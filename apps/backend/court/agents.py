# 에이전트 프롬프트·응답 스키마·응답 정리
import math
import re

from court import ontology
from court.skills import load_skill, render

MAX_CLAIMS = 2
MAX_EVIDENCE = 2
MAX_PLAN_SENTENCES = 4
MAX_PLAN_TYPES = 2
ACTIONS = ["L0", "L1", "L2", "L3"]
STATUS_LABELS = {name: spec["label"] for name, spec in ontology.load()["evidence_status"].items()}


# 공개 사건만 기사 본문 문자열로 변환
def render_article(case):
    lines = [f"[제목] {case['title']}"]
    if case["subtitle"]:
        lines.append(f"[부제] {case['subtitle']}")
    lines.append("[본문]")
    lines += [f"{s['no']}. {s['text']}" for s in case["sentences"]]
    return "\n".join(lines)


# 스킬 파일(또는 그 구획)을 읽어 자리표시자 치환
def build_prompt(skill_name, section=None, **values):
    skill = load_skill(skill_name)
    base = skill["sections"][section] if section else skill["prompt"]
    return render(base, {"judge_notes": "없음", "issues": "없음", "absent_keywords": absent_text([]), "specialty": "없음 (전반을 다룸)", "tool_results": "없음", **values})


# 전문 분야 안내 문장
def specialty_text(type_id):
    if not type_id:
        return "없음 (전반을 다룸)"
    found = ontology.claim_type(type_id)
    return f"{found['label']} ({type_id}): 첫 번째 주장은 반드시 이 유형으로 쓰세요. 이 유형을 뒷받침할 원문 근거가 정말 하나도 없을 때만 다른 유형을 고르세요. 두 번째 주장은 자유롭게 고를 수 있습니다."


# 자기 입장 주장 유형 목록 (전문 분야가 맨 앞)
def own_types(stance, specialty=None):
    return list(dict.fromkeys([specialty, *ontology.selectable_types(stance)] if specialty else ontology.selectable_types(stance)))


# 핵심어 후보 안내 문장
def absent_text(keywords):
    return ", ".join(keywords) if keywords else "없음 (absence 근거를 쓸 수 없으니 quote만 쓰세요)"


# 근거 객체 스키마 (핵심어는 제목 단어 또는 빈 문자열만)
def _evidence_schema(keywords, kinds=None):
    kinds = kinds or (["quote", "absence"] if keywords else ["quote"])
    return {
        "type": "array",
        "minItems": 1,
        "maxItems": MAX_EVIDENCE,
        "items": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": list(kinds)},
                "sentenceNo": {"type": "integer"},
                "quote": {"type": "string"},
                "keyword": {"type": "string", "enum": ["", *keywords]},
            },
            "required": ["kind", "sentenceNo", "quote", "keyword"],
        },
    }


# 주장 목록 응답 스키마 (본 주장은 자기 입장 유형만, 인정은 반대 입장 유형)
def claims_schema(types, concession_types, keywords):
    # 주장 한 건 스키마
    def item(allowed):
        return {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": allowed},
                "text": {"type": "string"},
                "strength": {"type": "integer", "minimum": 1, "maximum": 3},
                "evidence": _evidence_schema(keywords),
            },
            "required": ["type", "text", "strength", "evidence"],
        }

    return {
        "type": "object",
        "properties": {
            "claims": {"type": "array", "minItems": 1, "maxItems": MAX_CLAIMS, "items": item(types)},
            "concession": {"type": "array", "maxItems": 1, "items": item(concession_types)},
        },
        "required": ["claims", "concession"],
    }


# 계획 응답 스키마 (문장 번호·찾을 단어, 선택적으로 주장 유형·겨냥할 근거)
def plan_schema(sentence_nos, types=None, target_ids=None):
    props = {"sentenceNos": {"type": "array", "maxItems": MAX_PLAN_SENTENCES, "items": {"type": "integer", "enum": sentence_nos}}}
    if types:
        props["claimTypes"] = {"type": "array", "maxItems": MAX_PLAN_TYPES, "items": {"type": "string", "enum": types}}
    if target_ids:
        props["targetEvidenceId"] = {"type": "string", "enum": target_ids}
    props["findKeyword"] = {"type": "string"}
    return {"type": "object", "properties": props, "required": list(props)}


# 반대신문 응답 스키마
def cross_schema(target_ids):
    item = {
        "type": "object",
        "properties": {
            "targetEvidenceId": {"type": "string", "enum": target_ids},
            "text": {"type": "string"},
            "strength": {"type": "integer", "minimum": 1, "maximum": 3},
            "evidence": _evidence_schema([], ["quote"]),
        },
        "required": ["targetEvidenceId", "text", "strength", "evidence"],
    }
    return {"type": "object", "properties": {"claims": {"type": "array", "maxItems": 1, "items": item}}, "required": ["claims"]}


# 서기 권고 응답 스키마 (구체적 단서 칸을 판단보다 먼저 채움)
def screening_schema(sentence_nos, keywords):
    return {
        "type": "object",
        "properties": {
            "offTopicSentenceNo": {"type": "integer", "enum": [0, *sentence_nos]},
            "absentKeyword": {"type": "string", "enum": ["", *keywords]},
            "isClickbait": {"type": "boolean"},
            "confidence": {"type": "integer", "minimum": 0, "maximum": 100},
            "reason": {"type": "string"},
            "claimType": {"type": "string", "enum": ontology.selectable_types()},
        },
        "required": ["offTopicSentenceNo", "absentKeyword", "isClickbait", "confidence", "reason", "claimType"],
    }


# 재판연구관 보고서 응답 스키마
def officer_schema():
    item = {
        "type": "object",
        "properties": {"evidenceId": {"type": "string"}, "to": {"type": "string", "enum": ["pro", "con"]}, "why": {"type": "string"}},
        "required": ["evidenceId", "to", "why"],
    }
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "issues": {"type": "array", "maxItems": 4, "items": {"type": "string"}},
            "reclassified": {"type": "array", "maxItems": 4, "items": item},
            "recommendedAction": {"type": "string", "enum": ACTIONS},
        },
        "required": ["summary", "issues", "reclassified", "recommendedAction"],
    }


# 정수 여부 (불리언 제외)
def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


# 근거 목록 정리
def tidy_evidence(raw):
    raw = raw if isinstance(raw, list) else []
    tidy = []
    for e in raw[:MAX_EVIDENCE]:
        if not isinstance(e, dict):
            continue
        if e.get("kind") == "absence" and str(e.get("keyword") or "").strip():
            tidy.append({"kind": "absence", "keyword": str(e["keyword"]).strip()})
        elif e.get("kind") == "quote" and _is_int(e.get("sentenceNo")) and str(e.get("quote") or "").strip():
            tidy.append({"kind": "quote", "sentenceNo": e["sentenceNo"], "quote": str(e["quote"]).strip()})
    return tidy


# 힘 세기 범위 보정
def _strength(value):
    if isinstance(value, float) and not math.isfinite(value):
        return 1
    return min(3, max(1, int(value))) if isinstance(value, (int, float)) and not isinstance(value, bool) else 1


# 주장 응답 정리 (허용 유형만 유지)
def tidy_claims(raw, allowed_types, max_claims=MAX_CLAIMS, key="claims"):
    raw = raw if isinstance(raw, dict) else {}
    claims = raw.get(key)
    claims = claims if isinstance(claims, list) else []
    tidy = []
    for c in claims[:max_claims]:
        if not isinstance(c, dict) or c.get("type") not in allowed_types:
            continue
        kinds = ontology.claim_type(c["type"])["evidence_kinds"]
        evidence = [e for e in tidy_evidence(c.get("evidence")) if e["kind"] in kinds]
        if evidence and str(c.get("text") or "").strip():
            tidy.append({"type": c["type"], "text": str(c["text"]).strip(), "strength": _strength(c.get("strength")), "evidence": evidence})
    return tidy


# 본 주장과 인정 정리 (본 주장 먼저)
def tidy_statement(raw, types, concession_types):
    return tidy_claims(raw, types) + tidy_claims(raw, concession_types, 1, key="concession")


# 반박 응답 정리 (대상 id 유효성은 호출부에서 확인)
def tidy_cross(raw):
    raw = raw if isinstance(raw, dict) else {}
    claims = raw.get("claims")
    claims = claims if isinstance(claims, list) else []
    tidy = []
    for c in claims[:1]:
        if not isinstance(c, dict) or not isinstance(c.get("targetEvidenceId"), str):
            continue
        kinds = ontology.claim_type("rebuttal")["evidence_kinds"]
        evidence = [e for e in tidy_evidence(c.get("evidence")) if e["kind"] in kinds]
        if evidence and str(c.get("text") or "").strip():
            tidy.append({"targetEvidenceId": c["targetEvidenceId"], "text": str(c["text"]).strip(), "strength": _strength(c.get("strength")), "evidence": evidence})
    return tidy


# 서기 권고 정리 (구체적 단서가 없으면 낚시성 아님·낮은 확신도로 제한)
def tidy_screening(raw, sentence_nos, keywords):
    raw = raw if isinstance(raw, dict) else {}
    confidence = raw.get("confidence")
    if isinstance(confidence, float) and not math.isfinite(confidence):
        confidence = 0
    claim_type = raw.get("claimType")
    clue = raw.get("offTopicSentenceNo") in sentence_nos or raw.get("absentKeyword") in keywords and raw.get("absentKeyword")
    confidence = min(100, max(0, int(confidence))) if isinstance(confidence, (int, float)) and not isinstance(confidence, bool) else 0
    return {
        "isClickbait": bool(raw.get("isClickbait")) and bool(clue),
        "confidence": confidence if clue else min(confidence, 60),
        "reason": str(raw.get("reason") or "").strip(),
        "claimType": claim_type if claim_type in ontology.selectable_types() else None,
    }


# 계획 응답 정리 (유효한 번호·유형·근거 id만 유지)
def tidy_plan(raw, sentence_nos, types=None, target_ids=None):
    raw = raw if isinstance(raw, dict) else {}
    nos = list(dict.fromkeys(n for n in raw.get("sentenceNos") or [] if _is_int(n) and n in sentence_nos))[:MAX_PLAN_SENTENCES]
    claim_types = list(dict.fromkeys(t for t in raw.get("claimTypes") or [] if isinstance(t, str) and t in (types or [])))[:MAX_PLAN_TYPES]
    target = raw.get("targetEvidenceId")
    return {"sentenceNos": nos, "claimTypes": claim_types, "targetEvidenceId": target if target in (target_ids or []) else None, "findKeyword": str(raw.get("findKeyword") or "").strip()[:30]}


# 재판연구관 보고서 정리 (위증 목록은 호출부가 채움)
def tidy_officer(raw, stances):
    raw = raw if isinstance(raw, dict) else {}
    reclassified = []
    items = raw.get("reclassified")
    items = items if isinstance(items, list) else []
    for r in items[:4]:
        if not isinstance(r, dict) or r.get("evidenceId") not in stances or r.get("to") not in ("pro", "con"):
            continue
        if r["to"] != stances[r["evidenceId"]]:
            reclassified.append({"evidenceId": r["evidenceId"], "from": stances[r["evidenceId"]], "to": r["to"], "why": str(r.get("why") or "").strip()})
    issues = raw.get("issues")
    issues = [str(i).strip() for i in issues[:4] if str(i).strip()] if isinstance(issues, list) else []
    action = raw.get("recommendedAction")
    return {"summary": str(raw.get("summary") or "").strip(), "issues": issues, "reclassified": reclassified, "recommendedAction": action if action in ACTIONS else "L0"}


# 근거 한 건 요약 문장
def describe_evidence(claim, evidence):
    status = STATUS_LABELS[evidence["status"]]
    label = ontology.claim_type(claim["type"])["label"]
    if evidence["kind"] == "absence":
        body = f'본문에 "{evidence["keyword"]}" 없음 주장'
    else:
        body = f'{evidence["sentenceNo"]}번 문장 인용 "{evidence["quote"]}"'
    return f"{evidence['id']} | 입장 {evidence['stance']} | {label} | {body} | 검증 결과: {status}"


# 상대 근거 목록 문자열
def render_opponent_evidence(claims):
    lines = [f"- {describe_evidence(c, e)}" for c in claims for e in c["evidence"]]
    return "\n".join(lines) or "(없음)"


# 하급심 기록 문자열 (재판연구관 입력)
def render_records(records):
    lines = []
    for record in records:
        lines.append(f"### {record['instance']}심")
        if record.get("screening"):
            s = record["screening"]
            lines.append(f"서기 권고: 낚시성={s['isClickbait']} 확신도={s['confidence']} 사유={s['reason']}")
        for c in record["claims"]:
            lines.append(f"주장 {c['id']} ({c['agentId']}, {c['type']}, 입장 {c['stance']}, 강도 {c['strength']}): {c['text']}")
            lines += [f"  - {describe_evidence(c, e)}" for e in c["evidence"]]
    return "\n".join(lines) or "(없음)"
