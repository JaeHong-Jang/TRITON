# 심급별 재판 진행 (1심·2심·3심)
import argparse
import json
from datetime import datetime, timezone

from court import agent_loop, ontology
from court.agent_loop import Session
from court.intake import load as load_intake
from court.intake import run_case
from court.llm import OllamaClient
from court.paths import DATA_DIR
from court.scale import balance
from court.skills import load_skill

SIDES = {"prosecution": ("P", "검사", "prosecutor", "검사 측"), "defense": ("D", "변호인", "defense", "변호 측")}
ROUND_TITLES = {"opening": "모두 주장", "cross": "반대신문", "review": "법률 검토"}
BALANCE_RATIO_LIMIT = 0.3
CONFIDENCE_LIMIT = 70
INTAKE_OMITTED = object()


# 에이전트 기록 생성
def _agent(instance, side, number, specialty=None):
    prefix, name, skill, _ = SIDES[side]
    meta = load_skill(skill)
    return {"id": f"i{instance}-{prefix}{number}", "side": side, "name": f"{name} {number}", "specialty": specialty, "skill": meta["name"], "skillVersion": meta["version"]}


# 심급 기록 공통 틀 (작업 중에는 지금까지의 중간 기록)
def _record(session, bench, screening=None, officer=None):
    return {
        "caseId": session.case["id"],
        "instance": session.instance,
        "ontologyVersion": ontology.load()["version"],
        "model": {"name": session.client.model, "options": session.client.options},
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bench": bench,
        "rounds": session.rounds,
        "claims": session.claims,
        "screening": screening,
        "officer": officer,
        "calls": session.calls,
        "trace": session.trace,
        "agentStats": session.stats,
    }


# 2심 팀 인원 결정 (어려운 사건은 3명)
def bench_size(prior):
    first = next((r for r in prior if r["instance"] == 1), None)
    if first is None:
        return 2
    screening = first.get("screening")
    if screening is None or screening["confidence"] < CONFIDENCE_LIMIT:
        return 3
    scale = balance(first["claims"])
    total = scale["pro"] + scale["con"]
    if total == 0 or abs(scale["pro"] - scale["con"]) / total < BALANCE_RATIO_LIMIT:
        return 3
    if any(e["status"] == "fabricated" for c in first["claims"] for e in c["evidence"]):
        return 3
    return 2


# 하급심 위증 의심 근거 id 집계
def perjury_ids(prior):
    return [e["id"] for r in prior for c in r["claims"] for e in c["evidence"] if e["status"] == "fabricated"]


# 1심 진행 (접수 결과 복사·검사·변호인)
def _first_instance(case, client, notes, on_step, on_event, attempt=1, intake_doc=INTAKE_OMITTED, save_intake=None):
    session = Session(case, 1, client, notes, on_step, on_event, 3, attempt)
    intake = load_intake(case["id"]) if intake_doc is INTAKE_OMITTED else intake_doc
    clerk_meta = load_skill("clerk")
    clerk_agent = {"id": "i1-K1", "side": "officer", "name": "서기", "specialty": None, "skill": clerk_meta["name"], "skillVersion": clerk_meta["version"]}
    bench = [clerk_agent, _agent(1, "prosecution", 1), _agent(1, "defense", 1)]
    session.build_partial = lambda: _record(session, bench, screening=intake["screening"] if intake else None)
    if intake is None:
        session.progress("서기 접수 검토")
        intake = run_case(case, client, on_event, session.build_partial, save_result=save_intake)
    session.skip("서기 접수 결과 사용")
    opening = session.add_round("opening", ROUND_TITLES["opening"])
    for agent in bench[1:]:
        agent_loop.work_statement(session, agent, opening)
    return _finish(session, _record(session, bench, screening=intake["screening"]))


# 2심 진행 (전문 분담 팀·반대신문)
def _second_instance(case, prior, client, notes, on_step, on_event, attempt=1):
    size = bench_size(prior)
    session = Session(case, 2, client, notes, on_step, on_event, 4 * size, attempt)
    pro_types, con_types = ontology.selectable_types("pro"), ontology.selectable_types("con")
    prosecutors = [_agent(2, "prosecution", i, pro_types[i - 1]) for i in range(1, size + 1)]
    defenders = [_agent(2, "defense", i, con_types[i - 1]) for i in range(1, size + 1)]
    bench = prosecutors + defenders
    session.build_partial = lambda: _record(session, bench)
    opening = session.add_round("opening", ROUND_TITLES["opening"])
    for p, d in zip(prosecutors, defenders):
        agent_loop.work_statement(session, p, opening, p["specialty"])
        agent_loop.work_statement(session, d, opening, d["specialty"])
    side_of = {a["id"]: a["side"] for a in bench}
    side_claims = {side: [c for c in session.claims if side_of[c["agentId"]] == side] for side in SIDES}
    cross = session.add_round("cross", ROUND_TITLES["cross"])
    for p, d in zip(prosecutors, defenders):
        agent_loop.work_cross(session, p, cross, side_claims["defense"], SIDES["prosecution"][3])
        agent_loop.work_cross(session, d, cross, side_claims["prosecution"], SIDES["defense"][3])
    return _finish(session, _record(session, bench))


# 3심 진행 (재판연구관 보고서·쟁점별 검토)
def _third_instance(case, prior, client, notes, on_step, on_event, attempt=1):
    session = Session(case, 3, client, notes, on_step, on_event, 3, attempt)
    officer_skill = load_skill("research-officer")
    officer_agent = {"id": "i3-O1", "side": "officer", "name": "재판연구관", "specialty": None, "skill": officer_skill["name"], "skillVersion": officer_skill["version"]}
    bench = [officer_agent, _agent(3, "prosecution", 1), _agent(3, "defense", 1)]
    officer = None
    session.build_partial = lambda: _record(session, bench, officer=officer)
    officer = {**agent_loop.work_officer(session, officer_agent, prior), "perjury": perjury_ids(prior)}
    issues = "\n".join([f"요약: {officer['summary']}"] + [f"{i}. {text}" for i, text in enumerate(officer["issues"], start=1)])
    review = session.add_round("review", ROUND_TITLES["review"])
    for agent in bench[1:]:
        agent_loop.work_statement(session, agent, review, issues=issues)
    return _finish(session, _record(session, bench, officer=officer))


# 작업 종료 이벤트와 최종 기록 확정
def _finish(session, record):
    session.emit(agent_loop.CHECKER, "done", f"{session.instance}심 작업 완료 · 주장 {len(session.claims)}건 제출", role=agent_loop.CHECKER, public=f"{session.instance}심 작업 완료")
    return {**record, "trace": session.trace, "agentStats": session.stats}


# 심급별 TrialRecord 생성
def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None, attempt=1, intake_doc=INTAKE_OMITTED, save_intake=None):
    if instance == 1:
        return _first_instance(case, client, judge_notes, on_step, on_event, attempt, intake_doc, save_intake)
    if instance == 2:
        return _second_instance(case, prior, client, judge_notes, on_step, on_event, attempt)
    if instance == 3:
        return _third_instance(case, prior, client, judge_notes, on_step, on_event, attempt)
    raise ValueError(f"알 수 없는 심급: {instance}")


# 저장된 하급심 기록 읽기
def _load_prior(case_id, instance):
    found = []
    for n in range(1, instance):
        path = DATA_DIR / "trials" / case_id / f"{n}.json"
        if path.exists():
            found.append(json.loads(path.read_text(encoding="utf-8")))
    return found


# 재판 기록 생성 CLI 진입점
def main():
    ap = argparse.ArgumentParser(description="심급별 재판 기록 생성 (A.X via Ollama)")
    ap.add_argument("--instance", type=int, required=True, choices=[1, 2, 3])
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true")
    group.add_argument("--case")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--model", default=None)
    ap.add_argument("--force", action="store_true", help="이미 있는 기록도 다시 생성")
    args = ap.parse_args()

    lines = (DATA_DIR / "cases" / "cases.jsonl").read_text(encoding="utf-8").splitlines()
    cases = [json.loads(line) for line in lines]
    cases = [c for c in cases if args.all or c["id"] == args.case][: args.limit]
    client = OllamaClient(model=args.model)
    for case in cases:
        out = DATA_DIR / "trials" / case["id"] / f"{args.instance}.json"
        prior = _load_prior(case["id"], args.instance)
        if (out.exists() and not args.force) or (args.instance > 1 and len(prior) < args.instance - 1):
            print(f"{case['id']}: 건너뜀")
            continue
        record = run(case, args.instance, prior, client)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
        statuses = [e["status"] for c in record["claims"] for e in c["evidence"]]
        print(f"{case['id']}: 주장 {len(record['claims'])}건, 근거 {statuses}, {sum(c['seconds'] for c in record['calls']):.1f}초")


if __name__ == "__main__":
    main()
