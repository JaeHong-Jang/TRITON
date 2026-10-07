# API 라우트
import json
from typing import Literal

from court import paths
from fastapi import APIRouter, HTTPException, Path, status

from app import console, execution, jobs, lab, ledger, projection, stats, store, summary
from app.schemas import IntakeIn, LedgerIn, NewCaseIn, PolicyIn, SessionIn, TrialIn, VariantIn

router = APIRouter(prefix="/api")


# 사건 조회 또는 404
def _case_or_404(case_id: str) -> dict:
    case = store.get_case(case_id)
    if not case:
        raise HTTPException(404, "사건을 찾을 수 없습니다")
    return case


# 법정 최종 판결 여부 (실험실 기록 제외)
def _is_final(case_id: str) -> bool:
    return any(e["type"] == "final" and not e.get("labSessionId") for e in store.load_ledger(case_id))


# 서버 상태 확인
@router.get("/health")
def health() -> dict:
    return jobs.model_health()


# 구현 현황 조회
@router.get("/progress")
def progress():
    path = paths.ROOT / "tools" / "progress.json"
    if not path.exists():
        raise HTTPException(404, "progress.json이 없습니다")
    return json.loads(path.read_text(encoding="utf-8"))


# 온톨로지 조회
@router.get("/ontology")
def ontology():
    return store.court("ontology").load()


# 사건 목록 조회
@router.get("/cases")
def list_cases(track: Literal["summary", "trial"] | None = None, stage: Literal["new", "in_trial", "appealed", "final"] | None = None):
    by_case: dict[str, list[dict]] = {}
    for e in store.load_ledger():
        by_case.setdefault(e["caseId"], []).append(e)
    rows = [summary.case_summary(c, store.load_trials(c["id"]), by_case.get(c["id"], [])) for c in store.load_cases()]
    return [r for r in rows if (not track or r["docket"]["track"] == track) and (not stage or r["progress"]["stage"] == stage)]


# 직접 기사 등록
@router.post("/cases", status_code=status.HTTP_201_CREATED)
def create_case(body: NewCaseIn):
    try:
        return store.register_manual_case(str(body.requestId), body.title, body.body, body.category)
    except UnicodeEncodeError:
        raise
    except ValueError as e:
        raise HTTPException(409, str(e))


# 사건 상세 조회
@router.get("/cases/{case_id}")
def get_case(case_id: str):
    return store.public_case(_case_or_404(case_id))


# 재판 기록 조회
@router.get("/cases/{case_id}/trials/{n}")
def get_trial(case_id: str, labSessionId: str | None = None, n: int = Path(ge=1, le=3)):
    labSessionId = labSessionId or None
    _case_or_404(case_id)
    if labSessionId and n != 1:
        raise HTTPException(403, "실험실은 1심 기록만 볼 수 있습니다")
    try:
        projection.lab_condition(labSessionId, case_id)
    except ValueError as e:
        raise HTTPException(403, str(e))
    record = store.load_trial(case_id, n)
    if not record:
        raise HTTPException(404, "재판 기록이 없습니다")
    return projection.trial(record, case_id, labSessionId)


# 재판 생성 시작
@router.post("/cases/{case_id}/trials/{n}")
def create_trial(case_id: str, body: TrialIn | None = None, n: int = Path(ge=1, le=3)) -> dict:
    case = _case_or_404(case_id)
    if _is_final(case_id):
        raise HTTPException(409, "최종 확정된 사건은 새 심급을 열 수 없습니다")
    if store.load_trial(case_id, n):
        raise HTTPException(409, f"{n}심 기록이 이미 있습니다")
    entries = [e for e in store.load_ledger(case_id) if not e.get("labSessionId")]
    appeals = [e for e in entries if e["type"] == "appeal" and e["instance"] < n]
    if n > 1 and not any(e["instance"] == n - 1 for e in appeals):
        raise HTTPException(409, f"{n - 1}심 항소가 장부에 없어 {n}심을 열 수 없습니다")
    existing = jobs.latest(case_id, n)
    if existing:
        return {"jobId": existing["id"]}
    try:
        jobs.require_model()
    except jobs.ModelUnavailableError as e:
        raise HTTPException(503, str(e))
    notes = [body.judgeNotes] if body and body.judgeNotes else []
    notes += [f"[{e['instance']}심 항소 사유] {e['data']['reason']}" for e in appeals]
    prior = [t for t in store.load_trials(case_id) if t["instance"] < n]
    return {"jobId": jobs.enqueue(case, n, prior, "\n".join(notes))}


# 작업 상태 조회 (since 이후 이벤트와 중간 기록 포함)
@router.get("/jobs/{job_id}")
def get_job(job_id: str, since: int = 0):
    job = jobs.get(job_id, since)
    if not job:
        raise HTTPException(404, "작업을 찾을 수 없습니다")
    return projection.job(job)


# 작업 재시도
@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str):
    try:
        return {"jobId": jobs.retry(job_id)}
    except KeyError:
        raise HTTPException(404, "작업을 찾을 수 없습니다")
    except jobs.ModelUnavailableError as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))


# 작업 취소
@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    try:
        return projection.job(jobs.cancel(job_id))
    except KeyError:
        raise HTTPException(404, "작업을 찾을 수 없습니다")
    except ValueError as e:
        raise HTTPException(409, str(e))


# 접수 검토(서기) 일괄 실행 시작
@router.post("/intake")
def create_intake(body: IntakeIn | None = None) -> dict:
    if body and body.caseIds is not None:
        cases = [store.get_case(i) for i in body.caseIds]
        if not all(cases):
            raise HTTPException(404, "사건을 찾을 수 없습니다")
    else:
        cases = [c for c in store.load_cases() if not store.load_intake(c["id"])]
    try:
        jobs.require_model()
    except jobs.ModelUnavailableError as e:
        raise HTTPException(503, str(e))
    return {"jobId": jobs.enqueue_intake(cases)}


# 자율 범위 정책 조회
@router.get("/policy")
def get_policy():
    return store.load_policy()


# 자율 범위 정책 저장
@router.put("/policy")
def put_policy(body: PolicyIn):
    store.write_json("policy.json", body.model_dump())
    return store.load_policy()


# 대시보드 조회
@router.get("/dashboard")
def get_dashboard():
    return console.dashboard()


# 작업실 에이전트 조회
@router.get("/agents")
def get_agents():
    return console.agents()


# 장부 조회
@router.get("/ledger")
def get_ledger(caseId: str | None = None, labSessionId: str | None = None):
    labSessionId = labSessionId or None
    entries = store.load_ledger(caseId)
    if labSessionId:
        return [e for e in entries if e.get("labSessionId") == labSessionId]
    return [e for e in entries if not e.get("labSessionId")]


# 장부 기록 추가
@router.post("/ledger")
def add_ledger(body: LedgerIn):
    _case_or_404(body.caseId)
    try:
        entry = ledger.append(body)
    except UnicodeEncodeError:
        raise
    except ledger.LedgerConflictError as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return entry


# 사건 기록 묶음 조회
@router.get("/records/{case_id}")
def get_records(case_id: str, labSessionId: str | None = None):
    labSessionId = labSessionId or None
    case = _case_or_404(case_id)
    try:
        projection.lab_condition(labSessionId, case_id)
    except ValueError as e:
        raise HTTPException(403, str(e))
    answer = store.load_answers().get(case_id)
    final = any(e["type"] == "final" and e.get("labSessionId") == labSessionId for e in store.load_ledger(case_id)) if labSessionId else _is_final(case_id)
    trials = [t for t in store.load_trials(case_id) if not labSessionId or t["instance"] == 1]
    return {
        "case": store.public_case(case),
        "trials": projection.trials(trials, case_id, labSessionId),
        "ledger": [e for e in store.load_ledger(case_id) if e.get("labSessionId") == labSessionId],
        "answer": store.public_answer(answer) if final and answer else None,
    }


# 실행 그래프 정의 조회
@router.get("/workflow")
def get_workflow():
    try:
        return store.court("workflow").definition()
    except ModuleNotFoundError:
        return execution.definition()


# 사건 실행 상태 조회
@router.get("/cases/{case_id}/execution")
def get_execution(case_id: str, instance: int = 1, labSessionId: str | None = None):
    labSessionId = labSessionId or None
    _case_or_404(case_id)
    if labSessionId and instance != 1:
        raise HTTPException(403, "실험실은 1심 기록만 볼 수 있습니다")
    if instance not in (1, 2, 3):
        raise HTTPException(422, "instance는 1, 2, 3 중 하나여야 합니다")
    try:
        return execution.view(case_id, instance, labSessionId)
    except ValueError as e:
        raise HTTPException(403, str(e))


# 정답 조회
@router.get("/cases/{case_id}/answer")
def get_answer(case_id: str):
    _case_or_404(case_id)
    if not _is_final(case_id):
        raise HTTPException(403, "최종 판결 이후에만 정답을 볼 수 있습니다")
    answer = store.load_answers().get(case_id)
    if not answer:
        raise HTTPException(404, "정답이 없습니다")
    return store.public_answer(answer)


# 실험실 세션 정답 조회
@router.get("/lab/sessions/{session_id}/answers/{case_id}")
def get_lab_answer(session_id: str, case_id: str):
    if not lab.get(session_id):
        raise HTTPException(404, "세션을 찾을 수 없습니다")
    _case_or_404(case_id)
    if not any(e["type"] == "final" and e.get("labSessionId") == session_id for e in store.load_ledger(case_id)):
        raise HTTPException(403, "이 세션에서 판결을 기록한 뒤에만 정답을 볼 수 있습니다")
    answer = store.load_answers().get(case_id)
    if not answer:
        raise HTTPException(404, "정답이 없습니다")
    return store.public_answer(answer)


# 통계 조회
@router.get("/stats")
def get_stats():
    return stats.compute()


# 실험 조건 조회
@router.get("/lab/conditions")
def lab_conditions():
    return lab.CONDITIONS


# 실험 세션 생성
@router.post("/lab/sessions")
def create_session(body: SessionIn):
    if not body.judge.strip() or not 1 <= body.size <= 50:
        raise HTTPException(422, "판사 이름과 1~50 사이 size가 필요합니다")
    return lab.create(body.condition, body.judge, body.size)


# 실험 세션 조회
@router.get("/lab/sessions/{session_id}")
def get_session(session_id: str):
    session = lab.get(session_id)
    if not session:
        raise HTTPException(404, "세션을 찾을 수 없습니다")
    return session


# 레드팀 변형 생성
@router.post("/lab/variants")
def create_variant(body: VariantIn):
    case = _case_or_404(body.caseId)
    if body.attack == "move_inserted" and not _is_final(body.caseId):
        raise HTTPException(409, "문장 이동 변형은 원 사건 최종 판결 뒤에만 만들 수 있습니다 (정답 비공개)")
    answer = store.load_answers().get(body.caseId)
    if not answer:
        raise HTTPException(404, "정답이 없어 변형을 만들 수 없습니다")
    try:
        variant, variant_answer = store.court("redteam").make_variant(case, answer, body.attack)
    except ValueError as e:
        raise HTTPException(422, str(e))
    if store.get_case(variant["id"]):
        raise HTTPException(409, "이미 같은 변형 사건이 있습니다")
    try:
        jobs.require_model()
    except jobs.ModelUnavailableError as e:
        raise HTTPException(503, str(e))
    with store.LOCK:
        if store.get_case(variant["id"]):
            raise HTTPException(409, "이미 같은 변형 사건이 있습니다")
        store.append_jsonl("cases/cases.jsonl", variant)
        store.append_jsonl("answers/answers.jsonl", variant_answer)
    return {"case": summary.summarize_one(variant), "jobId": jobs.enqueue(variant, 1, [], "")}
