# 실험실 조건과 세션
import random
import uuid
from datetime import datetime, timezone

from app import store

CONDITIONS = [
    {"id": "A", "label": "A 기사만", "description": "기사만 보고 바로 판결한다. 천칭·변론·AI 권고는 보이지 않는다."},
    {"id": "B", "label": "B 기사+AI 권고", "description": "기사와 AI 서기 권고를 함께 보고 판결한다."},
    {"id": "C", "label": "C 기사+변론·천칭", "description": "기사와 1심 변론 전체, 천칭을 보고 판결한다. AI 권고는 판결 직전에 공개된다."},
]


# 세션 완료 사건 계산
def with_done(session: dict) -> dict:
    finals = {e["caseId"] for e in store.load_ledger() if e["type"] == "final" and e["labSessionId"] == session["id"]}
    return {**session, "done": [c for c in session["caseIds"] if c in finals]}


# 세션 조회
def get(session_id: str) -> dict | None:
    s = next((s for s in store.load_sessions() if s["id"] == session_id), None)
    return with_done(s) if s else None


# 세션 사건 표본 추출
def _pick(size: int, rng: random.Random) -> list[str]:
    answers = store.load_answers()
    ids = [c["id"] for c in store.load_cases() if not c.get("variantOf") and answers.get(c["id"]) and store.load_trial(c["id"], 1)]
    pos = [i for i in ids if answers.get(i, {}).get("isClickbait")]
    neg = [i for i in ids if i not in pos]
    rng.shuffle(pos)
    rng.shuffle(neg)
    picked = []
    while len(picked) < size and (pos or neg):
        for pool in (pos, neg):
            if pool and len(picked) < size:
                picked.append(pool.pop())
    rng.shuffle(picked)
    return picked


# 세션 생성
def create(condition: str, judge: str, size: int) -> dict:
    session_id = uuid.uuid4().hex[:10]
    session = {
        "id": session_id, "condition": condition, "judge": judge,
        "createdAt": datetime.now(timezone.utc).isoformat(), "caseIds": _pick(size, random.Random(session_id)),
    }
    with store.LOCK:
        store.write_json("lab/sessions.json", [*store.load_sessions(), session])
    return with_done(session)
