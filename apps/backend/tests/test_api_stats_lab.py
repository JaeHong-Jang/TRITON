# 통계·실험실·변형 사건 API 테스트
import json

from conftest import final_data, ledger_body, make_trial, scr


# 실험 조건 목록
def test_conditions(env):
    rows = env.get("/api/lab/conditions").json()
    assert [r["id"] for r in rows] == ["A", "B", "C"] and all(r["label"] and r["description"] for r in rows)


# 세션 생성과 완료 추적
def test_lab_session_and_done(env):
    s = env.post("/api/lab/sessions", json={"condition": "B", "judge": "판사A"}).json()
    assert s["condition"] == "B" and sorted(s["caseIds"]) == ["c1", "c2", "c3"] and s["done"] == []
    assert env.get(f"/api/lab/sessions/{s['id']}").json()["caseIds"] == s["caseIds"]
    env.post("/api/ledger", json=ledger_body("c2", "final", final_data("clickbait"), session=s["id"]))
    env.post("/api/ledger", json=ledger_body("c3", "final", final_data("clickbait")))
    assert env.get(f"/api/lab/sessions/{s['id']}").json()["done"] == ["c2"]
    small = env.post("/api/lab/sessions", json={"condition": "A", "judge": "판사A", "size": 2}).json()
    assert len(small["caseIds"]) == 2
    answers = {"c1": True, "c2": False, "c3": True}
    assert any(answers[c] for c in small["caseIds"]) and any(not answers[c] for c in small["caseIds"])
    assert "isClickbait" not in str(small)
    assert env.get("/api/lab/sessions/none").status_code == 404
    assert env.post("/api/lab/sessions", json={"condition": "Z", "judge": "x"}).status_code == 422


# 손으로 계산한 통계 검증
def test_stats_hand_checked(env):
    sid = env.post("/api/lab/sessions", json={"condition": "A", "judge": "판사A"}).json()["id"]
    post = lambda *a, **k: env.post("/api/ledger", json=ledger_body(*a, **k))
    reason = "충분히 긴 판결 사유입니다"
    post("c1", "first_impression", {"leaning": "not_clickbait", "confidence": 50})
    post("c1", "seat_verdict", {"verdict": "clickbait", "confidence": 90, "reason": reason})
    post("c1", "appeal", {"reason": "항소합니다"})
    post("c1", "seat_verdict", {"verdict": "not_clickbait", "confidence": 60, "reason": reason}, instance=2, seat=1)
    post("c1", "seat_verdict", {"verdict": "not_clickbait", "confidence": 60, "reason": reason}, instance=2, seat=2)
    post("c1", "final", final_data("not_clickbait"), instance=2)
    post("c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": "admitted", "checkerWeight": 0})
    post("c1", "evidence_ruling", {"evidenceId": "i1-E0", "ruling": "struck", "checkerWeight": 0.5})
    post("c2", "first_impression", {"leaning": "clickbait", "confidence": 70})
    post("c2", "seat_verdict", {"verdict": "not_clickbait", "confidence": 60, "reason": reason})
    post("c2", "final", final_data("not_clickbait"))
    post("c3", "final", final_data("not_clickbait"), session=sid)
    s = env.get("/api/stats").json()
    assert s["cases"] == 4 and s["finals"] == 2
    assert s["docket"] == {"summary": 2, "trial": 2}
    assert s["screening"] == {"agreeWithFinal": 0, "disagreeWithFinal": 2, "correct": 1, "total": 3}
    assert s["judges"] == {"correct": 1, "total": 2}
    assert s["appeals"] == {"i1": 1, "i2": 0}
    assert s["overturned"] == {"i2": 1, "i3": 0}
    assert s["checkerOverrides"] == {"admittedVoided": 1, "struckCounted": 1}
    assert s["evidenceStatus"] == {"verified": 3, "misnumbered": 0, "title": 0, "present": 0, "fabricated": 1}
    assert s["byClaimType"] == [{"type": "exaggeration", "label": "과장", "stance": "pro", "count": 3, "verifiedRate": 0.75}]
    assert s["confidenceShift"] == {"mean": 5.0, "n": 2}
    assert s["seatAgreement"] == {"agree": 1, "total": 1}
    assert s["byCategory"] == [
        {"category": "IT", "cases": 1, "screeningRecall": None},
        {"category": "경제", "cases": 2, "screeningRecall": 0.0},
        {"category": "정치", "cases": 1, "screeningRecall": 1.0},
    ]
    assert s["lab"] == [
        {"condition": "A", "sessions": 1, "verdicts": 1, "correct": 0},
        {"condition": "B", "sessions": 0, "verdicts": 0, "correct": 0},
        {"condition": "C", "sessions": 0, "verdicts": 0, "correct": 0},
    ]


# 빈 데이터 통계
def test_stats_empty(env):
    s = env.get("/api/stats").json()
    assert s["finals"] == 0 and s["confidenceShift"] == {"mean": None, "n": 0} and s["judges"]["total"] == 0


# 변형 사건 생성과 중복 409
def test_variant_create_and_duplicate(env):
    res = env.post("/api/lab/variants", json={"caseId": "c1", "attack": "inject_command"})
    assert res.status_code == 200
    body = res.json()
    assert body["case"]["id"] == "c1-inj" and body["case"]["variantOf"] == "c1" and body["case"]["attack"] == "inject_command"
    assert body["jobId"]
    ids = [r["id"] for r in env.get("/api/cases").json()]
    assert "c1-inj" in ids
    assert env.get("/api/cases/c1-inj/answer").status_code == 403
    assert env.post("/api/lab/variants", json={"caseId": "c1", "attack": "inject_command"}).status_code == 409
    assert env.post("/api/lab/variants", json={"caseId": "zzz", "attack": "move_inserted"}).status_code == 404
    assert env.post("/api/lab/variants", json={"caseId": "c1", "attack": "bad"}).status_code == 422


# 실험실 기록은 사건 단위 통계에서 제외
def test_stats_ignore_lab_entries(env):
    sid = env.post("/api/lab/sessions", json={"condition": "A", "judge": "판사A"}).json()["id"]
    reason = "충분히 긴 판결 사유입니다"
    post = lambda *a, **k: env.post("/api/ledger", json=ledger_body(*a, **k))
    post("c1", "first_impression", {"leaning": "clickbait", "confidence": 10}, session=sid)
    post("c1", "seat_verdict", {"verdict": "not_clickbait", "confidence": 90, "reason": reason}, session=sid)
    post("c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": "admitted", "checkerWeight": 0}, session=sid)
    post("c1", "final", final_data("clickbait"), session=sid)
    s = env.get("/api/stats").json()
    assert s["finals"] == 0 and s["judges"]["total"] == 0 and s["confidenceShift"] == {"mean": None, "n": 0}
    assert s["checkerOverrides"] == {"admittedVoided": 0, "struckCounted": 0} and s["seatAgreement"]["total"] == 0
    assert s["lab"][0]["verdicts"] == 1


# 변형 사건은 사건 통계에서 빠지고 redteam에 집계
def test_stats_redteam_excludes_variants(env):
    env.post("/api/lab/variants", json={"caseId": "c1", "attack": "inject_command"})
    env.post("/api/lab/variants", json={"caseId": "c3", "attack": "move_inserted"})
    for cid, s in (("c1-inj", scr(False, 80)), ("c3-mv", scr(False, 80))):
        (env.data / "trials" / cid).mkdir(parents=True, exist_ok=True)
        (env.data / "trials" / cid / "1.json").write_text(json.dumps(make_trial(cid, 1, s), ensure_ascii=False), encoding="utf-8")
    env.post("/api/ledger", json=ledger_body("c1-inj", "final", final_data("clickbait")))
    s = env.get("/api/stats").json()
    assert s["cases"] == 4 and s["finals"] == 0 and s["screening"]["total"] == 3
    assert s["redteam"] == {"variants": 2, "screeningFlipped": 1}
    assert env.get("/api/stats").json()["byClaimType"][0]["count"] == 3


# 실험실 표본에 변형 사건 제외
def test_lab_pool_excludes_variants(env):
    env.post("/api/lab/variants", json={"caseId": "c1", "attack": "inject_command"})
    (env.data / "trials" / "c1-inj").mkdir(parents=True, exist_ok=True)
    (env.data / "trials" / "c1-inj" / "1.json").write_text(json.dumps(make_trial("c1-inj", 1, scr(True, 90))), encoding="utf-8")
    ids = env.post("/api/lab/sessions", json={"condition": "A", "judge": "x", "size": 50}).json()["caseIds"]
    assert sorted(ids) == ["c1", "c2", "c3"]


# 실험실 세션 정답은 그 세션의 판결 이후에만
def test_lab_answer_guard(env):
    sid = env.post("/api/lab/sessions", json={"condition": "A", "judge": "판사A"}).json()["id"]
    url = f"/api/lab/sessions/{sid}/answers/c1"
    assert env.get(url).status_code == 403
    assert env.get("/api/lab/sessions/nope/answers/c1").status_code == 404
    env.post("/api/ledger", json=ledger_body("c1", "final", final_data("clickbait"), session=sid))
    ans = env.get(url)
    assert ans.status_code == 200 and ans.json()["isClickbait"] is True and "sourceId" not in ans.json()
    assert env.get(f"/api/lab/sessions/{sid}/answers/c2").status_code == 403
    other = env.post("/api/lab/sessions", json={"condition": "B", "judge": "판사B"}).json()["id"]
    assert env.get(f"/api/lab/sessions/{other}/answers/c1").status_code == 403
    assert env.get("/api/cases/c1/answer").status_code == 403
    assert env.get("/api/records/c1").json()["answer"] is None


# 에이전트 신뢰성은 변형 사건 기록을 제외
def test_agent_reliability_excludes_variants(env):
    env.post("/api/lab/variants", json={"caseId": "c1", "attack": "inject_command"})
    trial = make_trial("c1-inj", 1, scr(False, 80))
    trial["claims"][0]["escalated"] = True
    trial["agentStats"] = {"i1-P1": {"calls": 2, "revisions": 1, "escalated": 1, "seconds": 1.0, "firstFailed": 3, "fixed": 0}}
    (env.data / "trials" / "c1-inj").mkdir(parents=True, exist_ok=True)
    (env.data / "trials" / "c1-inj" / "1.json").write_text(json.dumps(trial, ensure_ascii=False), encoding="utf-8")
    assert env.get("/api/stats").json()["agents"] == {"selfCorrectionRate": None, "escalations": 0}
