# 서기 접수 검토 (읽기 → 사실 확인 계획 → 권고 초안) 와 접수 결과 파일
import json
import time
from datetime import datetime, timezone

from court import agents, ontology, paths
from court.agent_loop import Session, plan_public
from court.skills import load_skill


# 접수 결과 파일 경로
def _path(case_id):
    return paths.DATA_DIR / "intake" / f"{case_id}.json"


# 저장된 접수 결과 읽기
def load(case_id):
    path = _path(case_id)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


# 서기 한 사건 접수 검토 후 파일 저장
def run_case(case, client, on_event=None, build_partial=None):
    started = time.time()
    s = Session(case, 0, client, on_event=on_event)
    s.build_partial = build_partial
    skill = load_skill("clerk")
    clerk = {"id": "i1-K1", "name": "서기"}
    s.role = "clerk"
    s.emit(clerk["id"], "read", f"기사 {len(s.sentence_nos)}문장 읽음 · 본문에 없는 제목 핵심어 {len(s.absent)}개", public="기사 읽기")
    plan = agents.tidy_plan(s.ask(clerk["id"], "clerk", "plan", agents.build_prompt("clerk", "plan", absent_keywords=s.absent_text), agents.plan_schema(s.sentence_nos), optional=True), s.sentence_nos)
    s.emit(clerk["id"], "plan", f"{', '.join(f'{n}번' for n in plan['sentenceNos']) or '전체'} 문장 사실 확인 계획", public=plan_public(plan["sentenceNos"]))
    tool_text = s.run_tools(clerk["id"], plan)
    system = agents.build_prompt("clerk", claim_types=ontology.render_catalogue(), absent_keywords=s.absent_text, tool_results=tool_text)
    reply = s.ask(clerk["id"], "clerk", "draft", system, agents.screening_schema(s.sentence_nos, s.absent))
    screening = agents.tidy_screening(reply, s.sentence_nos, s.absent)
    s.emit(clerk["id"], "draft", f"권고 작성 · {'낚시성 의심' if screening['isClickbait'] else '정상으로 판단'} · 확신도 {screening['confidence']}", public="권고 작성")
    s.stat(clerk["id"])["seconds"] = round(time.time() - started, 2)
    s.emit(clerk["id"], "done", f"접수 검토 완료 · {'낚시성 의심' if screening['isClickbait'] else '정상'} 확신도 {screening['confidence']}", public="접수 검토 완료")
    doc = {
        "caseId": case["id"],
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": {"name": client.model, "options": client.options},
        "skill": skill["name"],
        "skillVersion": skill["version"],
        "screening": screening,
        "trace": s.trace,
        "calls": s.calls,
        "agentStats": s.stats,
    }
    path = _path(case["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return doc

