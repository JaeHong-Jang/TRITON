# 관제 제어와 비공개 경로의 서버 계약 회귀
import copy
import json

import pytest
from conftest import appeal_case, finalize_case, first_impression, make_trial, scr

from app import execution, jobs, projection, store
from court import workflow


# 저장 가능한 합성 실행 등록
def seed_run(monkeypatch, status="error", instance=1):
    record = make_trial("c4", instance, scr(True, 91), ("fabricated",))
    record["claims"][0].update(text="숨길 주장", revisions=2, escalated=True)
    record["agentStats"] = {"checker": {"verified": 17, "perjury": 9}, "i1-P1": {"revisions": 2, "escalated": 1}}
    record["calls"] = [{"role": "prosecution", "seconds": 4}]
    record["trace"] = [{"seq": 1, "at": "2026-10-03T00:00:00Z", "agentId": "i1-P1", "kind": "revise", "nodeId": "revise", "fromNode": "check", "text": "실패 9건", "publicText": "17번 문장 확인", "claimId": "i1-C1", "attempt": 1}]
    run = jobs._job_from_run({
        "id": "control-run", "caseId": "c4", "instance": instance, "kind": "trial", "status": status,
        "step": "17번 문장 수정 · 실패 9건", "done": 9, "total": 17, "attempt": 1, "graphVersion": workflow.VERSION,
        "partial": record, "events": copy.deepcopy(record["trace"]), "caseSnapshot": store.get_case("c4"), "versionSnapshot": jobs._versions(),
    })
    monkeypatch.setattr(jobs, "JOBS", {run["id"]: run})
    return run


# 시작 조건은 저장 기록과 항소 및 최종 확정 조건 적용
def test_start_controls_match_trial_guards(env):
    fresh = env.get("/api/cases/c4/execution?instance=1").json()
    assert fresh["controls"]["start"] == {"allowed": True, "reason": ""}
    assert fresh["availableInstances"] == [1]
    locked = env.get("/api/cases/c4/execution?instance=2").json()
    assert locked["controls"]["start"]["reason"] == env.post("/api/cases/c4/trials/2").json()["detail"]
    saved = env.get("/api/cases/c1/execution?instance=1").json()
    assert not saved["controls"]["start"]["allowed"]
    assert saved["controls"]["start"]["reason"] == env.post("/api/cases/c1/trials/1").json()["detail"]
    appeal_case(env, "c1")
    appealed = env.get("/api/cases/c1/execution?instance=2").json()
    assert appealed["controls"]["start"]["allowed"] and appealed["availableInstances"] == [1, 2]
    finalize_case(env, "c2", "not_clickbait")
    final = env.get("/api/cases/c2/execution?instance=2").json()
    assert final["controls"]["start"]["reason"] == env.post("/api/cases/c2/trials/2").json()["detail"]


# 기존 실행을 새 시작으로 교체하지 않는 제어
def test_existing_execution_disables_start_and_exposes_open_instances(env, monkeypatch):
    seed_run(monkeypatch, instance=2)
    view = execution.view("c4", 2)
    assert view["availableInstances"] == [1, 2]
    assert not view["controls"]["start"]["allowed"]
    store.save_trial("c4", 3, make_trial("c4", 3, None))
    assert execution.view("c4", 1)["availableInstances"] == [1, 2, 3]


@pytest.mark.parametrize("field,value,expected", [
    ("graphVersion", "old", "실행 그래프 버전"),
    ("_versions", {}, "저장된 실행 버전"),
    ("attempt", 3, "재시도 횟수"),
    ("_case", None, "사건 원문"),
])
# 재시도 버튼과 실제 실행은 같은 차단 사유 사용
def test_retry_controls_share_execution_validation(env, monkeypatch, field, value, expected):
    run = seed_run(monkeypatch)
    run[field] = value
    control = execution.view("c4", 1)["controls"]["retry"]
    assert not control["allowed"] and expected in control["reason"]
    response = env.post(f"/api/jobs/{run['id']}/retry")
    assert response.status_code == 409 and response.json()["detail"] == control["reason"]


@pytest.mark.parametrize("status,retry,cancel", [
    ("queued", False, True), ("running", False, True), ("done", False, False),
    ("error", True, False), ("interrupted", True, False), ("cancelled", True, False),
])
# 진행 중 중복 실행과 끝난 작업의 취소 방지
def test_job_controls_follow_status(env, monkeypatch, status, retry, cancel):
    seed_run(monkeypatch, status=status)
    controls = execution.view("c4", 1)["controls"]
    assert controls["retry"]["allowed"] is retry
    assert controls["cancel"]["allowed"] is cancel


# 첫인상 전 API와 실행 화면에서 내부 선택과 수량 비공개
def test_hidden_run_removes_sensitive_paths_counts_and_messages(env, monkeypatch):
    run = seed_run(monkeypatch, status="running")
    view = env.get("/api/cases/c4/execution?instance=1").json()
    job = env.get(f"/api/jobs/{run['id']}").json()
    for projected in (view["run"], job):
        assert projected["events"] == [] and projected["done"] == projected["total"] == 0
        assert projected["step"] == "재판 준비 중"
        record = projected["partial"]
        assert record["trace"] == record["claims"] == record["calls"] == []
        assert record["agentStats"] == {} and record["screening"] is None and record["officer"] is None
    assert view["agents"] == []
    text = json.dumps(view, ensure_ascii=False)
    assert all(secret not in text for secret in ("17번", "실패 9건", "숨길 주장", "fabricated", "perjury"))
    assert len(run["_events"]) == 1 and len(run["_partial"]["claims"]) == 1
    first_impression(env, "c4")
    opened = env.get(f"/api/jobs/{run['id']}").json()
    assert opened["events"][0]["nodeId"] == "revise" and opened["total"] == 17
    assert opened["partial"]["agentStats"]["checker"]["verified"] == 17


@pytest.mark.parametrize("condition,visible,screening", [("A", False, False), ("B", False, True), ("C", True, True)])
# 실험실 조건별 주장과 서기 권고 공개 정책 유지
def test_lab_projection_keeps_condition_specific_disclosure(env, monkeypatch, condition, visible, screening):
    run = seed_run(monkeypatch)
    monkeypatch.setattr(projection, "lab_condition", lambda *_: condition)
    view = execution.view("c4", 1, "lab-session")
    record = view["run"]["partial"]
    assert bool(record["claims"]) is visible
    assert bool(record["trace"]) is visible
    assert bool(view["run"]["events"]) is visible
    assert bool(view["agents"]) is visible
    assert (record["screening"] is not None) is screening
    assert run["_partial"]["screening"] is not None


# 숨긴 실행의 반복 수와 담당 역할 변경은 전역 활동에 비노출
def test_dashboard_hidden_activity_is_stable_per_case(env, monkeypatch):
    run = seed_run(monkeypatch, status="running")
    run.update(startedAt="2026-10-03T00:00:00Z", createdAt="2026-10-02T23:59:59Z", updatedAt="2026-10-03T00:00:01Z", _role="prosecution")
    run["_events"][0]["kind"] = "escalate"
    before = env.get("/api/dashboard").json()
    assert before["recent"] == [{"caseId": "c4", "kind": "agent", "at": run["startedAt"], "text": "재판 준비 중"}]
    assert before["activeJobs"][0]["updatedAt"] == run["startedAt"]
    run["_events"] = [{**run["_events"][0], "seq": i, "at": f"2026-10-03T00:00:{i:02d}Z", "publicText": f"{i}번 문장 선택"} for i in range(1, 20)]
    run.update(updatedAt="2026-10-03T00:00:20Z", _role="checker", step="수정 19회", done=19, total=20)
    after = env.get("/api/dashboard").json()
    assert after == before
    assert all(a["working"] is None and a["queued"] == 0 for a in env.get("/api/agents").json())
    first_impression(env, "c4")
    opened = env.get("/api/dashboard").json()
    assert len([r for r in opened["recent"] if r["kind"] == "agent"]) == 10
    assert opened["activeJobs"][0]["updatedAt"] == run["updatedAt"]
    assert any(a["role"] == "checker" and a["working"] is not None for a in env.get("/api/agents").json())


# 숨긴 기록의 근거와 모델 호출 수는 전역 집계에서 제외
def test_hidden_evidence_and_calls_do_not_change_global_aggregates(env, monkeypatch):
    run = seed_run(monkeypatch)
    before_stats = env.get("/api/stats").json()
    before_agents = env.get("/api/agents").json()
    before_kpis = env.get("/api/dashboard").json()["kpis"]
    record = run["_partial"]
    record["calls"][0].update(promptTokens=200, outputTokens=100)
    store.save_trial("c4", 1, record)
    assert env.get("/api/stats").json() == before_stats
    assert env.get("/api/agents").json() == before_agents
    assert env.get("/api/dashboard").json()["kpis"] == before_kpis
    first_impression(env, "c4")
    opened = env.get("/api/stats").json()
    assert opened["evidenceStatus"]["fabricated"] == 1
    assert opened["cost"]["calls"] == 1 and opened["agents"]["escalations"] == 1


@pytest.mark.parametrize("status", ["done", "error", "interrupted"])
# 취소가 완료와 실패 기록을 덮어쓰지 않는 제약
def test_cancel_preserves_terminal_run(env, monkeypatch, status):
    run = seed_run(monkeypatch, status=status)
    run["error"] = "원본 모델 오류"
    before = copy.deepcopy(run)
    control = execution.view("c4", 1)["controls"]["cancel"]
    response = env.post(f"/api/jobs/{run['id']}/cancel")
    assert response.status_code == 409 and response.json()["detail"] == control["reason"]
    assert not control["allowed"] and run == before


@pytest.mark.parametrize("status", ["queued", "running", "cancelled"])
# 대기 실행 취소와 반복 취소의 멱등성
def test_cancel_allows_active_run_and_repeated_request(env, monkeypatch, status):
    run = seed_run(monkeypatch, status=status)
    before_events = copy.deepcopy(run["_events"])
    response = env.post(f"/api/jobs/{run['id']}/cancel")
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    snapshot = copy.deepcopy(run)
    assert env.post(f"/api/jobs/{run['id']}/cancel").status_code == 200
    assert run == snapshot and run["_events"] == before_events


# 미연결 모델은 제어와 직접 시작 요청을 같은 사유로 차단
def test_model_unavailable_blocks_start_without_creating_run(env, monkeypatch):
    monkeypatch.setattr(jobs, "model_health", lambda **_: {"ok": True, "ollama": False, "model": "missing"})
    control = execution.view("c4", 1)["controls"]["start"]
    response = env.post("/api/cases/c4/trials/1")
    assert not control["allowed"] and response.status_code == 503
    assert response.json()["detail"] == control["reason"]
    assert jobs.latest("c4", 1) is None and not env.calls["run"]


# 미연결 상태의 재시도는 오류와 시도 횟수 보존
def test_model_unavailable_blocks_retry_without_changing_run(env, monkeypatch):
    run = seed_run(monkeypatch)
    run["error"] = "원본 오류"
    before = copy.deepcopy(run)
    monkeypatch.setattr(jobs, "model_health", lambda **_: {"ok": True, "ollama": False, "model": "missing"})
    control = execution.view("c4", 1)["controls"]["retry"]
    response = env.post(f"/api/jobs/{run['id']}/retry")
    assert not control["allowed"] and response.status_code == 503
    assert response.json()["detail"] == control["reason"] and run == before


@pytest.mark.parametrize("status", ["queued", "running"])
# 진행 중 중복 요청은 모델 중단과 무관하게 기존 작업 반환
def test_duplicate_active_requests_remain_idempotent_without_model(env, monkeypatch, status):
    run = seed_run(monkeypatch, status=status)
    before = copy.deepcopy(run)
    monkeypatch.setattr(jobs, "model_health", lambda **_: {"ok": True, "ollama": False, "model": "missing"})
    for endpoint in ("/api/cases/c4/trials/1", f"/api/jobs/{run['id']}/retry"):
        response = env.post(endpoint)
        assert response.status_code == 200 and response.json() == {"jobId": run["id"]}
    assert run == before


# 상태 조회 캐시와 실행 직전 재확인의 구분
def test_model_health_cache_limits_polling_and_start_refreshes(env, monkeypatch):
    probes = []
    connected = [True]
    factory = store.court("llm").OllamaClient

    # 실제 네트워크 없이 연결 상태를 세는 확인
    def available(_):
        probes.append(1)
        return connected[0]

    monkeypatch.setattr(factory, "available", available)
    monkeypatch.setattr(jobs, "HEALTH_CACHE", {})
    assert env.get("/api/health").json()["ollama"] is True
    assert execution.view("c4", 1)["controls"]["start"]["allowed"]
    assert env.get("/api/health").json()["ollama"] is True and len(probes) == 1
    connected[0] = False
    assert env.post("/api/cases/c4/trials/1").status_code == 503
    assert len(probes) == 2 and jobs.latest("c4", 1) is None
    assert not execution.view("c4", 1)["controls"]["start"]["allowed"]
    assert len(probes) == 2
    jobs.HEALTH_CACHE["at"] -= jobs.HEALTH_TTL + 1
    env.get("/api/health")
    assert len(probes) == 3
