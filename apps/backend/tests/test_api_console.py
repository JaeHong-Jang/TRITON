# 운영 콘솔 API 테스트 (이벤트·접수·정책·대시보드·작업실·비용)
import json
import sys
import time
import types
from pathlib import Path

from conftest import ledger_body, make_trial, scr

FIRST = {"leaning": "clickbait", "confidence": 70}
ROLES = ["clerk", "prosecution", "defense", "cross", "officer", "checker"]


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
    assert [e["seq"] for e in done["events"]] == [1, 2] and done["partial"]["caseId"] == "c4"
    assert len(done["partial"]["claims"]) == 1
    later = env.get(f"/api/jobs/{job_id}?since=1").json()
    assert [e["seq"] for e in later["events"]] == [2] and later["partial"] is not None
    assert env.get(f"/api/jobs/{job_id}?since=2").json()["events"] == []
    assert set(done["events"][0]) == {"seq", "at", "agentId", "kind", "text", "claimId"}


# 접수 일괄 실행은 파일을 쓰고 서기 권고가 접수 분류를 정한다
def test_intake_batch_and_docket(env):
    job = wait_job(env, env.post("/api/intake", json={"caseIds": ["c4"]}).json()["jobId"])
    assert job["status"] == "done" and job["instance"] == 0 and job["total"] == 1 and job["events"][0]["kind"] == "done"
    assert (env.data / "intake" / "c4.json").exists() and env.calls["intake"] == ["c4"]
    assert env.get("/api/cases?track=trial").json()
    c4 = next(c for c in env.get("/api/cases").json() if c["id"] == "c4")
    assert c4["docket"]["screening"]["confidence"] == 40 and c4["docket"]["track"] == "trial"
    (env.data / "intake" / "c3.json").write_text(json.dumps({"caseId": "c3", "screening": scr(True, 99), "trace": [], "calls": [], "agentStats": {}}), encoding="utf-8")
    c3 = next(c for c in env.get("/api/cases").json() if c["id"] == "c3")
    assert c3["docket"]["screening"]["confidence"] == 99
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
    env.post("/api/ledger", json=ledger_body("c1", "appeal", {"reason": "항소 사유"}))
    dash = env.get("/api/dashboard").json()
    assert set(dash) == {"cases", "inTrial", "finals", "activeJobs", "agentsWorking", "kpis", "recent"}
    assert (dash["cases"], dash["inTrial"], dash["finals"], dash["activeJobs"], dash["agentsWorking"]) == (4, 1, 0, [], 0)
    assert set(dash["kpis"]) == {"screeningAccuracy", "selfCorrectionRate", "escalations", "perjuryRate", "humanOverrides"}
    assert dash["kpis"]["selfCorrectionRate"] == 0.5 and dash["kpis"]["escalations"] == 1 and dash["kpis"]["screeningAccuracy"] == 0.3333
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
    assert stats["cost"] == {"calls": 3, "promptTokens": 450, "outputTokens": 110, "seconds": 8.0, "byRole": [{"role": "prosecution", "calls": 2, "seconds": 7.0}, {"role": "cross", "calls": 1, "seconds": 1.0}]}
    assert stats["agents"] == {"selfCorrectionRate": 0.5, "escalations": 1}


# 진행 중 작업은 작업실의 working과 대시보드에 나타난다
def test_working_and_queued_from_jobs(env, monkeypatch):
    from app import jobs

    job = {"id": "j1", "caseId": "c4", "instance": 2, "status": "running", "step": "시작", "done": 0, "total": 8, "error": None, "startedAt": "2026-01-01T00:00:00+00:00",
           "_kind": "trial", "_case": None, "_prior": [], "_notes": "", "_events": [{"seq": 1, "at": "2026-01-01T00:00:00+00:00", "agentId": "i2-D1", "kind": "tool", "text": "7번 문장 원문 확인", "claimId": None}], "_partial": None, "_role": "cross"}
    waiting = {**job, "id": "j2", "status": "queued", "instance": 1, "_events": [], "_role": None}
    monkeypatch.setattr(jobs, "JOBS", {"j1": job, "j2": waiting})
    agents = {a["role"]: a for a in env.get("/api/agents").json()}
    assert agents["cross"]["working"] == {"caseId": "c4", "instance": 2, "text": "7번 문장 원문 확인"}
    assert agents["prosecution"]["working"] is None and agents["prosecution"]["queued"] == 1 and agents["cross"]["queued"] == 0
    dash = env.get("/api/dashboard").json()
    assert dash["agentsWorking"] == 1 and [j["id"] for j in dash["activeJobs"]] == ["j1", "j2"]
    assert all("events" not in j and "partial" not in j and not any(k.startswith("_") for k in j) for j in dash["activeJobs"])


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
    job = {"id": "j1", "caseId": "c4", "instance": 0, "status": "running", "step": "시작", "done": 0, "total": 1, "error": None, "startedAt": None,
           "_kind": "intake", "_case": [], "_prior": [], "_notes": "", "_events": [event], "_partial": None, "_role": "clerk"}
    jobs.JOBS["j1"] = job
    try:
        recent = env.get("/api/dashboard").json()["recent"]
    finally:
        jobs.JOBS.pop("j1")
    assert [r["caseId"] for r in recent if r["kind"] == "ledger"] == ["c2"]
    assert [r["text"] for r in recent if r["kind"] == "agent" and r["caseId"] == "c4"] == ["서기 · 접수 검토 완료"]
