# 운영 콘솔 집계 (대시보드·작업실 에이전트)
from datetime import datetime

from app import jobs, ledger, stats, store

ROLES = [
    ("clerk", "서기", "서기실", "clerk"),
    ("prosecution", "검사", "검사실", "prosecutor"),
    ("defense", "변호인", "변호인실", "defense"),
    ("cross", "반대신문", "반대신문실", "cross-examination"),
    ("officer", "재판연구관", "재판연구관실", "research-officer"),
    ("checker", "증거 검증관(코드)", "증거 검증실", None),
]
INSTANCE_ROLES = {1: ("prosecution", "defense"), 2: ("prosecution", "defense", "cross"), 3: ("officer", "prosecution", "defense")}
LEDGER_LABELS = {"first_impression": "첫인상 기록", "reveal": "주장 공개", "evidence_ruling": "근거 판정", "seat_verdict": "판사석 판결", "appeal": "항소", "final": "최종 판결"}
ACTIVITY_KINDS = ("submit", "escalate", "done", "error")


# 작업이 해당 역할을 쓰는지 여부
def _involves(job: dict, role: str) -> bool:
    if role == "checker":
        return True
    if job["_kind"] == "intake":
        return role == "clerk"
    return role in INSTANCE_ROLES[job["instance"]]


# 역할별 누적 지표 (재판 기록·접수 결과 기준)
def _totals(trials: list[dict], intakes: list[dict]) -> dict[str, dict]:
    zero = {"tasks": 0, "claims": 0, "evidence": 0, "verified": 0, "perjury": 0, "revisions": 0, "escalations": 0, "seconds": 0.0}
    totals = {role: dict(zero) for role, *_ in ROLES}
    for r in trials:
        side = {a["id"]: a["side"] for a in r.get("bench", [])}
        for c in r["claims"]:
            t = totals.get("cross" if c["rebuts"] else side.get(c["agentId"]))
            if t is None:
                continue
            t["claims"] += 1
            t["evidence"] += len(c["evidence"])
            t["verified"] += sum(e["status"] == "verified" for e in c["evidence"])
            t["perjury"] += sum(e["status"] == "fabricated" for e in c["evidence"])
            t["revisions"] += c.get("revisions", 0)
            t["escalations"] += bool(c.get("escalated"))
        for call in r["calls"]:
            t = totals[call["role"]]
            t["seconds"] += call["seconds"]
            t["tasks"] += call.get("step") in (None, "plan") or call["role"] == "officer"
        checker = r.get("agentStats", {}).get("checker", {})
        totals["checker"]["tasks"] += sum(e["kind"] == "check" for e in r.get("trace", []))
        totals["checker"]["evidence"] += checker.get("calls", 0)
        totals["checker"]["verified"] += checker.get("verified", 0)
        totals["checker"]["perjury"] += checker.get("perjury", 0)
    for i in intakes:
        totals["clerk"]["tasks"] += 1
        totals["clerk"]["seconds"] += sum(c["seconds"] for c in i.get("calls", []))
    for t in totals.values():
        t["seconds"] = round(t["seconds"], 2)
    return totals


# 작업실 에이전트 목록
def agents() -> list[dict]:
    trials, intakes = stats.runs()
    totals = _totals(trials, intakes)
    active = jobs.active()
    rows = []
    for role, label, room, skill in ROLES:
        meta = store.court("skills").load_skill(skill) if skill else None
        running = next((j for j in active if j["status"] == "running" and j["_role"] == role), None)
        rows.append({
            "role": role, "label": label, "room": room,
            "skill": meta["name"] if meta else None, "skillVersion": meta["version"] if meta else None,
            "totals": totals[role],
            "working": {"caseId": running["caseId"], "instance": running["instance"], "text": running["_text"]} if running else None,
            "queued": sum(j["status"] == "queued" and _involves(j, role) for j in active),
        })
    return rows


# 최근 활동 (장부와 에이전트 이벤트 합침, 최신순 30건)
def _recent(trials: list[dict], intakes: list[dict], active: list[dict]) -> list[dict]:
    variants = {c["id"] for c in store.load_cases() if c.get("variantOf")}
    items = [{"at": e["at"], "caseId": e["caseId"], "kind": "ledger", "text": f"{e['judge']['name']} · {e['instance']}심 {LEDGER_LABELS[e['type']]}"} for e in store.load_ledger() if not e.get("labSessionId") and e["caseId"] not in variants]
    saved = {(e["at"], e["agentId"], e["kind"], e["text"]) for r in intakes for e in r.get("trace", [])}
    for r in [*trials, *intakes]:
        if r["caseId"] in variants:
            continue
        names = {a["id"]: a["name"] for a in r.get("bench", [])}
        items += [{"at": e["at"], "caseId": r["caseId"], "kind": "agent", "text": f"{names.get(e['agentId'], '서기' if e['agentId'] == 'i1-K1' else '증거 검증관')} · {e['text']}"} for e in r.get("trace", []) if e["kind"] in ACTIVITY_KINDS]
    for j in active:
        if j["caseId"] in variants:
            continue
        items += [{"at": e["at"], "caseId": j["caseId"], "kind": "agent", "text": e["text"]} for e in j["_recent"] if e["kind"] in ACTIVITY_KINDS and (e["at"], e["agentId"], e["kind"], e["text"]) not in saved]
    return sorted(items, key=lambda i: datetime.fromisoformat(i["at"]), reverse=True)[:30]


# 대시보드 집계
def dashboard() -> dict:
    snapshot = stats.compute()
    trials, intakes = stats.runs()
    active = jobs.active()
    by_case: dict[str, list[dict]] = {}
    for e in store.load_ledger():
        by_case.setdefault(e["caseId"], []).append(e)
    stages = [ledger.progress_of(by_case.get(c["id"], []))["stage"] for c in store.load_cases() if not c.get("variantOf")]
    evidence_total = sum(snapshot["evidenceStatus"].values())
    screening = snapshot["screening"]
    return {
        "cases": snapshot["cases"], "inTrial": sum(s in ("in_trial", "appealed") for s in stages), "finals": snapshot["finals"],
        "activeJobs": [{k: v for k, v in j.items() if not k.startswith("_")} for j in active],
        "agentsWorking": sum(j["status"] == "running" for j in active),
        "kpis": {
            "screeningAccuracy": round(screening["correct"] / screening["total"], 4) if screening["total"] else None,
            "selfCorrectionRate": snapshot["agents"]["selfCorrectionRate"],
            "escalations": snapshot["agents"]["escalations"],
            "perjuryRate": round(snapshot["evidenceStatus"]["fabricated"] / evidence_total, 4) if evidence_total else None,
            "humanOverrides": snapshot["checkerOverrides"]["admittedVoided"] + snapshot["checkerOverrides"]["struckCounted"],
        },
        "recent": _recent(trials, intakes, active),
    }
