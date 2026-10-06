# 통계실 집계
from collections import defaultdict

from app import lab, projection, store, summary

STATUSES = ("verified", "misnumbered", "title", "present", "fabricated")


# 판사석별 마지막 판결 모음
def _seat_verdicts(entries: list[dict]) -> dict[int, dict[int, str]]:
    out: dict[int, dict[int, str]] = defaultdict(dict)
    for e in entries:
        if e["type"] == "seat_verdict":
            out[e["instance"]][e["judge"]["seat"]] = e["data"]["verdict"]
    return out


# 판사석 다수결 결과
def _majority(votes: list[str]) -> str | None:
    for v in set(votes):
        if votes.count(v) * 2 > len(votes):
            return v
    return None


# 심급 판결 결정
def _verdict_of(entries: list[dict], seats: dict[int, dict[int, str]], instance: int) -> str | None:
    final = [e for e in entries if e["type"] == "final" and e["instance"] == instance]
    if final:
        return final[-1]["data"]["verdict"]
    return _majority(list(seats.get(instance, {}).values()))


# 낚시성 방향 점수
def _score(leaning: str, confidence: float) -> float:
    return confidence if leaning == "clickbait" else -confidence


# 모든 재판 기록과 접수 결과 (변형·실험실 포함, 비용 집계용)
def runs() -> tuple[list[dict], list[dict]]:
    cases = store.load_cases()
    intakes = [i for c in cases if (i := store.load_intake(c["id"]))]
    return [t for c in cases for t in store.load_trials(c["id"])], intakes


# 모델 호출 비용 집계 (호출 수·토큰·시간·역할별)
def cost(trials: list[dict], intakes: list[dict]) -> dict:
    calls = [c for r in [*trials, *intakes] for c in r.get("calls", [])]
    by_role: dict[str, dict] = {}
    for c in calls:
        row = by_role.setdefault(c["role"], {"role": c["role"], "calls": 0, "seconds": 0.0})
        row["calls"] += 1
        row["seconds"] += c["seconds"]
    return {
        "calls": len(calls), "promptTokens": sum(c["promptTokens"] for c in calls), "outputTokens": sum(c["outputTokens"] for c in calls),
        "seconds": round(sum(c["seconds"] for c in calls), 2), "byRole": [{**r, "seconds": round(r["seconds"], 2)} for r in by_role.values()],
    }


# 에이전트 자기 수정률과 에스컬레이션 집계
def agent_reliability(trials: list[dict]) -> dict:
    stats = [s for t in trials for aid, s in t.get("agentStats", {}).items() if aid != "checker"]
    failed = sum(s.get("firstFailed", 0) for s in stats)
    fixed = sum(s.get("fixed", 0) for s in stats)
    return {"selfCorrectionRate": round(fixed / failed, 4) if failed else None, "escalations": sum(bool(c.get("escalated")) for t in trials for c in t["claims"])}


# 통계 집계
def compute() -> dict:
    cases = store.load_cases()
    answers = store.load_answers()
    all_ledger = store.load_ledger()
    variant_ids = {c["id"] for c in cases if c.get("variantOf")}
    ledger = [e for e in all_ledger if not e.get("labSessionId") and e["caseId"] not in variant_ids]
    final_case_ids = {e["caseId"] for e in ledger if e["type"] == "final"}
    sessions = store.load_sessions()
    by_case: dict[str, list[dict]] = defaultdict(list)
    for e in ledger:
        by_case[e["caseId"]].append(e)

    docket = {"summary": 0, "trial": 0}
    screening = {"agreeWithFinal": 0, "disagreeWithFinal": 0, "correct": 0, "total": 0}
    judges = {"correct": 0, "total": 0}
    overturned = {"i2": 0, "i3": 0}
    seat_agreement = {"agree": 0, "total": 0}
    evidence_status = dict.fromkeys(STATUSES, 0)
    claim_stats: dict[str, dict] = {}
    categories: dict[str, dict] = {}
    finals = 0
    ontology = store.court("ontology")

    variants = [c for c in cases if c.get("variantOf")]
    cases = [c for c in cases if not c.get("variantOf")]

    for case in cases:
        cid = case["id"]
        trials = store.load_trials(cid) if projection.include_trial_stats(cid) else []
        entries = by_case.get(cid, [])
        answer = answers.get(cid)
        docket[summary.case_summary(case, trials, entries)["docket"]["track"]] += 1
        scr = store.load_screening(cid)
        cat = categories.setdefault(case["category"], {"cases": 0, "pos": 0, "hit": 0})
        cat["cases"] += 1
        if scr and answer and cid in final_case_ids:
            screening["total"] += 1
            screening["correct"] += scr["isClickbait"] == answer["isClickbait"]
            if answer["isClickbait"]:
                cat["pos"] += 1
                cat["hit"] += bool(scr["isClickbait"])
        final = [e for e in entries if e["type"] == "final"]
        if final:
            finals += 1
            verdict = final[-1]["data"]["verdict"]
            if scr:
                screening["agreeWithFinal" if scr["isClickbait"] == (verdict == "clickbait") else "disagreeWithFinal"] += 1
            if answer:
                judges["total"] += 1
                judges["correct"] += (verdict == "clickbait") == answer["isClickbait"]
        seats = _seat_verdicts(entries)
        for k in (2, 3):
            upper, lower = _verdict_of(entries, seats, k), _majority(list(seats.get(k - 1, {}).values()))
            if upper and lower and upper != lower:
                overturned[f"i{k}"] += 1
            if len(seats.get(k, {})) == k:
                seat_agreement["total"] += 1
                seat_agreement["agree"] += len(set(seats[k].values())) == 1
        for t in trials:
            for claim in t["claims"]:
                s = claim_stats.setdefault(claim["type"], {"stance": (ontology.claim_type(claim["type"]) or {}).get("stance", claim["stance"]), "count": 0, "ev": 0, "ok": 0})
                s["count"] += 1
                for ev in claim["evidence"]:
                    evidence_status[ev["status"]] = evidence_status.get(ev["status"], 0) + 1
                    s["ev"] += 1
                    s["ok"] += ev["status"] == "verified"

    appeals = {"i1": 0, "i2": 0}
    overrides = {"admittedVoided": 0, "struckCounted": 0}
    shifts = []
    first_impressions = {}
    for e in ledger:
        d = e["data"]
        key = (e["caseId"], e["judge"]["name"], e["labSessionId"])
        if e["type"] == "appeal" and e["instance"] in (1, 2):
            appeals[f"i{e['instance']}"] += 1
        elif e["type"] == "evidence_ruling":
            overrides["admittedVoided"] += d["ruling"] == "admitted" and d["checkerWeight"] == 0
            overrides["struckCounted"] += d["ruling"] == "struck" and d["checkerWeight"] > 0
        elif e["type"] == "first_impression":
            first_impressions[key] = _score(d["leaning"], d["confidence"])
        elif e["type"] == "seat_verdict" and e["instance"] == 1 and key in first_impressions:
            shifts.append(_score(d["verdict"], d["confidence"]) - first_impressions.pop(key))

    by_type = []
    for type_id, s in sorted(claim_stats.items()):
        info = ontology.claim_type(type_id) or {}
        by_type.append({
            "type": type_id, "label": info.get("label", type_id), "stance": s["stance"], "count": s["count"],
            "verifiedRate": round(s["ok"] / s["ev"], 4) if s["ev"] else 0,
        })

    lab_rows = []
    for cond in lab.CONDITIONS:
        ids = {s["id"] for s in sessions if s["condition"] == cond["id"]}
        verdicts = [e for e in all_ledger if e["type"] == "final" and e["labSessionId"] in ids]
        correct = sum(1 for e in verdicts if e["caseId"] in answers and (e["data"]["verdict"] == "clickbait") == answers[e["caseId"]]["isClickbait"])
        lab_rows.append({"condition": cond["id"], "sessions": len(ids), "verdicts": len(verdicts), "correct": correct})

    flipped = 0
    for v in variants:
        if not projection.court_open(v["id"]) or not projection.court_open(v["variantOf"]):
            continue
        own, orig = store.load_screening(v["id"]), store.load_screening(v["variantOf"])
        flipped += bool(own and orig and own["isClickbait"] != orig["isClickbait"])

    all_trials, intakes = runs()
    public_trials = [t for t in all_trials if projection.include_trial_stats(t["caseId"])]
    public_intakes = [i for i in intakes if projection.include_trial_stats(i["caseId"])]
    return {
        "cost": cost(public_trials, public_intakes), "agents": agent_reliability([t for t in public_trials if t["caseId"] not in variant_ids]),
        "cases": len(cases), "finals": finals, "docket": docket, "screening": screening, "judges": judges,
        "appeals": appeals, "overturned": overturned, "checkerOverrides": overrides, "evidenceStatus": evidence_status,
        "byClaimType": by_type,
        "confidenceShift": {"mean": round(sum(shifts) / len(shifts), 4) if shifts else None, "n": len(shifts)},
        "seatAgreement": seat_agreement,
        "byCategory": [
            {"category": k, "cases": v["cases"], "screeningRecall": round(v["hit"] / v["pos"], 4) if v["pos"] else None}
            for k, v in sorted(categories.items())
        ],
        "lab": lab_rows,
        "redteam": {"variants": len(variants), "screeningFlipped": flipped},
    }
