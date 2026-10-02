# 접수 분류 (약식 처리 / 재판 회부)
DEFAULT_POLICY = {"summaryEnabled": True, "summaryThreshold": 85, "highRiskCategories": ["정치", "사회"]}


# 서기 권고와 자율 범위 정책으로 접수 분류 결정
def classify(case, screening, policy=None):
    policy = {**DEFAULT_POLICY, **(policy or {})}
    if screening is None:
        return {"track": "trial", "reasons": ["서기 권고 없음"], "screening": None}
    reasons = []
    if not policy["summaryEnabled"]:
        reasons.append("약식 처리 꺼짐 (정책)")
    if screening["confidence"] < policy["summaryThreshold"]:
        reasons.append(f"서기 확신도 {screening['confidence']} < {policy['summaryThreshold']}")
    if case["category"] in policy["highRiskCategories"]:
        reasons.append(f"고위험 분야: {case['category']}")
    if reasons:
        return {"track": "trial", "reasons": reasons, "screening": screening}
    reasons = [f"서기 확신도 {screening['confidence']} ≥ {policy['summaryThreshold']}", f"일반 분야: {case['category']}"]
    return {"track": "summary", "reasons": reasons, "screening": screening}
