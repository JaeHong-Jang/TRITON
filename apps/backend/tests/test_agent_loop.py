# 에이전트 작업 루프 테스트 (스크립트된 가짜 LLM, 네트워크 없음)
import json

import pytest
from court import intake, paths
from court.instances import run

SENTENCES = [
    {"no": 1, "text": "임팩트금융은 사회 문제를 푸는 프로젝트에 투자하는 금융이다."},
    {"no": 2, "text": "최 위원장은 기금을 만들겠다고 강조했다."},
    {"no": 3, "text": "한편 새 휴대폰 할인 행사가 열린다."},
]
CASE = {"id": "case-0001", "category": "경제", "subcategory": "은행", "title": "공동주택 하자분쟁 조정 본격화", "subtitle": "", "sentences": SENTENCES, "variantOf": None, "attack": None}
META = {"promptTokens": 10, "outputTokens": 5, "seconds": 0.1}
GOOD = {"kind": "quote", "sentenceNo": 1, "quote": "사회 문제를 푸는 프로젝트", "keyword": ""}
BAD = {"kind": "quote", "sentenceNo": 2, "quote": "존재하지 않는 인용문이 여기에 있다", "keyword": ""}


# 근거 목록을 가진 주장 한 건
def claim(evidence, type_="title_body_mismatch"):
    return {"type": type_, "text": "주장", "strength": 2, "evidence": evidence}


# 임시 데이터 폴더 지정
@pytest.fixture(autouse=True)
def tmp_data(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path / "data")


# 역할별 초안 목록을 차례로 돌려주는 가짜 LLM (마지막 초안은 반복)
class Script:
    model = "fake"
    options = {}

    # 검사·변호 초안과 계획 실패 여부 지정
    def __init__(self, prosecutor, defender=None, plan_fails=False, cross=None):
        self.cross = list(cross or [[GOOD]])
        self.drafts = {"검사": list(prosecutor), "변호": list(defender or [[claim([GOOD], "title_reflects_core")]])}
        self.plan_fails = plan_fails
        self.schemas = []

    # 스키마와 프롬프트로 단계를 구분한 응답
    def chat_json(self, system, user, schema):
        props = schema["properties"]
        self.schemas.append(schema)
        if "sentenceNos" in props:
            if self.plan_fails:
                raise ValueError("bad json")
            return {"sentenceNos": [1, 2], "findKeyword": ""}, META
        if "isClickbait" in props:
            return {"offTopicSentenceNo": 3, "absentKeyword": "", "isClickbait": True, "confidence": 90, "reason": "3번 문장", "claimType": "title_body_mismatch"}, META
        if "targetEvidenceId" in props["claims"]["items"]["properties"]:
            target = props["claims"]["items"]["properties"]["targetEvidenceId"]["enum"][0]
            return {"claims": [{"targetEvidenceId": target, "text": "반박", "strength": 2, "evidence": self.cross.pop(0) if len(self.cross) > 1 else self.cross[0]}]}, META
        queue = self.drafts["검사" if "검사입니다" in system else "변호"]
        return {"claims": queue.pop(0) if len(queue) > 1 else queue[0]}, META


# 첫 초안의 위조 인용을 수정 단계가 고친다
def test_revision_fixes_fabricated_quote():
    client = Script([[claim([BAD])], [claim([GOOD])]])
    record = run(CASE, 1, [], client)
    mine = [c for c in record["claims"] if c["agentId"] == "i1-P1"]
    assert [(c["revisions"], c["escalated"], c["evidence"][0]["status"]) for c in mine] == [(1, False, "verified")]
    kinds = [e["kind"] for e in record["trace"] if e["agentId"] == "i1-P1"]
    assert kinds.count("revise") == 1 and kinds[-1] == "submit"
    revise = next(e for e in record["trace"] if e["kind"] == "revise")
    assert "위증 의심 1건" in revise["text"]
    stats = record["agentStats"]["i1-P1"]
    assert (stats["calls"], stats["revisions"], stats["escalated"], stats["firstFailed"], stats["fixed"]) == (3, 1, 0, 1, 1)
    assert record["agentStats"]["checker"]["perjury"] == 1


# 수정 요청에는 틀린 근거와 실제 원문이 들어간다
def test_revise_prompt_has_real_sentence():
    seen = []

    # 프롬프트를 기록하는 스크립트 클라이언트
    class Spy(Script):
        # 호출마다 프롬프트 저장
        def chat_json(self, system, user, schema):
            seen.append(system)
            return super().chat_json(system, user, schema)

    run(CASE, 1, [], Spy([[claim([BAD])], [claim([GOOD])]]))
    revise = next(s for s in seen if "## 수정 요청" in s)
    assert "2번 문장 실제 원문: 최 위원장은 기금을 만들겠다고 강조했다." in revise and "존재하지 않는 인용문" in revise
    assert all("정답" not in s and "originalTitle" not in s for s in seen)


# 계속 틀리면 두 번 고친 뒤 에스컬레이션
def test_escalate_after_two_revisions():
    client = Script([[claim([BAD])]])
    record = run(CASE, 1, [], client)
    mine = next(c for c in record["claims"] if c["agentId"] == "i1-P1")
    assert (mine["revisions"], mine["escalated"], mine["evidence"][0]["status"]) == (2, True, "fabricated")
    events = [e for e in record["trace"] if e["agentId"] == "i1-P1"]
    assert [e["kind"] for e in events].count("revise") == 2
    escalate = events[-1]
    assert escalate["kind"] == "escalate" and escalate["claimId"] == mine["id"] and "판사 확인 필요" in escalate["text"]
    assert record["agentStats"]["i1-P1"]["calls"] == 4 and record["agentStats"]["i1-P1"]["escalated"] == 1


# 이벤트는 순서대로 쌓이고 제출마다 중간 기록이 자란다
def test_event_order_and_partial_growth():
    seen = []
    drafts = [[claim([GOOD]), claim([GOOD], "exaggeration")]]
    run(CASE, 1, [], Script(drafts), on_event=lambda event, partial, role: seen.append((event, partial, role)))
    events = [e for e, _, _ in seen if e["agentId"] != "i1-K1"]
    prosecutor = [e["kind"] for e in events if e["agentId"] == "i1-P1"]
    assert prosecutor[:2] == ["read", "plan"] and "tool" in prosecutor and prosecutor.index("draft") < prosecutor.index("submit")
    assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
    assert all(e["text"] and set(e) == {"seq", "at", "agentId", "kind", "text", "publicText", "claimId"} for e in events)
    submits = [(e, p) for e, p, _ in seen if e["kind"] == "submit"]
    assert [len(p["claims"]) for _, p in submits] == [1, 2, 3]
    assert all(e["claimId"] == p["claims"][-1]["id"] for e, p in submits)
    assert all(ev["status"] == "verified" for _, p in submits for c in p["claims"] for ev in c["evidence"])
    assert seen[-1][0]["kind"] == "done" and seen[-1][2] == "checker"
    tool_texts = [e["text"] for e in events if e["kind"] == "tool"]
    assert "1번 문장 원문 확인" in tool_texts and any("본문에 없는 제목 핵심어" in t for t in tool_texts)


# 에이전트 하나의 모델 호출은 계획이 두 번 깨져도 4번을 넘지 않는다
def test_max_four_calls_per_agent():
    record = run(CASE, 1, [], Script([[claim([BAD])]], plan_fails=True))
    assert all(s["calls"] <= 4 for aid, s in record["agentStats"].items() if aid != "checker")
    prosecutor = [c for c in record["calls"] if c["agentId"] == "i1-P1"]
    assert [c["step"] for c in prosecutor] == ["draft", "revise"] and record["agentStats"]["i1-P1"]["calls"] == 4


# 접수 검토는 파일을 쓰고 1심은 그 권고를 복사하며 서기를 다시 부르지 않는다
def test_intake_file_and_first_instance_copy():
    doc = intake.run_case(CASE, Script([[claim([GOOD])]]))
    saved = json.loads((paths.DATA_DIR / "intake" / "case-0001.json").read_text(encoding="utf-8"))
    assert saved == doc and set(saved) == {"caseId", "createdAt", "model", "skill", "skillVersion", "screening", "trace", "calls", "agentStats"}
    assert [e["kind"] for e in saved["trace"]][:2] == ["read", "plan"] and saved["trace"][-1]["kind"] == "done"
    assert [c["step"] for c in saved["calls"]] == ["plan", "draft"] and saved["agentStats"]["i1-K1"]["calls"] == 2
    client = Script([[claim([GOOD])]])
    record = run(CASE, 1, [], client)
    assert record["screening"] == saved["screening"] and not any("isClickbait" in s["properties"] for s in client.schemas)
    assert [c["agentId"] for c in record["calls"]] == ["i1-P1", "i1-P1", "i1-D1", "i1-D1"]


# 반대신문은 앞선 주장 단계에서 호출을 다 써도 자기 한 바퀴의 상한 안에서 고쳐 쓴다
def test_cross_gets_own_call_budget_and_revises():
    client = Script([[claim([BAD])]], cross=[[BAD], [GOOD]])
    first = run(CASE, 1, [], Script([[claim([GOOD])]]))
    record = run(CASE, 2, [first], client)
    prosecutor = next(a["id"] for a in record["bench"] if a["side"] == "prosecution")
    assert record["agentStats"][prosecutor]["calls"] == 7
    cross_calls = [c["step"] for c in record["calls"] if c["role"] == "cross" and c["agentId"] == prosecutor]
    assert cross_calls == ["plan", "draft", "revise"]
    rebuttal = next(c for c in record["claims"] if c["rebuts"] and c["agentId"] == prosecutor)
    assert (rebuttal["type"], rebuttal["revisions"], rebuttal["escalated"], rebuttal["evidence"][0]["status"]) == ("rebuttal", 1, False, "verified")
    assert any(e["kind"] == "tool" and e["agentId"] == prosecutor and "문장 원문 확인" in e["text"] for e in record["trace"])


# 모든 이벤트의 publicText는 유형·입장·건수 없이 단계와 문장 번호만 담는다
def test_public_text_is_neutral():
    record = run(CASE, 1, [], Script([[claim([BAD])], [claim([GOOD])]]))
    prosecutor = [e for e in record["trace"] if e["agentId"] == "i1-P1"]
    assert all(e["publicText"] for e in record["trace"])
    assert next(e for e in prosecutor if e["kind"] == "plan")["publicText"] == "1·2번 문장 살펴보기"
    assert {e["kind"]: e["publicText"] for e in prosecutor}.items() >= {"draft": "초안 작성", "revise": "다시 작성"}.items()
    assert next(e for e in record["trace"] if e["kind"] == "check")["publicText"] == "근거 대조"
    assert not any(ch in e["publicText"] for e in record["trace"] for ch in "건%") and "노릴" not in " ".join(e["publicText"] for e in record["trace"])


# 초안이 빈 목록이면 에스컬레이션 이벤트와 통계를 남기고 재판은 이어진다
def test_zero_claim_draft_escalates():
    record = run(CASE, 1, [], Script([[]]))
    events = [e for e in record["trace"] if e["agentId"] == "i1-P1"]
    assert events[-1]["kind"] == "escalate" and events[-1]["claimId"] is None and "유효한 주장을 만들지 못함" in events[-1]["text"] and "판사 확인 필요" in events[-1]["text"]
    assert record["agentStats"]["i1-P1"]["escalated"] == 1 and not [c for c in record["claims"] if c["agentId"] == "i1-P1"]
    assert any(c["agentId"] == "i1-D1" for c in record["claims"])


# 수정 횟수는 실제로 다시 쓴 횟수 (더 나쁜 재작성은 채택하지 않아도 센다)
def test_revisions_count_rewrites_made():
    client = Script([[claim([GOOD])]])
    assert next(c for c in run(CASE, 1, [], client)["claims"] if c["agentId"] == "i1-P1")["revisions"] == 0
    worse = Script([[claim([BAD])], [claim([BAD, BAD])], [claim([BAD, BAD, BAD])]])
    record = run(CASE, 1, [], worse)
    mine = next(c for c in record["claims"] if c["agentId"] == "i1-P1")
    assert mine["revisions"] == 2 and record["agentStats"]["i1-P1"]["revisions"] == 2 and len(mine["evidence"]) == 1


# 접수 파일이 없는 1심은 서기 이벤트에도 전체 bench와 중간 기록을 붙인다
def test_inline_intake_events_carry_bench():
    seen = []
    run(CASE, 1, [], Script([[claim([GOOD])]]), on_event=lambda event, partial, role: seen.append((event, partial)))
    clerk = [(e, p) for e, p in seen if e["agentId"] == "i1-K1"]
    assert clerk and all(p is not None and [a["id"] for a in p["bench"]] == ["i1-K1", "i1-P1", "i1-D1"] for _, p in clerk)
    assert all(next(a["name"] for a in p["bench"] if a["id"] == e["agentId"]) == "서기" for e, p in clerk)


# 모델이 없는 404와 연결 거부는 다른 안내문
def test_missing_model_differs_from_connection_refused():
    import urllib.error

    from court.errors import ModelError

    # 지정한 예외를 던지는 가짜 클라이언트
    class Broken(Script):
        exc = None

        # 예외 발생
        def chat_json(self, system, user, schema):
            raise self.exc

    Broken.exc = urllib.error.HTTPError("http://x/api/chat", 404, "Not Found", None, None)
    with pytest.raises(ModelError, match="모델 fake이 Ollama에 없습니다"):
        run(CASE, 1, [], Broken([[claim([GOOD])]]))
    Broken.exc = ConnectionRefusedError("refused")
    with pytest.raises(ModelError, match="연결할 수 없습니다"):
        run(CASE, 1, [], Broken([[claim([GOOD])]]))
