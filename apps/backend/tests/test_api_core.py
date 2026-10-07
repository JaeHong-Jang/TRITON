# 기본 조회·정답 보호·정적 서빙 API 테스트
import json
import sys
import time

import pytest
from app import jobs, lab, ledger, store
from conftest import appeal_case, ensure_trial, finalize_case, first_impression, ledger_body, post_ledger, reveal_all


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
    assert c1["trials"] == [1] and c1["docket"]["track"] == "trial" and c1["docket"]["screening"] is None
    assert c1["progress"] == {"instance": 0, "stage": "new", "finalVerdict": None, "action": None}
    env.post("/api/ledger", json=ledger_body("c1", "first_impression", {"leaning": "clickbait", "confidence": 70}))
    c1 = next(r for r in env.get("/api/cases").json() if r["id"] == "c1")
    assert c1["docket"]["track"] == "summary"
    assert "sentences" not in c1 and "originalTitle" not in str(rows)
    assert [r["id"] for r in env.get("/api/cases?track=trial").json()] == ["c2", "c3", "c4"]
    assert env.get("/api/cases?stage=final").json() == []


# 사건 상세는 정답을 숨김
def test_case_detail_hides_answer(env):
    body = env.get("/api/cases/c1").json()
    assert body["title"] == "합성 제목 하나" and len(body["sentences"]) == 3
    assert "isClickbait" not in body and "sourceId" not in body
    assert env.get("/api/cases/none").status_code == 404


# 직접 기사 등록은 모델 없이 사건을 저장
def test_manual_case_registration(env):
    body = {
        "requestId": "11111111-1111-4111-8111-111111111111",
        "title": "  직접 넣은 AI 기사 제목  ",
        "body": "첫 번째 줄입니다.\r\n\r\n 두 번째 줄입니다. ",
        "category": "  실험  ",
    }
    res = env.post("/api/cases", json=body)
    assert res.status_code == 201, res.json()
    case = res.json()
    assert case["id"].startswith("manual-")
    assert case["origin"] == "manual"
    assert case["category"] == "실험" and case["subcategory"] == "사용자 입력"
    assert [s["text"] for s in case["sentences"]] == ["첫 번째 줄입니다.", "두 번째 줄입니다."]
    assert "manualRequestId" not in case and "isClickbait" not in str(case)
    assert env.post("/api/cases", json=body).json()["id"] == case["id"]
    conflict = env.post("/api/cases", json={**body, "title": "다른 제목"})
    assert conflict.status_code == 409
    assert any(r["id"] == case["id"] and r["origin"] == "manual" for r in env.get("/api/cases").json())
    assert env.get(f"/api/cases/{case['id']}/answer").status_code == 403


# 직접 기사 등록은 서버 생성 필드 주입을 거부
def test_manual_case_registration_rejects_injected_fields(env):
    body = {
        "requestId": "22222222-2222-4222-8222-222222222222",
        "title": "제목",
        "body": "본문",
        "id": "c1",
        "isClickbait": True,
    }
    assert env.post("/api/cases", json=body).status_code == 422
    assert env.post("/api/cases", json={"requestId": "bad", "title": "제목", "body": "본문"}).status_code == 422
    assert env.post("/api/cases", json={"requestId": "33333333-3333-4333-8333-333333333333", "title": "  ", "body": "본문"}).status_code == 422
    assert env.post("/api/cases", json={"requestId": "44444444-4444-4444-8444-444444444444", "title": "제목", "body": "\n\n"}).status_code == 422


# 재판 기록 조회
def test_trial_get(env):
    assert env.get("/api/cases/c1/trials/1").json()["instance"] == 1
    assert env.get("/api/cases/c1/trials/2").status_code == 404
    assert env.get("/api/cases/c1/trials/4").status_code == 422


# 직접 등록 기사는 확정 뒤에도 정답을 만들지 않음
def test_manual_case_has_no_answer_after_final(env):
    case = env.post("/api/cases", json={
        "requestId": "55555555-5555-4555-8555-555555555555",
        "title": "수동 사건",
        "body": "본문 한 줄",
    }).json()
    job_id = env.post(f"/api/cases/{case['id']}/trials/1").json()["jobId"]
    for _ in range(100):
        job = env.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert job["status"] == "done"
    finalize_case(env, case["id"], "not_clickbait")
    ans = env.get(f"/api/cases/{case['id']}/answer")
    assert ans.status_code == 404 and ans.json()["detail"] == "정답이 없습니다"


# 정답은 최종 판결 전 403 후 200
def test_answer_guard(env):
    assert env.get("/api/cases/c1/answer").status_code == 403
    assert env.get("/api/records/c1").json()["answer"] is None
    assert finalize_case(env, "c1", "clickbait").status_code == 200
    ans = env.get("/api/cases/c1/answer")
    assert ans.status_code == 200 and ans.json()["isClickbait"] is True and "sourceId" not in ans.json()
    rec = env.get("/api/records/c1").json()
    assert rec["answer"]["originalTitle"] == "원제목"
    assert rec["case"]["id"] == "c1" and len(rec["trials"]) == 1 and len(rec["ledger"]) == 5
    assert env.get("/api/records/c2").json()["answer"] is None


# 재판 생성 작업 완료까지
def test_job_lifecycle_done(env):
    appeal_case(env, "c1")
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
    assert "참고하세요" in call["notes"] and "항소 사유" in call["notes"]
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
    assert job["status"] == "error" and job["error"] == "작업 오류"
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
    finalize_case(env, "c1", "clickbait", session=sid)
    assert env.get("/api/cases/c1/answer").status_code == 403
    assert env.get("/api/records/c1").json()["answer"] is None


# 법정 최종 확정은 실험실 기록 정답을 열지 않음
def test_lab_records_answer_uses_lab_scope(env):
    sid = env.post("/api/lab/sessions", json={"condition": "A", "judge": "판사A"}).json()["id"]
    finalize_case(env, "c1", "clickbait")
    assert env.get(f"/api/records/c1?labSessionId={sid}").json()["answer"] is None


# 최종 확정 뒤 새 심급 생성 금지
def test_create_trial_rejects_final_case(env):
    finalize_case(env, "c1", "clickbait")
    assert env.post("/api/cases/c1/trials/2").status_code == 409


# 기본 장부 조회는 실험실 기록 제외
def test_ledger_default_excludes_lab_entries(env):
    sid = env.post("/api/lab/sessions", json={"condition": "A", "judge": "판사A"}).json()["id"]
    finalize_case(env, "c1", "clickbait", session=sid)
    assert env.get("/api/ledger").json() == []
    assert env.get(f"/api/ledger?labSessionId={sid}").json()


# 실행 화면은 첫인상 전 세부 수량을 숨김
def test_execution_view_hides_before_first_impression(env):
    view = env.get("/api/cases/c1/execution?instance=1").json()
    steps = {s["id"]: s for s in view["steps"]}
    assert view["disclosure"] == "hidden"
    assert "첫인상" in steps["reveal"]["reason"]
    assert "/" not in steps["review"]["reason"]
    assert "/" not in steps["seat_verdict"]["reason"]
    assert all(a["agentId"] != "c1" for a in view["agents"])


# 실행 화면은 장부 조건과 판사석 수를 반영
def test_execution_view_reflects_ledger_gates(env):
    first_impression(env, "c1")
    reveal_all(env, "c1")
    post_ledger(env, "c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": None, "checkerWeight": 0})
    view = env.get("/api/cases/c1/execution?instance=1").json()
    steps = {s["id"]: s for s in view["steps"]}
    assert steps["review"]["status"] == "active" and steps["review"]["reason"] == "0/1 실패 근거 판정"
    post_ledger(env, "c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": "struck", "checkerWeight": 0})
    post_ledger(env, "c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": "충분히 긴 판결 사유입니다"})
    steps = {s["id"]: s for s in env.get("/api/cases/c1/execution?instance=1").json()["steps"]}
    assert steps["review"]["status"] == "complete"
    assert steps["seat_verdict"]["status"] == "complete" and steps["seat_verdict"]["reason"].startswith("1/1석 판결")


# 실행 화면은 상급심 판사석을 모두 요구
def test_execution_view_requires_all_upper_seats(env):
    appeal_case(env, "c1")
    ensure_trial(env, "c1", 2)
    post_ledger(env, "c1", "reveal", {"claimId": "i2-C1"}, instance=2)
    post_ledger(env, "c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": "충분히 긴 판결 사유입니다"}, instance=2, seat=1)
    steps = {s["id"]: s for s in env.get("/api/cases/c1/execution?instance=2").json()["steps"]}
    assert steps["seat_verdict"]["status"] == "active" and steps["seat_verdict"]["reason"].startswith("1/2석 판결")


@pytest.mark.parametrize("payload", [None, {"caseIds": ["c4"]}])
# 모델 미연결 접수 검토의 실행 차단
def test_intake_requires_model_before_enqueue(env, monkeypatch, payload):
    monkeypatch.setattr(sys.modules["court.llm"].OllamaClient, "available", lambda self: False)
    monkeypatch.setattr(jobs, "_ensure_worker", lambda: None)
    response = env.post("/api/intake", json=payload)
    assert response.status_code == 503
    assert response.json()["detail"] == jobs.model_reason(jobs.model_health())
    assert not jobs.JOBS and jobs.QUEUE.empty()
    assert not (env.data / "runs").exists() and not (env.data / "intake").exists()
    assert env.calls.get("intake", []) == []
    assert env.post("/api/intake", json={"caseIds": ["missing"]}).status_code == 404


@pytest.mark.parametrize("field,value", [
    ("summaryThreshold", True), ("summaryThreshold", "85"), ("summaryThreshold", 85.0),
    ("summaryThreshold", -1), ("summaryThreshold", 101),
    ("summaryEnabled", 1), ("summaryEnabled", "true"),
    ("highRiskCategories", "정치"), ("highRiskCategories", [1]), ("highRiskCategories", [True]),
])
# 자율 범위 정책의 엄격한 타입과 범위 검증
def test_policy_rejects_coerced_types_without_saving(env, field, value):
    body = {"summaryEnabled": True, "summaryThreshold": 85, "highRiskCategories": ["정치"]}
    before = env.get("/api/policy").json()
    response = env.put("/api/policy", json={**body, field: value})
    assert response.status_code == 422 and "요청 형식이 올바르지 않습니다" in response.json()["detail"]
    assert env.get("/api/policy").json() == before
    assert not (env.data / "policy.json").exists()
    assert env.put("/api/policy", json=body).json() == body


@pytest.mark.parametrize("url,payload", [
    ("/api/lab/sessions", {"condition": "A", "judge": "\ud800"}),
    ("/api/cases/c4/trials/1", {"judgeNotes": "\ud800"}),
    ("/api/intake", {"caseIds": ["\ud800"]}),
    ("/api/lab/variants", {"caseId": "\ud800", "attack": "inject_command"}),
    ("/api/lab/variants", {"caseId": "c1", "attack": "\ud800"}),
    ("/api/policy", {"summaryEnabled": True, "summaryThreshold": 85, "highRiskCategories": ["\ud800"]}),
])
# 요청 스키마 전체의 인코딩 오류 저장 차단
def test_request_bodies_reject_surrogates_before_saving(env, url, payload):
    response = env.request("PUT" if url == "/api/policy" else "POST", url, content=json.dumps(payload), headers={"Content-Type": "application/json"})
    assert response.status_code == 422 and "UTF-8로 저장할 수 없는 문자" in response.json()["detail"]
    assert not jobs.JOBS and env.calls["run"] == []
    assert not any((env.data / name).exists() for name in ("lab", "runs", "intake", "policy.json"))


@pytest.mark.parametrize("url,target,name,payload", [
    ("/api/lab/sessions", lab, "create", {"condition": "A", "judge": "판사"}),
    ("/api/cases", store, "register_manual_case", {"requestId": "11111111-1111-4111-8111-111111111111", "title": "제목", "body": "본문"}),
    ("/api/ledger", ledger, "append", ledger_body("c1", "first_impression", {"leaning": "clickbait", "confidence": 70})),
])
# 전역 인코딩 오류의 한국어 응답
def test_unicode_encode_error_safety_net(env, monkeypatch, url, target, name, payload):
    # 저장 계층의 인코딩 실패 재현
    def fail(*args):
        "\ud800".encode("utf-8")

    monkeypatch.setattr(target, name, fail)
    response = env.post(url, json=payload)
    assert response.status_code == 422 and "UTF-8로 저장할 수 없는 문자" in response.json()["detail"]


@pytest.mark.parametrize("method,url,payload,reason", [
    ("POST", "/api/lab/sessions", {}, "필수 항목"),
    ("POST", "/api/lab/sessions", {"condition": "A", "judge": 1}, "문자열"),
    ("POST", "/api/lab/sessions", {"condition": "A", "judge": "판사", "size": "abc"}, "형식"),
    ("POST", "/api/lab/sessions", {"condition": "D", "judge": "판사"}, "허용된 값"),
    ("POST", "/api/intake", {"caseIds": {}}, "목록"),
    ("POST", "/api/ledger", {**ledger_body("c1", "reveal", {"claimId": "i1-C1"}), "data": []}, "객체"),
    ("GET", "/api/cases/c1/trials/0", None, "최솟값"),
    ("GET", "/api/cases/c1/trials/4", None, "최댓값"),
    ("GET", "/api/cases/c1/trials/abc", None, "형식"),
])
# 기본 검증 오류의 한국어 사유
def test_validation_errors_use_korean_reasons(env, method, url, payload, reason):
    response = env.request(method, url, json=payload)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail.startswith("요청 형식이 올바르지 않습니다:") and reason in detail
    assert "Input should" not in detail and "Field required" not in detail


@pytest.mark.parametrize("content", [b'{"judge":', b'{"judge":"\xff"}'])
# JSON 파싱과 본문 인코딩 오류의 한국어 응답
def test_malformed_body_returns_korean_422(env, content):
    response = env.post("/api/lab/sessions", content=content, headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail.startswith("요청 형식이 올바르지 않습니다:")
    assert "JSON 형식" in detail or "본문 인코딩" in detail


@pytest.mark.parametrize("method", ["POST", "PATCH", "HEAD", "OPTIONS"])
# API 경로와 메서드 기본 오류의 한국어 응답
def test_api_default_http_errors_are_korean(env, method):
    unknown = env.request(method, "/api/unknown")
    assert unknown.status_code == 404
    if method != "HEAD":
        assert unknown.json()["detail"] == "찾을 수 없는 API 경로입니다"
    wrong = env.request(method, "/api/health")
    assert wrong.status_code == 405 and "GET" in wrong.headers["allow"]
    if method != "HEAD":
        assert wrong.json()["detail"] == "허용되지 않는 요청 메서드입니다"
    assert env.get("/api/cases/missing").json()["detail"] == "사건을 찾을 수 없습니다"


@pytest.mark.parametrize("condition", ["A", "B", "C"])
# 실험실 조회의 상급심 기록 차단
def test_lab_views_only_expose_first_instance(env, condition):
    first_impression(env, "c1")
    ensure_trial(env, "c1", 2)
    ensure_trial(env, "c1", 3)
    third = store.load_trial("c1", 3)
    third["officer"] = {"summary": "상급심 합성 보고서", "issues": [], "reclassified": [], "perjury": [], "recommendedAction": "L0"}
    store.save_trial("c1", 3, third)
    session = env.post("/api/lab/sessions", json={"condition": condition, "judge": "판사", "size": 50}).json()
    assert "c1" in session["caseIds"]
    query = f"?labSessionId={session['id']}"
    records = env.get("/api/records/c1" + query)
    assert records.status_code == 200 and [t["instance"] for t in records.json()["trials"]] == [1]
    assert "상급심 합성 보고서" not in records.text
    assert env.get("/api/cases/c1/trials/1" + query).status_code == 200
    assert env.get("/api/cases/c1/execution" + query).status_code == 200
    for instance in (2, 3):
        for url in (f"/api/cases/c1/trials/{instance}{query}", f"/api/cases/c1/execution{query}&instance={instance}"):
            response = env.get(url)
            assert response.status_code == 403 and response.json()["detail"] == "실험실은 1심 기록만 볼 수 있습니다"
        assert env.get(f"/api/cases/c1/trials/{instance}").status_code == 200
    assert [t["instance"] for t in env.get("/api/records/c1").json()["trials"]] == [1, 2, 3]
