# 심급 진행 테스트 (결정적 가짜 LLM)
import json

import pytest
from court import ontology, paths
from court.instances import bench_size, perjury_ids, run

SENTENCES = [
    {"no": 1, "text": "임팩트금융은 사회 문제를 푸는 프로젝트에 투자하는 금융이다."},
    {"no": 2, "text": "최 위원장은 기금을 만들겠다고 강조했다."},
    {"no": 3, "text": "한편 새 휴대폰 할인 행사가 열린다."},
]
CASE = {"id": "case-0001", "category": "경제", "subcategory": "은행", "title": "공동주택 하자분쟁 조정 본격화", "subtitle": "", "sentences": SENTENCES, "variantOf": None, "attack": None}
META = {"promptTokens": 10, "outputTokens": 5, "seconds": 0.1}
GOOD_QUOTE = {"kind": "quote", "sentenceNo": 1, "quote": "사회 문제를 푸는 프로젝트", "keyword": ""}
BAD_QUOTE = {"kind": "quote", "sentenceNo": 2, "quote": "존재하지 않는 인용문이 여기에 있다", "keyword": ""}
ABSENCE = {"kind": "absence", "sentenceNo": 0, "quote": "", "keyword": "하자분쟁"}


# 재판 기록·접수 결과가 임시 폴더에만 쓰이게 함
@pytest.fixture(autouse=True)
def tmp_data(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path / "data")


# 초안·수정 호출만 골라낸 (프롬프트, 스키마) 목록
def drafts(client):
    return [(s, sc) for (s, _), sc in zip(client.seen, client.schemas) if "sentenceNos" not in sc["properties"]]


# 가짜 LLM: 스키마와 프롬프트로 역할을 구분해 정해진 답을 준다
class FakeClient:
    model = "fake"
    options = {"temperature": 0}

    # 응답 구성 지정
    def __init__(self, confidence=90, pro_evidence=None, con_evidence=None, cross=None):
        self.confidence = confidence
        self.pro_evidence = pro_evidence or [GOOD_QUOTE]
        self.con_evidence = con_evidence or [GOOD_QUOTE]
        self.cross = cross
        self.seen = []
        self.schemas = []

    # 역할별 고정 응답
    def chat_json(self, system, user, schema):
        self.seen.append((system, user))
        self.schemas.append(schema)
        props = schema["properties"]
        if "sentenceNos" in props:
            reply = {"sentenceNos": [1, 3], "findKeyword": "하자분쟁"}
            if "claimTypes" in props:
                reply["claimTypes"] = props["claimTypes"]["items"]["enum"][:1]
            if "targetEvidenceId" in props:
                reply["targetEvidenceId"] = props["targetEvidenceId"]["enum"][0]
            return reply, META
        if "isClickbait" in props:
            return {"offTopicSentenceNo": 3, "absentKeyword": "", "isClickbait": True, "confidence": self.confidence, "reason": "1번 문장과 제목이 다르다", "claimType": "title_body_mismatch"}, META
        if "recommendedAction" in props:
            return {"summary": "공방 요약", "issues": ["쟁점 하나", "쟁점 둘"], "reclassified": [
                {"evidenceId": "i1-E1", "to": "con", "why": "재분류"}, {"evidenceId": "i9-E9", "to": "con", "why": "없는 근거"}, {"evidenceId": "i1-E1", "to": "pro", "why": "같은 입장"}],
                "recommendedAction": "L1"}, META
        item = props["claims"]["items"]["properties"]
        if "targetEvidenceId" in item:
            return {"claims": self.cross(item["targetEvidenceId"]["enum"]) if self.cross else []}, META
        if "검사입니다" in system:
            return {"claims": [{"type": "title_body_mismatch", "text": "제목 주제가 본문에 없다", "strength": 3, "evidence": self.pro_evidence}]}, META
        return {"claims": [{"type": "title_reflects_core", "text": "제목이 본문을 반영한다", "strength": 2, "evidence": self.con_evidence}]}, META


# 1심 기록 형태가 api.md 키와 일치
def test_first_instance_shape_and_ids():
    client = FakeClient(pro_evidence=[GOOD_QUOTE, ABSENCE], con_evidence=[BAD_QUOTE])
    record = run(CASE, 1, [], client)
    assert set(record) == {"caseId", "instance", "ontologyVersion", "model", "createdAt", "bench", "rounds", "claims", "screening", "officer", "calls", "trace", "agentStats"}
    assert [a["id"] for a in record["bench"]] == ["i1-K1", "i1-P1", "i1-D1"]
    assert all(set(a) == {"id", "side", "name", "specialty", "skill", "skillVersion"} for a in record["bench"])
    assert record["rounds"] == [{"index": 0, "kind": "opening", "title": "모두 주장"}]
    assert [c["id"] for c in record["claims"]] == ["i1-C1", "i1-C2"]
    claim_keys = {"id", "agentId", "round", "type", "stance", "text", "strength", "evidence", "rebuts", "revisions", "escalated"}
    assert all(set(c) == claim_keys for c in record["claims"])
    pro, con = record["claims"]
    assert [e["id"] for e in pro["evidence"]] == ["i1-E1", "i1-E2"] and con["evidence"][0]["id"] == "i1-E3"
    assert [e["status"] for e in pro["evidence"]] == ["verified", "verified"] and con["evidence"][0]["status"] == "fabricated"
    assert (pro["stance"], con["stance"]) == ("pro", "con")
    assert set(pro["evidence"][0]) == {"id", "kind", "stance", "sentenceNo", "quote", "keyword", "status", "foundIn"}
    assert record["screening"]["claimType"] == "title_body_mismatch" and record["officer"] is None
    assert [(c["role"], c["agentId"], c["step"]) for c in record["calls"]] == [("prosecution", "i1-P1", "plan"), ("prosecution", "i1-P1", "draft"), ("defense", "i1-D1", "plan"), ("defense", "i1-D1", "draft"), ("defense", "i1-D1", "revise"), ("defense", "i1-D1", "revise")]
    assert (pro["revisions"], pro["escalated"], con["revisions"], con["escalated"]) == (0, False, 2, True)
    assert json.dumps(record, ensure_ascii=False)


# 인라인 서기의 전체 이벤트와 통계 및 시도 번호 보존
def test_inline_clerk_trace_and_stats_are_in_trial_without_calls():
    events = []
    record = run(CASE, 1, [], FakeClient(), attempt=2, on_event=lambda event, partial, role: events.append(event))
    doc = json.loads((paths.DATA_DIR / "intake" / f"{CASE['id']}.json").read_text(encoding="utf-8"))
    clerk_trace = [event for event in record["trace"] if event["agentId"] == "i1-K1"]
    assert clerk_trace == doc["trace"]
    assert record["trace"] == events
    assert [event["seq"] for event in record["trace"]] == list(range(1, len(events) + 1))
    assert {event["attempt"] for event in record["trace"]} == {2}
    assert record["agentStats"]["i1-K1"] == doc["agentStats"]["i1-K1"]
    assert all(call["role"] != "clerk" for call in record["calls"])
    assert len(doc["calls"]) == 2


# 기존 접수 결과의 이벤트와 통계 중복 복사 방지
def test_existing_intake_does_not_add_clerk_trace_or_stats():
    first = run(CASE, 1, [], FakeClient())
    client = FakeClient()
    second = run(CASE, 1, [], client, attempt=2)
    assert first["screening"] == second["screening"]
    assert "i1-K1" not in second["agentStats"]
    assert all(event["agentId"] != "i1-K1" for event in second["trace"])
    assert all("isClickbait" not in schema["properties"] for schema in client.schemas)


# 에이전트 프롬프트에는 정답 필드가 없다
def test_prompts_never_contain_answer_fields():
    client = FakeClient()
    run(CASE, 1, [], client)
    for system, user in client.seen:
        for forbidden in ("processPattern", "originalTitle", "newsID", "insertedSentenceNos"):
            assert forbidden not in system and forbidden not in user
        assert "{{" not in system
    assert len({user for _, user in client.seen}) == 1
    assert "[본문]" in client.seen[0][1]


# 진행률은 호출 전후로 보고된다
def test_on_step_reports_before_and_after():
    steps = []
    run(CASE, 1, [], FakeClient(), on_step=lambda text, done, total: steps.append((done, total)))
    assert steps == [(0, 3), (1, 3), (1, 3), (2, 3), (2, 3), (3, 3)]


# 판사 메모는 프롬프트에 들어간다
def test_judge_notes_reach_prompts():
    client = FakeClient()
    run(CASE, 1, [], client, judge_notes="인용 문장을 다시 보라")
    assert all("인용 문장을 다시 보라" in system for system, _ in client.seen[2:])


# 2심 팀 인원: 확신도 낮음·접전·위증이면 3명, 아니면 2명
def test_bench_size_rule_both_ways():
    first = run(CASE, 1, [], FakeClient(90))
    first["claims"][0]["strength"], first["claims"][1]["strength"] = 3, 1
    assert bench_size([first]) == 2
    assert bench_size([{**first, "screening": {**first["screening"], "confidence": 69}}]) == 3
    first["claims"][1]["strength"] = 2
    assert bench_size([first]) == 3
    first["claims"][1]["evidence"][0]["status"] = "present"
    assert bench_size([first]) == 2
    first["claims"][0]["evidence"][0]["status"] = "present"
    assert bench_size([first]) == 3
    assert bench_size([]) == 2


# 위증 근거가 있으면 천칭이 기울어도 3명
def test_bench_size_three_when_fabricated_exists():
    first = run(CASE, 1, [], FakeClient(90, [GOOD_QUOTE], [BAD_QUOTE]))
    assert perjury_ids([first]) == ["i1-E2"]
    assert bench_size([first]) == 3


# 2심 개정: 전문 분담과 반대신문 검증
def test_second_instance_cross_filters_and_stance():
    first = run(CASE, 1, [], FakeClient(90))

    # 유효·무효·같은 편 대상을 섞어 반박 시도
    def cross(valid_ids):
        return [{"targetEvidenceId": "i2-E999" if len(valid_ids) == 99 else valid_ids[0], "text": "반박", "strength": 2, "evidence": [GOOD_QUOTE]}]

    client = FakeClient(pro_evidence=[GOOD_QUOTE], con_evidence=[GOOD_QUOTE], cross=cross)
    record = run(CASE, 2, [first], client)
    size = len(record["bench"]) // 2
    assert size == bench_size([first])
    assert [a["id"] for a in record["bench"]] == [f"i2-P{i}" for i in range(1, size + 1)] + [f"i2-D{i}" for i in range(1, size + 1)]
    assert record["bench"][0]["specialty"] == ontology.selectable_types("pro")[0]
    assert all(ontology.claim_type(a["specialty"])["stance"] == ("pro" if a["side"] == "prosecution" else "con") for a in record["bench"])
    assert [r["kind"] for r in record["rounds"]] == ["opening", "cross"]
    rebuttals = [c for c in record["claims"] if c["type"] == "rebuttal"]
    assert len(rebuttals) == 2 * size
    ev = {e["id"]: (c, e) for c in record["claims"] for e in c["evidence"]}
    owner_side = {c["id"]: next(a["side"] for a in record["bench"] if a["id"] == c["agentId"]) for c in record["claims"]}
    for r in rebuttals:
        target_claim, target = ev[r["rebuts"]]
        assert owner_side[target_claim["id"]] != next(a["side"] for a in record["bench"] if a["id"] == r["agentId"])
        assert r["stance"] != target["stance"] and r["round"] == 1
    assert len(record["calls"]) == 2 * 4 * size


# 잘못된 대상·같은 편 대상 반박은 버려진다
def test_invalid_and_same_side_targets_dropped():
    first = run(CASE, 1, [], FakeClient(90))
    own = {}

    # 상대 목록에 없는 id만 노린다
    def cross(valid_ids):
        own["valid"] = valid_ids
        return [{"targetEvidenceId": "i2-E1", "text": "같은 편 근거 반박", "strength": 2, "evidence": [GOOD_QUOTE]}] if "i2-E1" not in valid_ids else [{"targetEvidenceId": "i2-E404", "text": "없는 근거", "strength": 1, "evidence": [GOOD_QUOTE]}]

    record = run(CASE, 2, [first], FakeClient(cross=cross))
    first_prosecutor_claim = next(c for c in record["claims"] if c["agentId"] == "i2-P1")
    assert first_prosecutor_claim["evidence"][0]["id"] == "i2-E1"
    assert all(c["type"] != "rebuttal" or c["rebuts"] in own["valid"] for c in record["claims"])
    assert not [c for c in record["claims"] if c["type"] == "rebuttal" and c["agentId"] == "i2-P1" and c["rebuts"] == "i2-E1"]


# 3심: 위증은 코드 집계, 재분류는 존재하는 근거만
def test_third_instance_officer_report():
    first = run(CASE, 1, [], FakeClient(90, [GOOD_QUOTE], [BAD_QUOTE]))
    client = FakeClient(90)
    record = run(CASE, 3, [first], client, judge_notes="메모")
    officer = record["officer"]
    assert officer["perjury"] == ["i1-E2"]
    assert officer["recommendedAction"] == "L1" and officer["issues"] == ["쟁점 하나", "쟁점 둘"]
    assert officer["reclassified"] == [{"evidenceId": "i1-E1", "from": "pro", "to": "con", "why": "재분류"}]
    assert set(officer) == {"summary", "issues", "reclassified", "perjury", "recommendedAction"}
    assert [a["id"] for a in record["bench"]] == ["i3-O1", "i3-P1", "i3-D1"]
    assert record["rounds"] == [{"index": 0, "kind": "review", "title": "법률 검토"}]
    assert [c["id"] for c in record["claims"]] == ["i3-C1", "i3-C2"]
    assert [(c["role"], c["step"]) for c in record["calls"]] == [("officer", "draft"), ("prosecution", "plan"), ("prosecution", "draft"), ("defense", "plan"), ("defense", "draft")]
    assert "쟁점 하나" in client.seen[2][0] and "메모" in client.seen[0][0]
    assert "1심: 주장 2건" in client.seen[0][0]
    assert "i1-E2" in client.seen[0][0] and record["screening"] is None


# 잘못된 행동 단계와 비정상 응답은 보정된다
def test_officer_and_claims_are_sanitized():
    from court import agents

    report = agents.tidy_officer({"summary": 1, "issues": ["a", ""], "reclassified": "x", "recommendedAction": "L9"}, {})
    assert report["recommendedAction"] == "L0" and report["issues"] == ["a"] and report["reclassified"] == []
    raw = {"claims": [{"type": "rebuttal", "text": "t", "strength": 9, "evidence": [GOOD_QUOTE]}, {"type": "body_consistent", "text": "t", "strength": "x", "evidence": [{"kind": "quote", "sentenceNo": "a", "quote": "q"}]},
                      {"type": "body_consistent", "text": "ok", "strength": 7, "evidence": [GOOD_QUOTE]}]}
    tidy = agents.tidy_claims(raw, ontology.selectable_types(), max_claims=3)
    assert len(tidy) == 1 and tidy[0]["strength"] == 3


# 검사·변호인 스키마는 본 주장을 자기 입장 유형으로, 인정을 반대 입장 유형으로 제한한다
def test_schema_enums_per_side_and_concession_stance():
    client = FakeClient()
    run(CASE, 1, [], client)
    prosecutor, defender = [sc for _, sc in drafts(client)][1:3]
    for schema, own, other in ((prosecutor, "pro", "con"), (defender, "con", "pro")):
        main = schema["properties"]["claims"]["items"]["properties"]["type"]["enum"]
        conc = schema["properties"]["concession"]["items"]["properties"]["type"]["enum"]
        assert {ontology.stance_of(t) for t in main} == {own} and {ontology.stance_of(t) for t in conc} == {other}
        assert schema["properties"]["concession"]["maxItems"] == 1


# 인정은 본 주장 뒤에 오며 입장이 반대이고 잘못된 유형은 버려진다
def test_concession_placed_after_claims():
    # 반대 입장을 인정하는 가짜 모델
    class Conceding(FakeClient):
        # 검사가 반대 입장 인정 한 건을 덧붙임
        def chat_json(self, system, user, schema):
            reply, meta = super().chat_json(system, user, schema)
            if "claims" in reply and "검사입니다" in system:
                reply["concession"] = [{"type": "body_consistent", "text": "본문은 일관된다", "strength": 1, "evidence": [GOOD_QUOTE]}, {"type": "title_body_mismatch", "text": "잘못된 인정", "strength": 1, "evidence": [GOOD_QUOTE]}]
            return reply, meta

    record = run(CASE, 1, [], Conceding())
    mine = [c for c in record["claims"] if c["agentId"] == "i1-P1"]
    assert [(c["type"], c["stance"]) for c in mine] == [("title_body_mismatch", "pro"), ("body_consistent", "con")]


# 본문에 없는 제목 핵심어가 없으면 absence 종류가 스키마에서 빠진다
def test_absence_kind_removed_when_no_candidates():
    client = FakeClient()
    run({**CASE, "title": "임팩트금융 투자"}, 1, [], client)
    kinds = drafts(client)[1][1]["properties"]["claims"]["items"]["properties"]["evidence"]["items"]["properties"]
    assert kinds["kind"]["enum"] == ["quote"] and kinds["keyword"]["enum"] == [""]
    run(CASE, 1, [], client)
    kinds = drafts(client)[-2][1]["properties"]["claims"]["items"]["properties"]["evidence"]["items"]["properties"]
    assert "absence" in kinds["kind"]["enum"] and "하자분쟁" in kinds["keyword"]["enum"]


# 구체적 단서가 없는 서기 권고는 낚시성 아님·확신도 60 이하로 제한된다
def test_screening_without_clue_is_capped():
    from court import agents

    raw = {"offTopicSentenceNo": 0, "absentKeyword": "", "isClickbait": True, "confidence": 95, "reason": "r", "claimType": "title_body_mismatch"}
    capped = agents.tidy_screening(raw, [1, 2], ["하자분쟁"])
    assert (capped["isClickbait"], capped["confidence"], capped["claimType"]) == (False, 60, None) and "단서" in capped["reason"] and capped["reason"].endswith("r")
    assert agents.tidy_screening({**raw, "absentKeyword": "하자분쟁"}, [1, 2], ["하자분쟁"])["confidence"] == 95
    assert agents.tidy_screening({**raw, "offTopicSentenceNo": 2}, [1, 2], [])["isClickbait"] is True


# 같은 근거를 겨냥한 채택된 반박의 단일 반감 검증
def test_scale_halves_once_per_target():
    from court.scale import balance, weights

    ev = lambda i, status="verified": {"id": i, "kind": "quote", "stance": "pro", "status": status}
    claim = lambda cid, evidence, rebuts=None: {"id": cid, "strength": 2, "evidence": evidence, "rebuts": rebuts, "type": "rebuttal" if rebuts else "x"}
    claims = [claim("C1", [ev("E1")]), *(claim(f"R{i}", [{**ev(f"RE{i}"), "stance": "con"}], "E1") for i in range(3))]
    rulings = {f"RE{i}": "admitted" for i in range(3)}
    assert weights(claims)["E1"][1] == 2
    assert balance(claims)["pro"] == 2
    assert weights(claims, rulings)["E1"][1] == 1
    assert balance(claims, rulings)["pro"] == 1


# 판사 판정이 반박 유효성과 근거 무게에 반영
def test_scale_rulings_precedence():
    from court.scale import weights

    ev = lambda i, status="verified": {"id": i, "kind": "quote", "stance": "pro", "status": status}
    base = {"strength": 2, "type": "x", "rebuts": None}
    target = {"id": "C1", "evidence": [ev("E1")], **base}
    weak = {"id": "R1", "evidence": [ev("RE1", "present")], **{**base, "rebuts": "E1", "type": "rebuttal"}}
    assert weights([target, weak])["E1"][1] == 2
    assert weights([target, weak], {"RE1": "admitted"})["E1"][1] == 1
    assert weights([target, weak], {"E1": "struck", "RE1": "admitted"})["E1"][1] == 0
    strong = {**weak, "evidence": [ev("RE1")]}
    assert weights([target, strong], {"RE1": "struck"})["E1"][1] == 2
    assert weights([target, strong], {"E1": "admitted", "RE1": "admitted"})["E1"][1] == 2


@pytest.mark.parametrize("rulings, expected", [
    (None, [2, 2, 2]),
    ({}, [2, 2, 2]),
    ({"e2": "admitted"}, [1, 2, 2]),
    ({"e2": "struck"}, [2, 0, 2]),
    ({"e1": "admitted", "e2": "admitted"}, [2, 2, 2]),
    ({"e1": "struck", "e2": "admitted"}, [0, 2, 2]),
    ({"e2": "admitted", "e3": "admitted"}, [1, 2, 2]),
    ({"e2": "struck", "e3": "admitted"}, [1, 0, 2]),
])
# 프론트와 같은 주장과 판사 판정의 반박 무게 검증
def test_scale_rebuttal_parity(rulings, expected):
    from court.scale import weights

    claims = []
    for i in range(1, 4):
        stance = "pro" if i == 1 else "con"
        claims.append({
            "id": f"c{i}", "agentId": "a1", "round": 0, "type": "exaggeration" if i == 1 else "rebuttal",
            "stance": stance, "text": "주장", "strength": 2, "rebuts": None if i == 1 else "e1", "revisions": 0, "escalated": False,
            "evidence": [{"id": f"e{i}", "kind": "quote", "stance": stance, "sentenceNo": 1, "quote": "문장", "keyword": None, "status": "verified", "foundIn": 1}],
        })
    assert [weight for _, weight in weights(claims, rulings).values()] == expected


# 일부 반박 근거의 채택과 채택 취소에 따른 반감 복원 검증
def test_scale_one_admitted_rebuttal_evidence_is_enough():
    from court.scale import weights

    target = {"id": "c1", "strength": 2, "type": "exaggeration", "rebuts": None, "evidence": [{"id": "e1", "status": "verified"}]}
    rebuttal = {"id": "c2", "strength": 2, "type": "rebuttal", "rebuts": "e1", "evidence": [{"id": "e2", "status": "verified"}, {"id": "e3", "status": "fabricated"}]}
    assert weights([target, rebuttal], {"e2": "admitted", "e3": "struck"})["e1"][1] == 1
    assert weights([target, rebuttal], {"e3": "struck"})["e1"][1] == 2


# 모델 연결 실패와 반복 파싱 실패는 오류로 종료
def test_model_failures_raise():
    import pytest
    from court.errors import ModelError

    # 항상 실패하는 가짜 클라이언트
    class Broken(FakeClient):
        exc = OSError("refused")

        # 예외 발생
        def chat_json(self, system, user, schema):
            raise self.exc

    with pytest.raises(ModelError, match="Ollama"):
        run(CASE, 1, [], Broken())
    Broken.exc = ValueError("bad json")
    with pytest.raises(ModelError, match="해석"):
        run(CASE, 1, [], Broken())
