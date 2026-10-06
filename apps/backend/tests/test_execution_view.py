# 실행 화면의 실제 상태와 공개 범위 회귀
import copy

import pytest
from conftest import first_impression, make_trial, scr

from app import execution, jobs, store


# 두 역할이 포함된 실행 중간 기록
def partial_record():
    record = make_trial("c4", 1, scr(True, 91))
    record["bench"].append({"id": "i1-D1", "name": "변호인 1", "side": "defense"})
    record["agentStats"] = {"i1-P1": {"revisions": 2, "escalated": 1}}
    return record


# 실행 스냅샷 조회 대체
def set_run(monkeypatch, status="running", record=None):
    run = {"id": "live", "caseId": "c4", "instance": 1, "status": status, "step": "변호인 초안 작성", "attempt": 1, "graphVersion": "1", "error": None,
           "partial": record or partial_record(), "events": [
               {"seq": 1, "agentId": "i1-P1", "nodeId": "submit", "kind": "submit", "text": "주장", "publicText": "주장 제출", "attempt": 1},
               {"seq": 2, "agentId": "i1-D1", "nodeId": "draft", "kind": "draft", "text": "초안", "publicText": "초안 작성", "attempt": 1},
           ]}
    monkeypatch.setattr(jobs, "latest", lambda *args: copy.deepcopy(run))
    return run


# 첫인상 전 그래프도 실패 건수와 권고 비공개
def test_execution_hidden_projection(env, monkeypatch):
    set_run(monkeypatch)
    view = execution.view("c4", 1)
    assert view["phase"] == "first_impression"
    assert view["agents"] == []
    assert view["run"]["events"] == [] and view["run"]["partial"]["trace"] == []
    assert view["run"]["step"] == "재판 준비 중" and view["run"]["done"] == view["run"]["total"] == 0
    review = next(s for s in view["steps"] if s["id"] == "review")
    assert review["status"] == "blocked" and "/" not in review["reason"]


# 먼저 제출한 역할과 현재 생성 중인 역할 구분
def test_execution_partial_agents_and_verdict_gate(env, monkeypatch):
    first_impression(env, "c4")
    record = partial_record()
    record["agentStats"] = {}
    set_run(monkeypatch, record=record)
    view = execution.view("c4", 1)
    agents = {a["agentId"]: a for a in view["agents"]}
    assert agents["i1-P1"]["status"] == "complete"
    assert agents["i1-D1"]["status"] == "running"
    assert agents["i1-D1"]["nodeId"] == "draft"
    steps = {s["id"]: s for s in view["steps"]}
    assert steps["seat_verdict"]["status"] == "blocked"
    assert steps["review"]["status"] == "blocked"
    assert steps["reveal"]["status"] == "active"


@pytest.mark.parametrize("status", ["error", "cancelled", "interrupted"])
# 실패 중단 실행을 성공이나 실행 전으로 표시하지 않는 상태
def test_execution_failed_state(env, monkeypatch, status):
    first_impression(env, "c4")
    set_run(monkeypatch, status=status)
    view = execution.view("c4", 1)
    assert view["mode"] == "live" and view["phase"] == "generate"
    assert next(s for s in view["steps"] if s["id"] == "generate")["status"] in ("error", "blocked")
    assert next(s for s in view["steps"] if s["id"] == "seat_verdict")["status"] == "blocked"


# 옛 재판에 존재하지 않는 에이전트 실행 이력 생성 금지
def test_execution_legacy_provenance(env):
    view = execution.view("c1", 1)
    assert view["mode"] == "replay" and view["run"] is None
    assert view["agents"] == []
    assert "실행 그래프 기록 없음" in view["reason"]


# 완료된 재판 trace에서 빠진 서기 실행도 저장 작업 이벤트로 표시
def test_execution_completed_clerk_uses_run_events(env, monkeypatch):
    first_impression(env, "c4")
    record = partial_record()
    record["bench"].append({"id": "i1-K1", "name": "서기", "side": "officer", "skill": "clerk"})
    record["trace"] = [{"seq": 1, "agentId": "i1-P1", "kind": "submit", "text": "제출", "publicText": "제출"}]
    store.save_trial("c4", 1, record)
    run = set_run(monkeypatch, status="done", record=record)
    run["events"].insert(0, {"seq": 0, "agentId": "i1-K1", "kind": "done", "nodeId": "submit", "text": "권고", "publicText": "접수 검토 완료", "attempt": 1})
    clerk = next(a for a in execution.view("c4", 1)["agents"] if a["agentId"] == "i1-K1")
    assert clerk["status"] == "complete" and clerk["nodeId"] == "submit"


# 합의부 한 석만으로 최종 확정 가능 상태 표시 금지
def test_execution_two_seats_and_appeal(env, monkeypatch):
    record = make_trial("c4", 2, None)
    record["execution"] = {"runId": "second", "version": "1", "attempt": 1}
    store.save_trial("c4", 2, record)
    entries = [
        {"type": "first_impression", "instance": 1, "labSessionId": None, "data": {}},
        {"type": "reveal", "instance": 2, "labSessionId": None, "data": {"claimId": "i2-C1"}},
        {"type": "seat_verdict", "instance": 2, "labSessionId": None, "judge": {"seat": 1}, "data": {"verdict": "clickbait"}},
    ]
    monkeypatch.setattr(store, "load_ledger", lambda *args: entries)
    view = execution.view("c4", 2)
    assert view["phase"] == "seat_verdict"
    steps = {s["id"]: s for s in view["steps"]}
    assert steps["seat_verdict"]["status"] == "active" and "1/2" in steps["seat_verdict"]["reason"]
    assert steps["final"]["status"] == "blocked"
    entries.append({"type": "seat_verdict", "instance": 2, "labSessionId": None, "judge": {"seat": 2}, "data": {"verdict": "not_clickbait"}})
    view = execution.view("c4", 2)
    assert view["phase"] == "appeal"
    assert next(s for s in view["steps"] if s["id"] == "final")["status"] == "blocked"
