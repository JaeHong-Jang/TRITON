# API 테스트 공용 픽스처
import json
import sys
import types

import pytest
from court import paths
from fastapi.testclient import TestClient

BODY = [{"no": i, "text": f"합성 문장 {i}입니다."} for i in range(1, 4)]


# 합성 사건 생성
def make_case(cid: str, category: str, title: str) -> dict:
    return {"id": cid, "category": category, "subcategory": "합성", "title": title, "subtitle": "", "sentences": BODY, "variantOf": None, "attack": None}


# 합성 정답 생성
def make_answer(cid: str, clickbait: bool) -> dict:
    return {"id": cid, "sourceId": "SECRET", "isClickbait": clickbait, "part": 2, "method": "auto", "pattern": None, "level": None, "insertedSentenceNos": [], "originalTitle": "원제목"}


# 합성 재판 기록 생성
def make_trial(cid: str, instance: int, screening: dict | None, statuses: tuple = ("verified",)) -> dict:
    evidence = [{"id": f"i{instance}-E{i}", "kind": "quote", "stance": "pro", "sentenceNo": 1, "quote": "합성", "keyword": None, "status": s, "foundIn": 1} for i, s in enumerate(statuses)]
    claim = {"id": f"i{instance}-C1", "agentId": "p1", "round": 0, "type": "exaggeration", "stance": "pro", "text": "주장", "strength": 2, "evidence": evidence, "rebuts": None}
    return {"caseId": cid, "instance": instance, "ontologyVersion": 1, "model": {"name": "fake", "options": {}}, "createdAt": "2026-01-01T00:00:00Z",
            "bench": [{"id": f"i{instance}-P1", "side": "prosecution", "name": "검사 1", "specialty": None, "skill": "prosecutor", "skillVersion": "2.1"}], "rounds": [], "claims": [claim], "screening": screening, "officer": None, "calls": [], "trace": [], "agentStats": {}}


# 합성 서기 권고 생성
def scr(is_clickbait: bool, confidence: int) -> dict:
    return {"isClickbait": is_clickbait, "confidence": confidence, "reason": "합성 사유", "claimType": None}


# 가짜 재판 도메인 모듈 설치
def install_fakes(monkeypatch) -> dict:
    calls = {"run": [], "fail": False}
    instances = types.ModuleType("court.instances")

    # 가짜 재판 실행
    def run(case, instance, prior, client, judge_notes="", on_step=None, on_event=None):
        calls["run"].append({"caseId": case["id"], "instance": instance, "prior": prior, "notes": judge_notes})
        if calls["fail"]:
            raise RuntimeError("모델 응답 실패")
        record = make_trial(case["id"], instance, scr(True, 90) if instance == 1 else None)
        on_step("주장 생성", 1, 2)
        for n, kind in enumerate(("read", "submit"), start=1):
            event = {"seq": n, "at": "2026-01-01T00:00:0%d+00:00" % n, "agentId": f"i{instance}-P1", "kind": kind, "text": f"{kind} 이벤트", "claimId": None}
            on_event(event, {**record, "claims": record["claims"][:n - 1]}, "prosecution")
        on_step("검증", 2, 2)
        return record

    instances.run = run
    docket = types.ModuleType("court.docket")

    # 가짜 접수 분류
    def classify(case, screening, policy=None):
        high = bool(screening) and screening["confidence"] >= 85
        return {"track": "summary" if high else "trial", "reasons": [] if high else ["합성 회부"], "screening": screening}

    docket.classify = classify
    docket.DEFAULT_POLICY = {"summaryEnabled": True, "summaryThreshold": 85, "highRiskCategories": ["정치", "사회"]}
    intake = types.ModuleType("court.intake")

    # 가짜 접수 검토 (고정 권고 저장)
    def run_case(case, client, on_event=None):
        calls.setdefault("intake", []).append(case["id"])
        doc = {"caseId": case["id"], "screening": scr(False, 40), "trace": [], "calls": [], "agentStats": {}}
        (paths.DATA_DIR / "intake").mkdir(parents=True, exist_ok=True)
        (paths.DATA_DIR / "intake" / f"{case['id']}.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
        on_event({"seq": 1, "at": "2026-01-01T00:00:00+00:00", "agentId": "i1-K1", "kind": "done", "text": "접수 검토 완료", "claimId": None}, None, "clerk")
        return doc

    intake.run_case = run_case
    redteam = types.ModuleType("court.redteam")

    # 가짜 변형 생성
    def make_variant(case, answer, attack):
        suffix = "mv" if attack == "move_inserted" else "inj"
        return {**case, "id": f"{case['id']}-{suffix}", "variantOf": case["id"], "attack": attack}, {**answer, "id": f"{case['id']}-{suffix}"}

    redteam.make_variant = make_variant
    llm = types.ModuleType("court.llm")

    # 가짜 모델 클라이언트
    class OllamaClient:
        model = "fake-model"
        options = {}

        # 모델 응답 여부
        def available(self):
            return True

    llm.OllamaClient = OllamaClient
    ontology = types.ModuleType("court.ontology")
    ontology.load = lambda: {"version": 1, "claim_types": [{"id": "exaggeration", "label": "과장"}]}
    types_ = {"exaggeration": {"id": "exaggeration", "label": "과장", "stance": "pro"}, "rebuttal": {"id": "rebuttal", "label": "반박", "stance": "derived"}}
    ontology.claim_type = lambda t: types_.get(t)
    for name, mod in (("instances", instances), ("docket", docket), ("intake", intake), ("redteam", redteam), ("llm", llm), ("ontology", ontology)):
        monkeypatch.setitem(sys.modules, f"court.{name}", mod)
        monkeypatch.setattr(sys.modules["court"], name, mod, raising=False)
    return calls


@pytest.fixture
# 임시 데이터 폴더와 가짜 도메인이 설치된 클라이언트
def env(tmp_path, monkeypatch):
    data = tmp_path / "data"
    root = tmp_path / "root"
    (root / "tools").mkdir(parents=True)
    (root / "tools" / "progress.json").write_text(json.dumps({"phases": ["x"]}), encoding="utf-8")
    monkeypatch.setattr(paths, "DATA_DIR", data)
    monkeypatch.setattr(paths, "ROOT", root)
    calls = install_fakes(monkeypatch)
    cases = [make_case("c1", "정치", "합성 제목 하나"), make_case("c2", "경제", "합성 제목 둘"), make_case("c3", "경제", "합성 제목 셋"), make_case("c4", "IT", "합성 제목 넷")]
    answers = [make_answer("c1", True), make_answer("c2", False), make_answer("c3", True), make_answer("c4", False)]
    (data / "cases").mkdir(parents=True)
    (data / "answers").mkdir()
    (data / "cases" / "cases.jsonl").write_text("\n".join(json.dumps(c, ensure_ascii=False) for c in cases) + "\n", encoding="utf-8")
    (data / "answers" / "answers.jsonl").write_text("\n".join(json.dumps(a, ensure_ascii=False) for a in answers) + "\n", encoding="utf-8")
    for cid, s in (("c1", scr(True, 90)), ("c2", scr(True, 60)), ("c3", scr(False, 95))):
        (data / "trials" / cid).mkdir(parents=True)
        statuses = ("verified", "fabricated") if cid == "c1" else ("verified",)
        (data / "trials" / cid / "1.json").write_text(json.dumps(make_trial(cid, 1, s, statuses), ensure_ascii=False), encoding="utf-8")
    from app.main import create_app
    from app import jobs

    jobs.JOBS.clear()
    while not jobs.QUEUE.empty():
        jobs.QUEUE.get_nowait()

    client = TestClient(create_app())
    client.calls = calls
    client.root = root
    client.data = data
    return client


# 장부 기록 본문 생성
def ledger_body(case_id: str, type_: str, data: dict, instance: int = 1, seat: int = 1, session: str | None = None, name: str = "판사A") -> dict:
    return {"caseId": case_id, "instance": instance, "judge": {"seat": seat, "name": name, "soloMode": False}, "labSessionId": session,
            "type": type_, "data": data, "context": {"balance": None, "aiRecommendationShown": False, "scaleVisible": False}}


# 최종 판결 본문 생성
def final_data(verdict: str, action: str = "L1") -> dict:
    return {"verdict": verdict, "action": action, "reason": "합성 사유", "votes": [{"seat": 1, "verdict": verdict}]}


# 장부 기록 성공 요청
def post_ledger(env, case_id: str, type_: str, data: dict, instance: int = 1, seat: int = 1, session: str | None = None):
    res = env.post("/api/ledger", json=ledger_body(case_id, type_, data, instance=instance, seat=seat, session=session))
    assert res.status_code == 200, res.json()
    return res


# 첫인상 기록 보장
def first_impression(env, case_id: str, session: str | None = None):
    if not any(e["type"] == "first_impression" and e.get("labSessionId") == session for e in env.get(f"/api/ledger?caseId={case_id}").json()):
        post_ledger(env, case_id, "first_impression", {"leaning": "clickbait", "confidence": 70}, session=session)


# 저장 재판 기록 보장
def ensure_trial(env, case_id: str, instance: int, statuses: tuple = ("verified",)):
    path = env.data / "trials" / case_id / f"{instance}.json"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(make_trial(case_id, instance, scr(True, 80) if instance == 1 else None, statuses), ensure_ascii=False), encoding="utf-8")


# 모든 주장 공개
def reveal_all(env, case_id: str, instance: int = 1):
    trial = env.get(f"/api/cases/{case_id}/trials/{instance}").json()
    for claim in trial["claims"]:
        post_ledger(env, case_id, "reveal", {"claimId": claim["id"]}, instance=instance)


# 실패 근거 판정
def rule_failed(env, case_id: str, instance: int = 1):
    trial = env.get(f"/api/cases/{case_id}/trials/{instance}").json()
    for claim in trial["claims"]:
        for evidence in claim["evidence"]:
            if evidence["status"] != "verified":
                post_ledger(env, case_id, "evidence_ruling", {"evidenceId": evidence["id"], "ruling": "struck", "checkerWeight": 0}, instance=instance)


# 판사석 기록과 최종 확정
def finalize_case(env, case_id: str, verdict: str, instance: int = 1, action: str = "L1", votes: list[str] | None = None, session: str | None = None):
    first_impression(env, case_id, session=session)
    if not session:
        reveal_all(env, case_id, instance)
        rule_failed(env, case_id, instance)
    seats = {1: 1, 2: 2, 3: 3}[instance]
    chosen = votes or [verdict] * seats
    reason = "충분히 긴 판결 사유입니다"
    for seat, vote in enumerate(chosen, start=1):
        post_ledger(env, case_id, "seat_verdict", {"verdict": vote, "confidence": 70, "reason": reason}, instance=instance, seat=seat, session=session)
    data = {"verdict": verdict, "action": action, "reason": "합성 사유", "votes": [{"seat": i + 1, "verdict": v} for i, v in enumerate(chosen)]}
    return post_ledger(env, case_id, "final", data, instance=instance, session=session)


# 항소 가능한 1심 완료
def appeal_case(env, case_id: str):
    first_impression(env, case_id)
    reveal_all(env, case_id, 1)
    rule_failed(env, case_id, 1)
    post_ledger(env, case_id, "seat_verdict", {"verdict": "clickbait", "confidence": 70, "reason": "충분히 긴 판결 사유입니다"})
    return post_ledger(env, case_id, "appeal", {"reason": "항소 사유입니다"})
