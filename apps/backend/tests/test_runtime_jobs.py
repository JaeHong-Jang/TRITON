# 실행 런타임 테스트
import json
import time
import types

import pytest

from app import jobs, run_store
from court import paths, workflow


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
    assert trial["execution"] == {"version": "1", "runId": job_id, "attempt": 2}
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
