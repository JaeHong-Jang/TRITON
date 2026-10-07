# 실행 런타임 테스트
import json
import time
import types
from urllib.error import URLError

import pytest

from app import console, jobs, projection, run_store
from court import paths, workflow
from court.agent_loop import Session


# 합성 사건
CASE = {"id": "runtime-case", "category": "경제", "subcategory": "합성", "title": "합성 제목", "subtitle": "", "sentences": [{"no": 1, "text": "합성 문장입니다."}], "variantOf": None, "attack": None}


# 임시 런타임 상태
@pytest.fixture(autouse=True)
def runtime_env(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(jobs, "model_health", lambda **_: {"ok": True, "ollama": True, "model": "runtime-test"})
    with jobs.STATE_LOCK:
        jobs.JOBS.clear()
        while not jobs.QUEUE.empty():
            jobs.QUEUE.get_nowait()
    yield
    with jobs.STATE_LOCK:
        jobs.JOBS.clear()
        while not jobs.QUEUE.empty():
            jobs.QUEUE.get_nowait()


# 조건 대기
def wait_until(predicate):
    deadline = time.time() + 2
    while time.time() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("condition did not become true")


# 실행 그래프 정의
def test_workflow_definition_and_transition_guards():
    definition = workflow.definition()
    assert definition["version"] == "1"
    assert definition["limits"] == {"maxCalls": 4, "maxRevisions": 2, "maxRunAttempts": 3}
    assert [node["id"] for node in definition["nodes"]] == ["read", "plan", "tool", "draft", "check", "revise", "submit", "escalate"]
    assert workflow.next_nodes("check", failed=False, can_revise=True) == ["submit"]
    assert workflow.next_nodes("check", failed=True, can_revise=True) == ["revise"]
    assert workflow.next_nodes("check", failed=True, can_revise=False) == ["escalate"]
    for source, target in (("read", "tool"), ("read", "draft"), ("plan", "draft"), ("revise", "escalate"), ("submit", "escalate"), ("escalate", "submit")):
        workflow.guard(source, target)
    with pytest.raises(ValueError):
        workflow.guard("plan", "submit")


# 재시도 캐시와 저장 실행
def test_retry_reuses_completed_model_response_and_persists_run(monkeypatch):
    external_calls = []
    invocations = {"run": 0}

    # 호출 수를 세는 가짜 모델
    class CountingClient:
        model = "fake"
        options = {"temperature": 0}

        # 모델 호출 기록
        def chat_json(self, system, user, schema):
            external_calls.append((system, user, schema))
            return {"ok": len(external_calls)}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}

    # 첫 실행은 첫 응답 뒤 실패, 재시도는 같은 첫 호출을 재사용하고 완료
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None):
        invocations["run"] += 1
        first, first_meta = client.chat_json("same-system", "same-user", {"type": "object", "properties": {"ok": {"type": "integer"}}})
        if invocations["run"] == 1:
            raise RuntimeError("boom after checkpoint")
        second, second_meta = client.chat_json("new-system", "same-user", {"type": "object", "properties": {"ok": {"type": "integer"}}})
        return {
            "caseId": case["id"],
            "instance": instance,
            "ontologyVersion": 1,
            "model": {"name": client.model, "options": client.options},
            "createdAt": "2026-01-01T00:00:00+00:00",
            "bench": [],
            "rounds": [],
            "claims": [{"id": "i1-C1", "agentId": "i1-P1", "round": 0, "type": "x", "stance": "pro", "text": str(first["ok"] + second["ok"]), "strength": 1, "evidence": [], "rebuts": None}],
            "screening": None,
            "officer": None,
            "calls": [{**first_meta, "agentId": "i1-P1", "role": "prosecution", "step": "draft"}, {**second_meta, "agentId": "i1-P1", "role": "prosecution", "step": "revise"}],
            "trace": [],
            "agentStats": {},
        }

    fake_llm = types.SimpleNamespace(OllamaClient=CountingClient)
    fake_instances = types.SimpleNamespace(run=run)
    monkeypatch.setattr(jobs.store, "court", lambda name: fake_llm if name == "llm" else fake_instances)

    job_id = jobs.enqueue(CASE, 1, [], "")
    wait_until(lambda: jobs.get(job_id)["status"] == "error")
    assert len(external_calls) == 1
    assert jobs.retry(job_id) == job_id
    wait_until(lambda: jobs.get(job_id)["status"] == "done")

    job = jobs.get(job_id)
    trial = json.loads((paths.DATA_DIR / "trials" / CASE["id"] / "1.json").read_text(encoding="utf-8"))
    saved_run = run_store.load(job_id)
    assert job["attempt"] == 2 and job["graphVersion"] == "1"
    assert {k: trial["execution"][k] for k in ("version", "runId", "attempt")} == {"version": "1", "runId": job_id, "attempt": 2}
    assert trial["execution"]["modelCalls"]["calls"] == 2
    assert saved_run["status"] == "done" and saved_run["attempt"] == 2
    assert len(external_calls) == 2
    assert run_store.load(job_id)["checkpoints"][0]["input"] == {"system": "same-system", "user": "same-user", "schema": {"type": "object", "properties": {"ok": {"type": "integer"}}}}


# 취소 펜싱
def test_cancel_fences_late_callbacks_and_trial_write(monkeypatch):
    captured = {}

    # 취소 뒤 늦게 도착한 콜백을 흉내 내는 실행
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None):
        jobs.cancel(captured["job_id"])
        on_event({"seq": 1, "at": "2026-01-01T00:00:00+00:00", "agentId": "i1-P1", "kind": "submit", "text": "late", "publicText": "late", "claimId": None}, {"late": True}, "prosecution")
        return {"caseId": case["id"], "instance": instance, "claims": [], "trace": [], "calls": [], "agentStats": {}}

    fake_llm = types.SimpleNamespace(OllamaClient=lambda: types.SimpleNamespace(model="fake", options={}))
    fake_instances = types.SimpleNamespace(run=run)
    monkeypatch.setattr(jobs.store, "court", lambda name: fake_llm if name == "llm" else fake_instances)

    captured["job_id"] = jobs.enqueue(CASE, 1, [], "")
    wait_until(lambda: jobs.get(captured["job_id"])["status"] == "cancelled")
    job = jobs.get(captured["job_id"])
    assert job["events"] == [] and job["partial"] is None
    assert not (paths.DATA_DIR / "trials" / CASE["id"] / "1.json").exists()


# 수동 실행을 위한 작업 큐 고정
@pytest.fixture
def manual_queue(monkeypatch):
    monkeypatch.setattr(jobs, "_ensure_worker", lambda: None)
    monkeypatch.setattr(jobs.QUEUE, "put", lambda item: None)


# 일괄 접수 이벤트의 사건 식별자와 개별 공개 범위
@pytest.mark.parametrize("open_first", [False, True])
def test_intake_batch_events_keep_case_disclosure(monkeypatch, manual_queue, open_first):
    hidden_case = {**CASE, "id": "hidden-case"}
    cases = [CASE, hidden_case] if open_first else [hidden_case, CASE]
    monkeypatch.setattr(projection, "court_open", lambda cid: cid == CASE["id"])

    # 사건별 서기 권고 이벤트 발행
    def run_case(case, client, on_event=None):
        on_event({"seq": 1, "at": "2026-01-01T00:00:00+00:00", "agentId": "i1-K1", "kind": "done", "text": f"{case['id']} 권고 작성 · 낚시성 의심 · 확신도 90", "claimId": None}, None, "clerk")

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=lambda: types.SimpleNamespace(model="fake", options={})) if name == "llm" else types.SimpleNamespace(run_case=run_case))
    job_id = jobs.enqueue_intake(cases)
    job = jobs.JOBS[job_id]
    jobs._run(job, 1)
    raw = jobs.get(job_id)

    assert raw["status"] == "done"
    assert [e.get("caseId") for e in raw["events"]] == [c["id"] for c in cases]
    assert [e["caseId"] for e in projection.job(raw)["events"]] == [CASE["id"]]
    assert projection.job(jobs.get(job_id, since=1))["events"] == ([] if open_first else [raw["events"][1]])
    assert [e["caseId"] for e in run_store.load(job_id)["events"]] == [c["id"] for c in cases]

    job["status"] = "running"
    active = jobs.active()
    recent = console._recent([], [], active)
    recommendations = [e for e in recent if "권고 작성" in e["text"]]
    assert [e["caseId"] for e in recommendations] == [CASE["id"]]
    assert all("hidden-case 권고" not in e["text"] for e in recent)


# 사건 식별자가 없는 재판 이벤트의 기존 공개 규칙
@pytest.mark.parametrize("open_", [False, True])
def test_job_projection_preserves_untagged_event_gate(monkeypatch, open_):
    monkeypatch.setattr(projection, "court_open", lambda cid: cid == "open" or cid == CASE["id"] and open_)
    events = [{"text": "재판 이벤트"}, {"caseId": "hidden", "text": "비공개 권고"}, {"caseId": "open", "text": "공개 권고"}]
    raw = {"caseId": CASE["id"], "status": "running", "step": "주장 생성", "events": events, "partial": None}

    assert projection.job(raw)["events"] == ([events[0], events[2]] if open_ else [events[2]])
    assert raw["events"] == events


# 이전 사건의 비공개 권고를 작업실 텍스트에서 제외
def test_working_text_filters_events_by_case(monkeypatch):
    monkeypatch.setattr(projection, "court_open", lambda cid: cid == CASE["id"])
    job = {"caseId": CASE["id"], "status": "running", "step": "접수 검토", "_recent": [{"caseId": "hidden", "text": "비공개 권고"}]}

    assert console._working_text(job) == "접수 검토"
    job["_recent"].insert(0, {"caseId": CASE["id"], "text": "공개 권고"})
    assert console._working_text(job) == "공개 권고"


# 파싱 실패와 동일 입력의 여러 응답을 호출 순서대로 재생
def test_retry_replays_parse_failures_and_repeated_replies_in_order(monkeypatch, manual_queue):
    external_calls, attempts = [], []

    # 파싱 실패 사이에 서로 다른 응답을 주는 모델
    class Client:
        model = "fake"
        options = {}

        # 실패와 성공을 번갈아 반환하는 모델 호출
        def chat_json(self, system, user, schema):
            external_calls.append(system)
            if len(external_calls) == 1:
                raise ValueError("invalid JSON")
            if len(external_calls) == 3:
                raise KeyError("missing reply")
            return {"ok": len(external_calls)}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}

    # 같은 입력으로 두 번 질문하고 첫 시도에서 중단
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None):
        session = Session(case, instance, client)
        replies = [session.ask("i1-P1", "prosecution", "draft", "same", {"type": "object"}) for _ in range(2)]
        attempts.append((replies, session.task_calls))
        if len(attempts) == 1:
            raise RuntimeError("checkpoint 이후 중단")
        return {"claims": [], "trace": [], "calls": session.calls, "agentStats": session.stats}

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=Client) if name == "llm" else types.SimpleNamespace(run=run))
    job_id = jobs.enqueue(CASE, 1, [])
    jobs._run(jobs.JOBS[job_id], 1)
    checkpoints = run_store.load(job_id)["checkpoints"]
    assert [c["status"] for c in checkpoints] == ["invalid", "complete", "invalid", "complete"]
    jobs.JOBS.clear()
    jobs.retry(job_id)
    jobs._run(jobs.JOBS[job_id], 2)

    assert attempts == [([{"ok": 2}, {"ok": 4}], 4)] * 2
    assert external_calls == ["same"] * 4
    assert jobs.get(job_id)["status"] == "done"
    assert run_store.load(job_id)["checkpoints"] == checkpoints


# 통신 실패는 체크포인트에 넣지 않고 재시도에서 실제 호출
@pytest.mark.parametrize("error", [OSError("connection failed"), URLError("connection failed"), TimeoutError("timed out")])
def test_retry_does_not_cache_transport_errors(monkeypatch, manual_queue, error):
    external_calls = []

    # 첫 호출에서 연결 실패를 일으키는 모델
    class Client:
        model = "fake"
        options = {}

        # 연결 복구 후 응답 반환
        def chat_json(self, system, user, schema):
            external_calls.append(system)
            if len(external_calls) == 1:
                raise error
            return {"ok": 1}, {}

    # 모델 호출 후 빈 재판 반환
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None):
        client.chat_json("same", "user", {})
        return {"claims": []}

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=Client) if name == "llm" else types.SimpleNamespace(run=run))
    job_id = jobs.enqueue(CASE, 1, [])
    jobs._run(jobs.JOBS[job_id], 1)
    assert run_store.load(job_id)["checkpoints"] == []
    jobs.retry(job_id)
    jobs._run(jobs.JOBS[job_id], 2)

    assert external_calls == ["same", "same"]
    assert jobs.get(job_id)["status"] == "done"


# 이미 저장된 재판이 있는 실행의 재시도 차단
@pytest.mark.parametrize("same_run", [False, True])
def test_retry_blocks_existing_trial(manual_queue, same_run):
    job_id = jobs.enqueue(CASE, 1, [])
    job = jobs.JOBS[job_id]
    job["status"] = "error"
    jobs._save(job)
    record = {"claims": [{"text": "판결에 사용한 주장"}], "execution": {"runId": job_id if same_run else "other-run"}}
    jobs.store.save_trial(CASE["id"], 1, record)

    assert jobs.retry_reason(job_id, model_block="")
    with pytest.raises(ValueError):
        jobs.retry(job_id)
    assert jobs.get(job_id)["attempt"] == 1
    assert jobs.store.load_trial(CASE["id"], 1) == record


# 같은 실행의 저장 재판은 최종 저장에서 덮어쓰지 않고 완료 처리
@pytest.mark.parametrize("same_run", [False, True])
def test_trial_commit_preserves_existing_record(monkeypatch, manual_queue, same_run):
    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=lambda: types.SimpleNamespace(model="fake", options={})) if name == "llm" else types.SimpleNamespace(run=lambda *a, **k: {"claims": [{"text": "새 주장"}]}))
    job_id = jobs.enqueue(CASE, 1, [])
    record = {"claims": [{"text": "판결에 사용한 주장"}], "execution": {"runId": job_id if same_run else "other-run"}}
    jobs.store.save_trial(CASE["id"], 1, record)
    monkeypatch.setattr(jobs.store, "save_trial", lambda *a: pytest.fail("기존 재판 저장 호출"))
    jobs._run(jobs.JOBS[job_id], 1)

    assert jobs.store.load_trial(CASE["id"], 1) == record
    assert jobs.get(job_id)["status"] == ("done" if same_run else "error")
    if same_run:
        assert jobs.get(job_id)["step"] == "완료"
        assert run_store.load(job_id)["status"] == "done"
    else:
        assert "다른 실행" in jobs.get(job_id)["error"]


# 모든 미완료 저장 실행에서 같은 실행의 재판 완료 상태 복구
@pytest.mark.parametrize("status", ["queued", "running", "interrupted", "error", "cancelled"])
@pytest.mark.parametrize("same_run", [False, True])
def test_recover_reconciles_all_saved_trial_runs(status, same_run):
    run_store.save({"id": "saved-trial", "kind": "trial", "caseId": CASE["id"], "instance": 1, "status": status, "attempt": 1})
    jobs.store.save_trial(CASE["id"], 1, {"execution": {"runId": "saved-trial" if same_run else "other-run"}})
    jobs.recover()
    expected = "done" if same_run else "interrupted" if status in ("queued", "running") else status

    assert run_store.load("saved-trial")["status"] == expected
    assert jobs.get("saved-trial")["status"] == expected
    if same_run:
        assert jobs.get("saved-trial")["step"] == "완료"
    jobs.JOBS.clear()
    jobs.recover()
    assert jobs.get("saved-trial")["status"] == expected


# 빈 접수 묶음은 저장된 재판 작업과 중복 처리하지 않는 규칙
def test_empty_intake_dedupe_filters_saved_job_kind(manual_queue):
    trial_id = jobs.enqueue(CASE, 1, [])
    jobs.JOBS.clear()
    intake_id = jobs.enqueue_intake([])

    assert intake_id != trial_id
    assert run_store.load(intake_id)["kind"] == "intake"
    jobs.JOBS.clear()
    assert jobs.enqueue_intake([]) == intake_id


# 취소 뒤 다음 모델 호출 차단
def test_cancel_blocks_next_model_call_and_checkpoint(monkeypatch):
    external_calls = []
    captured = {}

    # 호출 때마다 값을 돌려주는 가짜 모델
    class CountingClient:
        model = "fake"
        options = {}

        # 외부 호출 기록
        def chat_json(self, system, user, schema):
            external_calls.append(system)
            return {"ok": len(external_calls)}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}

    # 첫 호출 뒤 취소하고 두 번째 호출을 시도한다
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None):
        client.chat_json("first", "u", {"type": "object", "properties": {"ok": {"type": "integer"}}})
        jobs.cancel(captured["job_id"])
        client.chat_json("second", "u", {"type": "object", "properties": {"ok": {"type": "integer"}}})
        return {"caseId": case["id"], "instance": instance, "claims": [], "trace": [], "calls": [], "agentStats": {}}

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=CountingClient) if name == "llm" else types.SimpleNamespace(run=run))
    captured["job_id"] = jobs.enqueue(CASE, 1, [], "")
    wait_until(lambda: jobs.get(captured["job_id"])["status"] == "cancelled")

    assert external_calls == ["first"]
    assert len(run_store.load(captured["job_id"])["checkpoints"]) == 1
    assert not (paths.DATA_DIR / "trials" / CASE["id"] / "1.json").exists()


# 큐에 남은 예전 시도 무시
def test_retry_attempt_token_skips_stale_queued_item(monkeypatch):
    calls = []

    # 실행된 시도만 기록하는 가짜 재판
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None):
        calls.append(case["title"])
        return {"caseId": case["id"], "instance": instance, "claims": [], "trace": [], "calls": [], "agentStats": {}}

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=lambda: types.SimpleNamespace(model="fake", options={})) if name == "llm" else types.SimpleNamespace(run=run))
    job = {
        "id": "tokened", "caseId": CASE["id"], "instance": 1, "status": "queued", "step": "대기",
        "done": 0, "total": 0, "error": None, "startedAt": None, "createdAt": "2026-01-01T00:00:00+00:00", "updatedAt": "2026-01-01T00:00:00+00:00",
        "attempt": 2, "graphVersion": "1", "_kind": "trial", "_case": CASE, "_cases": None, "_intake": None, "_prior": [], "_notes": "", "_events": [], "_partial": None,
        "_role": None, "_checkpoints": [], "_policy": {}, "_model": None, "_versions": jobs._versions(),
    }
    jobs.JOBS[job["id"]] = job

    jobs._run(job, 1)
    jobs._run(job, 2)

    assert calls == [CASE["title"]]
    assert jobs.get("tokened")["attempt"] == 2 and jobs.get("tokened")["status"] == "done"


# 저장 스냅샷으로 재시도
def test_retry_uses_saved_case_snapshot_after_restart(monkeypatch):
    seen = []
    invocations = {"run": 0}

    # 모델은 한 번만 호출되는 가짜
    class Client:
        model = "fake"
        options = {}

        # 응답 반환
        def chat_json(self, system, user, schema):
            return {"ok": 1}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}

    # 첫 실행은 실패하고 재시도에서 사건 제목을 기록한다
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None):
        invocations["run"] += 1
        seen.append(case["title"])
        client.chat_json("same", "u", {"type": "object", "properties": {"ok": {"type": "integer"}}})
        if invocations["run"] == 1:
            raise RuntimeError("boom")
        return {"caseId": case["id"], "instance": instance, "claims": [], "trace": [], "calls": [], "agentStats": {}}

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=Client) if name == "llm" else types.SimpleNamespace(run=run))
    job_id = jobs.enqueue(CASE, 1, [], "")
    wait_until(lambda: jobs.get(job_id)["status"] == "error")
    with jobs.STATE_LOCK:
        jobs.JOBS.clear()
    jobs.retry(job_id)
    wait_until(lambda: jobs.get(job_id)["status"] == "done")

    assert seen == ["합성 제목", "합성 제목"]


# 저장 이벤트는 실행 시도 번호를 런타임 기준으로 보정한다
def test_record_event_stamps_current_attempt():
    job = {"attempt": 2, "status": "running", "_events": [], "_partial": None, "_role": None, "updatedAt": "", "id": "stamp", "caseId": CASE["id"], "instance": 1, "graphVersion": "1"}
    jobs._record_event(job, {"seq": 1, "at": "2026-01-01T00:00:00+00:00", "agentId": "i1-K1", "kind": "read", "text": "x", "publicText": "x", "claimId": None, "attempt": 1}, None, "clerk", 2)

    assert job["_events"][0]["attempt"] == 2


# 버전 불일치 재시도 차단
def test_retry_rejects_graph_version_mismatch():
    run_store.save({"id": "old", "caseId": CASE["id"], "instance": 1, "status": "interrupted", "attempt": 1, "graphVersion": "old", "versionSnapshot": {"graph": "old"}, "caseSnapshot": CASE, "priorSnapshot": [], "events": [], "partial": None, "checkpoints": []})
    with pytest.raises(ValueError, match="버전"):
        jobs.retry("old")


# 재시작 복구
def test_recover_marks_unfinished_runs_interrupted():
    run_store.save({"id": "stale", "caseId": CASE["id"], "instance": 1, "status": "running", "attempt": 1, "events": [], "partial": None, "checkpoints": []})
    jobs.recover()
    job = jobs.get("stale")
    assert job["status"] == "interrupted" and job["attempt"] == 1
    assert jobs.latest(CASE["id"], 1)["id"] == "stale"

# 1심 안쪽 접수 저장도 작업 취소 펜스를 따른다
def test_first_instance_inline_intake_save_is_fenced_by_cancel(monkeypatch):
    import importlib

    # 1심 서기 응답 중 취소하는 가짜 모델
    class DomainClient:
        model = "fake"
        options = {}

        # 스키마 종류별 최소 응답
        def chat_json(self, system, user, schema):
            props = schema["properties"]
            if "sentenceNos" in props:
                return {"sentenceNos": [1], "findKeyword": ""}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}
            if "isClickbait" in props:
                jobs.cancel("domain-intake")
                return {"offTopicSentenceNo": 0, "absentKeyword": "", "isClickbait": False, "confidence": 50, "reason": "정상", "claimType": "body_consistent"}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}
            return {"claims": [{"type": "body_consistent", "text": "본문 일치", "strength": 1, "evidence": [{"kind": "quote", "sentenceNo": 1, "quote": "합성 문장", "keyword": ""}]}]}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}

    real_court = jobs.store.court
    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=DomainClient) if name == "llm" else importlib.import_module(f"court.{name}"))
    job = {
        "id": "domain-intake", "caseId": CASE["id"], "instance": 1, "status": "queued", "step": "대기",
        "done": 0, "total": 0, "error": None, "startedAt": None, "createdAt": "2026-01-01T00:00:00+00:00", "updatedAt": "2026-01-01T00:00:00+00:00",
        "attempt": 1, "graphVersion": "1", "_kind": "trial", "_case": CASE, "_cases": None, "_intake": None, "_prior": [], "_notes": "", "_events": [], "_partial": None,
        "_role": None, "_checkpoints": [], "_policy": {}, "_model": None, "_versions": jobs._versions(),
    }
    jobs.JOBS[job["id"]] = job

    jobs._run(job, 1)

    assert jobs.get("domain-intake")["status"] == "cancelled"
    assert not (paths.DATA_DIR / "intake" / f"{CASE['id']}.json").exists()
    assert not (paths.DATA_DIR / "trials" / CASE["id"] / "1.json").exists()
    monkeypatch.setattr(jobs.store, "court", real_court)


# 재시도는 저장된 모델 설정이 현재 모델과 다르면 캐시를 섞지 않는다
def test_retry_rejects_model_snapshot_mismatch(monkeypatch):
    calls = {"run": 0, "model": "fake-a"}

    # 모델 이름이 바뀌는 가짜 클라이언트
    class ModelClient:
        options = {"temperature": 0}

        # 모델 이름 설정
        def __init__(self):
            self.model = calls["model"]

        # 응답 반환
        def chat_json(self, system, user, schema):
            return {"ok": 1}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}

    # 항상 실패해 재시도 상태를 만든다
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None):
        calls["run"] += 1
        if calls["run"] == 1:
            raise RuntimeError("boom")
        return {"caseId": case["id"], "instance": instance, "claims": [], "trace": [], "calls": [], "agentStats": {}}

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=ModelClient) if name == "llm" else types.SimpleNamespace(run=run))
    job_id = jobs.enqueue(CASE, 1, [], "")
    wait_until(lambda: jobs.get(job_id)["status"] == "error")
    calls["model"] = "fake-b"

    jobs.retry(job_id)
    wait_until(lambda: jobs.get(job_id)["status"] == "error" and "모델 설정" in (jobs.get(job_id).get("error") or ""))

    assert calls["run"] == 1


# 재시도는 스킬·온톨로지 해시 불일치를 차단한다
def test_retry_rejects_version_hash_mismatch(monkeypatch):
    version = jobs._versions()
    run_store.save({"id": "hash-old", "caseId": CASE["id"], "instance": 1, "status": "interrupted", "attempt": 1, "graphVersion": "1", "versionSnapshot": version, "caseSnapshot": CASE, "priorSnapshot": [], "events": [], "partial": None, "checkpoints": []})
    monkeypatch.setattr(jobs, "_versions", lambda: {**version, "skillHashes": {"changed": "x"}})

    with pytest.raises(ValueError, match="버전"):
        jobs.retry("hash-old")


# 1심 접수 결과는 enqueue 시점 스냅샷으로 고정된다
def test_first_instance_uses_intake_snapshot_from_enqueue(monkeypatch):
    original = {"caseId": CASE["id"], "screening": {"confidence": 11}, "trace": [], "calls": [], "agentStats": {}}
    changed = {"caseId": CASE["id"], "screening": {"confidence": 99}, "trace": [], "calls": [], "agentStats": {}}
    jobs.store.write_json(f"intake/{CASE['id']}.json", original)
    seen = {}

    # 전달된 intake_doc만 확인하는 가짜 심급 실행
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None, attempt=1, intake_doc=None, save_intake=None):
        seen["intake"] = intake_doc
        return {"caseId": case["id"], "instance": instance, "claims": [], "trace": [], "calls": [], "agentStats": {}}

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=lambda: types.SimpleNamespace(model="fake", options={})) if name == "llm" else types.SimpleNamespace(run=run))
    monkeypatch.setattr(jobs, "_ensure_worker", lambda: None)
    monkeypatch.setattr(jobs.QUEUE, "put", lambda item: None)
    job_id = jobs.enqueue(CASE, 1, [], "")
    jobs.store.write_json(f"intake/{CASE['id']}.json", changed)

    jobs._run(jobs.JOBS[job_id], 1)

    assert seen["intake"]["screening"]["confidence"] == 11


# 같은 사건·심급은 실패 후 새 POST가 새 run을 만들지 않는다
def test_enqueue_reuses_existing_case_instance_run(monkeypatch):
    monkeypatch.setattr(jobs, "_ensure_worker", lambda: None)
    monkeypatch.setattr(jobs.QUEUE, "put", lambda item: None)
    first = jobs.enqueue(CASE, 1, [], "")
    jobs.JOBS[first]["status"] = "error"
    jobs.JOBS[first]["updatedAt"] = "2026-01-01T00:00:00+00:00"
    second = jobs.enqueue(CASE, 1, [], "")

    assert second == first

# enqueue 때 intake가 없으면 이후 디스크 intake를 쓰지 않고 새 접수를 수행한다
def test_first_instance_explicit_none_intake_snapshot_ignores_later_disk_intake(monkeypatch):
    seen = {"ran_intake": False}
    late = {"caseId": CASE["id"], "screening": {"confidence": 99}, "trace": [], "calls": [], "agentStats": {}}

    # 접수와 주장 응답을 모두 주는 가짜 모델
    class DomainClient:
        model = "fake"
        options = {}

        # 스키마 종류별 응답
        def chat_json(self, system, user, schema):
            props = schema["properties"]
            if "sentenceNos" in props:
                return {"sentenceNos": [1], "findKeyword": ""}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}
            if "isClickbait" in props:
                seen["ran_intake"] = True
                return {"offTopicSentenceNo": 0, "absentKeyword": "", "isClickbait": False, "confidence": 44, "reason": "새 접수", "claimType": "body_consistent"}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}
            return {"claims": [{"type": "body_consistent", "text": "본문 일치", "strength": 1, "evidence": [{"kind": "quote", "sentenceNo": 1, "quote": "합성 문장", "keyword": ""}]}]}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}

    import importlib

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=DomainClient) if name == "llm" else importlib.import_module(f"court.{name}"))
    monkeypatch.setattr(jobs, "_ensure_worker", lambda: None)
    monkeypatch.setattr(jobs.QUEUE, "put", lambda item: None)
    job_id = jobs.enqueue(CASE, 1, [], "")
    jobs.store.write_json(f"intake/{CASE['id']}.json", late)

    jobs._run(jobs.JOBS[job_id], 1)
    trial = json.loads((paths.DATA_DIR / "trials" / CASE["id"] / "1.json").read_text(encoding="utf-8"))

    assert seen["ran_intake"] is True
    assert trial["screening"]["confidence"] == 44
    assert json.loads((paths.DATA_DIR / "intake" / f"{CASE['id']}.json").read_text(encoding="utf-8"))["screening"]["confidence"] == 44


# 큐에 있던 실행도 시작 전에 버전 스냅샷 불일치를 거절한다
def test_queued_execution_rejects_version_snapshot_mismatch_before_model(monkeypatch):
    calls = []
    version = jobs._versions()

    # 호출되면 실패해야 하는 모델
    class Client:
        model = "fake"
        options = {}

        # 호출 기록
        def chat_json(self, system, user, schema):
            calls.append(system)
            return {"ok": 1}, {}

    monkeypatch.setattr(jobs, "_versions", lambda: {**version, "ontologyHash": "changed"})
    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=Client) if name == "llm" else types.SimpleNamespace(run=lambda *a, **k: {}))
    job = {
        "id": "version-start", "caseId": CASE["id"], "instance": 1, "status": "queued", "step": "대기",
        "done": 0, "total": 0, "error": None, "startedAt": None, "createdAt": "2026-01-01T00:00:00+00:00", "updatedAt": "2026-01-01T00:00:00+00:00",
        "attempt": 1, "graphVersion": "1", "_kind": "trial", "_case": CASE, "_cases": None, "_intake": None, "_prior": [], "_notes": "", "_events": [], "_partial": None,
        "_role": None, "_checkpoints": [], "_policy": {}, "_model": None, "_versions": version,
    }
    jobs.JOBS[job["id"]] = job

    jobs._run(job, 1)

    assert calls == []
    assert "버전" in (jobs.get("version-start")["error"] or "")

# 실행 중 스킬·온톨로지 버전이 바뀌면 다음 모델 호출과 최종 저장을 막는다
def test_mid_run_version_change_blocks_next_model_call_and_commit(monkeypatch):
    version = jobs._versions()
    version_checks = {"n": 0}
    external_calls = []

    # 첫 호출 뒤 버전이 바뀐 것처럼 보이게 하는 버전 함수
    def versions():
        version_checks["n"] += 1
        if version_checks["n"] >= 4:
            return {**version, "ontologyHash": "changed-mid-run"}
        return version

    # 외부 호출 횟수를 세는 모델
    class Client:
        model = "fake"
        options = {}

        # 모델 호출 기록
        def chat_json(self, system, user, schema):
            external_calls.append(system)
            return {"ok": len(external_calls)}, {"promptTokens": 1, "outputTokens": 1, "seconds": 0.01}

    # 두 번째 모델 호출을 시도하면 안 된다
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None):
        client.chat_json("first", "u", {"type": "object", "properties": {"ok": {"type": "integer"}}})
        client.chat_json("second", "u", {"type": "object", "properties": {"ok": {"type": "integer"}}})
        return {"caseId": case["id"], "instance": instance, "claims": [], "trace": [], "calls": [], "agentStats": {}}

    monkeypatch.setattr(jobs, "_versions", versions)
    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=Client) if name == "llm" else types.SimpleNamespace(run=run))
    job = {
        "id": "mid-version", "caseId": CASE["id"], "instance": 1, "status": "queued", "step": "대기",
        "done": 0, "total": 0, "error": None, "startedAt": None, "createdAt": "2026-01-01T00:00:00+00:00", "updatedAt": "2026-01-01T00:00:00+00:00",
        "attempt": 1, "graphVersion": "1", "_kind": "trial", "_case": CASE, "_cases": None, "_intake": None, "_prior": [], "_notes": "", "_events": [], "_partial": None,
        "_role": None, "_checkpoints": [], "_policy": {}, "_model": None, "_versions": version,
    }
    jobs.JOBS[job["id"]] = job

    jobs._run(job, 1)

    assert external_calls == ["first"]
    assert "버전" in (jobs.get("mid-version")["error"] or "")
    assert not (paths.DATA_DIR / "trials" / CASE["id"] / "1.json").exists()


@pytest.mark.parametrize("job_id", ["x" * 300, "x" * 65, "../trial", "invalid.id", "작업", ""])
# 잘못된 작업 식별자의 파일 접근 차단
def test_malformed_job_ids_are_missing_and_refuse_save(job_id):
    assert run_store.load(job_id) is None
    assert jobs.get(job_id) is None
    with pytest.raises(KeyError):
        jobs.retry(job_id)
    with pytest.raises(KeyError):
        jobs.cancel(job_id)
    with pytest.raises(ValueError, match="ID"):
        run_store.save({"id": job_id})


# 긴 작업 식별자의 API 오류 상태
def test_malformed_job_ids_return_api_404(env):
    path = "/api/jobs/" + "x" * 300
    assert env.get(path).status_code == 404
    assert env.post(path + "/retry").status_code == 404
    assert env.post(path + "/cancel").status_code == 404


@pytest.mark.parametrize("error_type", [ValueError, KeyError, OSError, URLError, TimeoutError])
# 실패와 성공의 실제 호출 비용 및 재시도 캐시 보존
def test_model_request_totals_survive_retry(monkeypatch, manual_queue, error_type):
    clock, invocations = {"seconds": 0.0}, {"model": 0, "run": 0}
    monkeypatch.setattr(jobs, "time", types.SimpleNamespace(time=time.time, monotonic=lambda: clock["seconds"]))

    # 실패 메타와 실제 경과 시간을 제공하는 모델
    class Client:
        model = "fake"
        options = {}

        # 첫 요청 실패 후 성공 응답
        def chat_json(self, system, user, schema):
            invocations["model"] += 1
            clock["seconds"] += 1.5
            if invocations["model"] == 1:
                error = error_type("실패")
                error.meta = {"promptTokens": 7, "outputTokens": 3}
                raise error
            return {"ok": 1}, {"promptTokens": 5, "outputTokens": 2, "seconds": 999}

    # 파싱 오류 복구 뒤에도 첫 실행을 중단하는 재판
    def run(case, instance, prior, client, **kwargs):
        invocations["run"] += 1
        session = Session(case, instance, client)
        session.ask("i1-P1", "prosecution", "draft", "same", {})
        if invocations["run"] == 1:
            raise RuntimeError("시도 중단")
        return {"claims": [], "calls": session.calls}

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=Client) if name == "llm" else types.SimpleNamespace(run=run))
    job_id = jobs.enqueue(CASE, 1, [])
    jobs._run(jobs.JOBS[job_id], 1)
    assert jobs.get(job_id)["status"] == "error"
    assert run_store.load(job_id)["modelCallsSnapshot"][CASE["id"]]["trial"]["failed"] == 1
    jobs.JOBS.clear()
    jobs.retry(job_id)
    jobs._run(jobs.JOBS[job_id], 2)

    assert jobs.get(job_id)["status"] == "done"
    assert invocations["model"] == 2
    trial = jobs.store.load_trial(CASE["id"], 1)
    assert trial["execution"]["modelCalls"] == {"calls": 2, "failed": 1, "promptTokens": 12, "outputTokens": 5, "seconds": 3.0}


# 접수와 변론 스키마별 고정 응답 모델
class IntakeClient:
    model = "fake"
    options = {}

    # 서기와 양측 변론의 최소 응답
    def chat_json(self, system, user, schema):
        props = schema["properties"]
        if "sentenceNos" in props:
            reply = {"sentenceNos": [1], "findKeyword": ""}
        elif "isClickbait" in props:
            reply = {"offTopicSentenceNo": 0, "absentKeyword": "", "isClickbait": False, "confidence": 50, "reason": "정상", "claimType": "body_consistent"}
        else:
            reply = {"claims": [{"type": "body_consistent", "text": "본문 일치", "strength": 1, "evidence": [{"kind": "quote", "sentenceNo": 1, "quote": "합성 문장", "keyword": ""}]}]}
        return reply, {"promptTokens": 10, "outputTokens": 5, "seconds": 0.01}


# 인라인 서기 비용과 변론 비용의 별도 저장
def test_inline_clerk_cost_is_saved_only_in_intake(monkeypatch, manual_queue):
    import importlib

    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=IntakeClient) if name == "llm" else importlib.import_module(f"court.{name}"))
    job_id = jobs.enqueue(CASE, 1, [])
    jobs._run(jobs.JOBS[job_id], 1)

    assert jobs.get(job_id)["status"] == "done"
    trial = jobs.store.load_trial(CASE["id"], 1)
    intake = jobs.store.load_intake(CASE["id"])
    assert intake["modelCalls"]["calls"] == 2
    assert intake["modelCalls"]["promptTokens"] == 20
    assert trial["execution"]["modelCalls"]["calls"] == 4
    assert trial["execution"]["modelCalls"]["promptTokens"] == 40
    assert all(call["role"] != "clerk" for call in trial["calls"])


# 접수 배치의 사건별 비용 귀속과 재시도 번호 저장
def test_intake_batch_costs_and_trace_use_current_case_and_attempt(monkeypatch, manual_queue):
    import importlib

    cases = [CASE, {**CASE, "id": "second-case", "title": "두 번째 합성 제목"}]
    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=IntakeClient) if name == "llm" else importlib.import_module(f"court.{name}"))
    job_id = jobs.enqueue_intake(cases)
    job = jobs.JOBS[job_id]
    job["status"] = "interrupted"
    jobs.retry(job_id)
    jobs._run(job, 2)

    assert jobs.get(job_id)["status"] == "done"
    for case in cases:
        doc = jobs.store.load_intake(case["id"])
        assert doc["modelCalls"]["calls"] == 2
        assert doc["modelCalls"]["promptTokens"] == 20
        assert doc["modelCalls"]["failed"] == 0
        assert {e["attempt"] for e in doc["trace"]} == {2}


@pytest.mark.parametrize("fails", [False, True])
# 재판 우선 실행 동안 접수 선점 표시와 예외 후 해제
def test_intake_preemption_is_internal_and_resets(monkeypatch, manual_queue, fails):
    seen = []

    # 대기 재판 처리 중 접수 작업 상태 확인
    def waiting_trials():
        row = next(row for row in jobs.active() if row["id"] == job_id)
        seen.append((row["status"], row["_preempted"]))
        assert "_preempted" not in jobs.get(job_id)
        if fails:
            raise OSError("재판 실패")

    monkeypatch.setattr(jobs, "_run_waiting_trials", waiting_trials)
    monkeypatch.setattr(jobs.store, "court", lambda name: types.SimpleNamespace(OllamaClient=lambda: types.SimpleNamespace(model="fake", options={})) if name == "llm" else types.SimpleNamespace(run_case=lambda *args, **kwargs: None))
    job_id = jobs.enqueue_intake([CASE])
    job = jobs.JOBS[job_id]
    jobs._run(job, 1)

    assert seen == [("running", True)]
    assert job["_preempted"] is False
    assert jobs.get(job_id)["status"] == ("error" if fails else "done")
