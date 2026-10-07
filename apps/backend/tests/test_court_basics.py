# 온톨로지·스킬·증거 검증·접수 분류·레드팀 테스트
import re

import pytest

from court import agents, ontology
from court.docket import classify
from court.evidence import absence_candidates, check_absence, check_quote, coverage, verify
from court.redteam import INJECTED_COMMAND, make_variant
from court.skills import load_skill, render

SENTENCES = [
    {"no": 1, "text": '최 위원장은 "기금을 만들겠다"고 강조했다.'},
    {"no": 2, "text": "임팩트금융은 사회 문제를 푸는 프로젝트에 투자하는 금융이다."},
]
CASE = {"id": "case-0001", "category": "경제", "subcategory": "은행", "title": "공동주택 하자분쟁 조정 본격화", "subtitle": "분쟁위 출범", "sentences": SENTENCES, "variantOf": None, "attack": None}


# 반박 입장은 대상 근거의 반대
def test_stance_derivation_including_rebuttal():
    assert ontology.stance_of("title_body_mismatch") == "pro"
    assert ontology.stance_of("body_consistent") == "con"
    assert ontology.stance_of("rebuttal", "pro") == "con"
    assert ontology.stance_of("rebuttal", "con") == "pro"
    with pytest.raises(ValueError):
        ontology.stance_of("rebuttal")
    with pytest.raises(ValueError):
        ontology.stance_of("nope")


# 유형 목록은 반박을 빼고 입장으로 거른다
def test_selectable_types_and_catalogue_filter():
    assert "rebuttal" not in ontology.selectable_types()
    assert all(ontology.stance_of(t) == "con" for t in ontology.selectable_types("con"))
    text = ontology.render_catalogue("pro")
    assert "title_body_mismatch" in text and "body_consistent" not in text


# 스킬 파일은 메타와 본문을 읽고 자리표시자를 치환한다
@pytest.mark.parametrize("name", ["clerk", "prosecutor", "defense", "cross-examination", "research-officer"])
def test_skills_load_and_render(name):
    skill = load_skill(name)
    assert skill["name"] == name and skill["version"] and skill["role"]
    assert "지시" in skill["prompt"] and "{{" in skill["prompt"]
    assert render("a {{x}} b {{y}}", {"x": "1"}) == "a 1 b {{y}}"


@pytest.mark.parametrize("name", ["prosecutor", "defense", "cross-examination", "research-officer", "clerk", "agent-revise"])
# 수정한 역할 프롬프트와 모든 구획의 자리표시자 치환 검증
def test_build_prompt_renders_all_changed_skill_placeholders(name):
    skill = load_skill(name)
    values = {key: f"치환_{key}" for key in ("claim_types", "concession_types", "absent_keywords", "tool_results", "specialty", "issues", "judge_notes", "side", "opponent_evidence", "record", "round", "feedback", "previous")}
    for section, template in {None: skill["prompt"], **skill["sections"]}.items():
        prompt = agents.build_prompt(name, section, **values)
        assert "{{" not in prompt and "}}" not in prompt
        assert all(values[key] in prompt for key in re.findall(r"\{\{(\w+)\}\}", template))


@pytest.mark.parametrize("evidence", [
    [{"kind": "quote", "sentenceNo": 1, "quote": '“기금을 만들겠다”'}, {"kind": "quote", "sentenceNo": 1, "quote": '  "기금을   만들겠다"  '}],
    [{"kind": "absence", "keyword": "하자 분쟁"}, {"kind": "absence", "keyword": " 하자\n분쟁 "}],
    [{"kind": "absence", "keyword": "‘핵심어’"}, {"kind": "absence", "keyword": "'핵심어'"}],
])
# 공백과 따옴표를 정규화한 중복 근거의 한 건 유지
def test_tidy_evidence_deduplicates_normalized_keys(evidence):
    assert agents.tidy_evidence(evidence) == [evidence[0]]


@pytest.mark.parametrize("other", [
    {"kind": "quote", "sentenceNo": 2, "quote": "기금"},
    {"kind": "quote", "sentenceNo": 1, "quote": "다른 인용"},
    {"kind": "absence", "keyword": "기금"},
])
# 종류나 문장 번호나 내용이 다른 근거의 별도 유지
def test_tidy_evidence_keeps_distinct_keys(other):
    evidence = [{"kind": "quote", "sentenceNo": 1, "quote": "기금"}, other]
    assert agents.tidy_evidence(evidence) == evidence


# 구체적 단서 없는 낚시성 권고의 사유와 유형 보정
def test_screening_without_clue_explains_forced_normal():
    raw = {"isClickbait": True, "confidence": 95, "reason": "제목이 과장됐다.", "claimType": "exaggeration", "offTopicSentenceNo": 99, "absentKeyword": "없는후보"}
    screening = agents.tidy_screening(raw, [1, 2], ["하자분쟁"])
    assert screening["isClickbait"] is False and screening["confidence"] == 60 and screening["claimType"] is None
    assert screening["reason"].startswith("구체적 단서(무관 문장·부재 핵심어)를 찾지 못해 정상으로 보정함.")
    assert screening["reason"].endswith(raw["reason"])


@pytest.mark.parametrize("is_clickbait, claim_type, expected", [
    (False, "exaggeration", None), (False, "title_reflects_core", "title_reflects_core"),
    (True, "body_consistent", None), (True, "inserted_irrelevant", "inserted_irrelevant"),
])
# 최종 서기 권고와 주장 유형 입장의 일치 검증
def test_screening_claim_type_matches_final_stance(is_clickbait, claim_type, expected):
    raw = {"isClickbait": is_clickbait, "confidence": 90, "reason": "합성 사유", "claimType": claim_type, "offTopicSentenceNo": 2}
    screening = agents.tidy_screening(raw, [1, 2], [])
    assert screening == {"isClickbait": is_clickbait, "confidence": 90, "reason": "합성 사유", "claimType": expected}


# 인용 상태 네 가지
def test_quote_statuses():
    assert check_quote(2, "사회 문제를 푸는 프로젝트", CASE) == {"status": "verified", "foundIn": 2}
    assert check_quote(1, "투자하는 금융이다", CASE) == {"status": "misnumbered", "foundIn": 2}
    assert check_quote(1, "공동주택 하자분쟁 조정 본격화", CASE) == {"status": "title", "foundIn": None}
    assert check_quote(1, "전혀 없는 문장이 여기에 있다", CASE)["status"] == "fabricated"
    assert coverage("최 위원장은  “기금을 만들겠다”고", SENTENCES[0]["text"]) == 1.0


# 핵심어 부재 근거 세 가지
def test_absence_verified_present_fabricated():
    assert check_absence("하자분쟁", CASE)["status"] == "verified"
    assert check_absence("하자 분쟁", CASE)["status"] == "verified"
    assert check_absence("분쟁위", CASE)["status"] == "verified"
    assert check_absence("휴대폰", CASE)["status"] == "fabricated"
    present = {**CASE, "sentences": SENTENCES + [{"no": 3, "text": "하자 분쟁 조정이 시작됐다."}]}
    assert check_absence("하자분쟁", present)["status"] == "present"


# 근거 조립은 계약 키를 모두 가진다
def test_verify_shapes():
    quote = verify("quote", CASE, 2, "투자하는 금융", None)
    absence = verify("absence", CASE, keyword="하자분쟁")
    keys = {"kind", "sentenceNo", "quote", "keyword", "status", "foundIn"}
    assert set(quote) == keys and set(absence) == keys
    assert absence["sentenceNo"] is None and absence["keyword"] == "하자분쟁"


# 잘못된 응답 루트의 빈 결과 처리
@pytest.mark.parametrize("raw", [None, [{}], "reply", 1, True])
def test_tidy_malformed_roots_are_empty(raw):
    assert agents.tidy_statement(raw, ["title_body_mismatch"], ["title_reflects_core"]) == []
    assert agents.tidy_cross(raw) == []
    assert agents.tidy_screening(raw, [1, 2], ["하자분쟁"]) == {"isClickbait": False, "confidence": 0, "reason": "", "claimType": None}
    assert agents.tidy_officer(raw, {}) == {"summary": "", "issues": [], "reclassified": [], "recommendedAction": "L0"}


# 목록이 아닌 주장·근거·보고서 항목의 빈 결과 처리
@pytest.mark.parametrize("items", [None, {"type": "title_body_mismatch"}, "reply", 1, True])
def test_tidy_malformed_containers_are_empty(items):
    assert agents.tidy_evidence(items) == []
    assert agents.tidy_statement({"claims": items, "concession": items}, ["title_body_mismatch"], ["title_reflects_core"]) == []
    assert agents.tidy_cross({"claims": items}) == []
    claim = {"type": "title_body_mismatch", "targetEvidenceId": "E1", "text": "주장", "evidence": items}
    assert agents.tidy_claims({"claims": [claim]}, ["title_body_mismatch"]) == []
    assert agents.tidy_cross({"claims": [claim]}) == []
    assert agents.tidy_officer({"issues": items, "reclassified": items}, {"E1": "pro"}) == {"summary": "", "issues": [], "reclassified": [], "recommendedAction": "L0"}


# 유한하지 않은 힘 세기와 확신도의 기본값 보정
@pytest.mark.parametrize("value", [float("inf"), float("-inf"), float("nan")])
def test_tidy_nonfinite_strength_and_confidence(value):
    evidence = [{"kind": "quote", "sentenceNo": 2, "quote": "투자하는 금융"}]
    claim = {"type": "title_body_mismatch", "targetEvidenceId": "E1", "text": "주장", "strength": value, "evidence": evidence}
    assert agents.tidy_claims({"claims": [claim]}, ["title_body_mismatch"])[0]["strength"] == 1
    assert agents.tidy_cross({"claims": [claim]})[0]["strength"] == 1
    assert agents.tidy_screening({"confidence": value, "offTopicSentenceNo": 2}, [1, 2], [])["confidence"] == 0


@pytest.mark.parametrize("type_, allows_absence", [
    ("title_body_mismatch", True), ("curiosity_gap", True),
    ("inserted_irrelevant", False), ("exaggeration", False),
    ("title_reflects_core", False), ("body_consistent", False), ("strong_but_factual", False), ("rebuttal", False),
])
# 주장 유형별 부재 근거 허용 범위와 인용 근거 유지
def test_claim_evidence_kinds_follow_ontology(type_, allows_absence):
    absence = {"kind": "absence", "keyword": "하자분쟁"}
    quote = {"kind": "quote", "sentenceNo": 2, "quote": "투자하는 금융"}
    assert check_absence(absence["keyword"], CASE)["status"] == "verified"
    claim = {"type": type_, "text": "주장", "evidence": [absence]}
    assert bool(agents.tidy_claims({"claims": [claim]}, [type_])) == allows_absence
    mixed = {**claim, "evidence": [absence, quote]}
    expected = [absence, quote] if allows_absence else [quote]
    assert agents.tidy_claims({"claims": [mixed]}, [type_])[0]["evidence"] == expected
    assert bool(agents.tidy_claims({"concession": [claim]}, [type_], key="concession")) == allows_absence


@pytest.mark.parametrize("types, expected", [
    (["inserted_irrelevant", "exaggeration"], ["quote"]),
    (["inserted_irrelevant", "curiosity_gap"], ["quote", "absence"]),
])
# 허용된 주장 유형의 근거 종류 합집합 적용 검증
def test_claims_schema_uses_allowed_type_union(types, expected):
    schema = agents.claims_schema(types, types, ["합성핵심어"])
    for key in ("claims", "concession"):
        evidence = schema["properties"][key]["items"]["properties"]["evidence"]["items"]["properties"]
        assert evidence["kind"]["enum"] == expected
        assert evidence["keyword"]["enum"] == ["", "합성핵심어"]


@pytest.mark.parametrize("stance, keywords, claims_kinds, concession_kinds", [
    ("con", ["합성핵심어"], ["quote"], ["quote", "absence"]),
    ("pro", ["합성핵심어"], ["quote", "absence"], ["quote"]),
    ("con", [], ["quote"], ["quote"]),
    ("pro", [], ["quote"], ["quote"]),
])
# 검사와 변호의 주장 및 인정 항목별 부재 근거 허용 검증
def test_claims_schema_evidence_kinds_by_stance_and_keywords(stance, keywords, claims_kinds, concession_kinds):
    schema = agents.claims_schema(ontology.selectable_types(stance), ontology.selectable_types(ontology.OPPOSITE[stance]), keywords)
    for key, expected in (("claims", claims_kinds), ("concession", concession_kinds)):
        evidence = schema["properties"][key]["items"]["properties"]["evidence"]["items"]["properties"]
        assert evidence["kind"]["enum"] == expected
        assert evidence["keyword"]["enum"] == ["", *keywords]


# 반대신문 반박의 부재 근거 제거와 인용 근거 유지
def test_cross_rebuttal_evidence_is_quote_only():
    absence = {"kind": "absence", "keyword": "하자분쟁"}
    quote = {"kind": "quote", "sentenceNo": 2, "quote": "투자하는 금융"}
    claim = {"targetEvidenceId": "E1", "text": "반박", "evidence": [absence]}
    assert agents.tidy_cross({"claims": [claim]}) == []
    assert agents.tidy_cross({"claims": [{**claim, "evidence": [absence, quote]}]})[0]["evidence"] == [quote]


# 접수 분류 규칙
def test_docket_rules():
    sure = {"isClickbait": True, "confidence": 90, "reason": "x", "claimType": None}
    assert classify(CASE, sure)["track"] == "summary"
    assert classify({**CASE, "category": "정치"}, sure)["reasons"] == ["고위험 분야: 정치"]
    unsure = {**sure, "confidence": 72}
    docket = classify(CASE, unsure)
    assert docket["track"] == "trial" and docket["reasons"] == ["서기 확신도 72 < 85"] and docket["screening"] == unsure
    assert classify({**CASE, "category": "사회"}, {**sure, "confidence": 85})["track"] == "trial"
    assert classify(CASE, None) == {"track": "trial", "reasons": ["서기 권고 없음"], "screening": None}


ANSWER = {"id": "case-0001", "sourceId": "x-P2", "isClickbait": True, "part": 2, "method": "auto", "pattern": "99", "level": "하", "insertedSentenceNos": [5, 6], "originalTitle": "원제"}
PART2 = {**CASE, "sentences": [{"no": i, "text": t} for i, t in enumerate(["a", "b", "c", "d", "X", "Y"], start=1)]}


# 끼워 넣은 문장을 가운데로 옮기고 번호를 다시 매긴다
def test_move_inserted_variant():
    case, answer = make_variant(PART2, ANSWER, "move_inserted")
    assert [s["text"] for s in case["sentences"]] == ["a", "b", "X", "Y", "c", "d"]
    assert [s["no"] for s in case["sentences"]] == [1, 2, 3, 4, 5, 6]
    assert answer["insertedSentenceNos"] == [3, 4]
    assert case["id"] == answer["id"] == "case-0001-mv"
    assert case["variantOf"] == "case-0001" and case["attack"] == "move_inserted"
    assert PART2["sentences"][4]["text"] == "X" and ANSWER["insertedSentenceNos"] == [5, 6]


# Part2 낚시성이 아니면 이동 변형은 거부
def test_move_inserted_rejects_other_cases():
    with pytest.raises(ValueError):
        make_variant(PART2, {**ANSWER, "part": 1, "insertedSentenceNos": []}, "move_inserted")
    with pytest.raises(ValueError):
        make_variant(PART2, {**ANSWER, "isClickbait": False}, "move_inserted")
    with pytest.raises(ValueError):
        make_variant(PART2, ANSWER, "unknown")


# 명령 주입 문장은 가운데에 들어가고 정답 번호가 밀린다
def test_inject_command_variant():
    case, answer = make_variant(PART2, ANSWER, "inject_command")
    texts = [s["text"] for s in case["sentences"]]
    assert texts[3] == INJECTED_COMMAND and len(texts) == 7
    assert [s["no"] for s in case["sentences"]] == list(range(1, 8))
    assert answer["insertedSentenceNos"] == [6, 7]
    assert case["id"] == "case-0001-inj" and case["attack"] == "inject_command" and case["variantOf"] == "case-0001"
    assert answer["isClickbait"] is True


# 핵심어 후보는 조사를 떼고 본문에 없는 단어만 남긴다
def test_absence_candidates_strip_josa_and_drop_present():
    case = {**CASE, "title": "차이슨이 공동주택의 하자분쟁을 조정하다 null", "subtitle": "", "sentences": [{"no": 1, "text": "차이 슨 청소기와 공동주택 이야기."}]}
    assert absence_candidates(case) == ["하자분쟁"]
    assert absence_candidates({**case, "title": "그 는", "subtitle": ""}) == []


@pytest.mark.parametrize("tag", ["[주말 TV 본방사수]", "[단독]", "[2021 국감]", "【주말 TV 본방사수】", "<2021 국감>"])
# 제목과 부제의 편집 태그를 제외한 정상 핵심어 후보 유지
def test_absence_candidates_exclude_bracketed_editorial_tags(tag):
    case = {**CASE, "title": f"{tag} 하자분쟁", "subtitle": f"{tag} 공동주택"}
    assert absence_candidates(case) == ["하자분쟁", "공동주택"]


# 한자 약칭이 든 단어를 제외한 정상 핵심어 후보 유지
def test_absence_candidates_exclude_cjk_words():
    case = {**CASE, "title": "檢출석 反日적인 하자분쟁", "subtitle": "檢조사 공동주택", "sentences": [{"no": 1, "text": "검찰 출석과 반일 성향을 설명했다."}]}
    assert absence_candidates(case) == ["하자분쟁", "공동주택"]
