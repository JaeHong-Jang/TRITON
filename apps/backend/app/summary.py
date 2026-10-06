# 사건 요약 조립
from app import ledger, projection, store


# 사건 요약 생성
def case_summary(case: dict, trials: list[dict], entries: list[dict]) -> dict:
    docket = store.court("docket").classify(case, store.load_screening(case["id"]), store.load_policy())
    docket = projection.docket(docket, case["id"])
    pub = store.public_case(case)
    return {
        "id": pub["id"],
        "origin": pub["origin"],
        "category": pub["category"],
        "subcategory": pub["subcategory"],
        "title": pub["title"],
        "variantOf": pub["variantOf"],
        "attack": pub["attack"],
        "docket": docket,
        "progress": ledger.progress_of(entries),
        "trials": [t["instance"] for t in trials],
    }


# 사건 한 건 요약 조회
def summarize_one(case: dict) -> dict:
    return case_summary(case, store.load_trials(case["id"]), store.load_ledger(case["id"]))
