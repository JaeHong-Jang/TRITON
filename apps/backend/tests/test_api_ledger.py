# 장부 검증과 단계 계산 API 테스트
import pytest
from conftest import appeal_case, ensure_trial, finalize_case, first_impression, ledger_body, post_ledger, reveal_all, rule_failed

REASON = "충분히 긴 판결 사유입니다"


# 단계가 new에서 final까지 변함
def test_stage_derivation(env):
    stage = lambda: next(r for r in env.get("/api/cases").json() if r["id"] == "c1")["progress"]
    assert stage()["stage"] == "new"
    r = env.post("/api/ledger", json=ledger_body("c1", "first_impression", {"leaning": "clickbait", "confidence": 70}))
    assert r.status_code == 200 and r.json()["id"] and r.json()["at"]
    assert stage() == {"instance": 1, "stage": "in_trial", "finalVerdict": None, "action": None}
    reveal_all(env, "c1")
    rule_failed(env, "c1")
    post_ledger(env, "c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": REASON})
    post_ledger(env, "c1", "appeal", {"reason": "다시 봐야 합니다"})
    assert stage()["stage"] == "appealed"
    ensure_trial(env, "c1", 2)
    post_ledger(env, "c1", "reveal", {"claimId": "i2-C1"}, instance=2)
    assert stage() == {"instance": 2, "stage": "in_trial", "finalVerdict": None, "action": None}
    post_ledger(env, "c1", "seat_verdict", {"verdict": "not_clickbait", "confidence": 70, "reason": REASON}, instance=2, seat=1)
    post_ledger(env, "c1", "seat_verdict", {"verdict": "not_clickbait", "confidence": 70, "reason": REASON}, instance=2, seat=2)
    post_ledger(env, "c1", "final", {"verdict": "not_clickbait", "action": "L0", "reason": "합성 사유", "votes": [{"seat": 1, "verdict": "not_clickbait"}, {"seat": 2, "verdict": "not_clickbait"}]}, instance=2)
    assert stage() == {"instance": 2, "stage": "final", "finalVerdict": "not_clickbait", "action": "L0"}
    assert [r["id"] for r in env.get("/api/cases?stage=final").json()] == ["c1"]


# 장부는 시간순이고 사건별 필터됨
def test_ledger_get_filter(env):
    first_impression(env, "c1")
    first_impression(env, "c2")
    post_ledger(env, "c1", "reveal", {"claimId": "i1-C1"})
    post_ledger(env, "c2", "reveal", {"claimId": "i1-C1"})
    assert [e["data"]["claimId"] for e in env.get("/api/ledger?caseId=c1").json() if e["type"] == "reveal"] == ["i1-C1"]
    assert len(env.get("/api/ledger").json()) == 4


BAD = [
    ("first_impression", {"leaning": "maybe", "confidence": 50}, {}),
    ("first_impression", {"leaning": "clickbait", "confidence": 150}, {}),
    ("reveal", {}, {}),
    ("evidence_ruling", {"evidenceId": "e", "ruling": "x", "checkerWeight": 1}, {}),
    ("evidence_ruling", {"evidenceId": "e", "ruling": "admitted"}, {}),
    ("seat_verdict", {"verdict": "clickbait", "confidence": 50, "reason": "짧음"}, {}),
    ("seat_verdict", {"verdict": "clickbait", "confidence": 50}, {}),
    ("appeal", {"reason": " "}, {}),
    ("appeal", {"reason": "3심 항소"}, {"instance": 3}),
    ("final", {"verdict": "clickbait", "action": "L9", "reason": "r", "votes": []}, {}),
    ("final", {"verdict": "clickbait", "action": "L2", "reason": "", "votes": []}, {}),
    ("final", {"verdict": "clickbait", "action": "L1", "reason": "r", "votes": [{"seat": 9, "verdict": "clickbait"}]}, {}),
    ("reveal", {"claimId": "a"}, {"instance": 4}),
    ("reveal", {"claimId": "a"}, {"seat": 0}),
    ("reveal", {"claimId": "a"}, {"session": "nosession"}),
]


@pytest.mark.parametrize("type_,data,extra", BAD)
# 잘못된 장부 기록은 422
def test_ledger_validation_422(env, type_, data, extra):
    r = env.post("/api/ledger", json=ledger_body("c1", type_, data, **extra))
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)
    assert env.get("/api/ledger").json() == []


# 형식 오류와 없는 사건
def test_ledger_shape_and_unknown_case(env):
    r = env.post("/api/ledger", json={"caseId": "c1"})
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)
    assert env.post("/api/ledger", json=ledger_body("zzz", "reveal", {"claimId": "a"})).status_code == 404


# 올바른 사유 길이는 통과
def test_seat_verdict_ok(env):
    d = {"verdict": "not_clickbait", "confidence": 55, "reason": REASON}
    first_impression(env, "c1")
    reveal_all(env, "c1")
    rule_failed(env, "c1")
    assert env.post("/api/ledger", json=ledger_body("c1", "seat_verdict", d)).status_code == 200


# 절차 우회는 실패
def test_ledger_lifecycle_guards(env):
    assert env.post("/api/ledger", json=ledger_body("c1", "reveal", {"claimId": "i1-C1"})).status_code == 422
    first_impression(env, "c1")
    assert env.post("/api/ledger", json=ledger_body("c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": REASON})).status_code == 422
    post_ledger(env, "c1", "reveal", {"claimId": "i1-C1"})
    assert env.post("/api/ledger", json=ledger_body("c1", "final", {"verdict": "clickbait", "action": "L1", "reason": "합성 사유", "votes": [{"seat": 1, "verdict": "clickbait"}]})).status_code == 422


# 요청 ID 멱등성
def test_ledger_request_id_idempotency(env):
    body = ledger_body("c1", "first_impression", {"leaning": "clickbait", "confidence": 70})
    body["requestId"] = "r1"
    first = env.post("/api/ledger", json=body)
    second = env.post("/api/ledger", json=body)
    assert first.status_code == second.status_code == 200 and first.json()["id"] == second.json()["id"]
    changed = {**body, "data": {"leaning": "not_clickbait", "confidence": 70}}
    assert env.post("/api/ledger", json=changed).status_code == 409


# 진행 중 partial 주장은 공개할 수 있음
def test_reveal_allows_running_partial(env):
    from app import jobs

    first_impression(env, "c4")
    partial = {"caseId": "c4", "instance": 1, "claims": [{"id": "i1-C1", "evidence": []}], "trace": [], "calls": [], "agentStats": {}}
    jobs.JOBS["live"] = {"id": "live", "caseId": "c4", "instance": 1, "status": "running", "step": "생성", "done": 0, "total": 1, "error": None, "startedAt": None, "createdAt": "2026-01-01T00:00:00+00:00", "updatedAt": "2026-01-01T00:00:00+00:00", "attempt": 1, "graphVersion": "1", "_kind": "trial", "_case": None, "_cases": None, "_prior": [], "_notes": "", "_events": [], "_partial": partial, "_role": None, "_checkpoints": []}
    try:
        assert env.post("/api/ledger", json=ledger_body("c4", "reveal", {"claimId": "i1-C1"})).status_code == 200
    finally:
        jobs.JOBS.pop("live", None)


# 항소와 좌석 순서 전이 검증
def test_appeal_and_seat_order_guards(env):
    first_impression(env, "c1")
    reveal_all(env, "c1")
    rule_failed(env, "c1")
    assert env.post("/api/ledger", json=ledger_body("c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": REASON}, instance=1, seat=2)).status_code == 422
    post_ledger(env, "c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": REASON})
    post_ledger(env, "c1", "appeal", {"reason": "자발 항소입니다"})
    assert env.post("/api/ledger", json=ledger_body("c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": None, "checkerWeight": 0})).status_code == 422
    ensure_trial(env, "c1", 2)
    post_ledger(env, "c1", "reveal", {"claimId": "i2-C1"}, instance=2)
    post_ledger(env, "c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": REASON}, instance=2, seat=1)
    post_ledger(env, "c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": REASON}, instance=2, seat=2)
    assert env.post("/api/ledger", json=ledger_body("c1", "appeal", {"reason": "일치해도 항소합니다"}, instance=2)).status_code == 200


# 최신 근거 판정만 완료로 인정
def test_latest_evidence_ruling_controls_completion(env):
    first_impression(env, "c1")
    reveal_all(env, "c1")
    post_ledger(env, "c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": "struck", "checkerWeight": 0})
    post_ledger(env, "c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": None, "checkerWeight": 0})
    assert env.post("/api/ledger", json=ledger_body("c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": REASON})).status_code == 422


# 실험실 판결의 사건 단계 비반영
def test_lab_entries_do_not_change_case_stage():
    from app.ledger import progress_of
    lab = {"type": "final", "instance": 1, "labSessionId": "lab-1", "data": {"verdict": "clickbait", "action": "L0"}}
    court = {"type": "first_impression", "instance": 1, "labSessionId": None, "data": {}}
    assert progress_of([lab])["stage"] == "new"
    assert progress_of([court, lab])["stage"] == "in_trial"


# 새 요청 ID로 같은 장부를 재전송해도 기존 기록 반환
def test_semantic_dedupe_without_same_request_id(env):
    body = ledger_body("c1", "first_impression", {"leaning": "clickbait", "confidence": 70})
    body["requestId"] = "lost-1"
    first = env.post("/api/ledger", json=body)
    body["requestId"] = "lost-2"
    second = env.post("/api/ledger", json=body)
    assert first.status_code == second.status_code == 200 and first.json()["id"] == second.json()["id"]
    changed = {**body, "data": {"leaning": "not_clickbait", "confidence": 70}, "requestId": "lost-3"}
    assert env.post("/api/ledger", json=changed).status_code == 422


# evidence ruling은 최신과 같을 때만 재전송 반환
def test_evidence_ruling_dedupes_only_latest(env):
    first_impression(env, "c1")
    reveal_all(env, "c1")
    struck = post_ledger(env, "c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": "struck", "checkerWeight": 0}).json()
    assert env.post("/api/ledger", json=ledger_body("c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": "struck", "checkerWeight": 0})).json()["id"] == struck["id"]
    post_ledger(env, "c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": None, "checkerWeight": 0})
    again = env.post("/api/ledger", json=ledger_body("c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": "struck", "checkerWeight": 0}))
    assert again.status_code == 200 and again.json()["id"] != struck["id"]


# 주장이 없는 완료 기록도 사람 판사가 사유를 남기고 판결 가능
def test_empty_claim_completed_trial_allows_seat_verdict(env):
    import json
    from conftest import make_trial, scr

    trial = make_trial("c4", 1, scr(False, 40))
    trial["claims"] = []
    trial["trace"] = [{"seq": 1, "at": "2026-01-01T00:00:00+00:00", "agentId": "i1-P1", "kind": "done", "text": "완료", "claimId": None}]
    path = env.data / "trials" / "c4" / "1.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(trial, ensure_ascii=False), encoding="utf-8")
    first_impression(env, "c4")
    assert env.post("/api/ledger", json=ledger_body("c4", "seat_verdict", {"verdict": "not_clickbait", "confidence": 70, "reason": REASON})).status_code == 200


# 판사석 판결 뒤에는 근거 판정을 바꿀 수 없음
def test_evidence_ruling_locked_after_seat_verdict(env):
    first_impression(env, "c1")
    reveal_all(env, "c1")
    rule_failed(env, "c1")
    post_ledger(env, "c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": REASON})
    assert env.post("/api/ledger", json=ledger_body("c1", "evidence_ruling", {"evidenceId": "i1-E1", "ruling": None, "checkerWeight": 0})).status_code == 422


# 상급심 reveal과 seat는 직전 심급 항소가 필요
def test_upper_instance_requires_previous_appeal_for_reveal_and_seat(env):
    first_impression(env, "c1")
    ensure_trial(env, "c1", 2)
    assert env.post("/api/ledger", json=ledger_body("c1", "reveal", {"claimId": "i2-C1"}, instance=2)).status_code == 422
    assert env.post("/api/ledger", json=ledger_body("c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": REASON}, instance=2, seat=1)).status_code == 422
    reveal_all(env, "c1")
    rule_failed(env, "c1")
    post_ledger(env, "c1", "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": REASON})
    post_ledger(env, "c1", "appeal", {"reason": "항소 사유입니다"})
    assert env.post("/api/ledger", json=ledger_body("c1", "reveal", {"claimId": "i2-C1"}, instance=2)).status_code == 200
