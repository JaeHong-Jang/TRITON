# 공개 범위 투영
import copy

from app import lab, store


# 법정 첫인상 공개 여부
def court_open(case_id: str) -> bool:
    return any(e["type"] == "first_impression" and not e.get("labSessionId") for e in store.load_ledger(case_id))


# 실험실 사건 소속과 조건 조회
def lab_condition(session_id: str | None, case_id: str) -> str | None:
    if not session_id:
        return None
    session = lab.get(session_id)
    if not session or case_id not in session["caseIds"]:
        raise ValueError("실험실 세션에 속한 사건이 아닙니다")
    return session["condition"]


# 공개 단계 계산
def disclosure(case_id: str, lab_session_id: str | None = None) -> str:
    condition = lab_condition(lab_session_id, case_id) if lab_session_id else None
    if condition == "C" or (condition is None and court_open(case_id)):
        return "open"
    return "hidden"


# 서기 권고 공개 여부
def screening_allowed(case_id: str, lab_session_id: str | None = None) -> bool:
    condition = lab_condition(lab_session_id, case_id) if lab_session_id else None
    return condition in ("B", "C") or (condition is None and court_open(case_id))


# 기록 공개 투영
def trial(record: dict | None, case_id: str, lab_session_id: str | None = None) -> dict | None:
    if record is None:
        return None
    out = copy.deepcopy(record)
    open_ = disclosure(case_id, lab_session_id) == "open"
    screen = screening_allowed(case_id, lab_session_id)
    if not open_:
        out["claims"] = []
        out["officer"] = None
        out["trace"] = []
    if not screen:
        out["screening"] = None
    if not open_:
        out["calls"] = []
        out["agentStats"] = {}
    if not open_:
        out["disclosure"] = "hidden"
    return out


# 여러 기록 공개 투영
def trials(records: list[dict], case_id: str, lab_session_id: str | None = None) -> list[dict]:
    return [t for r in records if (t := trial(r, case_id, lab_session_id))]


# 작업 상태 공개 투영
def job(raw: dict, lab_session_id: str | None = None) -> dict:
    out = copy.deepcopy(raw)
    case_id = out.get("caseId", "")
    hidden = bool(case_id) and disclosure(case_id, lab_session_id) == "hidden"
    opened = {cid: disclosure(cid, lab_session_id) == "open" for cid in {e["caseId"] for e in out.get("events", []) if e.get("caseId")}}
    out["events"] = [e for e in out.get("events", []) if (opened[e["caseId"]] if e.get("caseId") else not hidden)]
    if hidden:
        out["partial"] = trial(out.get("partial"), case_id, lab_session_id)
        out["step"] = {"queued": "준비 대기", "running": "재판 준비 중", "done": "준비 완료", "error": "작업 오류", "interrupted": "실행 중단", "cancelled": "취소됨"}.get(out.get("status"), "재판 준비")
        out["done"] = 0
        out["total"] = 0
        if out.get("status") in ("queued", "running"):
            out.pop("updatedAt", None)
            if at := out.get("startedAt") or out.get("createdAt"):
                out["updatedAt"] = at
        if out.get("error"):
            out["error"] = "작업 오류"
    return out


# 접수 결과 공개 투영
def intake(doc: dict | None, case_id: str) -> dict | None:
    if doc is None or court_open(case_id):
        return copy.deepcopy(doc)
    out = copy.deepcopy(doc)
    out["screening"] = None
    out["trace"] = []
    out["calls"] = []
    out["agentStats"] = {}
    return out


# 접수 분류 공개 투영
def docket(row: dict, case_id: str) -> dict:
    out = copy.deepcopy(row)
    if not court_open(case_id):
        out["track"] = "trial"
        out["reasons"] = []
        out["screening"] = None
    return out


# 통계용 공개 기록 여부
def include_trial_stats(case_id: str) -> bool:
    return court_open(case_id)
