# ARCHITECTURE

## 전체 흐름

```
            ┌──────────── 단일 서버 :8000 (apps/backend/app, FastAPI) ─────────────┐
브라우저 ──▶ │  /           apps/frontend/dist (운영 콘솔 · 2D 법정)                 │
            │  /api/*      사건 · 재판 기록 · 작업 큐(실시간 이벤트) · 장부 · 통계    │
            └───────┬───────────────────────────────┬────────────────────────────┘
                    │ 함수 호출 (docs/contracts/domain.md)   │ 파일 읽기/쓰기
            apps/backend/court (재판 도메인)          data/ (사건 · 정답 · 접수 · 기록 · 장부)
                    │
          agents/ (역할 프롬프트 · 온톨로지) ──▶ Ollama A.X 4.0 Light
```

| 흐름 | 설명 |
|---|---|
| 사건 만들기 | `court.cases`가 AI-Hub 라벨을 공개 사건과 정답으로 나눈다. `POST /api/cases`는 직접 입력한 기사를 별도 파일에 저장하며 정답을 만들지 않는다 |
| 접수 | `court.intake`의 서기 에이전트가 사실 확인 후 권고, `court.docket`이 자율 범위 정책으로 약식 처리/재판 회부를 나눈다 |
| 변론 | `court.agent_loop`의 에이전트가 계획 → 도구(문장 읽기·핵심어 찾기) → 초안 → 증거 검증관(코드) 대조 → 고쳐 쓰기(최대 2번) → 제출/사람에게 넘김. 모든 단계가 이벤트로 남는다 |
| 재판 진행 | 프론트 상태 머신이 판사 단계를 진행하고 모든 행동을 `/api/ledger`에 기록한다 |
| 관제 | `/agents`가 서버 실행 투영을 조회하고 순수 `lib/controlGraph`로 원문·주장·검증·규칙·사람 판단의 관계를 구성한다. 시작·재시도·취소의 허용 조건과 공개 범위는 서버가 검증한다 |
| 신뢰성 측정 | `/api/stats`·`/api/dashboard`가 장부·기록·정답으로 서기 정확도, 자기 수정률, 번복률 등을 집계한다 |

## 계층과 의존 방향 (화살표 방향으로만 import)

**백엔드**

```
agents/*.md, ontology.yaml  ◀──  court/ (도메인)  ◀──  app/ (HTTP · 저장 · 집계)
```
- `court/`는 `app`·`fastapi`·`starlette`·`uvicorn`을 import하지 않는다.
- 프롬프트 문장은 코드에 쓰지 않고 `agents/`에서 읽는다.

**프론트엔드**

```
src/api  ◀──  src/lib  ◀──  src/ui · src/scene2d · src/features  ◀──  src/console  ◀──  src/pages  ◀──  App.tsx
```
- `src/api`: 서버 호출과 계약 타입만. `fetch`는 여기서만 쓴다.
- `src/lib`: React 없는 순수 로직 (천칭 무게, 재판 상태 머신, 장부 항목, 자동 공개 일정). 단위 테스트 대상.
- `src/scene2d`: SVG 법정 그림. 페이지·콘솔을 모른다.
- `src/features`: 화면 기능 묶음(법정 패널, 실행·근거·온톨로지 관제). 페이지를 모른다.

이 규칙은 `tools/checks/lint_harness.py`의 `LAYER_RULES`가 검사한다. 규칙을 바꾸면 이 문서와 검사기를 함께 고친다.

## 설계 근거
판사는 사람만 · AI 근거는 코드로 검증 · 천칭 무게는 계산식(재현 가능) · 정답은 최종 판결 전 비공개 · 계약이 코드보다 먼저 → `docs/design-docs/core-beliefs.md`.
