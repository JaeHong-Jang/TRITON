# 실행 그래프 API 계약 v1

2026-10-02 · 기존 API 확장 · 로컬 단일 프로세스

## 공용 응답

```ts
type RunStatus = 'queued' | 'running' | 'done' | 'error' | 'interrupted' | 'cancelled'
type StepStatus = 'pending' | 'active' | 'complete' | 'blocked' | 'error'
interface WorkflowDefinition {
  version: '1'
  nodes: { id: string; label: string; actor: 'code' | 'llm' | 'human' }[]
  edges: { from: string; to: string; condition: string }[]
  limits: { maxCalls: number; maxRevisions: number; maxRunAttempts: number }
}
interface ExecutionView {
  version: '1'; caseId: string; instance: 1 | 2 | 3
  mode: 'live' | 'replay' | 'not_started'
  disclosure: 'hidden' | 'open'
  phase: string; reason: string
  steps: { id: string; label: string; actor: 'code' | 'llm' | 'human'; status: StepStatus; reason: string }[]
  edges: { from: string; to: string; condition: string }[]
  agents: { agentId: string; label: string; nodeId: string; nodeLabel: string; status: 'waiting' | 'running' | 'complete' | 'review' | 'error'; revisions: number | null }[]
  run: JobInfo | null
  limits: { maxCalls: number; maxRevisions: number; maxRunAttempts: number }
}
// JobInfo 추가: attempt: number; graphVersion: '1'; createdAt: string; updatedAt: string
// status는 RunStatus로 확장, 기존 events/partial/step/error 등은 유지
// AgentEvent 선택 필드: nodeId, fromNode, reason, subjectAgentId, attempt
// TrialRecord 선택 필드: execution: { version: '1'; runId: string; attempt: number }
// LedgerIn 선택 필드: requestId: string
```

## API

| 요청 | 응답/조건 |
|---|---|
| GET `/api/workflow` | WorkflowDefinition, 내부 에이전트 그래프의 정적 정의 |
| GET `/api/cases/{id}/execution?instance=1` | ExecutionView, 실제 장부/작업 상태의 절차 그래프 |
| POST `/api/jobs/{id}/retry` | `{jobId}`, error/interrupted/cancelled만, 최대 3 attempt; 진행 중 중복 호출은 같은 ID |
| POST `/api/jobs/{id}/cancel` | JobInfo; queued/running만 취소, cancelled 반복 요청은 멱등, done/error/interrupted는 409로 기존 기록 보존 |
| GET `/api/jobs/{id}?since=n` | 기존 계약 + 저장된 실행, 공개 projection 적용 |
| GET `/api/records/{id}?labSessionId=...` | 해당 실험실 조건의 공개 투영; 미지정은 일반 법정 |
| GET `/api/cases/{id}/trials/{n}?labSessionId=...` | 같은 투영; 숨긴 응답은 `disclosure: 'hidden'` 필드 추가 가능 |

첫인상 전 claims=[], screening/officer=null, calls=[], agentStats={}, trace/events=[]이며 역할별 내부 노드도 비공개다. 작업 step은 중립 문구, done/total은 0이며 queued/running의 updatedAt은 시작·등록 시각으로 고정한다. 생성 중 구조(bench/rounds)는 유지한다. 첫인상 성공 후 프론트는 기록을 다시 읽고 이벤트 커서를 초기화한다. 재개/취소는 기존 장부를 지우지 않는다.

일반 장부: first_impression은 1심 처음 한 번, reveal은 실제 제출 주장 순서대로, evidence_ruling은 공개된 근거만, seat_verdict는 생성 완료·전체 공개·실패 근거 검토 완료 후. final/appeal은 심급별 판사석 완료 후만. final votes는 저장된 판결과 일치하고 2심 불일치는 확정 불가, 3심은 다수결. 최종 확정 뒤 수정 금지. 실험실 A/B/C는 세션 소속과 조건에 맞는 별도 경로로 검증한다.

- 같은 내용의 first_impression/reveal/seat_verdict/final/appeal 재전송은 requestId가 달라도 기존 entry를 반환한다. 같은 위치에 다른 내용은 409이다. evidence_ruling은 최신 판정과 같을 때만 중복 처리하며 첫 판사석 판결 뒤에는 변경할 수 없다.
- 빈 주장으로 종료된 실행은 성공한 변론으로 표시하지 않는다. 생성이 완료됐으면 사람이 미제출 사유를 확인하고 판결 사유를 남길 수 있다.
- 2·3심 장부는 직전 심급 항소가 있어야 기록할 수 있다. 하급심 기록·근거 판정은 고정된다.
- `mode: replay`는 저장된 재판을 보는 상태다. 옛 기록에 실행 정보가 없으면 `agents: []`, `run: null`, ‘실행 그래프 기록 없음’으로 표시한다.
- 일반 법정의 첫인상 정책과 실험실 조건은 구분한다. 실험실 A/B/C는 별도 첫인상 없이 1인 판결을 기록하는 기존 실험 경로다. C의 ‘판결 직전 권고’는 현재 화면 위치에 따른 안내이며 서버 시간 게이트가 아니다.

- 실험실 조회(`labSessionId` 지정)는 1심만 대상이다. `GET /api/cases/{id}/trials/{n}`의 n≠1과 `GET /api/cases/{id}/execution`의 instance≠1은 403, `GET /api/records/{id}`는 1심 기록만 돌려준다. 조건 C도 2·3심 변론·반대신문·재판연구관 보고서를 볼 수 없다.
- 실행 보기의 ‘유효한 주장 없음’ 안내는 판결 전 단계(공개·근거 검토·판사석 판결)에서만 쓴다. 항소·최종 확정이 끝난 심급은 그 상태를 안내한다.

## 실행 비용

- 실제로 모델 서버에 보낸 모든 요청을 센다. 실패한 요청(잘못된 응답·HTTP 오류·연결 실패)과 이전 시도의 요청도 포함하고, 저장된 응답을 재생한 캐시 호출은 제외한다.
- 저장되는 재판 기록은 `execution.modelCalls: { calls; failed; promptTokens; outputTokens; seconds }`, 접수 결과 파일은 같은 형식의 `modelCalls`를 가진다. 접수 배치는 요청 당시 처리 중이던 사건에 귀속한다. 옛 기록에 없으면 집계는 기존 `calls`로 대신한다.
- 1심 안에서 서기 접수를 함께 실행했으면 서기의 이벤트(trace)와 agentStats를 1심 기록에도 남긴다. 호출 비용은 접수 결과에만 세어 통계에서 중복되지 않게 한다.
- 접수 작업을 재시도하면 저장되는 접수 결과의 trace도 실제 시도 번호(attempt)를 쓴다.
- 대기 중인 재판을 먼저 처리하느라 접수 배치가 잠시 멈춘 동안, 그 접수 작업은 대시보드 작동 수와 작업실의 `working`에 세지 않는다. `working`은 실제로 실행 중인 작업과 사건만 가리킨다.

## 내부 책임

- `court.workflow.definition()` → WorkflowDefinition; 그래프 정의와 순수 전이 판단. `_loop`의 실제 실행을 제어한다.
- `app.jobs.get(id, since=0)` → 원본 JobInfo | None (API 경계에서 projection).
- `app.jobs.latest(case_id, instance)` → 원본 JobInfo | None.
- `app.jobs.retry(id)` → jobId; `app.jobs.cancel(id)` → 원본 JobInfo; 없는 ID는 KeyError, 불가능한 전이는 ValueError.
- `app.jobs`는 실행 스냅샷·모델 응답 캐시·attempt fencing을 소유한다. `app.store.LOCK`을 공유하여 장부와 일관된 판결 가능 여부를 조회한다.
- 동일 사건/심급의 생성 재요청은 기존 run ID를 반환한다. 재시도 한도는 새 생성 요청으로 초기화되지 않는다. 그래프/온톨로지/역할 프롬프트 해시 또는 모델 설정이 다르면 이전 체크포인트를 혼합하지 않고 중단한다.
- `app.projection`은 trial/job/docket/집계의 공개 범위를 소유한다.
- `app.execution`은 사건 절차 그래프의 현재 상태를 계산한다.

외부 프레임워크·패키지 추가 없음. `court`에서 `app` import 금지. 상세 설계는 design-docs/execution-graph.md.

## 관제 UI 소비 계약 (2026-10-03)

- 실행 보기에 `controls: { start, retry, cancel }`을 추가한다. 각 값은 `{ allowed: boolean, reason: string }`이며 서버의 생성·재시도 제약과 같은 판정을 사용한다. `availableInstances`는 1심과 기록·실행·정식 항소로 열리는 심급이다. 기존 클라이언트 호환을 유지하며 관제 UI는 제어 정보가 없으면 실행을 비활성화한다.
- 첫인상 전에는 `trace`, 작업 `events`, 역할별 내부 노드 목록을 비우고 작업 진행 카운터와 세부 메시지를 중립화한다. 수정·실패 근거의 수, 선택한 문장, 분기 경로를 노출하지 않는다. 실험실 A/B/C의 공개 조건은 유지한다.
- 중단된 실행은 재시도 API로 복구한다. 별도 일시정지·재개 기능으로 표시하지 않는다. 저장된 심급 기록 조회는 시간순 재생 기능과 구별한다.

- 기존 execution/records/workflow/ontology를 재사용한다. health API의 `{ok, ollama, model}`은 실행 가능 여부 안내에 사용한다. 서버는 기존 시작·취소·재시도 전제조건을 계속 검증한다.
- 모델 연결 상태는 기존 Ollama `/api/tags` 확인(최대 3초)을 재사용하며 상태 조회와 관제 제어는 5초 캐시를 공유한다. 새 실행 시작과 재시도는 변경 직전에 연결 상태를 새로 확인하고, 모델 미연결이면 같은 안내 사유의 503으로 작업 생성·시도 증가를 막는다. 진행 중 작업의 중복 시작·재시도는 기존 실행 ID를 반환하며 연결 실패 때문에 기존 기록을 변경하지 않는다.
- 프론트는 사건/심급을 바꿀 때 이전 데이터의 렌더링을 중단한다. 실패한 갱신은 마지막 확인 시각과 함께 표시하고 연결이 회복되기 전 생성 제어를 잠근다.
- 비공개 상태에서는 근거 그래프에 공개 기사만 사용하고 공개 전 레코드의 claims/calls/stats를 프론트에서 다시 차단한다. 정적 온톨로지 보기에는 사건별 사용 횟수나 연결을 추가하지 않는다.
- 공개 후 진행 중 레코드는 run.partial, 완료·과거 기록은 해당 심급의 records.trials를 사용한다. 이벤트는 attempt·seq 식별자로 구분한다. 법정의 reveal 및 판결 권한은 관제 화면이 대신 행사하지 않는다.
