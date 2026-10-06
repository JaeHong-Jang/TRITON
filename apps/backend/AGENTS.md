# apps/backend — 지도

Python 3.11+, uv. `court/`(재판 도메인, HTTP 모름) ← `app/`(FastAPI·저장·집계). 계약: `docs/contracts/{api,domain,agent-loop}.md`.

## court/ (도메인)
| 파일 | 역할 |
|---|---|
| `paths.py` | 저장소·`agents/`·`data/` 경로 (`TRITON_DATA_DIR`로 데이터 폴더 교체) |
| `cases.py` | AI-Hub 라벨 → 공개 사건 + 정답 (CLI) |
| `ontology.py` · `skills.py` | `agents/ontology.yaml` · `agents/*/SKILL.md` 로더 |
| `llm.py` | Ollama 클라이언트 (`ax4-light:q4_K_M`) |
| `agent_loop.py` | 에이전트 작업 루프: 읽기 → 계획 → 도구 → 초안 → 검증 → 고쳐 쓰기 → 제출/사람에게 넘김 |
| `workflow.py` | 실제 루프의 허용 전이·종료 예산·그래프 정의 |
| `agents.py` | 프롬프트 조립 · 응답 스키마 · 응답 정리 |
| `evidence.py` | 증거 검증관 (인용·핵심어 부재를 원문과 코드로 대조) |
| `instances.py` | 1·2·3심 진행 (CLI), 중간 기록·이벤트 보고 |
| `intake.py` · `docket.py` | 서기 접수 검토 · 약식 처리/재판 회부 분류 (자율 범위 정책) |
| `scale.py` | 천칭 무게 (프론트 `lib/scale.ts`와 같은 규칙) |
| `redteam.py` | 조작 실험(레드팀) 변형 사건 |

## app/ (HTTP)
`main.py` 앱·정적 서빙 · `api.py` 라우트 · `jobs.py` 작업 큐(재판 우선) · `ledger.py` 장부 검증·사건 단계 · `stats.py` 통계 · `console.py` 대시보드·작업실 · `lab.py` 실험실 · `summary.py` 사건 요약 · `store.py` 파일 입출력 · `schemas.py` 요청 스키마.

`run_store.py` 실행 스냅샷·복구 · `projection.py` 첫인상/실험실 공개 정책 · `execution.py` 실제 작업과 장부에 따른 사건 실행 화면. 계약: `docs/contracts/execution.md`. 로컬 단일 프로세스 전용.

## 테스트
```bash
uv run pytest -q                       # test_court_* (도메인, 가짜 LLM) · test_api_* (TestClient, 임시 데이터 폴더)
TRITON_DATA=<원천 경로> uv run pytest -q tests/test_cases.py   # 실제 원천 표본 변환까지
```
실제 모델을 부르는 테스트는 없다. GPU가 필요한 실행은 `instances` CLI나 서버 작업 큐로만.
