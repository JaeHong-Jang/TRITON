# 기본 조회·정답 보호·정적 서빙 API 테스트
import sys
import time

from conftest import final_data, ledger_body


# 서버 상태 확인
def test_health(env):
    assert env.get("/api/health").json() == {"ok": True, "ollama": True, "model": "fake-model"}


# 진행 현황과 온톨로지 조회
def test_progress_and_ontology(env):
    assert env.get("/api/progress").json() == {"phases": ["x"]}
    assert env.get("/api/ontology").json()["version"] == 1


# 사건 목록과 필터
def test_cases_list_and_filters(env):
    rows = env.get("/api/cases").json()
    assert [r["id"] for r in rows] == ["c1", "c2", "c3", "c4"]
    c1 = rows[0]
    assert c1["trials"] == [1] and c1["docket"]["track"] == "summary"
    assert c1["progress"] == {"instance": 0, "stage": "new", "finalVerdict": None, "action": None}
    assert "sentences" not in c1 and "originalTitle" not in str(rows)
    assert [r["id"] for r in env.get("/api/cases?track=trial").json()] == ["c2", "c4"]
    assert env.get("/api/cases?stage=final").json() == []


# 사건 상세는 정답을 숨김
def test_case_detail_hides_answer(env):
    body = env.get("/api/cases/c1").json()
    assert body["title"] == "합성 제목 하나" and len(body["sentences"]) == 3
    assert "isClickbait" not in body and "sourceId" not in body
    assert env.get("/api/cases/none").status_code == 404


# 재판 기록 조회
def test_trial_get(env):
    assert env.get("/api/cases/c1/trials/1").json()["instance"] == 1
    assert env.get("/api/cases/c1/trials/2").status_code == 404
    assert env.get("/api/cases/c1/trials/4").status_code == 422


# 정답은 최종 판결 전 403 후 200
def test_answer_guard(env):
    assert env.get("/api/cases/c1/answer").status_code == 403
    assert env.get("/api/records/c1").json()["answer"] is None
    assert env.post("/api/ledger", json=ledger_body("c1", "final", final_data("clickbait"))).status_code == 200
    ans = env.get("/api/cases/c1/answer")
    assert ans.status_code == 200 and ans.json()["isClickbait"] is True and "sourceId" not in ans.json()
    rec = env.get("/api/records/c1").json()
    assert rec["answer"]["originalTitle"] == "원제목"
    assert rec["case"]["id"] == "c1" and len(rec["trials"]) == 1 and len(rec["ledger"]) == 1
    assert env.get("/api/records/c2").json()["answer"] is None


# 재판 생성 작업 완료까지
def test_job_lifecycle_done(env):
    env.post("/api/ledger", json=ledger_body("c1", "appeal", {"reason": "첫 항소 사유"}))
    res = env.post("/api/cases/c1/trials/2", json={"judgeNotes": "참고하세요"})
    assert res.status_code == 200
    job_id = res.json()["jobId"]
    for _ in range(100):
        job = env.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert job["status"] == "done" and job["done"] == 2 and job["total"] == 2 and job["error"] is None
    assert job["caseId"] == "c1" and job["instance"] == 2
    call = env.calls["run"][-1]
    assert [p["instance"] for p in call["prior"]] == [1]
    assert "참고하세요" in call["notes"] and "첫 항소 사유" in call["notes"]
    assert env.get("/api/cases/c1/trials/2").json()["instance"] == 2
    assert env.post("/api/cases/c1/trials/2", json={}).status_code == 409


# 재판 생성 작업 오류 상태
def test_job_error(env):
    env.calls["fail"] = True
    job_id = env.post("/api/cases/c4/trials/1").json()["jobId"]
    for _ in range(100):
        job = env.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert job["status"] == "error" and "모델 응답 실패" in job["error"]
    assert env.get("/api/cases/c4/trials/1").status_code == 404
    assert env.get("/api/jobs/nope").status_code == 404


# 항소 없이 상급심 생성은 409
def test_appeal_guard(env):
    r = env.post("/api/cases/c1/trials/2")
    assert r.status_code == 409 and "항소" in r.json()["detail"]
    assert env.post("/api/cases/c1/trials/3").status_code == 409
    assert env.post("/api/cases/c1/trials/1").status_code == 409
    assert env.post("/api/cases/zzz/trials/1").status_code == 404


# 정적 서빙과 SPA 대체
def test_spa_fallback_and_api_404(env):
    assert env.get("/").status_code == 404
    dist = env.root / "apps" / "frontend" / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>앱</html>", encoding="utf-8")
    (dist / "assets" / "a.js").write_text("x=1", encoding="utf-8")
    assert "앱" in env.get("/").text
    assert "앱" in env.get("/court/c1").text
    assert env.get("/assets/a.js").text == "x=1"
    assert "앱" in env.get("/../../etc/passwd").text
    r = env.get("/api/unknown")
    assert r.status_code == 404 and "detail" in r.json()
    assert env.get("/api/cases").status_code == 200


# 같은 사건·심급 진행 중 작업은 같은 jobId 반환
def test_duplicate_post_returns_same_job(env):
    import threading

    gate = threading.Event()
    inner = sys.modules["court.instances"].run

    # 풀릴 때까지 대기하는 실행
    def slow(*a, **k):
        gate.wait(5)
        return inner(*a, **k)

    sys.modules["court.instances"].run = slow
    first = env.post("/api/cases/c4/trials/1")
    second = env.post("/api/cases/c4/trials/1")
    assert first.status_code == second.status_code == 200 and first.json() == second.json()
    gate.set()
    for _ in range(100):
        if env.get(f"/api/jobs/{first.json()['jobId']}").json()["status"] == "done":
            break
        time.sleep(0.05)
    assert len(env.calls["run"]) == 1
    assert env.post("/api/cases/c4/trials/1").status_code == 409


# 실험실 판결은 법정 정답 공개를 열지 않음
def test_lab_final_does_not_leak_answer(env):
    sid = env.post("/api/lab/sessions", json={"condition": "A", "judge": "판사A"}).json()["id"]
    env.post("/api/ledger", json=ledger_body("c1", "final", final_data("clickbait"), session=sid))
    assert env.get("/api/cases/c1/answer").status_code == 403
    assert env.get("/api/records/c1").json()["answer"] is None
