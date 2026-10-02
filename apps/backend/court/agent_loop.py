# 에이전트 작업 루프 (읽기·계획·도구·초안·검증·수정·제출)
import copy
import json
import time
import urllib.error
from datetime import datetime, timezone

from court import agents, ontology
from court.errors import ModelError
from court.evidence import absence_candidates, find_sentences, verify

MAX_AGENT_CALLS = 4
MAX_REVISIONS = 2
SIDE_STANCE = {"prosecution": "pro", "defense": "con"}
SHORT_STATUS = {"fabricated": "위증 의심", "present": "핵심어가 본문에 있음", "misnumbered": "문장 번호 오류", "title": "제목 인용"}
CHECKER = "checker"


# 에이전트 하나의 모델 호출 상한을 지키는 작업 상태 (이벤트·호출·통계·제출된 주장)
class Session:
    # 사건·심급·클라이언트와 진행 콜백 보관
    def __init__(self, case, instance, client, judge_notes="", on_step=None, on_event=None, total=0):
        self.case, self.instance, self.client, self.on_step, self.on_event, self.total = case, instance, client, on_step, on_event, total
        self.judge_notes = judge_notes.strip() or "없음"
        self.article = agents.render_article(case)
        self.sentence_nos = [s["no"] for s in case["sentences"]]
        self.absent = absence_candidates(case)
        self.absent_text = agents.absent_text(self.absent)
        self.calls, self.claims, self.rounds, self.trace, self.stats = [], [], [], [], {}
        self.claim_no = self.evidence_no = self.done = 0
        self.role = None
        self.task_calls = 0
        self.build_partial = None

    # 에이전트별 통계 칸 조회
    def stat(self, agent_id):
        return self.stats.setdefault(agent_id, {"calls": 0, "revisions": 0, "escalated": 0, "seconds": 0.0})

    # 이벤트 기록과 발행 (그 시점의 중간 기록을 함께 전달)
    def emit(self, agent_id, kind, text, claim_id=None, role=None, public=""):
        event = {"seq": len(self.trace) + 1, "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "agentId": agent_id, "kind": kind, "text": text, "publicText": public, "claimId": claim_id}
        self.trace.append(event)
        if self.on_event:
            self.on_event(event, copy.deepcopy(self.build_partial()) if self.build_partial else None, role or self.role)

    # 진행률 보고
    def progress(self, description, finished=False):
        self.done += finished
        if self.on_step:
            self.on_step(description, self.done, self.total)

    # 모델 호출 한 번 (작업 한 바퀴당 상한 적용, 파싱 실패 시 한 번 재시도)
    def ask(self, agent_id, role, step, system, schema, optional=False):
        stat = self.stat(agent_id)
        for _ in range(2):
            if self.task_calls >= MAX_AGENT_CALLS:
                break
            self.task_calls += 1
            stat["calls"] += 1
            try:
                reply, meta = self.client.chat_json(system, self.article, schema)
            except (ValueError, KeyError):
                continue
            except OSError as e:
                if isinstance(e, urllib.error.HTTPError) and e.code == 404:
                    raise ModelError(f"모델 {self.client.model}이 Ollama에 없습니다. 모델 설치 여부를 확인하세요") from e
                raise ModelError("AI 모델 서버(Ollama)에 연결할 수 없습니다. 서버 실행 여부를 확인하세요") from e
            self.calls.append({"role": role, "agentId": agent_id, "step": step, **meta})
            return reply
        if optional:
            return None
        raise ModelError("AI 모델 응답을 해석하지 못했습니다. 잠시 후 다시 시도하세요")

    # 모델 호출 없이 진행률만 한 칸 전진
    def skip(self, description):
        self.progress(description, finished=True)

    # 라운드 추가
    def add_round(self, kind, title):
        self.rounds.append({"index": len(self.rounds), "kind": kind, "title": title})
        return len(self.rounds) - 1

    # 도구: 문장 원문 가져오기
    def read_sentence(self, agent_id, no):
        text = next((s["text"] for s in self.case["sentences"] if s["no"] == no), "")
        self.emit(agent_id, "tool", f"{no}번 문장 원문 확인", public=f"{no}번 문장 원문 확인")
        return f"- {no}번 문장 원문: {text}"

    # 도구: 본문에서 단어 찾기
    def find_keyword(self, agent_id, word):
        found = find_sentences(word, self.case)
        self.emit(agent_id, "tool", f"'{word}' 본문 검색 → " + (", ".join(f"{n}번" for n in found) + " 문장에서 발견" if found else "본문에 없음"), public="본문 검색")
        return f"- '{word}' 본문 검색 결과: " + (", ".join(f"{n}번" for n in found) + " 문장에 있음" if found else "본문 어디에도 없음")

    # 도구: 본문에 없는 제목 핵심어 목록
    def absent_keywords(self, agent_id):
        self.emit(agent_id, "tool", "본문에 없는 제목 핵심어 확인: " + (", ".join(self.absent) or "없음"), public="제목 핵심어 확인")
        return f"- 본문에 없는 제목 핵심어: {', '.join(self.absent) or '없음'}"

    # 계획에 따른 도구 실행 (문장 읽기·단어 찾기·부재 핵심어)
    def run_tools(self, agent_id, plan, extra_nos=(), extra_keyword="", with_absent=True):
        lines = [self.read_sentence(agent_id, n) for n in dict.fromkeys([*plan["sentenceNos"], *extra_nos]) if n in self.sentence_nos]
        word = plan["findKeyword"] or extra_keyword
        if word:
            lines.append(self.find_keyword(agent_id, word))
        if with_absent:
            lines.append(self.absent_keywords(agent_id))
        return "\n".join(lines) or "없음"

    # 초안 근거 검증 (검증관 이벤트 발행)
    def check(self, tidy):
        checked = [[verify(e["kind"], self.case, e.get("sentenceNo"), e.get("quote"), e.get("keyword")) for e in c["evidence"]] for c in tidy]
        flat = [e for group in checked for e in group]
        bad = _count_bad(flat)
        stat = self.stat(CHECKER)
        stat["calls"] += len(flat)
        stat["verified"] = stat.get("verified", 0) + len(flat) - sum(bad.values())
        stat["perjury"] = stat.get("perjury", 0) + bad.get("fabricated", 0)
        self.emit(CHECKER, "check", f"근거 {len(flat)}건 대조 · 통과 {len(flat) - sum(bad.values())}건" + "".join(f" · {SHORT_STATUS[k]} {v}건" for k, v in bad.items()), role=CHECKER, public="근거 대조")
        return checked

    # 정리된 주장을 검증 결과와 함께 기록 (식별자 부여)
    def add_claim(self, agent, round_index, tidy, stance, checked, rebuts=None, revisions=0, escalated=False):
        self.claim_no += 1
        evidence = []
        for e in checked:
            self.evidence_no += 1
            evidence.append({"id": f"i{self.instance}-E{self.evidence_no}", "stance": stance, **e})
        claim = {
            "id": f"i{self.instance}-C{self.claim_no}",
            "agentId": agent["id"],
            "round": round_index,
            "type": "rebuttal" if rebuts else tidy["type"],
            "stance": stance,
            "text": tidy["text"],
            "strength": tidy["strength"],
            "evidence": evidence,
            "rebuts": rebuts,
            "revisions": revisions,
            "escalated": escalated,
        }
        self.claims.append(claim)
        return claim


# 계획 문장 번호의 중립 안내문
def plan_public(nos):
    return ("·".join(str(n) for n in nos) + "번" if nos else "전체") + " 문장 살펴보기"


# 통과하지 못한 근거 상태별 개수
def _count_bad(evidence):
    bad = {}
    for e in evidence:
        if e["status"] != "verified":
            bad[e["status"]] = bad.get(e["status"], 0) + 1
    return bad


# 후보 한 벌의 통과 못 한 근거 수
def _failing(checked):
    return sum(sum(_count_bad(group).values()) for group in checked)


# 되돌린 근거와 실제 원문을 적은 수정 지시 본문
def _feedback(session, tidy, checked):
    by_no = {s["no"]: s["text"] for s in session.case["sentences"]}
    lines = []
    for i, (claim, group) in enumerate(zip(tidy, checked), start=1):
        for src, res in zip(claim["evidence"], group):
            if res["status"] == "verified":
                continue
            if src["kind"] == "absence":
                where = find_sentences(src["keyword"], session.case)
                if res["status"] == "present":
                    shown = " / ".join(f"{n}번 문장 원문: {by_no[n]}" for n in where[:2])
                    lines.append(f'- {i}번째 주장의 핵심어 "{src["keyword"]}": 본문에 있음. {shown}')
                else:
                    lines.append(f'- {i}번째 주장의 핵심어 "{src["keyword"]}": 쓸 수 없는 단어. 사용 가능한 핵심어: {session.absent_text}')
                continue
            no = res["foundIn"] if res["status"] == "misnumbered" else src["sentenceNo"]
            real = by_no.get(no, "그 번호의 문장이 없음")
            reason = {"fabricated": "그 문장에도 본문 어디에도 없는 인용", "misnumbered": f"인용은 {no}번 문장에 있음 (번호가 틀림)", "title": "제목 문장이라 근거가 될 수 없음"}[res["status"]]
            lines.append(f'- {i}번째 주장의 {src["sentenceNo"]}번 문장 인용 "{src["quote"]}": {reason}. {no}번 문장 실제 원문: {real}')
    return "\n".join(lines)


# 근거 상태 요약 문장
def _summary(checked):
    bad = _count_bad([e for group in checked for e in group])
    return ", ".join(f"{SHORT_STATUS[k]} {v}건" for k, v in bad.items())


# 읽기·계획·도구·초안·검증·수정 한 바퀴 (최종 후보와 수정 횟수 반환)
def _loop(s, agent, role, read_text, plan_system, plan_schema, plan_tidy, tools, draft_system, draft_schema, tidy_draft):
    started = time.time()
    aid = agent["id"]
    s.role = role
    s.task_calls = 0
    s.emit(aid, "read", read_text, public="기사 읽기")
    plan = plan_tidy(s.ask(aid, role, "plan", plan_system, plan_schema, optional=True))
    labels = ", ".join(ontology.claim_type(t)["label"] for t in plan["claimTypes"])
    nos = ", ".join(f"{n}번" for n in plan["sentenceNos"])
    s.emit(aid, "plan", f"{nos or '전체'} 문장 확인 계획" + (f" · 노릴 주장: {labels}" if labels else ""), public=plan_public(plan["sentenceNos"]))
    system = draft_system(tools(plan), plan)
    raw = s.ask(aid, role, "draft", system, draft_schema(plan))
    tidy = tidy_draft(raw, plan)
    s.emit(aid, "draft", f"초안 {len(tidy)}건 작성", public="초안 작성")
    checked = s.check(tidy)
    first_failed = _failing(checked)
    best = (tidy, checked)
    rewrites = 0
    for number in range(1, MAX_REVISIONS + 1):
        if not _failing(best[1]) or s.task_calls >= MAX_AGENT_CALLS:
            break
        s.emit(aid, "revise", f"{_summary(best[1])} → 다시 작성 ({number}/{MAX_REVISIONS})", public="다시 작성")
        revise = agents.build_prompt("agent-revise", round=number, feedback=_feedback(s, tidy, checked), previous=json.dumps(raw, ensure_ascii=False))
        raw = s.ask(aid, role, "revise", f"{system}\n\n{revise}", draft_schema(plan), optional=True)
        if raw is None:
            break
        rewrites += 1
        tidy = tidy_draft(raw, plan)
        checked = s.check(tidy)
        if tidy and _failing(checked) <= _failing(best[1]):
            best = (tidy, checked)
    stat = s.stat(aid)
    stat["revisions"] += rewrites
    stat["firstFailed"] = stat.get("firstFailed", 0) + first_failed
    stat["fixed"] = stat.get("fixed", 0) + max(0, first_failed - _failing(best[1]))
    stat["seconds"] = round(stat["seconds"] + time.time() - started, 2)
    return (*best, rewrites)


# 최종 후보를 제출 또는 에스컬레이션으로 공개
def _submit(s, agent, round_index, best, role, stance_of, rebuts=None):
    tidy, checked, revisions = best
    if not tidy:
        s.stat(agent["id"])["escalated"] += 1
        s.emit(agent["id"], "escalate", "유효한 주장을 만들지 못함 · 판사 확인 필요", None, role, public="주장 제출 없음")
    for claim, group in zip(tidy, checked):
        bad = sum(_count_bad(group).values())
        record = s.add_claim(agent, round_index, claim, stance_of(claim), group, rebuts=rebuts(claim) if rebuts else None, revisions=revisions, escalated=bool(bad))
        label = "반박" if record["rebuts"] else ontology.claim_type(record["type"])["label"]
        if bad:
            s.stat(agent["id"])["escalated"] += 1
            s.emit(agent["id"], "escalate", f"{label} 주장 · 근거 {bad}건 끝내 통과 못함 → 자기 수정 실패 · 판사 확인 필요", record["id"], role, public="주장 제출")
        else:
            s.emit(agent["id"], "submit", f"{label} 주장 제출 · 근거 {len(group)}건 모두 원문 확인", record["id"], role, public="주장 제출")


# 모두 주장·법률 검토 한 건 (검사·변호인)
def work_statement(s, agent, round_index, specialty=None, issues="없음"):
    side = agent["side"]
    stance = SIDE_STANCE[side]
    opposite = ontology.OPPOSITE[stance]
    own = agents.own_types(stance, specialty)
    other = ontology.selectable_types(opposite)
    values = {"claim_types": ontology.render_catalogue(stance), "concession_types": ontology.render_catalogue(opposite), "specialty": agents.specialty_text(specialty), "issues": issues, "absent_keywords": s.absent_text, "judge_notes": s.judge_notes}
    description = f"{agent['name']} 주장 작성"
    s.progress(description)

    # 계획 응답 정리 (전문 분야는 맨 앞)
    def plan_tidy(raw):
        plan = agents.tidy_plan(raw, s.sentence_nos, own)
        if specialty:
            plan["claimTypes"] = list(dict.fromkeys([specialty, *plan["claimTypes"]]))[:2]
        return plan

    # 계획 결과를 반영한 초안 프롬프트
    def draft_system(tool_text, plan):
        labels = ", ".join(f"{ontology.claim_type(t)['label']}({t})" for t in plan["claimTypes"])
        return agents.build_prompt(agent["skill"], tool_results=tool_text + (f"\n- 계획 단계에서 노리기로 한 주장 유형: {labels}" if labels else ""), **values)

    best = _loop(
        s, agent, side, f"기사 {len(s.sentence_nos)}문장 읽음 · 본문에 없는 제목 핵심어 {len(s.absent)}개",
        agents.build_prompt(agent["skill"], "plan", **values), agents.plan_schema(s.sentence_nos, own), plan_tidy,
        lambda plan: s.run_tools(agent["id"], plan), draft_system, lambda plan: agents.claims_schema(own, other, s.absent), lambda raw, plan: agents.tidy_statement(raw, own, other),
    )
    _submit(s, agent, round_index, best, side, lambda claim: ontology.stance_of(claim["type"]))
    s.progress(description, finished=True)


# 반대신문 한 건 (상대 근거 하나 겨냥, 잘못된 대상은 버림)
def work_cross(s, agent, round_index, opponent_claims, side_label):
    evidence_by_id = {e["id"]: e for c in opponent_claims for e in c["evidence"]}
    description = f"{agent['name']} 반대신문"
    if not evidence_by_id:
        s.skip(f"{description} 건너뜀")
        return
    ids = list(evidence_by_id)
    values = {"side": side_label, "specialty": agents.specialty_text(agent["specialty"]), "opponent_evidence": agents.render_opponent_evidence(opponent_claims), "judge_notes": s.judge_notes}
    s.progress(description)

    # 계획 응답 정리 (겨냥할 근거 id 확인)
    def plan_tidy(raw):
        return agents.tidy_plan(raw, s.sentence_nos, None, ids)

    # 겨냥한 근거의 문장·핵심어를 도구로 확인
    def tools(plan):
        target = evidence_by_id.get(plan["targetEvidenceId"])
        extra_nos = [target["sentenceNo"]] if target and target["kind"] == "quote" else []
        return s.run_tools(agent["id"], plan, extra_nos, target["keyword"] if target and target["kind"] == "absence" else "", with_absent=False)

    # 겨냥 근거를 알려 주는 초안 프롬프트
    def draft_system(tool_text, plan):
        note = f"\n- 계획 단계에서 겨냥한 근거: {plan['targetEvidenceId']}" if plan["targetEvidenceId"] else ""
        return agents.build_prompt("cross-examination", tool_results=tool_text + note, **values)

    # 초안 정리 (겨냥 근거가 유효한 반박만)
    def tidy_draft(raw, plan):
        return [t for t in agents.tidy_cross(raw) if t["targetEvidenceId"] in evidence_by_id]

    best = _loop(
        s, agent, "cross", f"상대 근거 {len(ids)}건 검토 · 기사 {len(s.sentence_nos)}문장 읽음",
        agents.build_prompt("cross-examination", "plan", **values), agents.plan_schema(s.sentence_nos, None, ids), plan_tidy,
        tools, draft_system, lambda plan: agents.cross_schema([plan["targetEvidenceId"]] if plan["targetEvidenceId"] else ids), tidy_draft,
    )
    _submit(s, agent, round_index, best, "cross", lambda claim: ontology.stance_of("rebuttal", evidence_by_id[claim["targetEvidenceId"]]["stance"]), lambda claim: claim["targetEvidenceId"])
    s.progress(description, finished=True)


# 하급심 기록 집계 문장 (재판연구관 도구 결과)
def aggregate_prior(prior):
    lines = []
    for record in prior:
        claims = record["claims"]
        evidence = [e for c in claims for e in c["evidence"]]
        bad = _count_bad(evidence)
        lines.append(f"- {record['instance']}심: 주장 {len(claims)}건, 근거 {len(evidence)}건 (위증 의심 {bad.get('fabricated', 0)}건, 그 밖에 통과 못 함 {sum(bad.values()) - bad.get('fabricated', 0)}건), 자기 수정 실패 {sum(bool(c.get('escalated')) for c in claims)}건")
    return lines


# 재판연구관 한 건 (읽기·기록 집계·보고서 작성)
def work_officer(s, agent, prior):
    started = time.time()
    aid = agent["id"]
    description = f"{agent['name']} 보고서 작성"
    s.progress(description)
    s.role = "officer"
    s.task_calls = 0
    s.emit(aid, "read", f"하급심 기록 {len(prior)}건 읽음", public="기록 읽기")
    lines = aggregate_prior(prior)
    for line in lines:
        s.emit(aid, "tool", "기록 집계 " + line.lstrip("- "), public="기록 집계")
    stances = {e["id"]: e["stance"] for r in prior for c in r["claims"] for e in c["evidence"]}
    system = agents.build_prompt("research-officer", claim_types=ontology.render_catalogue(), record=agents.render_records(prior), judge_notes=s.judge_notes, tool_results="\n".join(lines) or "없음")
    officer = agents.tidy_officer(s.ask(aid, "officer", "draft", system, agents.officer_schema()), stances)
    s.emit(aid, "draft", f"보고서 작성 · 쟁점 {len(officer['issues'])}건 · 조치 권고 {officer['recommendedAction']}", public="보고서 작성")
    s.stat(aid)["seconds"] = round(time.time() - started, 2)
    s.progress(description, finished=True)
    return officer
