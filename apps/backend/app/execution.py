# 저장 실행과 사람 장부를 결합한 사건 진행 화면
from court import workflow

from app import jobs, ledger, projection, store

NODES = [
    {"id": "prepare", "label": "사건 접수·재판 준비", "actor": "code"},
    {"id": "generate", "label": "서기·양측 변론 준비", "actor": "llm"},
    {"id": "first_impression", "label": "사람의 첫인상", "actor": "human"},
    {"id": "reveal", "label": "제출된 주장 순차 공개", "actor": "human"},
    {"id": "review", "label": "실패 근거 채택·기각", "actor": "human"},
    {"id": "seat_verdict", "label": "심급별 사람 판결", "actor": "human"},
    {"id": "appeal", "label": "다음 심급으로 항소", "actor": "human"},
    {"id": "final", "label": "최종 확정·정답 공개", "actor": "human"},
]
EDGES = [
    {"from": "prepare", "to": "generate", "condition": "기사와 절차 버전 고정"},
    {"from": "prepare", "to": "first_impression", "condition": "기사 공개"},
    {"from": "generate", "to": "reveal", "condition": "주장 제출 및 첫인상 기록"},
    {"from": "first_impression", "to": "reveal", "condition": "기록 완료 및 주장 제출"},
    {"from": "reveal", "to": "review", "condition": "전체 공개 및 생성 완료"},
    {"from": "review", "to": "seat_verdict", "condition": "실패 근거 검토 완료"},
    {"from": "seat_verdict", "to": "final", "condition": "필요 판사석과 다수결 충족"},
    {"from": "seat_verdict", "to": "appeal", "condition": "항소 요청 또는 2심 불일치"},
    {"from": "appeal", "to": "generate", "condition": "이전 기록을 보존한 다음 심급"},
]


# 사건 절차 정의
def definition() -> dict:
    return {"version": workflow.VERSION, "nodes": NODES, "edges": EDGES, "limits": workflow.definition()["limits"]}


# 노드 상태와 안내문
def _step(node_id: str, status: str, reason: str) -> dict:
    return {**next(n for n in NODES if n["id"] == node_id), "status": status, "reason": reason}


# 현재 시도에 해당하는 실제 이벤트
def _events(record: dict, run: dict | None) -> list[dict]:
    if run:
        current = [e for e in run.get("events", []) if e.get("attempt", run["attempt"]) == run["attempt"]]
        if current:
            return current
    return record.get("trace", [])


# 실제 이벤트와 공개된 통계로 계산한 역할별 현재 노드
def _agents(record: dict | None, run: dict | None, visible: bool) -> list[dict]:
    if not visible or not record or not (run or record.get("execution")):
        return []
    events = _events(record, run)
    labels = {n["id"]: n["label"] for n in workflow.NODES}
    status = (run or {}).get("status", "done")
    last_subject = next((e.get("subjectAgentId") or e["agentId"] for e in reversed(events) if e["agentId"] != "checker" or e.get("subjectAgentId") not in (None, "checker")), None)
    rows = []
    for agent in record.get("bench", []):
        aid = agent["id"]
        own = [e for e in events if (e.get("subjectAgentId") or e["agentId"]) == aid]
        last = own[-1] if own else None
        stat = record.get("agentStats", {}).get(aid, {})
        review = visible and (stat.get("escalated", 0) > 0 or any(e["kind"] == "escalate" for e in own))
        terminal = bool(last and last["kind"] in ("submit", "escalate", "done"))
        if terminal:
            state = "review" if review else "complete"
        elif status == "running" and last_subject == aid:
            state = "running"
        elif status == "error" and last_subject == aid:
            state = "error"
        elif status == "done" and (own or agent.get("skill") == "clerk" and record.get("screening")):
            state = "review" if review else "complete"
        else:
            state = "waiting"
        node = (last.get("nodeId") or workflow.node_for(last["kind"])) if last else "read"
        if not visible and node == "escalate":
            node = "submit"
        rows.append({"agentId": aid, "label": agent["name"], "nodeId": node, "nodeLabel": labels.get(node, "재판 준비"), "status": state, "revisions": stat.get("revisions", 0) if visible else None})
    return rows


# 실행 제어의 허용 여부와 안내문
def _control(reason: str) -> dict:
    return {"allowed": not bool(reason), "reason": reason}


# 실제 기록과 실행 조건에 따른 관제 제어
def _controls(instance: int, saved: dict | None, run: dict | None, entries: list[dict], model_block: str) -> dict:
    if any(e["type"] == "final" for e in entries):
        start = "최종 확정된 사건은 새 심급을 열 수 없습니다"
    elif saved:
        start = f"{instance}심 기록이 이미 있습니다"
    elif instance > 1 and not any(e["type"] == "appeal" and e["instance"] == instance - 1 for e in entries):
        start = f"{instance - 1}심 항소가 장부에 없어 {instance}심을 열 수 없습니다"
    elif run:
        start = "기존 실행이 있습니다 · 실행 상태를 확인하거나 재시도하세요"
    else:
        start = model_block
    retry = jobs.retry_reason(run["id"], model_block) if run else "재시도할 실행이 없습니다"
    cancel = jobs.cancel_reason(run["status"]) if run else "취소할 실행이 없습니다"
    return {"start": _control(start), "retry": _control(retry), "cancel": _control(cancel)}


# 기록과 실행 또는 정식 항소로 열린 심급
def _available_instances(case_id: str, entries: list[dict]) -> list[int]:
    available = {1, *(record["instance"] for record in store.load_trials(case_id))}
    available.update(e["instance"] + 1 for e in entries if e["type"] == "appeal" and e["instance"] < 3)
    for instance in (2, 3):
        run = jobs.latest(case_id, instance)
        if run and run.get("instance") == instance:
            available.add(instance)
    return sorted(available)


# 일관된 실행 화면 스냅샷
def view(case_id: str, instance: int, lab_session_id: str | None = None) -> dict:
    model_block = jobs.model_reason(jobs.model_health())
    with store.LOCK:
        saved = store.load_trial(case_id, instance)
        raw_run = jobs.latest(case_id, instance)
        entries = store.load_ledger(case_id)
        court_entries = [e for e in entries if not e.get("labSessionId")]
        scoped = [e for e in entries if e.get("labSessionId") == lab_session_id]
        visible = projection.disclosure(case_id, lab_session_id) == "open"
        run = projection.job(raw_run, lab_session_id) if raw_run else None
        record = projection.trial(saved or (raw_run or {}).get("partial"), case_id, lab_session_id)
        controls = _controls(instance, saved, raw_run, court_entries, model_block)
        available_instances = _available_instances(case_id, court_entries)
    same = [e for e in scoped if e["instance"] == instance]
    status = (run or {}).get("status")
    complete = bool(saved) and status in (None, "done")
    mode = "replay" if complete else "live" if run else "not_started"
    legacy = bool(saved and not saved.get("execution") and not run)
    claims = [c["id"] for c in (record or {}).get("claims", [])]
    revealed = [e["data"]["claimId"] for e in same if e["type"] == "reveal"]
    reveal_done = visible and complete and ledger._all_claims_revealed(same, [record], instance)
    failed = {ev["id"] for c in (record or {}).get("claims", []) for ev in c.get("evidence", []) if ev.get("status") != "verified"}
    rulings = {e["data"]["evidenceId"]: e["data"].get("ruling") for e in same if e["type"] == "evidence_ruling"}
    resolved = {eid for eid in failed if rulings.get(eid) in ("admitted", "struck")}
    review_done = reveal_done and failed <= resolved
    votes = ledger._seat_votes(same, instance)
    seat_done = set(votes) == ledger.SEATS[instance]
    majority = ledger._majority(list(votes.values())) if seat_done else None
    appealed = any(e["type"] == "appeal" for e in same)
    final = any(e["type"] == "final" for e in same)
    can_seat = visible and complete and review_done and not appealed and not final
    can_finalize = can_seat and seat_done and majority is not None
    failure = status in ("error", "interrupted", "cancelled")
    generate_status = "complete" if complete else "error" if status == "error" else "blocked" if failure else "active" if status == "running" else "pending"
    generate_reason = "실행 그래프 기록 없음 · 저장된 재판 사용" if legacy else "준비 완료" if complete else (run or {}).get("error") or (run or {}).get("step") or "재판 시작을 기다립니다"
    steps = [
        _step("prepare", "complete" if saved or run else "active", "기사 접수 완료"),
        _step("generate", generate_status, generate_reason),
        _step("first_impression", "complete" if visible else "active", "기사의 첫인상을 기록하세요" if not visible else "공개 조건 충족"),
        _step("reveal", "complete" if reveal_done else "active" if visible and len(revealed) < len(claims) else "blocked", f"{len(revealed)}/{len(claims)} 주장 공개" if visible else "첫인상 기록 후 공개합니다"),
        _step("review", "complete" if review_done else "active" if reveal_done else "blocked", f"{len(resolved)}/{len(failed)} 실패 근거 판정" if visible and reveal_done else "변론 준비와 공개를 기다립니다"),
        _step("seat_verdict", "complete" if seat_done else "active" if can_seat else "blocked", f"{instance}/{instance}석 판결 기록 완료" if seat_done else f"{len(votes)}/{instance}석 판결 · 판결 사유를 기록하세요" if can_seat else "변론 완료와 필요한 근거 검토 후 판결합니다"),
        _step("appeal", "complete" if appealed else "active" if can_seat and seat_done and instance < 3 else "blocked", "이전 기록을 보존하고 다음 심급을 준비합니다" if appealed else "2심 판결 불일치 · 3심으로 넘겨야 합니다" if instance == 2 and seat_done and not majority else "상급심 검토가 필요하면 항소하세요"),
        _step("final", "complete" if final else "active" if can_finalize else "blocked", "최종 판결 기록 완료" if final else "조치 단계와 사유를 승인하세요" if can_finalize else "필요한 판사석 판결과 표결을 기다립니다"),
    ]
    phase = "final" if final else "appeal" if appealed else "first_impression" if not visible else "generate" if failure or not complete else "reveal" if not reveal_done else "review" if not review_done else "seat_verdict" if not seat_done else "appeal" if not majority else "final"
    reason = next(s["reason"] for s in steps if s["id"] == phase)
    if legacy:
        reason = f"실행 그래프 기록 없음 · {reason}"
    if visible and complete and not claims:
        reason = "유효한 주장 없음 · 판사가 기록을 검토해야 합니다"
    return {"version": workflow.VERSION, "caseId": case_id, "instance": instance, "mode": mode, "disclosure": "open" if visible else "hidden", "phase": phase, "reason": reason,
            "steps": steps, "edges": [e for e in EDGES if instance < 3 or e["from"] != "appeal" and e["to"] != "appeal"], "agents": _agents(record, run, visible), "run": run, "limits": workflow.definition()["limits"], "controls": controls, "availableInstances": available_instances}
