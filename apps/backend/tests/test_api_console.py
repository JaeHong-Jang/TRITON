# 운영 콘솔 API 테스트 (이벤트·접수·정책·대시보드·작업실·비용)
import json
import sys
import time
import types
from pathlib import Path

from app import console, stats, store
from conftest import appeal_case, final_data, first_impression, ledger_body, make_trial, scr

FIRST = {"leaning": "clickbait", "confidence": 70}
ROLES = ["clerk", "prosecution", "defense", "cross", "officer", "checker"]


# 같은 작업의 여러 주장과 다른 라운드의 독립 수정 횟수
def test_role_revisions_count_once_per_task(env):
    trial = make_trial("c2", 2, None)
    first = trial["claims"][0]
    first.update(agentId="i2-D1", revisions=2)
    trial["bench"] = [{**trial["bench"][0], "id": "i2-D1", "side": "defense"}]
    trial["rounds"] = [{"index": 0, "kind": "opening"}, {"index": 1, "kind": "cross"}]
    trial["claims"] = [first, {**first, "id": "second"}, {**first, "id": "cross", "round": 1, "rebuts": "target", "revisions": 1}]
    totals = console._totals([trial], [])
    assert totals["defense"]["claims"] == 2 and totals["defense"]["revisions"] == 2
    assert totals["cross"]["claims"] == 1 and totals["cross"]["revisions"] == 1


# 빈 모두 변론과 반대신문의 에이전트별 판사 이관 역할
def test_role_escalations_include_empty_opening_and_cross(env):
    trial = make_trial("c2", 2, None)
    trial["claims"] = []
    trial["bench"] = [{"id": "i2-P1", "side": "prosecution"}, {"id": "i2-D1", "side": "defense"}]
    trial["trace"] = [{"agentId": aid, "kind": kind, "claimId": None} for aid in ("i2-P1", "i2-D1", "i2-P1", "i2-D1") for kind in ("read", "escalate")]
    trial["agentStats"] = {aid: {"escalated": 2} for aid in ("i2-P1", "i2-D1")}
    totals = console._totals([trial], [])
    assert {role: totals[role]["escalations"] for role in ("prosecution", "defense", "cross")} == {"prosecution": 1, "defense": 1, "cross": 2}
    assert sum(t["escalations"] for t in totals.values()) == stats.agent_reliability([trial])["escalations"] == 4
    store.append_jsonl("cases/cases.jsonl", {**store.get_case("c2"), "id": "variant", "variantOf": "c2"})
    variant = {**trial, "caseId": "variant"}
    assert sum(t["escalations"] for t in console._totals([trial, variant], []).values()) == 4


# 비율별 실제 분모와 분야별 낚시성 재현율 표본
def test_metric_samples_match_rate_denominators(env):
    for cid in ("c1", "c2", "c3", "c4"):
        trial = store.load_trial(cid, 1) or make_trial(cid, 1, scr(False, 50))
        trial["agentStats"] = {"i1-P1": {"firstFailed": 3, "fixed": 2}} if cid == "c1" else {}
        store.write_json(f"trials/{cid}/1.json", trial)
        store.append_jsonl("ledger/ledger.jsonl", {"id": f"first-{cid}", "at": "2026-01-01T00:00:00Z", **ledger_body(cid, "first_impression", FIRST)})
        store.append_jsonl("ledger/ledger.jsonl", {"id": f"final-{cid}", "at": "2026-01-01T00:00:01Z", **ledger_body(cid, "final", final_data("clickbait"))})
    answers = store.load_answers()
    (env.data / "answers" / "answers.jsonl").write_text("\n".join(json.dumps(a) for cid, a in answers.items() if cid != "c4") + "\n", encoding="utf-8")
    snapshot, kpis = stats.compute(), console.dashboard()["kpis"]
    assert kpis["samples"] == {"screening": 3, "selfCorrection": 3, "perjury": 5}
    assert kpis["screeningAccuracy"] == 0.3333 and kpis["selfCorrectionRate"] == 0.6667 and kpis["perjuryRate"] == 0.2
    assert {r["category"]: (r["screeningRecall"], r["screeningSample"]) for r in snapshot["byCategory"]} == {"IT": (None, 0), "경제": (0.0, 1), "정치": (1.0, 1)}


# 실패와 이전 시도를 포함한 모델 비용 및 옛 기록 대체 경로
def test_cost_uses_model_calls_with_legacy_fallback(env):
    measured = make_trial("c1", 1, scr(True, 90))
    measured["calls"] = [{"role": "prosecution", "promptTokens": 1, "outputTokens": 1, "seconds": 1.0}]
    measured["execution"] = {"modelCalls": {"calls": 5, "failed": 2, "promptTokens": 1000, "outputTokens": 200, "seconds": 10.0}}
    legacy = make_trial("c2", 1, scr(False, 60))
    legacy["calls"] = [{"role": "defense", "promptTokens": 10, "outputTokens": 2, "seconds": 1.5}] * 2
    for trial in (measured, legacy):
        store.write_json(f"trials/{trial['caseId']}/1.json", trial)
    store.write_json("intake/c1.json", {"caseId": "c1", "screening": scr(True, 90), "calls": [{"role": "clerk", "promptTokens": 1, "outputTokens": 1, "seconds": 2.0}], "modelCalls": {"calls": 3, "failed": 1, "promptTokens": 500, "outputTokens": 100, "seconds": 4.0}})
    store.write_json("intake/c3.json", {"caseId": "c3", "screening": scr(False, 60), "calls": [{"role": "clerk", "promptTokens": 30, "outputTokens": 5, "seconds": 2.0}]})
    store.write_json("trials/c4/1.json", {**measured, "caseId": "c4"})
    for cid in ("c1", "c2", "c3"):
        store.append_jsonl("ledger/ledger.jsonl", {"id": cid, "at": "2026-01-01T00:00:00Z", **ledger_body(cid, "first_impression", FIRST)})
    assert stats.compute()["cost"] == {"calls": 11, "failedCalls": 3, "promptTokens": 1550, "outputTokens": 309, "seconds": 19.0, "byRole": [{"role": "prosecution", "calls": 1, "seconds": 1.0}, {"role": "defense", "calls": 2, "seconds": 3.0}, {"role": "clerk", "calls": 2, "seconds": 4.0}]}


# 실제 호출이 없는 캐시 재생 기록의 비용 제외
def test_cost_zero_model_calls_do_not_fall_back_to_cached_calls(env):
    trial = make_trial("c1", 1, None)
    trial["calls"] = [{"role": "prosecution", "promptTokens": 10, "outputTokens": 2, "seconds": 1.0}]
    trial["execution"] = {"modelCalls": {"calls": 0, "failed": 0, "promptTokens": 0, "outputTokens": 0, "seconds": 0}}
    cost = stats.cost([trial], [])
    assert (cost["calls"], cost["failedCalls"], cost["promptTokens"], cost["outputTokens"], cost["seconds"]) == (0, 0, 0, 0, 0)
    assert cost["byRole"] == [{"role": "prosecution", "calls": 1, "seconds": 1.0}]


# 재판 우선 실행에 선점된 접수는 작업 중 지표에서 제외
def test_preempted_intake_is_not_working(env, monkeypatch):
    store.append_jsonl("ledger/ledger.jsonl", {"id": "first", "at": "2026-01-01T00:00:00Z", **ledger_body("c1", "first_impression", FIRST)})
    job = {"id": "intake", "caseId": "c1", "instance": 0, "status": "running", "step": "접수 검토", "done": 1, "total": 2, "error": None, "startedAt": "2026-01-01T00:00:00Z", "_kind": "intake", "_role": "clerk", "_recent": [], "_preempted": True}
    trial = {**job, "id": "trial", "instance": 1, "_kind": "trial", "_role": "prosecution"}
    trial.pop("_preempted")
    monkeypatch.setattr(console.jobs, "active", lambda: [job, trial])
    assert console.dashboard()["agentsWorking"] == 1
    profiles = {a["role"]: a for a in console.agents()}
    assert profiles["clerk"]["working"] is None and profiles["prosecution"]["working"]["caseId"] == "c1"
    job["_preempted"] = False
    assert console.dashboard()["agentsWorking"] == 2
    assert next(a for a in console.agents() if a["role"] == "clerk")["working"]["caseId"] == "c1"


# 작업이 끝날 때까지 기다린 마지막 상태
def wait_job(env, job_id, query=""):
    for _ in range(100):
        job = env.get(f"/api/jobs/{job_id}{query}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.05)
    return job


# 새 필드가 담긴 2심 기록 저장
def write_trial2(env):
    trial = make_trial("c2", 2, None)
    trial["claims"][0]["revisions"], trial["claims"][0]["escalated"] = 1, True
    trial["claims"][0]["agentId"] = "i2-P1"
    trial["bench"][0]["id"] = "i2-P1"
    trial["calls"] = [{"role": "prosecution", "agentId": "i2-P1", "step": "plan", "promptTokens": 100, "outputTokens": 20, "seconds": 2.0}, {"role": "prosecution", "agentId": "i2-P1", "step": "draft", "promptTokens": 300, "outputTokens": 80, "seconds": 5.0}, {"role": "cross", "agentId": "i2-P1", "step": "plan", "promptTokens": 50, "outputTokens": 10, "seconds": 1.0}]
    trial["trace"] = [{"seq": 1, "at": "2026-02-01T00:00:00+00:00", "agentId": "i2-P1", "kind": "escalate", "text": "과장 주장 에스컬레이션", "claimId": "i2-C1"}, {"seq": 2, "at": "2026-02-01T00:00:01+00:00", "agentId": "checker", "kind": "check", "text": "근거 1건 대조", "claimId": None}]
    trial["agentStats"] = {"i2-P1": {"calls": 3, "revisions": 1, "escalated": 1, "seconds": 8.0, "firstFailed": 2, "fixed": 1}, "checker": {"calls": 4, "revisions": 0, "escalated": 0, "seconds": 0, "verified": 3, "perjury": 1}}
    (env.data / "trials" / "c2" / "2.json").write_text(json.dumps(trial, ensure_ascii=False), encoding="utf-8")


# 작업 조회는 since 이후 이벤트와 중간 기록과 시작 시각을 준다
def test_job_events_since_and_partial(env):
    job_id = env.post("/api/cases/c4/trials/1").json()["jobId"]
    done = wait_job(env, job_id)
    assert done["status"] == "done" and done["startedAt"]
    assert done["events"] == [] and done["partial"]["caseId"] == "c4"
    assert done["done"] == done["total"] == 0 and done["partial"]["trace"] == []
    assert done["partial"]["claims"] == [] and done["error"] is None
    first_impression(env, "c4")
    opened = env.get(f"/api/jobs/{job_id}").json()
    assert len(opened["partial"]["claims"]) == 1
    assert [e["seq"] for e in opened["events"]] == [1, 2]
    later = env.get(f"/api/jobs/{job_id}?since=1").json()
    assert [e["seq"] for e in later["events"]] == [2] and later["partial"] is not None
    assert env.get(f"/api/jobs/{job_id}?since=2").json()["events"] == []
    assert opened["done"] == opened["total"] == 2


# 숨긴 작업 오류는 상세 문자열을 내보내지 않음
def test_hidden_job_error_is_neutral(env):
    env.calls["fail"] = True
    job_id = env.post("/api/cases/c4/trials/1").json()["jobId"]
    done = wait_job(env, job_id)
    assert done["status"] == "error" and done["error"] == "작업 오류"
    assert done["events"] == [] and done["step"] == "작업 오류"


# 접수 일괄 실행은 파일을 쓰고 서기 권고가 접수 분류를 정한다
def test_intake_batch_and_docket(env):
    job = wait_job(env, env.post("/api/intake", json={"caseIds": ["c4"]}).json()["jobId"])
    assert job["status"] == "done" and job["instance"] == 0 and job["total"] == 0 and job["events"] == []
    assert (env.data / "intake" / "c4.json").exists() and env.calls["intake"] == ["c4"]
    assert env.get("/api/cases?track=trial").json()
    c4 = next(c for c in env.get("/api/cases").json() if c["id"] == "c4")
    assert c4["docket"]["screening"] is None and c4["docket"]["track"] == "trial" and c4["docket"]["reasons"] == []
    first_impression(env, "c4")
    opened_job = env.get(f"/api/jobs/{job['id']}").json()
    assert opened_job["total"] == 1 and opened_job["events"][0]["kind"] == "done"
    c4_open = next(c for c in env.get("/api/cases").json() if c["id"] == "c4")
    assert c4_open["docket"]["screening"]["confidence"] == 40 and c4_open["docket"]["track"] == "trial"
    (env.data / "intake" / "c3.json").write_text(json.dumps({"caseId": "c3", "screening": scr(True, 99), "trace": [], "calls": [], "agentStats": {}}), encoding="utf-8")
    c3 = next(c for c in env.get("/api/cases").json() if c["id"] == "c3")
    assert c3["docket"]["screening"] is None
    first_impression(env, "c3")
    c3_open = next(c for c in env.get("/api/cases").json() if c["id"] == "c3")
    assert c3_open["docket"]["screening"]["confidence"] == 99
    wait_job(env, env.post("/api/intake").json()["jobId"])
    assert sorted(env.calls["intake"]) == ["c1", "c2", "c4"]
    assert env.post("/api/intake", json={"caseIds": ["nope"]}).status_code == 404


# 정책은 파일에 저장되고 접수 분류를 바로 바꾼다
def test_policy_persists_and_flips_track(env, monkeypatch):
    real = types.ModuleType("court.docket")
    source = (Path(__file__).resolve().parents[1] / "court" / "docket.py").read_text(encoding="utf-8")
    exec(compile(source, "docket.py", "exec"), real.__dict__)
    monkeypatch.setitem(sys.modules, "court.docket", real)
    assert env.get("/api/policy").json() == {"summaryEnabled": True, "summaryThreshold": 85, "highRiskCategories": ["정치", "사회"]}
    (env.data / "intake" / "c3.json").parent.mkdir(exist_ok=True)
    (env.data / "intake" / "c3.json").write_text(json.dumps({"caseId": "c3", "screening": scr(False, 90), "trace": [], "calls": [], "agentStats": {}}), encoding="utf-8")
    track = lambda: next(c for c in env.get("/api/cases").json() if c["id"] == "c3")["docket"]
    assert track()["track"] == "trial" and track()["screening"] is None
    first_impression(env, "c3")
    assert track()["track"] == "summary"
    body = {"summaryEnabled": True, "summaryThreshold": 95, "highRiskCategories": ["정치", "경제"]}
    assert env.put("/api/policy", json=body).json() == body
    assert json.loads((env.data / "policy.json").read_text(encoding="utf-8")) == body
    flipped = track()
    assert flipped["track"] == "trial" and any("95" in r for r in flipped["reasons"]) and any("경제" in r for r in flipped["reasons"])
    env.put("/api/policy", json={**body, "summaryThreshold": 50, "highRiskCategories": [], "summaryEnabled": False})
    assert track()["track"] == "trial" and "약식 처리 꺼짐 (정책)" in track()["reasons"]
    assert env.put("/api/policy", json={**body, "summaryThreshold": 120}).status_code == 422


# 대시보드·작업실·비용 응답 모양과 집계값
def test_dashboard_agents_and_cost(env):
    write_trial2(env)
    first_impression(env, "c2")
    appeal_case(env, "c1")
    dash = env.get("/api/dashboard").json()
    assert set(dash) == {"cases", "inTrial", "finals", "activeJobs", "agentsWorking", "kpis", "recent"}
    assert (dash["cases"], dash["inTrial"], dash["finals"], dash["activeJobs"], dash["agentsWorking"]) == (4, 2, 0, [], 0)
    assert set(dash["kpis"]) == {"screeningAccuracy", "selfCorrectionRate", "escalations", "perjuryRate", "humanOverrides", "samples"}
    assert dash["kpis"]["selfCorrectionRate"] == 0.5 and dash["kpis"]["escalations"] == 1 and dash["kpis"]["screeningAccuracy"] is None
    assert dash["recent"][0]["kind"] == "ledger" and {i["kind"] for i in dash["recent"]} == {"ledger", "agent"}
    assert [i["text"] for i in dash["recent"] if i["kind"] == "agent"] == ["검사 1 · 과장 주장 에스컬레이션"]
    agents = env.get("/api/agents").json()
    assert [a["role"] for a in agents] == ROLES
    assert all(set(a) == {"role", "label", "room", "skill", "skillVersion", "totals", "working", "queued"} for a in agents)
    by_role = {a["role"]: a for a in agents}
    assert by_role["checker"]["skill"] is None and by_role["prosecution"]["skill"] == "prosecutor" and by_role["prosecution"]["skillVersion"]
    assert by_role["prosecution"]["totals"] == {"tasks": 1, "claims": 1, "evidence": 1, "verified": 1, "perjury": 0, "revisions": 1, "escalations": 1, "seconds": 7.0}
    assert by_role["cross"]["totals"]["tasks"] == 1 and by_role["cross"]["totals"]["seconds"] == 1.0
    assert by_role["checker"]["totals"]["evidence"] == 4 and by_role["checker"]["totals"]["perjury"] == 1 and by_role["checker"]["totals"]["tasks"] == 1
    stats = env.get("/api/stats").json()
    assert stats["cost"] == {"calls": 3, "failedCalls": 0, "promptTokens": 450, "outputTokens": 110, "seconds": 8.0, "byRole": [{"role": "prosecution", "calls": 2, "seconds": 7.0}, {"role": "cross", "calls": 1, "seconds": 1.0}]}
    assert stats["agents"] == {"selfCorrectionRate": 0.5, "escalations": 1}


# 진행 중 작업은 작업실의 working과 대시보드에 나타난다
def test_working_and_queued_from_jobs(env, monkeypatch):
    from app import jobs

    job = {"id": "j1", "caseId": "c4", "instance": 2, "status": "running", "step": "시작", "done": 0, "total": 8, "error": None, "startedAt": "2026-01-01T00:00:00+00:00",
           "_kind": "trial", "_case": None, "_prior": [], "_notes": "", "_events": [{"seq": 1, "at": "2026-01-01T00:00:00+00:00", "agentId": "i2-D1", "kind": "submit", "text": "숨은 주장 c4-C1 생성", "publicText": "변론 제출", "claimId": "c4-C1"}], "_partial": None, "_role": "cross"}
    waiting = {**job, "id": "j2", "status": "queued", "instance": 1, "_events": [], "_role": None}
    monkeypatch.setattr(jobs, "JOBS", {"j1": job, "j2": waiting})
    agents = {a["role"]: a for a in env.get("/api/agents").json()}
    assert all(a["working"] is None and a["queued"] == 0 for a in agents.values())
    dash = env.get("/api/dashboard").json()
    assert dash["agentsWorking"] == 1 and [j["id"] for j in dash["activeJobs"]] == ["j1", "j2"]
    assert "숨은 주장" not in json.dumps(dash["recent"], ensure_ascii=False)
    assert [r["text"] for r in dash["recent"] if r["caseId"] == "c4"] == ["재판 준비 중"]
    assert all("events" not in j and "partial" not in j and not any(k.startswith("_") for k in j) for j in dash["activeJobs"])
    first_impression(env, "c4")
    opened = {a["role"]: a for a in env.get("/api/agents").json()}
    assert opened["cross"]["working"] == {"caseId": "c4", "instance": 2, "text": "숨은 주장 c4-C1 생성"}
    assert opened["prosecution"]["queued"] == 1 and opened["cross"]["queued"] == 0


# 재판 작업은 긴 접수 일괄 작업의 다음 사건 앞에서 먼저 실행된다
def test_trial_job_runs_before_remaining_intake(env):
    import threading

    gate, order = threading.Event(), []
    intake, instances = sys.modules["court.intake"], sys.modules["court.instances"]
    inner_intake, inner_run = intake.run_case, instances.run

    # 첫 사건에서 풀릴 때까지 대기하는 접수
    def slow_intake(case, client, on_event=None, build_partial=None):
        order.append(f"intake:{case['id']}")
        if len(order) == 1:
            gate.wait(5)
        return inner_intake(case, client, on_event)

    # 실행 순서를 기록하는 재판
    def record_run(case, instance, *a, **k):
        order.append(f"trial:{case['id']}")
        return inner_run(case, instance, *a, **k)

    intake.run_case, instances.run = slow_intake, record_run
    intake_id = env.post("/api/intake", json={"caseIds": ["c1", "c2", "c3"]}).json()["jobId"]
    for _ in range(100):
        if order:
            break
        time.sleep(0.02)
    trial_id = env.post("/api/cases/c4/trials/1").json()["jobId"]
    gate.set()
    assert wait_job(env, trial_id)["status"] == "done" and wait_job(env, intake_id)["status"] == "done"
    assert order == ["intake:c1", "trial:c4", "intake:c2", "intake:c3"]


# 접수 중복 방지는 사건 집합이 같을 때만 같은 작업을 돌려준다
def test_intake_dedupe_by_case_set(env):
    import threading

    gate = threading.Event()
    intake = sys.modules["court.intake"]
    inner = intake.run_case

    # 풀릴 때까지 대기하는 접수
    def slow(case, client, on_event=None, build_partial=None):
        gate.wait(5)
        return inner(case, client, on_event)

    intake.run_case = slow
    first = env.post("/api/intake", json={"caseIds": ["c1", "c2"]}).json()["jobId"]
    same = env.post("/api/intake", json={"caseIds": ["c2", "c1"]}).json()["jobId"]
    other = env.post("/api/intake", json={"caseIds": ["c1"]}).json()["jobId"]
    gate.set()
    assert same == first and other != first
    wait_job(env, other)
    wait_job(env, first)


# 최근 활동은 실험실·변형 사건을 빼고 접수 이벤트를 한 번만 보여 준다
def test_recent_excludes_lab_and_variants_and_dedupes_intake(env):
    from app import jobs

    variant = {**json.loads((env.data / "cases" / "cases.jsonl").read_text(encoding="utf-8").splitlines()[0]), "id": "c1-mv", "variantOf": "c1", "attack": "move_inserted"}
    with (env.data / "cases" / "cases.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(variant, ensure_ascii=False) + "\n")
    env.post("/api/ledger", json=ledger_body("c1", "first_impression", FIRST, session="s1"))
    env.post("/api/ledger", json=ledger_body("c1-mv", "first_impression", FIRST))
    env.post("/api/ledger", json=ledger_body("c2", "first_impression", FIRST))
    event = {"seq": 1, "at": "2026-03-01T00:00:00+00:00", "agentId": "i1-K1", "kind": "done", "text": "접수 검토 완료", "publicText": "접수 검토 완료", "claimId": None}
    doc = {"caseId": "c4", "screening": scr(False, 40), "trace": [event], "calls": [], "agentStats": {}}
    (env.data / "intake").mkdir(exist_ok=True)
    (env.data / "intake" / "c4.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    job = {"id": "j1", "caseId": "c4", "instance": 0, "status": "running", "step": "시작", "done": 0, "total": 1, "error": None, "startedAt": "2026-03-01T00:00:00+00:00",
           "_kind": "intake", "_case": [], "_prior": [], "_notes": "", "_events": [event], "_partial": None, "_role": "clerk"}
    jobs.JOBS["j1"] = job
    try:
        recent = env.get("/api/dashboard").json()["recent"]
    finally:
        jobs.JOBS.pop("j1")
    assert [r["caseId"] for r in recent if r["kind"] == "ledger"] == ["c2"]
    assert [r["text"] for r in recent if r["kind"] == "agent" and r["caseId"] == "c4"] == ["재판 준비 중"]
