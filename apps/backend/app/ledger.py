# 장부 검증과 사건 단계 계산
LEANINGS = ("clickbait", "not_clickbait")
ACTIONS = ("L0", "L1", "L2", "L3")


# 숫자 여부 판정
def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# 확신도 검사
def _confidence(data: dict) -> None:
    c = data.get("confidence")
    if not _num(c) or not 0 <= c <= 100:
        raise ValueError("confidence는 0~100 사이 숫자여야 합니다")


# 판결 값 검사
def _leaning(v, name: str = "verdict") -> None:
    if v not in LEANINGS:
        raise ValueError(f"{name}은(는) clickbait 또는 not_clickbait여야 합니다")


# 장부 기록 검증
def validate(entry) -> None:
    if entry.instance not in (1, 2, 3):
        raise ValueError("instance는 1, 2, 3 중 하나여야 합니다")
    if entry.judge.seat not in (1, 2, 3):
        raise ValueError("judge.seat는 1, 2, 3 중 하나여야 합니다")
    if not entry.judge.name.strip():
        raise ValueError("judge.name이 비어 있습니다")
    d, t = entry.data, entry.type
    if t == "first_impression":
        _leaning(d.get("leaning"), "leaning")
        _confidence(d)
    elif t == "reveal":
        if not isinstance(d.get("claimId"), str) or not d["claimId"]:
            raise ValueError("claimId가 필요합니다")
    elif t == "evidence_ruling":
        if not isinstance(d.get("evidenceId"), str) or not d["evidenceId"]:
            raise ValueError("evidenceId가 필요합니다")
        if d.get("ruling") not in ("admitted", "struck", None):
            raise ValueError("ruling은 admitted, struck, null 중 하나여야 합니다")
        if not _num(d.get("checkerWeight")):
            raise ValueError("checkerWeight는 숫자여야 합니다")
    elif t == "seat_verdict":
        _leaning(d.get("verdict"))
        _confidence(d)
        if not isinstance(d.get("reason"), str) or len(d["reason"].strip()) < 10:
            raise ValueError("판결 사유는 10자 이상이어야 합니다")
    elif t == "appeal":
        if entry.instance >= 3:
            raise ValueError("3심은 항소할 수 없습니다")
        if not isinstance(d.get("reason"), str) or not d["reason"].strip():
            raise ValueError("항소 사유가 필요합니다")
    else:
        _leaning(d.get("verdict"))
        if d.get("action") not in ACTIONS:
            raise ValueError("action은 L0~L3 중 하나여야 합니다")
        if not isinstance(d.get("reason"), str):
            raise ValueError("reason이 필요합니다")
        if d["action"] in ("L2", "L3") and not d["reason"].strip():
            raise ValueError("L2·L3 조치는 사유가 필수입니다")
        votes = d.get("votes")
        if not isinstance(votes, list) or any(
            not isinstance(v, dict) or v.get("seat") not in (1, 2, 3) or v.get("verdict") not in LEANINGS for v in votes
        ):
            raise ValueError("votes는 {seat, verdict} 목록이어야 합니다")
    if entry.context.balance is not None:
        b = entry.context.balance
        if not all(_num(b.get(k)) for k in ("pro", "con", "tilt")):
            raise ValueError("balance는 pro, con, tilt 숫자가 필요합니다")


# 사건 진행 단계 계산
def progress_of(entries: list[dict]) -> dict:
    # 실험실 판결은 실험 기록일 뿐 사건 진행 단계에 넣지 않음
    entries = [e for e in entries if not e.get("labSessionId")]
    finals = [e for e in entries if e["type"] == "final"]
    top = max((e["instance"] for e in entries), default=0)
    if finals:
        f = finals[-1]
        return {"instance": top, "stage": "final", "finalVerdict": f["data"]["verdict"], "action": f["data"]["action"]}
    appealed = any(e["type"] == "appeal" and e["instance"] == top for e in entries)
    stage = "appealed" if appealed else "in_trial" if entries else "new"
    return {"instance": top, "stage": stage, "finalVerdict": None, "action": None}
