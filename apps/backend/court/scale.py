# 천칭 무게 집계 (판사 판정 제외)
from court.ontology import load

_STATUS_FACTOR = {name: spec["factor"] for name, spec in load()["evidence_status"].items()}


# 판사 판정까지 반영한 근거 하나의 무게 (반박 반감 전)
def _base_weight(claim, ev, rulings):
    ruling = rulings.get(ev["id"])
    if ruling == "admitted":
        return claim["strength"]
    if ruling == "struck" or any(e["status"] == "fabricated" for e in claim["evidence"]):
        return 0
    return claim["strength"] * _STATUS_FACTOR[ev["status"]]


# 근거별 무게 계산 (rulings: 근거 id → admitted/struck)
def weights(claims, rulings=None):
    rulings = rulings or {}
    halved = {
        c["rebuts"]
        for c in claims
        if c["rebuts"] and any(_base_weight(c, e, rulings) > 0 for e in c["evidence"])
    }
    by_id = {}
    for claim in claims:
        for e in claim["evidence"]:
            weight = _base_weight(claim, e, rulings)
            if e["id"] in halved and rulings.get(e["id"]) not in ("admitted", "struck"):
                weight /= 2
            by_id[e["id"]] = (e, weight)
    return by_id


# 찬성·반대 접시 합과 기울기 계산
def balance(claims, rulings=None):
    total = {"pro": 0.0, "con": 0.0}
    for evidence, weight in weights(claims, rulings).values():
        total[evidence["stance"]] += weight
    s = total["pro"] + total["con"]
    return {**total, "tilt": (total["pro"] - total["con"]) / s * 0.35 if s else 0.0}
