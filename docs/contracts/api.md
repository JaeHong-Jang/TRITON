# API 계약 (frontend ↔ backend)

단일 서버: FastAPI가 `:8000`에서 `/api/*`와 `frontend/dist`(SPA)를 함께 서빙. 개발 중 Vite는 `/api`를 `:8000`으로 프록시.
모든 응답 JSON UTF-8, 오류는 `{ "detail": "<한국어 사유>" }` + 4xx/5xx.
이 문서가 바뀌면 `apps/backend/app/schemas.py`와 `apps/frontend/src/api/types.ts`를 함께 고친다.

## 공용 타입 (TypeScript 표기, Python도 같은 키 camelCase)

```ts
type Stance = 'pro' | 'con'              // pro 찬성 = 낚시성이다 → 왼쪽 접시, con 반대 = 낚시성 아니다 → 오른쪽 접시
type Side = 'prosecution' | 'defense' | 'officer'
type Instance = 1 | 2 | 3
type EvidenceKind = 'quote' | 'absence'
type EvidenceStatus = 'verified' | 'misnumbered' | 'title' | 'present' | 'fabricated'
type ActionLevel = 'L0' | 'L1' | 'L2' | 'L3'
type Leaning = 'clickbait' | 'not_clickbait'

interface Sentence { no: number; text: string }
interface Case { id: string; category: string; subcategory: string; title: string; subtitle: string; sentences: Sentence[]; variantOf: string | null; attack: string | null }

interface Screening { isClickbait: boolean; confidence: number; reason: string; claimType: string | null }   // AI 서기 권고
interface Docket { track: 'summary' | 'trial'; reasons: string[]; screening: Screening | null }            // 접수 분류: 약식 처리 / 재판 회부
interface CaseProgress { instance: 0 | Instance; stage: 'new' | 'in_trial' | 'appealed' | 'final'; finalVerdict: Leaning | null; action: ActionLevel | null }
interface CaseSummary { id: string; category: string; subcategory: string; title: string; variantOf: string | null; attack: string | null; docket: Docket; progress: CaseProgress; trials: Instance[] }

interface Agent { id: string; side: Side; name: string; specialty: string | null; skill: string; skillVersion: string }
interface Evidence {
  id: string                 // 사건·심급 안에서 유일 (예: "i2-E7")
  kind: EvidenceKind
  stance: Stance             // 소속 주장의 입장 (반박이면 대상 근거의 반대)
  sentenceNo: number | null  // quote
  quote: string | null       // quote
  keyword: string | null     // absence
  status: EvidenceStatus     // 증거 검증관(코드) 판정
  foundIn: number | null     // quote가 실제로 발견된 문장 번호
}
interface Claim {
  id: string                 // 예: "i2-C3"
  agentId: string
  round: number              // rounds[].index
  type: string               // agents/ontology.yaml claim_types[].id
  stance: Stance
  text: string
  strength: 1 | 2 | 3
  evidence: Evidence[]
  rebuts: string | null      // 반박 대상 evidence id (type === 'rebuttal'일 때)
}
interface Round { index: number; kind: 'opening' | 'cross' | 'review'; title: string }
interface OfficerReport {
  summary: string
  issues: string[]                                                   // 3심 쟁점
  reclassified: { evidenceId: string; from: Stance; to: Stance; why: string }[]   // 온톨로지 기준 입장 재분류 제안
  perjury: string[]                                                  // 1·2심 위증 의심 evidence id (코드 집계)
  recommendedAction: ActionLevel
}
interface Call { role: string; agentId: string | null; promptTokens: number; outputTokens: number; seconds: number }
interface TrialRecord {
  caseId: string; instance: Instance; ontologyVersion: number
  model: { name: string; options: Record<string, unknown> }
  createdAt: string
  bench: Agent[]                  // 심급 참여 에이전트
  rounds: Round[]
  claims: Claim[]                 // 공개 순서대로 정렬
  screening: Screening | null     // 1심만
  officer: OfficerReport | null   // 3심만
  calls: Call[]
}
```

## 천칭 무게 규칙 (`apps/frontend/src/lib/scale.ts` 화면용, `apps/backend/court/scale.py` 2심 인원 결정·통계용, 두 구현은 같은 규칙)

근거 하나의 무게:
1. 판사가 `admitted` → 소속 주장 `strength` (다른 규칙 무시)
2. 판사가 `struck` → 0
3. 소속 주장에 `fabricated` 근거가 하나라도 있으면 → 0 (위증 무효)
4. 상태 배수: `verified`·`misnumbered` 1, `title`·`present`·`fabricated` 0 → `strength × 배수`
5. 검증된 반박이 겨냥한 근거면 → 절반. 검증된 반박 = 반박 주장의 근거 중 규칙 1~4(판사 판정 포함)로 무게 > 0인 것이 하나 이상. 같은 근거를 여러 반박이 겨냥해도 한 번만 절반 (`apps/backend/court/scale.py`도 같은 규칙, 판사 판정 없이 호출)

접시 합: 공개된 주장의 근거만, `stance`별 합. `tilt = (pro − con) / (pro + con) × 0.35` (양수 = 왼쪽 찬성 접시가 내려감), 합이 0이면 0.

## 신뢰도 장부

```ts
interface Judge { seat: 1 | 2 | 3; name: string; soloMode: boolean }   // soloMode: 한 사람이 여러 판사석을 맡음
type LedgerType = 'first_impression' | 'reveal' | 'evidence_ruling' | 'seat_verdict' | 'appeal' | 'final'
interface LedgerEntry {
  id: string; at: string                  // 서버가 채움
  caseId: string; instance: Instance; judge: Judge; labSessionId: string | null
  type: LedgerType
  data: Record<string, unknown>
  context: { balance: { pro: number; con: number; tilt: number } | null; aiRecommendationShown: boolean; scaleVisible: boolean }
}
// data 형식
// first_impression { leaning: Leaning, confidence: number }           1심 개정 전, 천칭 가림
// reveal           { claimId: string }
// evidence_ruling  { evidenceId: string, ruling: 'admitted' | 'struck' | null, checkerWeight: number }
// seat_verdict     { verdict: Leaning, confidence: number, reason: string }    판사석별 판결 (reason 10자 이상)
// appeal           { reason: string }                                   instance → instance + 1
// final            { verdict: Leaning, action: ActionLevel, reason: string, votes: { seat: number, verdict: Leaning }[] }
```

실험실 기록(`labSessionId` 있음)은 사건 단계·정답 공개·사건 단위 통계에 넣지 않는다 (실험실 통계에만).

사건 단계 계산 (서버): `final` 있으면 final · 마지막 심급 `appeal` 있고 final 없으면 appealed · 장부 기록 있으면 in_trial · 없으면 new.

## 엔드포인트

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| GET | `/api/health` | | `{ ok: true, ollama: boolean, model: string }` |
| GET | `/api/progress` | | `tools/progress.json` 그대로 |
| GET | `/api/ontology` | | `agents/ontology.yaml` 파싱 결과 |
| GET | `/api/cases` | `?track=summary\|trial&stage=...` | `CaseSummary[]` |
| GET | `/api/cases/{id}` | | `Case` |
| GET | `/api/cases/{id}/trials/{n}` | | `TrialRecord` (없으면 404) |
| POST | `/api/cases/{id}/trials/{n}` | `{ judgeNotes?: string }` | `{ jobId: string }` 생성 시작. 같은 사건·심급 작업이 대기·진행 중이면 그 jobId를 돌려줌 (화면 재접속용). 기록이 이미 있으면 409, n=2·3은 직전 심급 `appeal`이 장부에 없으면 409. 항소 사유는 서버가 장부에서 붙이므로 화면은 `judgeNotes`에 넣지 않음 |
| GET | `/api/jobs/{jobId}` | | `{ id, caseId, instance, status: 'queued'\|'running'\|'done'\|'error', step: string, done: number, total: number, error: string \| null }` |
| GET | `/api/ledger` | `?caseId=` | `LedgerEntry[]` (시간순) |
| POST | `/api/ledger` | `LedgerEntry`에서 `id`,`at` 제외 | `LedgerEntry` |
| GET | `/api/records/{id}` | | `{ case: Case, trials: TrialRecord[], ledger: LedgerEntry[], answer: Answer \| null }` answer는 final 이후에만 |
| GET | `/api/cases/{id}/answer` | | `Answer` · 법정 final(실험실 제외) 이전이면 403 |
| GET | `/api/lab/sessions/{id}/answers/{caseId}` | | `Answer` · 이 세션에서 그 사건 final을 기록한 뒤에만, 아니면 403 |
| GET | `/api/stats` | | `Stats` |
| GET | `/api/lab/conditions` | | `Condition[]` |
| POST | `/api/lab/sessions` | `{ condition: 'A'\|'B'\|'C', judge: string, size?: number }` | `LabSession` |
| GET | `/api/lab/sessions/{id}` | | `LabSession` |
| POST | `/api/lab/variants` | `{ caseId: string, attack: 'move_inserted'\|'inject_command' }` | `{ case: CaseSummary, jobId: string }` 레드팀 변형 사건 생성 + 1심 생성 시작 |

```ts
interface Answer { id: string; isClickbait: boolean; part: number; method: string; pattern: string | null; level: string | null; insertedSentenceNos: number[]; originalTitle: string }
interface Condition { id: 'A' | 'B' | 'C'; label: string; description: string }   // A 기사만 · B 기사+AI 권고 · C 기사+검사·변호 변론(천칭 포함)
interface LabSession { id: string; condition: 'A' | 'B' | 'C'; judge: string; createdAt: string; caseIds: string[]; done: string[] }
interface Stats {
  cases: number; finals: number
  docket: { summary: number; trial: number }
  screening: { agreeWithFinal: number; disagreeWithFinal: number; correct: number; total: number }   // 정답 대비 서기 정확도
  judges: { correct: number; total: number }                     // 정답 대비 최종 판결 정확도
  appeals: { i1: number; i2: number }                           // 1→2심, 2→3심 항소 수
  overturned: { i2: number; i3: number }                        // 상급심에서 하급심 판결이 뒤집힌 수
  checkerOverrides: { admittedVoided: number; struckCounted: number }
  evidenceStatus: Record<EvidenceStatus, number>
  byClaimType: { type: string; label: string; stance: string; count: number; verifiedRate: number }[]
  confidenceShift: { mean: number | null; n: number }           // 첫인상 → 1심 판결, 낚시성 방향 점수 변화
  seatAgreement: { agree: number; total: number }               // 2·3심 판사석 간 일치
  byCategory: { category: string; cases: number; screeningRecall: number | null }[]
  lab: { condition: string; sessions: number; verdicts: number; correct: number }[]
  redteam: { variants: number; screeningFlipped: number }      // 변형 사건 수, 원 사건과 서기 권고가 뒤집힌 수
}
// 사건 단위 집계(cases~byCategory)는 레드팀 변형 사건과 실험실 기록을 제외한다
```

## 2차 확장: 운영 콘솔 · 실시간 에이전트 (`agent-loop.md`, `console.md`)

```ts
// 에이전트 작업 이벤트 (agent-loop.md)
interface AgentEvent { seq: number; at: string; agentId: string; kind: 'read' | 'plan' | 'tool' | 'draft' | 'check' | 'revise' | 'submit' | 'escalate' | 'done' | 'error'; text: string; publicText?: string; claimId: string | null }

// 기존 타입에 추가되는 값
// Claim:       revisions: number; escalated: boolean
// TrialRecord: trace: AgentEvent[]; agentStats: Record<string, { calls: number; revisions: number; escalated: number; seconds: number }>
// JobInfo:     startedAt: string | null; events: AgentEvent[] (since 이후만); partial: TrialRecord | null (지금까지 제출된 주장만 담긴 중간 기록)

// 자율 범위 정책
interface Policy { summaryEnabled: boolean; summaryThreshold: number; highRiskCategories: string[] }

// 대시보드
interface ActivityItem { at: string; caseId: string; kind: 'ledger' | 'agent'; text: string }
interface Dashboard {
  cases: number; inTrial: number; finals: number
  activeJobs: Omit<JobInfo, 'events' | 'partial'>[]
  agentsWorking: number
  kpis: { screeningAccuracy: number | null; selfCorrectionRate: number | null; escalations: number; perjuryRate: number | null; humanOverrides: number }
  recent: ActivityItem[]            // 최신순, 최대 30
}

// 작업실 에이전트 (역할 단위)
interface AgentProfile {
  role: 'clerk' | 'prosecution' | 'defense' | 'cross' | 'officer' | 'checker'
  label: string                     // 서기 · 검사 · 변호인 · 반대신문 · 재판연구관 · 증거 검증관(코드)
  room: string                      // 서기실 · 검사실 · 변호인실 · 반대신문실 · 재판연구관실 · 증거 검증실
  skill: string | null; skillVersion: string | null
  totals: { tasks: number; claims: number; evidence: number; verified: number; perjury: number; revisions: number; escalations: number; seconds: number }
  working: { caseId: string; instance: Instance | 0; text: string } | null
  queued: number
}

// Stats에 추가
// cost:   { calls: number; promptTokens: number; outputTokens: number; seconds: number; byRole: { role: string; calls: number; seconds: number }[] }
// agents: { selfCorrectionRate: number | null; escalations: number }
```

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| GET | `/api/jobs/{jobId}?since=n` | | `JobInfo` (`events`는 seq > n, `partial` 포함). `since` 없으면 전체 이벤트 |
| GET | `/api/dashboard` | | `Dashboard` |
| GET | `/api/agents` | | `AgentProfile[]` (working은 진행 중 작업의 마지막 이벤트) |
| GET | `/api/policy` | | `Policy` (`data/policy.json`, 없으면 기본값 `{summaryEnabled: true, summaryThreshold: 85, highRiskCategories: ['정치','사회']}`) |
| PUT | `/api/policy` | `Policy` | `Policy` 저장. 접수 분류(`docket.classify`)가 바로 이 정책을 따름 |
| POST | `/api/intake` | `{ caseIds?: string[] }` | `{ jobId }` 서기 접수 검토(에이전트 루프) 일괄 실행. 결과는 `data/intake/<caseId>.json` (Screening + trace) |

- 접수 분류의 서기 권고는 `data/intake/<caseId>.json`에서 읽는다. 1심 기록의 `screening`은 접수 결과를 복사한다 (1심에서 서기를 다시 부르지 않음).
- 1심 기록이 없을 때 `POST /api/cases/{id}/trials/1`이 실시간 1심(에이전트 루프)을 시작한다.
