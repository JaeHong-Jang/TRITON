# 온톨로지·스킬·증거 검증·접수 분류·레드팀 테스트
import pytest

from court import ontology
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
