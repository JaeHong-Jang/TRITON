# 실행 그래프 정의
VERSION = "1"
MAX_AGENT_CALLS = 4
MAX_REVISIONS = 2
MAX_RUN_ATTEMPTS = 3
RUN_SECONDS_LIMIT = 30 * 60
NODES = [
    {"id": "read", "label": "읽기", "actor": "code"},
    {"id": "plan", "label": "계획", "actor": "llm"},
    {"id": "tool", "label": "허용 도구", "actor": "code"},
    {"id": "draft", "label": "초안", "actor": "llm"},
    {"id": "check", "label": "원문 검증", "actor": "code"},
    {"id": "revise", "label": "수정", "actor": "llm"},
    {"id": "submit", "label": "제출", "actor": "code"},
    {"id": "escalate", "label": "판사 검토 필요", "actor": "code"},
]
EDGES = [
    {"from": "read", "to": "plan", "condition": "기사 읽기 완료"},
    {"from": "read", "to": "draft", "condition": "집계할 하급심 없음"},
    {"from": "read", "to": "tool", "condition": "저장 기록 집계"},
    {"from": "plan", "to": "tool", "condition": "계획 정리 완료"},
    {"from": "plan", "to": "draft", "condition": "허용 도구 없음"},
    {"from": "tool", "to": "draft", "condition": "허용 도구 실행 완료"},
    {"from": "draft", "to": "check", "condition": "초안 작성 완료"},
    {"from": "check", "to": "submit", "condition": "검증 통과"},
    {"from": "check", "to": "revise", "condition": "검증 실패·수정 예산 남음"},
    {"from": "revise", "to": "check", "condition": "수정안 작성 완료"},
    {"from": "revise", "to": "escalate", "condition": "수정 응답 없음"},
    {"from": "check", "to": "escalate", "condition": "빈 주장 또는 수정 한도"},
    {"from": "submit", "to": "escalate", "condition": "같은 제출 묶음의 다른 주장"},
    {"from": "escalate", "to": "submit", "condition": "같은 제출 묶음의 다른 주장"},
]
EVENT_NODES = {"read": "read", "plan": "plan", "tool": "tool", "draft": "draft", "check": "check", "revise": "revise", "submit": "submit", "escalate": "escalate", "done": "submit", "error": "escalate"}


# 정적 실행 그래프
def definition() -> dict:
    return {"version": VERSION, "nodes": list(NODES), "edges": list(EDGES), "limits": {"maxCalls": MAX_AGENT_CALLS, "maxRevisions": MAX_REVISIONS, "maxRunAttempts": MAX_RUN_ATTEMPTS}}


# 이벤트 종류의 노드
def node_for(kind: str) -> str:
    return EVENT_NODES.get(kind, "read")


# 검증 결과별 다음 노드
def next_nodes(node_id: str, failed: bool = False, can_revise: bool = False) -> list[str]:
    if node_id == "check":
        if not failed:
            return ["submit"]
        return ["revise"] if can_revise else ["escalate"]
    return [edge["to"] for edge in EDGES if edge["from"] == node_id]


# 전이 허용 검사
def guard(from_node: str | None, to_node: str) -> None:
    if from_node is None or from_node == to_node:
        return
    if any(edge["from"] == from_node and edge["to"] == to_node for edge in EDGES):
        return
    if from_node in ("submit", "escalate") and to_node == "read":
        return
    if from_node == "check" and to_node in ("submit", "revise", "escalate"):
        return
    if from_node == "revise" and to_node in ("check", "submit", "escalate"):
        return
    if from_node == "draft" and to_node == "submit":
        return
    raise ValueError(f"허용되지 않은 실행 전이: {from_node} -> {to_node}")
