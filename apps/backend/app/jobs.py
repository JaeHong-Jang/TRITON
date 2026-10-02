# 재판 생성 작업 큐
import copy
import itertools
import queue
import threading
import uuid
from datetime import datetime, timezone

from court.errors import ModelError

from app import store

JOBS: dict[str, dict] = {}
QUEUE: queue.PriorityQueue = queue.PriorityQueue()
PRIORITY = {"trial": 0, "intake": 1}
ORDER = itertools.count()
STATE_LOCK = threading.Lock()
WORKER: list[threading.Thread] = []


# 공개 작업 필드 복사본 (비공개 필드 제외)
def _public(job: dict) -> dict:
    return {k: v for k, v in job.items() if not k.startswith("_")}


# 작업 상태 복사본 조회 (since 이후 이벤트와 중간 기록 포함)
def get(job_id: str, since: int = 0) -> dict | None:
    with STATE_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return None
        return {**_public(job), "events": [e for e in job["_events"] if e["seq"] > since], "partial": copy.deepcopy(job["_partial"])}


# 대기·진행 중 작업 목록 (이벤트·중간 기록 제외, 마지막 이벤트와 역할 포함)
def active() -> list[dict]:
    with STATE_LOCK:
        return [
            {**_public(j), "_kind": j["_kind"], "_role": j["_role"], "_recent": list(j["_events"][-10:]), "_text": j["_events"][-1]["text"] if j["_events"] else j["step"]}
            for j in JOBS.values() if j["status"] in ("queued", "running")
        ]


# 작업 상태 갱신
def _update(job: dict, **fields) -> None:
    with STATE_LOCK:
        job.update(fields)


# 작업 이벤트 기록 (작업 안에서 1부터 다시 번호 매김)
def _record_event(job: dict, event: dict, partial: dict | None, role: str | None) -> None:
    with STATE_LOCK:
        job["_events"].append({**event, "seq": len(job["_events"]) + 1})
        if partial is not None:
            job["_partial"] = partial
        job["_role"] = role


# 작업 하나 실행
def _run(job: dict) -> None:
    _update(job, status="running", step="시작", startedAt=datetime.now(timezone.utc).isoformat(timespec="seconds"))

    # 진행률 보고
    def on_step(step: str, done: int, total: int) -> None:
        _update(job, step=step, done=done, total=total)

    # 이벤트 보고
    def on_event(event: dict, partial: dict | None, role: str | None = None) -> None:
        _record_event(job, event, partial, role)

    try:
        client = store.court("llm").OllamaClient()
        if job["_kind"] == "intake":
            _run_intake(job, client, on_event)
        else:
            record = store.court("instances").run(
                job["_case"], job["instance"], job["_prior"], client, judge_notes=job["_notes"], on_step=on_step, on_event=on_event
            )
            record["caseId"] = job["caseId"]
            record["instance"] = job["instance"]
            store.save_trial(job["caseId"], job["instance"], record)
        _update(job, status="done", step="완료")
    except Exception as e:
        message = str(e) if isinstance(e, ModelError) else f"{type(e).__name__}: {e}"
        _record_event(job, {"seq": 0, "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "agentId": "checker", "kind": "error", "text": message, "publicText": "작업 오류", "claimId": None}, None, "checker")
        _update(job, status="error", error=message)


# 접수 검토 일괄 작업 실행
def _run_intake(job: dict, client, on_event) -> None:
    cases = job["_case"]
    _update(job, total=len(cases))
    for i, case in enumerate(cases):
        _run_waiting_trials()
        _update(job, caseId=case["id"], step=f"{case['id']} 접수 검토", done=i)
        store.court("intake").run_case(case, client, on_event)
    _update(job, done=len(cases))


# 대기 중인 재판 작업을 접수 사이에 먼저 실행 (GPU는 한 번에 한 호출)
def _run_waiting_trials() -> None:
    while QUEUE.queue and QUEUE.queue[0][0] == PRIORITY["trial"]:
        _run(QUEUE.get_nowait()[2])


# 작업 소비 루프
def _loop() -> None:
    while True:
        _run(QUEUE.get()[2])


# 작업 스레드 시작
def _ensure_worker() -> None:
    with STATE_LOCK:
        if not WORKER:
            t = threading.Thread(target=_loop, daemon=True)
            WORKER.append(t)
            t.start()


# 작업 등록 (같은 종류·대상 진행 중 작업이 있으면 그 id 반환)
def _enqueue(job: dict, same) -> str:
    with STATE_LOCK:
        running = next((j for j in JOBS.values() if j["status"] in ("queued", "running") and j["_kind"] == job["_kind"] and same(j)), None)
        if running:
            return running["id"]
        JOBS[job["id"]] = job
    _ensure_worker()
    QUEUE.put((PRIORITY[job["_kind"]], next(ORDER), job))
    return job["id"]


# 재판 생성 작업 등록
def enqueue(case: dict, instance: int, prior: list[dict], judge_notes: str = "") -> str:
    job = {
        "id": uuid.uuid4().hex[:12], "caseId": case["id"], "instance": instance, "status": "queued", "step": "대기",
        "done": 0, "total": 0, "error": None, "startedAt": None,
        "_kind": "trial", "_case": case, "_prior": prior, "_notes": judge_notes, "_events": [], "_partial": None, "_role": None,
    }
    return _enqueue(job, lambda j: j["caseId"] == case["id"] and j["instance"] == instance)


# 접수 검토 일괄 작업 등록
def enqueue_intake(cases: list[dict]) -> str:
    job = {
        "id": uuid.uuid4().hex[:12], "caseId": cases[0]["id"] if cases else "", "instance": 0, "status": "queued", "step": "대기",
        "done": 0, "total": len(cases), "error": None, "startedAt": None,
        "_kind": "intake", "_case": cases, "_prior": [], "_notes": "", "_events": [], "_partial": None, "_role": None,
    }
    ids = {c["id"] for c in cases}
    return _enqueue(job, lambda j: {c["id"] for c in j["_case"]} == ids)
