# 재판 생성 작업 큐
import copy
import hashlib
import inspect
import itertools
import json
import queue
import threading
import time
import uuid
from datetime import datetime, timezone

from court import paths, workflow
from court.errors import ModelError

from app import run_store, store

JOBS: dict[str, dict] = {}
QUEUE: queue.PriorityQueue = queue.PriorityQueue()
PRIORITY = {"trial": 0, "intake": 1}
ORDER = itertools.count()
STATE_LOCK = store.LOCK
WORKER: list[threading.Thread] = []
HEALTH_LOCK = threading.Lock()
HEALTH_CACHE: dict = {}
HEALTH_TTL = 5.0


# 모델 미연결에 따른 실행 거절
class ModelUnavailableError(Exception):
    pass


# 짧은 캐시를 공유하는 모델 연결 상태
def model_health(force: bool = False) -> dict:
    with HEALTH_LOCK:
        key, model = None, ""
        try:
            factory = store.court("llm").OllamaClient
            client = factory()
            model = client.model
            key = (factory, model, getattr(client, "host", ""))
            if not force and HEALTH_CACHE.get("key") == key and time.monotonic() - HEALTH_CACHE["at"] < HEALTH_TTL:
                return dict(HEALTH_CACHE["value"])
            health = {"ok": True, "ollama": bool(client.available()), "model": model}
        except Exception:
            health = {"ok": True, "ollama": False, "model": model}
        HEALTH_CACHE.update(key=key, at=time.monotonic(), value=health)
        return dict(health)


# 모델 연결 상태의 공통 차단 사유
def model_reason(health: dict) -> str:
    return "" if health["ollama"] else "AI 모델에 연결할 수 없습니다. Ollama 실행 및 모델 설치를 확인하세요"


# 실행 직전 모델 연결 검사
def require_model() -> None:
    reason = model_reason(model_health(force=True))
    if reason:
        raise ModelUnavailableError(reason)


# 현재 시각 문자열
def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# 안정적 내용 해시
def _hash(obj) -> str:
    data = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False, sort_keys=True, default=str).encode()
    return hashlib.sha256(data).hexdigest()


# 공개 작업 필드 복사본
def _public(job: dict) -> dict:
    return {k: v for k, v in job.items() if not k.startswith("_")}


# 저장 가능한 실행 스냅샷
def _snapshot(job: dict) -> dict:
    return {
        **_public(job),
        "events": copy.deepcopy(job.get("_events", [])),
        "partial": copy.deepcopy(job.get("_partial")),
        "checkpoints": copy.deepcopy(job.get("_checkpoints", [])),
        "caseSnapshot": copy.deepcopy(job.get("_case")),
        "priorSnapshot": copy.deepcopy(job.get("_prior", [])),
        "casesSnapshot": copy.deepcopy(job.get("_cases")),
        "intakeSnapshot": copy.deepcopy(job.get("_intake")),
        "policySnapshot": copy.deepcopy(job.get("_policy")),
        "modelSnapshot": copy.deepcopy(job.get("_model")),
        "modelCallsSnapshot": copy.deepcopy(job.get("_model_calls", {})),
        "versionSnapshot": copy.deepcopy(job.get("_versions", {})),
        "kind": job.get("_kind"),
        "role": job.get("_role"),
        "notes": job.get("_notes", ""),
    }


# 실행 스냅샷 저장
def _save(job: dict) -> None:
    run_store.save(_snapshot(job))


# 실행 시도 유효성
def _live(job: dict, attempt: int) -> bool:
    return job.get("attempt") == attempt and job.get("status") != "cancelled"


# 실행 계속 가능 여부 검사
def _ensure_live(job: dict, attempt: int, started: float | None = None) -> None:
    if not _live(job, attempt):
        raise RuntimeError("작업이 취소되었습니다")
    if started is not None and time.time() - started > workflow.RUN_SECONDS_LIMIT:
        raise TimeoutError("실행 시간이 30분을 넘었습니다")


# 유효 작업 상태 갱신
def _update_live(job: dict, attempt: int, started: float | None = None, **fields) -> None:
    with STATE_LOCK:
        _ensure_live(job, attempt, started)
        fields.setdefault("updatedAt", _now())
        job.update(fields)
        _save(job)


# 오류 상태 원자 기록
def _fail_live(job: dict, attempt: int, message: str) -> None:
    with STATE_LOCK:
        if not _live(job, attempt):
            _save(job)
            return
        event = {"seq": len(job["_events"]) + 1, "at": _now(), "agentId": "checker", "kind": "error", "text": message, "publicText": "작업 오류", "claimId": None, "nodeId": "escalate", "fromNode": None, "reason": "error", "subjectAgentId": "checker", "attempt": attempt}
        job["_events"].append(event)
        job.update(status="error", error=message, updatedAt=_now())
        _save(job)


# 실행 버전 스냅샷 검사
def _ensure_versions(job: dict) -> None:
    if job.get("_versions") != _versions():
        raise ValueError("저장된 실행 버전이 달라 실행할 수 없습니다")


# 저장 실행을 작업 메모리로 복원
def _job_from_run(run: dict) -> dict:
    case = copy.deepcopy(run.get("caseSnapshot"))
    cases = copy.deepcopy(run.get("casesSnapshot"))
    prior = copy.deepcopy(run.get("priorSnapshot") or [])
    return {
        "id": run["id"], "caseId": run.get("caseId", ""), "instance": run.get("instance", 0), "status": run.get("status", "interrupted"), "step": run.get("step", "중단됨"),
        "done": run.get("done", 0), "total": run.get("total", 0), "error": run.get("error"), "startedAt": run.get("startedAt"), "createdAt": run.get("createdAt"),
        "updatedAt": run.get("updatedAt"), "attempt": run.get("attempt", 1), "graphVersion": run.get("graphVersion", workflow.VERSION),
        "_kind": run.get("kind", "trial"), "_case": case, "_cases": cases, "_intake": copy.deepcopy(run.get("intakeSnapshot")), "_prior": prior, "_notes": run.get("notes", ""), "_events": run.get("events", []), "_partial": run.get("partial"),
        "_role": run.get("role"), "_checkpoints": run.get("checkpoints", []), "_policy": run.get("policySnapshot"), "_model": run.get("modelSnapshot"), "_versions": run.get("versionSnapshot", {}),
        "_model_calls": copy.deepcopy(run.get("modelCallsSnapshot", {})),
    }


# 사건과 처리 종류별 실제 모델 요청 누계
def _model_totals(job: dict, case_id: str, kind: str) -> dict:
    return copy.deepcopy(job.get("_model_calls", {}).get(case_id, {}).get(kind, {"calls": 0, "failed": 0, "promptTokens": 0, "outputTokens": 0, "seconds": 0.0}))


# 저장 응답 캐시를 쓰는 모델 클라이언트
class CachedClient:
    # 원본 클라이언트와 작업 상태
    def __init__(self, inner, job: dict, attempt: int, started: float):
        self.inner, self.job, self.attempt, self.started = inner, job, attempt, started
        self.model = inner.model
        self.options = getattr(inner, "options", {})
        self.requests = {}

    # 동일 입력의 응답과 파싱 실패 순차 재생
    def chat_json(self, system, user, schema):
        prompt = {"system": system, "user": user, "schema": schema}
        key = json.dumps(prompt, ensure_ascii=False, sort_keys=True)
        with STATE_LOCK:
            _ensure_live(self.job, self.attempt, self.started)
            _ensure_versions(self.job)
            index = self.requests.get(key, 0)
            self.requests[key] = index + 1
            checkpoints = [c for c in self.job["_checkpoints"] if c["key"] == key and c["status"] in ("complete", "invalid")]
            cached = checkpoints[index] if index < len(checkpoints) else None
            case_id = self.job["caseId"]
            kind = "intake" if self.job["_kind"] == "intake" or self.job.get("_role") == "clerk" else "trial"
        if cached:
            if cached["status"] == "invalid":
                raise ValueError(cached.get("error", "저장된 모델 응답을 해석하지 못했습니다"))
            return copy.deepcopy(cached["reply"]), {**copy.deepcopy(cached["meta"]), "cached": True}
        requested_at = time.monotonic()
        meta, failed = {}, False
        try:
            try:
                reply, meta = self.inner.chat_json(system, user, schema)
            except Exception as e:
                meta, failed = getattr(e, "meta", {}) or {}, True
                raise
            finally:
                seconds = time.monotonic() - requested_at
                with STATE_LOCK:
                    totals = _model_totals(self.job, case_id, kind)
                    totals["calls"] += 1
                    totals["failed"] += int(failed)
                    totals["promptTokens"] += meta.get("promptTokens", 0) or 0
                    totals["outputTokens"] += meta.get("outputTokens", 0) or 0
                    totals["seconds"] += seconds
                    self.job.setdefault("_model_calls", {}).setdefault(case_id, {})[kind] = totals
        except (ValueError, KeyError) as e:
            with STATE_LOCK:
                _ensure_live(self.job, self.attempt, self.started)
                _ensure_versions(self.job)
                self.job["_checkpoints"].append({"key": key, "input": copy.deepcopy(prompt), "status": "invalid", "error": str(e)})
                _save(self.job)
            raise
        with STATE_LOCK:
            _ensure_live(self.job, self.attempt, self.started)
            _ensure_versions(self.job)
            self.job["_checkpoints"].append({"key": key, "input": copy.deepcopy(prompt), "status": "complete", "reply": copy.deepcopy(reply), "meta": copy.deepcopy(meta)})
            _save(self.job)
        return reply, meta


# 작업 상태 복사본 조회
def get(job_id: str, since: int = 0) -> dict | None:
    with STATE_LOCK:
        job = JOBS.get(job_id)
        if not job:
            saved = run_store.load(job_id)
            if not saved:
                return None
            job = _job_from_run(saved)
            JOBS[job_id] = job
        return {**_public(job), "events": [e for e in job["_events"] if e["seq"] > since], "partial": copy.deepcopy(job["_partial"])}


# 사건·심급 최신 작업 조회
def latest(case_id: str, instance: int) -> dict | None:
    with STATE_LOCK:
        candidates = [j for j in JOBS.values() if j.get("caseId") == case_id and j.get("instance") == instance]
        if candidates:
            job = max(candidates, key=lambda j: (j.get("updatedAt") or "", j.get("createdAt") or "", j.get("id") or ""))
            return {**_public(job), "events": copy.deepcopy(job["_events"]), "partial": copy.deepcopy(job["_partial"])}
    saved = run_store.latest(case_id, instance)
    return get(saved["id"]) if saved else None


# 대기·진행 중 작업 목록
def active() -> list[dict]:
    with STATE_LOCK:
        return [
            {**_public(j), "_kind": j["_kind"], "_role": j["_role"], "_preempted": j.get("_preempted", False), "_recent": list(j["_events"][-10:]), "_text": j["_events"][-1]["text"] if j["_events"] else j["step"]}
            for j in JOBS.values() if j["status"] in ("queued", "running")
        ]


# 작업 상태 갱신
def _update(job: dict, **fields) -> None:
    with STATE_LOCK:
        fields.setdefault("updatedAt", _now())
        job.update(fields)
        _save(job)


# 작업 이벤트 기록
def _record_event(job: dict, event: dict, partial: dict | None, role: str | None, attempt: int | None = None) -> None:
    with STATE_LOCK:
        if attempt is not None and not _live(job, attempt):
            return
        event_attempt = attempt if attempt is not None else event.get("attempt", job.get("attempt"))
        job["_events"].append({**event, "seq": len(job["_events"]) + 1, "attempt": event_attempt})
        if partial is not None:
            job["_partial"] = partial
        job["_role"] = role
        job["updatedAt"] = _now()
        _save(job)


# 모델 스냅샷 검사
def _bind_model(job: dict, client) -> None:
    actual = {"name": client.model, "options": copy.deepcopy(client.options)}
    stored = job.get("_model")
    if stored and stored != actual:
        raise ValueError("저장된 모델 설정과 현재 모델 설정이 달라 재시도할 수 없습니다")
    job["_model"] = actual


# 접수 결과 저장 콜백 생성
def _save_intake_callback(job: dict, attempt: int, started: float):
    # 접수 결과 원자 저장
    def save(doc: dict) -> None:
        with STATE_LOCK:
            _ensure_live(job, attempt, started)
            doc["modelCalls"] = _model_totals(job, doc["caseId"], "intake")
            job["_intake"] = copy.deepcopy(doc)
            store.write_json(f"intake/{doc['caseId']}.json", doc)
            _save(job)
    return save


# 작업 하나 실행
def _run(job: dict, queued_attempt: int) -> None:
    attempt = queued_attempt
    started = time.time()
    with STATE_LOCK:
        if job["attempt"] != attempt or job["status"] != "queued":
            _save(job)
            return
        job.update(status="running", step="시작", startedAt=_now(), updatedAt=_now())
        _save(job)

    # 진행률 보고
    def on_step(step: str, done: int, total: int) -> None:
        _update_live(job, attempt, started, step=step, done=done, total=total)

    # 이벤트 보고
    def on_event(event: dict, partial: dict | None, role: str | None = None) -> None:
        _record_event(job, event, partial, role, attempt)

    try:
        with STATE_LOCK:
            _ensure_live(job, attempt, started)
            _ensure_versions(job)
        inner = store.court("llm").OllamaClient()
        client = CachedClient(inner, job, attempt, started)
        with STATE_LOCK:
            _ensure_live(job, attempt, started)
            _bind_model(job, client)
            _save(job)
        if job["_kind"] == "intake":
            _run_intake(job, client, on_event, attempt, started)
        else:
            run_trial = store.court("instances").run
            kwargs = {"judge_notes": job["_notes"], "on_step": on_step, "on_event": on_event}
            signature = inspect.signature(run_trial).parameters
            if "attempt" in signature:
                kwargs["attempt"] = attempt
            if "intake_doc" in signature:
                kwargs["intake_doc"] = copy.deepcopy(job.get("_intake"))
            if "save_intake" in signature:
                kwargs["save_intake"] = _save_intake_callback(job, attempt, started)
            record = run_trial(job["_case"], job["instance"], job["_prior"], client, **kwargs)
            record["caseId"] = job["caseId"]
            record["instance"] = job["instance"]
            record["execution"] = {"version": workflow.VERSION, "runId": job["id"], "attempt": attempt, "modelCalls": _model_totals(job, job["caseId"], "trial")}
            with STATE_LOCK:
                _ensure_live(job, attempt, started)
                _ensure_versions(job)
                existing = store.load_trial(job["caseId"], job["instance"])
                if existing is not None:
                    if existing.get("execution", {}).get("runId") != job["id"]:
                        raise ValueError("이미 다른 실행의 재판 기록이 있습니다")
                else:
                    store.save_trial(job["caseId"], job["instance"], record)
                job.update(status="done", step="완료", updatedAt=_now())
                _save(job)
            return
        _update_live(job, attempt, started, status="done", step="완료")
    except Exception as e:
        message = str(e) if isinstance(e, ModelError) else f"{type(e).__name__}: {e}"
        _fail_live(job, attempt, message)


# 접수 검토 일괄 작업 실행
def _run_intake(job: dict, client, on_event, attempt: int, started: float) -> None:
    cases = job["_cases"]
    _update_live(job, attempt, started, total=len(cases))
    for i, case in enumerate(cases):
        with STATE_LOCK:
            job["_preempted"] = True
        try:
            _run_waiting_trials()
        finally:
            with STATE_LOCK:
                job["_preempted"] = False
        _update_live(job, attempt, started, caseId=case["id"], step=f"{case['id']} 접수 검토", done=i)
        run_case = store.court("intake").run_case

        # 접수 결과 저장
        def save_result(doc: dict) -> None:
            with STATE_LOCK:
                _ensure_live(job, attempt, started)
                doc["modelCalls"] = _model_totals(job, doc["caseId"], "intake")
                store.write_json(f"intake/{doc['caseId']}.json", doc)
                _save(job)

        # 사건 식별자를 고정한 접수 이벤트 보고
        def case_event(event: dict, partial: dict | None, role: str | None = None, case_id: str = case["id"]) -> None:
            on_event({**event, "caseId": case_id}, partial, role)

        kwargs = {"on_event": case_event}
        if "attempt" in inspect.signature(run_case).parameters:
            kwargs["attempt"] = attempt
        if "save_result" in inspect.signature(run_case).parameters:
            kwargs["save_result"] = save_result
        elif "should_save" in inspect.signature(run_case).parameters:
            kwargs["should_save"] = lambda: _live(job, attempt)
        run_case(case, client, **kwargs)
        with STATE_LOCK:
            _ensure_live(job, attempt, started)
            _ensure_versions(job)
    _update_live(job, attempt, started, done=len(cases))


# 대기 중인 재판 작업 우선 실행
def _run_waiting_trials() -> None:
    while QUEUE.queue and QUEUE.queue[0][0] == PRIORITY["trial"]:
        _, _, job_id, attempt = QUEUE.get_nowait()
        with STATE_LOCK:
            job = JOBS.get(job_id)
        if job:
            _run(job, attempt)


# 작업 소비 루프
def _loop() -> None:
    while True:
        _, _, job_id, attempt = QUEUE.get()
        with STATE_LOCK:
            job = JOBS.get(job_id)
        if job:
            _run(job, attempt)


# 작업 스레드 시작
def _ensure_worker() -> None:
    with STATE_LOCK:
        if not WORKER:
            t = threading.Thread(target=_loop, daemon=True)
            WORKER.append(t)
            t.start()


# 저장 실행 조회
def _matching_saved(kind: str, same) -> dict | None:
    runs = [_job_from_run(r) for r in run_store.all_runs() if r]
    matches = [j for j in runs if j["_kind"] == kind and same(j)]
    return max(matches, key=lambda j: (j.get("updatedAt") or "", j.get("createdAt") or "", j.get("id") or "")) if matches else None


# 작업 등록
def _enqueue(job: dict, same) -> str:
    with STATE_LOCK:
        existing = next((j for j in JOBS.values() if j["_kind"] == job["_kind"] and same(j)), None) or _matching_saved(job["_kind"], same)
        if existing:
            JOBS[existing["id"]] = existing
            return existing["id"]
        JOBS[job["id"]] = job
        _save(job)
    _ensure_worker()
    QUEUE.put((PRIORITY[job["_kind"]], next(ORDER), job["id"], job["attempt"]))
    return job["id"]


# 버전 스냅샷 생성
def _versions() -> dict:
    try:
        ontology_doc = store.court("ontology").load()
        ontology_version = ontology_doc.get("version")
    except Exception:
        ontology_version = None
    try:
        ontology_hash = _hash((paths.SKILLS_DIR / "ontology.yaml").read_bytes())
    except OSError:
        ontology_hash = ""
    skill_hashes = {}
    for path in sorted(paths.SKILLS_DIR.glob("*/SKILL.md")):
        try:
            skill_hashes[path.parent.name] = _hash(path.read_bytes())
        except OSError:
            continue
    return {"graph": workflow.VERSION, "ontology": ontology_version, "ontologyHash": ontology_hash, "skillHashes": skill_hashes}


# 정책 스냅샷 생성
def _policy_snapshot() -> dict:
    try:
        return copy.deepcopy(store.load_policy())
    except Exception:
        return {}


# 재판 생성 작업 등록
def enqueue(case: dict, instance: int, prior: list[dict], judge_notes: str = "") -> str:
    now = _now()
    job = {
        "id": uuid.uuid4().hex[:12], "caseId": case["id"], "instance": instance, "status": "queued", "step": "대기",
        "done": 0, "total": 0, "error": None, "startedAt": None, "createdAt": now, "updatedAt": now, "attempt": 1, "graphVersion": workflow.VERSION,
        "_kind": "trial", "_case": copy.deepcopy(case), "_cases": None, "_intake": copy.deepcopy(store.load_intake(case["id"])) if instance == 1 else None,
        "_prior": copy.deepcopy(prior), "_notes": judge_notes, "_events": [], "_partial": None, "_role": None, "_checkpoints": [],
        "_policy": _policy_snapshot(), "_model": None, "_versions": _versions(),
    }
    return _enqueue(job, lambda j: j["caseId"] == case["id"] and j["instance"] == instance)


# 접수 검토 일괄 작업 등록
def enqueue_intake(cases: list[dict]) -> str:
    now = _now()
    job = {
        "id": uuid.uuid4().hex[:12], "caseId": cases[0]["id"] if cases else "", "instance": 0, "status": "queued", "step": "대기",
        "done": 0, "total": len(cases), "error": None, "startedAt": None, "createdAt": now, "updatedAt": now, "attempt": 1, "graphVersion": workflow.VERSION,
        "_kind": "intake", "_case": None, "_cases": copy.deepcopy(cases), "_intake": None, "_prior": [], "_notes": "", "_events": [], "_partial": None, "_role": None, "_checkpoints": [],
        "_policy": _policy_snapshot(), "_model": None, "_versions": _versions(),
    }
    ids = {c["id"] for c in cases}
    return _enqueue(job, lambda j: {c["id"] for c in (j.get("_cases") or [])} == ids)


# 재시도 전제조건의 차단 사유
def _retry_reason(job: dict) -> str:
    if job["status"] not in ("error", "interrupted", "cancelled"):
        return "이미 실행 중입니다" if job["status"] in ("queued", "running") else "재시도할 수 없는 작업 상태입니다"
    if job["_kind"] == "trial" and store.load_trial(job["caseId"], job["instance"]) is not None:
        return "이미 저장된 재판 기록이 있어 재시도할 수 없습니다"
    if job.get("graphVersion") != workflow.VERSION:
        return "실행 그래프 버전이 달라 재시도할 수 없습니다"
    if job.get("_versions") != _versions():
        return "저장된 실행 버전이 달라 재시도할 수 없습니다"
    if job["attempt"] >= workflow.MAX_RUN_ATTEMPTS:
        return "재시도 횟수를 초과했습니다"
    if job["_kind"] == "trial" and job.get("_case") is None:
        return "사건 원문을 찾을 수 없어 재시도할 수 없습니다"
    if job["_kind"] == "intake" and job.get("_cases") is None:
        return "접수 사건 원문을 찾을 수 없어 재시도할 수 없습니다"
    return ""


# 저장 스냅샷을 포함한 재시도 가능 여부
def retry_reason(job_id: str, model_block: str | None = None) -> str:
    with STATE_LOCK:
        saved = run_store.load(job_id)
        job = JOBS.get(job_id) or (_job_from_run(saved) if saved else None)
        reason = _retry_reason(job) if job else "작업을 찾을 수 없습니다"
    return reason or (model_reason(model_health()) if model_block is None else model_block)


# 작업 재시도
def retry(job_id: str) -> str:
    with STATE_LOCK:
        saved = run_store.load(job_id)
        job = JOBS.get(job_id) or (_job_from_run(saved) if saved else None)
        if not job:
            raise KeyError(job_id)
        if job["status"] in ("queued", "running"):
            return job_id
        reason = _retry_reason(job)
        if reason:
            raise ValueError(reason)
    require_model()
    with STATE_LOCK:
        job = JOBS.get(job_id) or job
        if job["status"] in ("queued", "running"):
            return job_id
        reason = _retry_reason(job)
        if reason:
            raise ValueError(reason)
        job["attempt"] += 1
        job["status"] = "queued"
        job["step"] = "대기"
        job["error"] = None
        job["updatedAt"] = _now()
        JOBS[job_id] = job
        _save(job)
    _ensure_worker()
    QUEUE.put((PRIORITY[job["_kind"]], next(ORDER), job["id"], job["attempt"]))
    return job_id


# 작업 취소
def cancel(job_id: str) -> dict:
    with STATE_LOCK:
        saved = run_store.load(job_id)
        job = JOBS.get(job_id) or (_job_from_run(saved) if saved else None)
        if not job:
            raise KeyError(job_id)
        if job["status"] != "cancelled":
            reason = cancel_reason(job["status"])
            if reason:
                raise ValueError(reason)
            job["status"] = "cancelled"
            job["step"] = "취소됨"
            job["updatedAt"] = _now()
            JOBS[job_id] = job
            _save(job)
        return {**_public(job), "events": copy.deepcopy(job["_events"]), "partial": copy.deepcopy(job["_partial"])}


# 취소 가능한 실행 상태의 공통 판정
def cancel_reason(status: str) -> str:
    if status in ("queued", "running"):
        return ""
    if status == "cancelled":
        return "이미 취소된 실행입니다"
    if status == "done":
        return "완료된 작업은 취소할 수 없습니다"
    return "실패·중단된 실행은 취소할 수 없습니다. 재시도를 사용하세요"


# 저장 실행 복구
def recover() -> None:
    with STATE_LOCK:
        interrupted = {run["id"] for run in run_store.recover_interrupted()}
        for run in run_store.all_runs():
            if not run or run.get("status") == "done":
                continue
            trial = store.load_trial(run["caseId"], run["instance"]) if run.get("kind", "trial") == "trial" and run.get("caseId") and run.get("instance") else None
            reconciled = bool(trial and trial.get("execution", {}).get("runId") == run["id"])
            if reconciled:
                run["status"] = "done"
                run["step"] = "완료"
                run_store.save(run)
            if reconciled or run["id"] in interrupted:
                JOBS[run["id"]] = _job_from_run(run)
