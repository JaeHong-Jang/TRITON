# 장부 검증과 단계 계산 API 테스트
import pytest
from conftest import final_data, ledger_body

REASON = "충분히 긴 판결 사유입니다"


# 단계가 new에서 final까지 변함
def test_stage_derivation(env):
    stage = lambda: next(r for r in env.get("/api/cases").json() if r["id"] == "c1")["progress"]
    assert stage()["stage"] == "new"
    r = env.post("/api/ledger", json=ledger_body("c1", "first_impression", {"leaning": "clickbait", "confidence": 70}))
    assert r.status_code == 200 and r.json()["id"] and r.json()["at"]
    assert stage() == {"instance": 1, "stage": "in_trial", "finalVerdict": None, "action": None}
    env.post("/api/ledger", json=ledger_body("c1", "appeal", {"reason": "다시 봐야 합니다"}))
    assert stage()["stage"] == "appealed"
    env.post("/api/ledger", json=ledger_body("c1", "reveal", {"claimId": "i2-C1"}, instance=2))
    assert stage() == {"instance": 2, "stage": "in_trial", "finalVerdict": None, "action": None}
    env.post("/api/ledger", json=ledger_body("c1", "final", final_data("not_clickbait", "L0"), instance=2))
    assert stage() == {"instance": 2, "stage": "final", "finalVerdict": "not_clickbait", "action": "L0"}
    assert [r["id"] for r in env.get("/api/cases?stage=final").json()] == ["c1"]


# 장부는 시간순이고 사건별 필터됨
def test_ledger_get_filter(env):
    env.post("/api/ledger", json=ledger_body("c1", "reveal", {"claimId": "a"}))
    env.post("/api/ledger", json=ledger_body("c2", "reveal", {"claimId": "b"}))
    env.post("/api/ledger", json=ledger_body("c1", "reveal", {"claimId": "c"}))
    assert [e["data"]["claimId"] for e in env.get("/api/ledger?caseId=c1").json()] == ["a", "c"]
    assert len(env.get("/api/ledger").json()) == 3


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
    assert env.post("/api/ledger", json=ledger_body("c1", "seat_verdict", d)).status_code == 200


# 실험실 판결의 사건 단계 비반영
def test_lab_entries_do_not_change_case_stage():
    from app.ledger import progress_of
    lab = {"type": "final", "instance": 1, "labSessionId": "lab-1", "data": {"verdict": "clickbait", "action": "L0"}}
    court = {"type": "first_impression", "instance": 1, "labSessionId": None, "data": {}}
    assert progress_of([lab])["stage"] == "new"
    assert progress_of([court, lab])["stage"] == "in_trial"
