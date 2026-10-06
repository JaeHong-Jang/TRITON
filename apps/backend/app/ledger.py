# 장부 검증과 사건 단계 계산
import copy
import json
import uuid
from datetime import datetime, timezone

from app import lab, store

LEANINGS = ("clickbait", "not_clickbait")
ACTIONS = ("L0", "L1", "L2", "L3")
SEATS = {1: {1}, 2: {1, 2}, 3: {1, 2, 3}}


# 숫자 여부 판정
def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# 확신도 검사
def _confidence(data: dict) -> None:
    c = data.get("confidence")
    if not _num(c) or not 0 <= c <= 100:
        raise ValueError("confidence는 0~100 사이 숫자여야 합니다")


# 판결 값 검사
def _leaning(v, name: str = "verdict") -> None:
    if v not in LEANINGS:
        raise ValueError(f"{name}은(는) clickbait 또는 not_clickbait여야 합니다")


# 장부 기록 검증
def validate(entry) -> None:
    if entry.instance not in (1, 2, 3):
        raise ValueError("instance는 1, 2, 3 중 하나여야 합니다")
    if entry.judge.seat not in (1, 2, 3):
        raise ValueError("judge.seat는 1, 2, 3 중 하나여야 합니다")
    if not entry.judge.name.strip():
        raise ValueError("judge.name이 비어 있습니다")
    d, t = entry.data, entry.type
    if t == "first_impression":
        _leaning(d.get("leaning"), "leaning")
        _confidence(d)
    elif t == "reveal":
        if not isinstance(d.get("claimId"), str) or not d["claimId"]:
            raise ValueError("claimId가 필요합니다")
    elif t == "evidence_ruling":
        if not isinstance(d.get("evidenceId"), str) or not d["evidenceId"]:
            raise ValueError("evidenceId가 필요합니다")
        if d.get("ruling") not in ("admitted", "struck", None):
            raise ValueError("ruling은 admitted, struck, null 중 하나여야 합니다")
        if not _num(d.get("checkerWeight")):
            raise ValueError("checkerWeight는 숫자여야 합니다")
    elif t == "seat_verdict":
        _leaning(d.get("verdict"))
        _confidence(d)
        if not isinstance(d.get("reason"), str) or len(d["reason"].strip()) < 10:
            raise ValueError("판결 사유는 10자 이상이어야 합니다")
    elif t == "appeal":
        if entry.instance >= 3:
            raise ValueError("3심은 항소할 수 없습니다")
        if not isinstance(d.get("reason"), str) or not d["reason"].strip():
            raise ValueError("항소 사유가 필요합니다")
    else:
        _leaning(d.get("verdict"))
        if d.get("action") not in ACTIONS:
            raise ValueError("action은 L0~L3 중 하나여야 합니다")
        if not isinstance(d.get("reason"), str):
            raise ValueError("reason이 필요합니다")
        if d["action"] in ("L2", "L3") and not d["reason"].strip():
            raise ValueError("L2·L3 조치는 사유가 필수입니다")
        votes = d.get("votes")
        if not isinstance(votes, list) or any(
            not isinstance(v, dict) or v.get("seat") not in (1, 2, 3) or v.get("verdict") not in LEANINGS for v in votes
        ):
            raise ValueError("votes는 {seat, verdict} 목록이어야 합니다")
    if entry.context.balance is not None:
        b = entry.context.balance
        if not all(_num(b.get(k)) for k in ("pro", "con", "tilt")):
            raise ValueError("balance는 pro, con, tilt 숫자가 필요합니다")


# 일반 법정 장부 항목
def _court_entries(entries: list[dict]) -> list[dict]:
    return [e for e in entries if not e.get("labSessionId")]


# 실험실 장부 항목
def _scope_entries(entries: list[dict], session_id: str | None) -> list[dict]:
    return [e for e in entries if e.get("labSessionId") == session_id]


# 저장 기록별 주장 순서
def _claim_ids(trials: list[dict], instance: int) -> list[str]:
    record = next((t for t in trials if t.get("instance") == instance), None)
    return [c["id"] for c in record.get("claims", [])] if record else []


# 저장 기록별 근거 사전
def _evidence(trials: list[dict], instance: int) -> dict[str, dict]:
    record = next((t for t in trials if t.get("instance") == instance), None)
    if not record:
        return {}
    return {e["id"]: e for c in record.get("claims", []) for e in c.get("evidence", [])}


# 심급별 저장 기록
def _trial(trials: list[dict], instance: int) -> dict | None:
    return next((t for t in trials if t.get("instance") == instance), None)


# 판사석 판결 목록
def _seat_votes(entries: list[dict], instance: int) -> dict[int, str]:
    votes: dict[int, str] = {}
    for e in entries:
        if e["type"] == "seat_verdict" and e["instance"] == instance:
            votes[e["judge"]["seat"]] = e["data"]["verdict"]
    return votes


# 다수결 계산
def _majority(votes: list[str]) -> str | None:
    for v in LEANINGS:
        if votes.count(v) * 2 > len(votes):
            return v
    return None


# 완성된 기록 여부
def _complete_trial(record: dict | None) -> bool:
    return bool(record and any(e.get("kind") == "done" for e in record.get("trace", [])) or record and record.get("claims") is not None)


# 모든 주장 공개 여부
def _all_claims_revealed(entries: list[dict], trials: list[dict], instance: int) -> bool:
    claims = _claim_ids(trials, instance)
    revealed = [e["data"]["claimId"] for e in entries if e["type"] == "reveal" and e["instance"] == instance]
    return revealed == claims


# 실패 근거 판정 완료 여부
def _failed_evidence_ruled(entries: list[dict], trials: list[dict], instance: int) -> bool:
    evidence = _evidence(trials, instance)
    failed = {eid for eid, ev in evidence.items() if ev.get("status") != "verified"}
    latest = {}
    for e in entries:
        if e["type"] == "evidence_ruling" and e["instance"] == instance:
            latest[e["data"]["evidenceId"]] = e["data"].get("ruling")
    ruled = {eid for eid, ruling in latest.items() if ruling in ("admitted", "struck")}
    return failed <= ruled


# 최종 기록 불변성 검사
def _ensure_open(entries: list[dict]) -> None:
    if any(e["type"] == "final" for e in entries):
        raise ValueError("최종 확정 뒤에는 장부를 수정할 수 없습니다")


# 실험실 범위 검증
def _validate_lab(entry) -> None:
    if not entry.labSessionId:
        return
    session = lab.get(entry.labSessionId)
    if not session or entry.caseId not in session["caseIds"]:
        raise ValueError("실험실 세션에 속한 사건이 아닙니다")
    allowed = {"A": {"first_impression", "seat_verdict", "final"}, "B": {"first_impression", "seat_verdict", "final"}, "C": {"first_impression", "reveal", "evidence_ruling", "seat_verdict", "final"}}
    if entry.type not in allowed[session["condition"]]:
        raise ValueError("실험 조건에서 허용하지 않는 장부 기록입니다")


# 법정 전이 검증
def validate_transition(entry, entries: list[dict], trials: list[dict], running: bool = False) -> None:
    validate(entry)
    _validate_lab(entry)
    scoped = _scope_entries(entries, entry.labSessionId)
    if entry.labSessionId:
        session = lab.get(entry.labSessionId)
        condition = session["condition"] if session else "A"
        _ensure_open(scoped)
        if entry.instance != 1 or entry.judge.seat != 1:
            raise ValueError("실험실 판결은 1심 1번 판사석만 기록할 수 있습니다")
        same = [e for e in scoped if e["instance"] == entry.instance]
        if entry.type == "first_impression":
            if any(e["type"] == "first_impression" for e in scoped):
                raise ValueError("첫인상은 1심에서 한 번만 기록할 수 있습니다")
        elif entry.type == "reveal":
            ids = _claim_ids(trials, entry.instance)
            revealed = [e["data"]["claimId"] for e in same if e["type"] == "reveal"]
            if condition != "C" or not ids or len(revealed) >= len(ids) or entry.data["claimId"] != ids[len(revealed)]:
                raise ValueError("주장은 실제 제출 순서대로 공개해야 합니다")
        elif entry.type == "evidence_ruling":
            if any(e["type"] == "seat_verdict" for e in same):
                raise ValueError("판사석 판결 뒤에는 근거 판정을 바꿀 수 없습니다")
            evidence = _evidence(trials, entry.instance)
            revealed = {e["data"]["claimId"] for e in same if e["type"] == "reveal"}
            owner = next((c["id"] for t in trials if t.get("instance") == entry.instance for c in t.get("claims", []) for ev in c.get("evidence", []) if ev["id"] == entry.data["evidenceId"]), None)
            if condition != "C" or entry.data["evidenceId"] not in evidence or owner not in revealed:
                raise ValueError("공개된 근거만 판정할 수 있습니다")
        elif entry.type == "seat_verdict":
            votes = _seat_votes(same, entry.instance)
            if entry.judge.seat in votes:
                raise ValueError("이미 기록된 판사석입니다")
        elif entry.type == "final":
            votes = _seat_votes(same, entry.instance)
            expected = [{"seat": seat, "verdict": verdict} for seat, verdict in sorted(votes.items())]
            verdict = _majority(list(votes.values()))
            if set(votes) != {1} or entry.data["votes"] != expected or entry.data["verdict"] != verdict:
                raise ValueError("최종 표결은 저장된 판사석 판결과 일치해야 합니다")
        return
    court_entries = _court_entries(entries)
    same = [e for e in court_entries if e["instance"] == entry.instance]
    if any(e["type"] == "appeal" for e in same) and entry.type != "appeal":
        raise ValueError("항소 뒤에는 해당 심급 장부를 수정할 수 없습니다")
    if entry.type != "first_impression":
        if not any(e["type"] == "first_impression" for e in court_entries):
            raise ValueError("첫인상 기록 뒤에만 공개할 수 있습니다")
    _ensure_open(court_entries)
    if entry.type == "first_impression":
        if entry.instance != 1 or any(e["type"] == "first_impression" for e in court_entries):
            raise ValueError("첫인상은 1심에서 한 번만 기록할 수 있습니다")
    elif entry.type == "reveal":
        if entry.instance > 1 and not any(e["type"] == "appeal" and e["instance"] == entry.instance - 1 for e in court_entries):
            raise ValueError("직전 심급 항소 뒤에만 상급심 장부를 기록할 수 있습니다")
        ids = _claim_ids(trials, entry.instance)
        revealed = [e["data"]["claimId"] for e in same if e["type"] == "reveal"]
        if not _complete_trial(_trial(trials, entry.instance)):
            raise ValueError("완료된 재판 기록이 필요합니다")
        if not ids or len(revealed) >= len(ids) or entry.data["claimId"] != ids[len(revealed)]:
            raise ValueError("주장은 실제 제출 순서대로 공개해야 합니다")
    elif entry.type == "evidence_ruling":
        if any(e["type"] == "seat_verdict" for e in same):
            raise ValueError("판사석 판결 뒤에는 근거 판정을 바꿀 수 없습니다")
        evidence = _evidence(trials, entry.instance)
        revealed = {e["data"]["claimId"] for e in same if e["type"] == "reveal"}
        owner = next((c["id"] for t in trials if t.get("instance") == entry.instance for c in t.get("claims", []) for ev in c.get("evidence", []) if ev["id"] == entry.data["evidenceId"]), None)
        if entry.data["evidenceId"] not in evidence or owner not in revealed:
            raise ValueError("공개된 근거만 판정할 수 있습니다")
    elif entry.type == "seat_verdict":
        if entry.instance > 1 and not any(e["type"] == "appeal" and e["instance"] == entry.instance - 1 for e in court_entries):
            raise ValueError("직전 심급 항소 뒤에만 상급심 장부를 기록할 수 있습니다")
        if entry.judge.seat not in SEATS[entry.instance]:
            raise ValueError(f"{entry.instance}심 판사석은 {sorted(SEATS[entry.instance])}번만 허용됩니다")
        votes = _seat_votes(same, entry.instance)
        if entry.judge.seat in votes:
            raise ValueError("이미 기록된 판사석입니다")
        pending = [seat for seat in SEATS[entry.instance] if seat not in votes]
        if not pending or entry.judge.seat != pending[0]:
            raise ValueError("판사석은 순서대로 기록해야 합니다")
        if not _complete_trial(_trial(trials, entry.instance)) or running:
            raise ValueError("완료된 재판 기록이 필요합니다")
        if not _all_claims_revealed(same, trials, entry.instance):
            raise ValueError("모든 주장을 공개해야 판결할 수 있습니다")
        if not _failed_evidence_ruled(same, trials, entry.instance):
            raise ValueError("실패 근거를 모두 판정해야 판결할 수 있습니다")
    elif entry.type == "appeal":
        votes = _seat_votes(same, entry.instance)
        if set(votes) != SEATS[entry.instance]:
            raise ValueError("해당 심급 판사석 판결이 모두 필요합니다")
    elif entry.type == "final":
        votes = _seat_votes(same, entry.instance)
        expected = [{"seat": seat, "verdict": verdict} for seat, verdict in sorted(votes.items())]
        verdict = _majority(list(votes.values()))
        if set(votes) != SEATS[entry.instance]:
            raise ValueError("해당 심급 판사석 판결이 모두 필요합니다")
        if entry.instance == 2 and verdict is None:
            raise ValueError("2심 불일치는 확정할 수 없습니다")
        if entry.instance == 3 and verdict is None:
            raise ValueError("3심은 다수결이 필요합니다")
        if entry.data["votes"] != expected or entry.data["verdict"] != verdict:
            raise ValueError("최종 표결은 저장된 판사석 판결과 일치해야 합니다")



# 중복 판단용 본문
def _semantic_body(item) -> dict:
    raw = item.model_dump() if hasattr(item, "model_dump") else item
    return {k: copy.deepcopy(v) for k, v in raw.items() if k not in ("id", "at", "requestId")}


# 장부 슬롯 비교
def _same_slot(entry: dict, body: dict) -> bool:
    if entry.get("labSessionId") != body.get("labSessionId") or entry.get("instance") != body.get("instance") or entry.get("type") != body.get("type"):
        return False
    if entry.get("judge", {}).get("seat") != body.get("judge", {}).get("seat"):
        return False
    if body.get("type") == "reveal":
        return entry.get("data", {}).get("claimId") == body.get("data", {}).get("claimId")
    if body.get("type") == "evidence_ruling":
        return entry.get("data", {}).get("evidenceId") == body.get("data", {}).get("evidenceId")
    return body.get("type") in {"first_impression", "seat_verdict", "appeal", "final"}


# 의미상 같은 기록인지 비교
def _same_semantic(entry: dict, body: dict) -> bool:
    return json.dumps(_semantic_body(entry), sort_keys=True, ensure_ascii=False) == json.dumps(_semantic_body(body), sort_keys=True, ensure_ascii=False)


# 재전송된 장부 기록 처리
def _dedupe(entry, entries: list[dict]) -> dict | None:
    body = entry.model_dump()
    scoped = _scope_entries(entries, entry.labSessionId)
    if entry.type == "evidence_ruling":
        latest = next((e for e in reversed(scoped) if _same_slot(e, body)), None)
        if latest and _same_semantic(latest, body):
            return copy.deepcopy(latest)
        return None
    duplicate = next((e for e in scoped if _same_slot(e, body)), None)
    if not duplicate:
        return None
    if _same_semantic(duplicate, body):
        return copy.deepcopy(duplicate)
    raise ValueError("이미 다른 내용으로 기록된 장부 항목입니다")

# 요청 본문 비교
def _same_request(entry: dict, body: dict) -> bool:
    left = {k: v for k, v in entry.items() if k not in ("id", "at")}
    return json.dumps(left, sort_keys=True, ensure_ascii=False) == json.dumps(body, sort_keys=True, ensure_ascii=False)


# 검증 후 장부 기록
def append(body, running: bool = False) -> dict:
    with store.LOCK:
        from app import jobs

        entries = store.load_ledger(body.caseId)
        if body.requestId:
            found = next((e for e in entries if e.get("requestId") == body.requestId), None)
            if found:
                if _same_request(found, body.model_dump()):
                    return copy.deepcopy(found)
                raise ValueError("같은 requestId의 본문이 다릅니다")
        duplicate = _dedupe(body, entries)
        if duplicate:
            return duplicate
        live = jobs.latest(body.caseId, body.instance)
        live_running = bool(live and live["status"] in ("queued", "running"))
        trials = store.load_trials(body.caseId)
        if live and live.get("partial") and not store.load_trial(body.caseId, body.instance):
            trials = [*trials, live["partial"]]
        validate_transition(body, entries, trials, live_running)
        entry = {"id": uuid.uuid4().hex[:12], "at": datetime.now(timezone.utc).isoformat(), **body.model_dump()}
        store.append_jsonl("ledger/ledger.jsonl", entry)
        return entry


# 사건 진행 단계 계산
def progress_of(entries: list[dict]) -> dict:
    # 실험실 판결은 실험 기록일 뿐 사건 진행 단계에 넣지 않음
    entries = [e for e in entries if not e.get("labSessionId")]
    finals = [e for e in entries if e["type"] == "final"]
    top = max((e["instance"] for e in entries), default=0)
    if finals:
        f = finals[-1]
        return {"instance": top, "stage": "final", "finalVerdict": f["data"]["verdict"], "action": f["data"]["action"]}
    appealed = any(e["type"] == "appeal" and e["instance"] == top for e in entries)
    stage = "appealed" if appealed else "in_trial" if entries else "new"
    return {"instance": top, "stage": stage, "finalVerdict": None, "action": None}
