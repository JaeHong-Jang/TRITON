# 백엔드 내부 계약 (apps/backend/court ↔ apps/backend/app)

`apps/backend/court`는 HTTP를 모르는 재판 도메인, `apps/backend/app`은 FastAPI·저장소·집계 계층이다.
app은 아래 함수만 호출한다. 시그니처를 바꾸면 이 문서와 호출부를 같이 고친다.

```python
# court/paths.py
ROOT: Path            # 저장소 루트
SKILLS_DIR: Path      # ROOT / "agents"
DATA_DIR: Path        # 환경변수 TRITON_DATA_DIR 또는 ROOT / "data"

# court/ontology.py
def load() -> dict                                   # agents/ontology.yaml 파싱 (캐시)
def claim_type(type_id: str) -> dict | None
def stance_of(type_id: str, rebuts_stance: str | None = None) -> str   # 'pro' | 'con'

# court/skills.py
def load_skill(name: str) -> dict                    # {name, version, role, prompt} agents/<name>/SKILL.md

# court/llm.py
class OllamaClient:
    model: str; options: dict
    def __init__(self, model=None, host=None, options=None): ...
    def available(self) -> bool                      # 서버·모델 응답 여부
    def chat_json(self, system: str, user: str, schema: dict) -> tuple[dict, dict]   # (응답 JSON, call 메타)

# court/cases.py  (기존)
def build(data_root, split, per_folder, seed) -> tuple[list[dict], list[dict]]     # (공개 사건, 정답)

# court/instances.py
def run(case: dict, instance: int, prior: list[dict], client, judge_notes: str = "",
        on_step: Callable[[str, int, int], None] | None = None,
        on_event: Callable[[dict, dict | None, str | None], None] | None = None,
        attempt: int = 1, intake_doc=INTAKE_OMITTED, save_intake=None) -> dict
    # TrialRecord 반환 (api.md 형식, trace·agentStats 포함). prior = 낮은 심급 TrialRecord 목록.
    # on_step(설명, 완료한 에이전트 작업 수, 전체 작업 수)로 진행률 보고.
    # on_event(AgentEvent, 지금까지 제출된 주장이 담긴 중간 기록 | None, 역할)로 실시간 이벤트 보고.
    # 1심 app 작업은 enqueue 당시 intake_doc을 사용한다. 명시적 None은 당시 접수 결과가 없었다는 뜻이다.
    # CLI처럼 인수를 생략하면 기존 접수 파일을 읽는다. 없으면 서기를 실행하고 save_intake(doc)으로 저장한다.
    # app 콜백은 공유 잠금 안에서 취소/attempt를 검사한 뒤 원자 저장한다.

# court/workflow.py (execution.md)
def definition() -> dict                             # 노드·조건부 엣지·호출/수정/실행 한도
def next_nodes(node_id: str, failed: bool = False, can_revise: bool = False) -> list[str]
    # 실제 루프가 따르는 허용 전이

# court/agent_loop.py  (agent-loop.md)
class Session: ...                                   # 이벤트·호출·통계·제출 주장 상태, 도구(read_sentence·find_keyword·absent_keywords)
def work_statement(s, agent, round_index, specialty=None, issues="없음") -> None   # 검사·변호인 한 바퀴
def work_cross(s, agent, round_index, opponent_claims, side_label) -> None         # 반대신문 한 바퀴
def work_officer(s, agent, prior) -> dict                                          # 재판연구관 보고서

# court/intake.py
def load(case_id: str) -> dict | None                # data/intake/<caseId>.json
def run_case(case, client, on_event=None, build_partial=None, should_save=None, save_result=None) -> dict
    # 서기 루프 결과 {caseId, createdAt, model, skill, skillVersion, screening, trace, calls, agentStats}
    # save_result(doc)이 있으면 저장을 위임한다. CLI 기본 경로는 파일 저장이다.

# court/docket.py
DEFAULT_POLICY: dict                                 # {summaryEnabled, summaryThreshold, highRiskCategories}
def classify(case: dict, screening: dict | None, policy: dict | None = None) -> dict     # Docket

# court/redteam.py
def make_variant(case: dict, answer: dict, attack: str) -> tuple[dict, dict]   # (변형 사건, 변형 정답)
```

데이터 파일 (모두 `DATA_DIR` 아래, gitignore):

| 파일 | 내용 | 쓰는 쪽 |
|---|---|---|
| `cases/cases.jsonl` | 공개 사건 (`variantOf`, `attack` 포함) | cases CLI, redteam |
| `answers/answers.jsonl` | 정답 (공개 금지) | cases CLI, redteam |
| `trials/<caseId>/<n>.json` | TrialRecord | instances CLI, 작업 큐 |
| `intake/<caseId>.json` | 서기 접수 결과 (Screening + trace) | intake, 작업 큐 |
| `policy.json` | 자율 범위 정책 | app |
| `ledger/ledger.jsonl` | LedgerEntry | app |
| `lab/sessions.json` | LabSession 목록 | app |
| `runs/<runId>.json` | 고정 입력·버전·모델 설정·이벤트·부분 기록·모델 응답 체크포인트 | app.jobs/run_store |

실행 저장소는 단일 프로세스 전용이다. API 응답에서 runs의 내부 입력/체크포인트를 직접 반환하지 않는다. 공개 범위와 재개 계약은 `execution.md`를 따른다.
