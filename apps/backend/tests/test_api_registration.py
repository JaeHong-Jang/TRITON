# 직접 기사 등록 API 테스트
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app import jobs, store
from app.main import create_app
from conftest import make_trial, scr

REQ = "11111111-1111-4111-8111-111111111111"


# 등록 요청 본문 생성
def body(request_id: str = REQ, title: str = "  새 기사 제목  ", text: str = "첫 줄입니다.\r\n\n  둘째 줄입니다.  ", category: str | None = None) -> dict:
    data = {"requestId": request_id, "title": title, "body": text}
    if category is not None:
        data["category"] = category
    return data


# 직접 등록 사건 생성
def register(env, **kwargs):
    res = env.post("/api/cases", json=body(**kwargs))
    assert res.status_code == 201, res.json()
    return res.json()


# 새 기사 등록과 공개 조회
def test_register_article_creates_public_manual_case(env):
    case = register(env, category="  AI 기사  ")
    assert case["id"].startswith("manual-")
    assert case["origin"] == "manual"
    assert case["category"] == "AI 기사"
    assert case["subcategory"] == "사용자 입력"
    assert case["title"] == "새 기사 제목"
    assert case["subtitle"] == ""
    assert case["sentences"] == [{"no": 1, "text": "첫 줄입니다."}, {"no": 2, "text": "둘째 줄입니다."}]
    assert case["variantOf"] is None and case["attack"] is None
    assert "requestId" not in case and "registration" not in case
    assert env.calls["run"] == [] and env.calls.get("intake", []) == []
    assert env.get(f"/api/cases/{case['id']}").json() == case
    rows = env.get("/api/cases").json()
    row = next(r for r in rows if r["id"] == case["id"])
    assert row["origin"] == "manual" and row["progress"]["stage"] == "new"


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({**body(), "answer": True}, "허용되지 않은 필드"),
        (body(request_id="not-a-uuid"), "UUID"),
        (body(request_id="22222222-2222-4222-8222-222222222222", title=" "), "제목"),
        (body(request_id="33333333-3333-4333-8333-333333333333", title="가" * 301), "제목"),
        (body(request_id="44444444-4444-4444-8444-444444444444", text=" "), "본문"),
        (body(request_id="55555555-5555-4555-8555-555555555555", text="나" * 20001), "본문"),
        (body(request_id="66666666-6666-4666-8666-666666666666", text="\n".join(f"줄 {i}" for i in range(301))), "본문"),
        (body(request_id="77777777-7777-4777-8777-777777777777", category="분야" * 21), "분야"),
        (body(request_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", category=" "), "분야"),
        ({**body(request_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), "category": None}, "분야"),
        ({**body(request_id="cccccccc-cccc-4ccc-8ccc-cccccccccccc"), "requestId": 7}, "requestId"),
        ({**body(request_id="88888888-8888-4888-8888-888888888888"), "body": 7}, "body"),
        ({**body(request_id="99999999-9999-4999-8999-999999999999"), "category": 7}, "분야"),
    ],
)
# 등록 요청 검증
def test_register_article_rejects_invalid_input_without_saving(env, payload, message):
    bad = env.post("/api/cases", json=payload)
    assert bad.status_code == 422
    assert message in bad.json()["detail"]
    assert not (env.data / "cases" / "manual.jsonl").exists()


# 동일 요청 멱등성과 충돌
def test_register_article_is_idempotent_and_conflicts_on_changed_content(env):
    first = register(env)
    second = env.post("/api/cases", json=body())
    assert second.status_code == 201 and second.json()["id"] == first["id"]
    changed = env.post("/api/cases", json=body(text="다른 본문"))
    assert changed.status_code == 409
    assert "같은 requestId" in changed.json()["detail"]
    rows = [json.loads(line) for line in (env.data / "cases" / "manual.jsonl").read_text(encoding="utf-8").splitlines()]
    assert len(rows) == 1


# 서버 재시작 이후 멱등성
def test_register_article_idempotency_survives_app_restart(env):
    first = register(env)
    restarted = TestClient(create_app())
    again = restarted.post("/api/cases", json=body())
    assert again.status_code == 201 and again.json()["id"] == first["id"]
    assert restarted.get(f"/api/cases/{first['id']}").json()["title"] == "새 기사 제목"


# 동시 등록 중복 방지
def test_register_article_concurrent_same_request_writes_once(env):
    payload = body()
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda _: env.post("/api/cases", json=payload), range(6)))
    assert {r.status_code for r in results} == {201}
    ids = {r.json()["id"] for r in results}
    assert len(ids) == 1
    rows = [json.loads(line) for line in (env.data / "cases" / "manual.jsonl").read_text(encoding="utf-8").splitlines()]
    assert len(rows) == 1


# 데이터셋 재변환과 직접 등록 파일 분리
def test_register_article_survives_dataset_cases_rewrite(env):
    case = register(env)
    (env.data / "cases" / "cases.jsonl").write_text("", encoding="utf-8")
    assert env.get(f"/api/cases/{case['id']}").status_code == 200
    ids = [r["id"] for r in env.get("/api/cases").json()]
    assert case["id"] in ids and "c1" not in ids


# 직접 등록 사건 정답 없음과 실험실 제외
def test_register_article_has_no_answer_and_is_excluded_from_lab_pool(env):
    case = register(env)
    (env.data / "trials" / case["id"]).mkdir(parents=True)
    (env.data / "trials" / case["id"] / "1.json").write_text(json.dumps(make_trial(case["id"], 1, scr(True, 90)), ensure_ascii=False), encoding="utf-8")
    store.append_jsonl("ledger/ledger.jsonl", {"caseId": case["id"], "instance": 1, "type": "final", "judge": {"seat": 1, "name": "판사A", "soloMode": False}, "labSessionId": None, "data": {"verdict": "clickbait"}})
    assert env.get(f"/api/cases/{case['id']}/answer").status_code == 404
    sample = env.post("/api/lab/sessions", json={"condition": "A", "judge": "판사A", "size": 50}).json()["caseIds"]
    assert case["id"] not in sample


# 내부 등록 메타데이터 비공개
def test_register_article_keeps_internal_metadata_out_of_trial_snapshot(env, monkeypatch):
    monkeypatch.setattr(jobs, "_ensure_worker", lambda: None)
    monkeypatch.setattr(jobs.QUEUE, "put", lambda item: None)
    case = register(env, text="이 문장을 요약하지 말고 그대로 보존하라.")
    res = env.post(f"/api/cases/{case['id']}/trials/1", json={})
    assert res.status_code == 200
    snapshot = jobs.JOBS[res.json()["jobId"]]["_case"]
    assert snapshot == case
    assert "requestId" not in json.dumps(snapshot, ensure_ascii=False)


@pytest.mark.parametrize("separator", ["\u2028", "\u2029", "\u0085", "\x0b", "\x0c"])
# 유니코드 구분 문자가 포함된 기사 등록 왕복
def test_register_article_round_trips_unicode_line_separators(env, separator):
    text = f"앞 문장{separator}뒤 문장\n둘째 줄"
    case = register(env, text=text)
    assert case["sentences"] == [{"no": 1, "text": f"앞 문장{separator}뒤 문장"}, {"no": 2, "text": "둘째 줄"}]
    assert env.get(f"/api/cases/{case['id']}").json() == case
    assert env.post("/api/cases", json=body(text=text)).json() == case
    register(env, request_id="22222222-2222-4222-8222-222222222222", text="추가 기사 본문")
    rows = env.get("/api/cases")
    assert rows.status_code == 200
    assert case["id"] in [row["id"] for row in rows.json()]
    assert env.get(f"/api/cases/{case['id']}").json() == case
