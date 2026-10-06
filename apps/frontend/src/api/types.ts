// API 계약 타입

// 근거 입장
export type Stance = 'pro' | 'con'
// 에이전트 편
export type Side = 'prosecution' | 'defense' | 'officer'
// 심급
export type Instance = 1 | 2 | 3
// 근거 종류
export type EvidenceKind = 'quote' | 'absence'
// 근거 검증 상태
export type EvidenceStatus = 'verified' | 'misnumbered' | 'title' | 'present' | 'fabricated'
// 조치 단계
export type ActionLevel = 'L0' | 'L1' | 'L2' | 'L3'
// 판결 방향
export type Leaning = 'clickbait' | 'not_clickbait'
// 판사 근거 판정
export type Ruling = 'admitted' | 'struck'
// 실행 작업 상태
export type RunStatus = 'queued' | 'running' | 'done' | 'error' | 'interrupted' | 'cancelled'
// 실행 노드 상태
export type StepStatus = 'pending' | 'active' | 'complete' | 'blocked' | 'error'

// 기사 문장
export interface Sentence { no: number; text: string }
// 공개 사건
export interface Case {
  id: string
  origin?: 'manual' | null
  category: string
  subcategory: string
  title: string
  subtitle: string
  sentences: Sentence[]
  variantOf: string | null
  attack: string | null
}

// 직접 기사 등록 요청
export interface NewCase { requestId: string; title: string; body: string; category?: string }

// AI 서기 권고
export interface Screening { isClickbait: boolean; confidence: number; reason: string; claimType: string | null }
// 접수 분류
export interface Docket { track: 'summary' | 'trial'; reasons: string[]; screening: Screening | null }
// 사건 진행 단계
export interface CaseProgress { instance: 0 | Instance; stage: 'new' | 'in_trial' | 'appealed' | 'final'; finalVerdict: Leaning | null; action: ActionLevel | null }
// 접수처 사건 요약
export interface CaseSummary {
  id: string
  origin?: 'manual' | null
  category: string
  subcategory: string
  title: string
  variantOf: string | null
  attack: string | null
  docket: Docket
  progress: CaseProgress
  trials: Instance[]
}

// 재판 에이전트
export interface Agent { id: string; side: Side; name: string; specialty: string | null; skill: string; skillVersion: string }
// 근거
export interface Evidence {
  id: string
  kind: EvidenceKind
  stance: Stance
  sentenceNo: number | null
  quote: string | null
  keyword: string | null
  status: EvidenceStatus
  foundIn: number | null
}
// 주장
export interface Claim {
  id: string
  agentId: string
  round: number
  type: string
  stance: Stance
  text: string
  strength: 1 | 2 | 3
  evidence: Evidence[]
  rebuts: string | null
  revisions: number
  escalated: boolean
}
// 변론 라운드
export interface Round { index: number; kind: 'opening' | 'cross' | 'review'; title: string }
// 재판연구관 보고서
export interface OfficerReport {
  summary: string
  issues: string[]
  reclassified: { evidenceId: string; from: Stance; to: Stance; why: string }[]
  perjury: string[]
  recommendedAction: ActionLevel
}
// 모델 호출 기록
export interface Call { role: string; agentId: string | null; promptTokens: number; outputTokens: number; seconds: number }
// 심급 재판 기록
export interface TrialRecord {
  caseId: string
  instance: Instance
  ontologyVersion: number
  model: { name: string; options: Record<string, unknown> }
  createdAt: string
  bench: Agent[]
  rounds: Round[]
  claims: Claim[]
  screening: Screening | null
  officer: OfficerReport | null
  calls: Call[]
  trace: AgentEvent[]
  agentStats: Record<string, AgentStat>
  execution?: { version: '1'; runId: string; attempt: number }
}

// 판사석
export interface Judge { seat: 1 | 2 | 3; name: string; soloMode: boolean }
// 장부 기록 종류
export type LedgerType = 'first_impression' | 'reveal' | 'evidence_ruling' | 'seat_verdict' | 'appeal' | 'final'
// 천칭 상태
export interface Balance { pro: number; con: number; tilt: number }
// 장부 기록 당시 화면 상태
export interface LedgerContext { balance: Balance | null; aiRecommendationShown: boolean; scaleVisible: boolean }
// 신뢰도 장부 기록
export interface LedgerEntry {
  id: string
  at: string
  caseId: string
  instance: Instance
  judge: Judge
  labSessionId: string | null
  type: LedgerType
  data: Record<string, unknown>
  context: LedgerContext
}
// 새 장부 기록 요청
export type NewLedgerEntry = Omit<LedgerEntry, 'id' | 'at'> & { requestId?: string }

// 정답
export interface Answer {
  id: string
  isClickbait: boolean
  part: number
  method: string
  pattern: string | null
  level: string | null
  insertedSentenceNos: number[]
  originalTitle: string
}
// 실험 조건
export interface Condition { id: 'A' | 'B' | 'C'; label: string; description: string }
// 실험실 세션
export interface LabSession { id: string; condition: 'A' | 'B' | 'C'; judge: string; createdAt: string; caseIds: string[]; done: string[] }
// 통계실 집계
export interface Stats {
  cases: number
  finals: number
  docket: { summary: number; trial: number }
  screening: { agreeWithFinal: number; disagreeWithFinal: number; correct: number; total: number }
  judges: { correct: number; total: number }
  appeals: { i1: number; i2: number }
  overturned: { i2: number; i3: number }
  checkerOverrides: { admittedVoided: number; struckCounted: number }
  evidenceStatus: Record<EvidenceStatus, number>
  byClaimType: { type: string; label: string; stance: string; count: number; verifiedRate: number }[]
  confidenceShift: { mean: number | null; n: number }
  seatAgreement: { agree: number; total: number }
  byCategory: { category: string; cases: number; screeningRecall: number | null }[]
  lab: { condition: string; sessions: number; verdicts: number; correct: number }[]
  redteam: { variants: number; screeningFlipped: number }
  cost: { calls: number; promptTokens: number; outputTokens: number; seconds: number; byRole: { role: string; calls: number; seconds: number }[] }
  agents: { selfCorrectionRate: number | null; escalations: number }
}

// 실행 그래프 정적 정의
export interface WorkflowDefinition {
  version: '1'
  nodes: { id: string; label: string; actor: 'code' | 'llm' | 'human' }[]
  edges: { from: string; to: string; condition: string }[]
  limits: { maxCalls: number; maxRevisions: number; maxRunAttempts: number }
}

// 재판 생성 작업 상태
export interface JobInfo {
  id: string
  caseId: string
  instance: Instance
  status: RunStatus
  step: string
  done: number
  total: number
  error: string | null
  startedAt: string | null
  attempt?: number
  graphVersion?: '1'
  createdAt?: string
  updatedAt?: string
  events: AgentEvent[]
  partial: TrialRecord | null
}
// 실행 그래프 사건별 보기
export interface ExecutionView {
  version: '1'
  caseId: string
  instance: Instance
  mode: 'live' | 'replay' | 'not_started'
  disclosure: 'hidden' | 'open'
  phase: string
  reason: string
  steps: { id: string; label: string; actor: 'code' | 'llm' | 'human'; status: StepStatus; reason: string }[]
  edges: { from: string; to: string; condition: string }[]
  agents: { agentId: string; label: string; nodeId: string; nodeLabel: string; status: 'waiting' | 'running' | 'complete' | 'review' | 'error'; revisions: number | null }[]
  run: JobInfo | null
  controls?: Record<'start' | 'retry' | 'cancel', { allowed: boolean; reason: string }>
  availableInstances?: Instance[]
  limits: { maxCalls: number; maxRevisions: number; maxRunAttempts: number }
}
// 모델 연결 상태
export interface Health { ok: boolean; ollama: boolean; model: string }
// 기록실 묶음
export interface Records { case: Case; trials: TrialRecord[]; ledger: LedgerEntry[]; answer: Answer | null }

// 근거 온톨로지
export interface Ontology {
  version: number
  stances: Record<Stance, { label: string; meaning: string; pan: string }>
  claim_types: { id: string; label: string; stance: Stance | 'derived'; definition: string }[]
  evidence_kinds: Record<EvidenceKind, { label: string }>
  evidence_status: Record<EvidenceStatus, { label: string; factor: number }>
  actions: Record<ActionLevel, { label: string; autonomy: 'ai' | 'human_approval' | 'human_only' }>
}

// 구현 현황 기능
export interface ProgressFeature { id: string; title: string; owner: string; status: string; verify: string }
// 구현 현황 문서
export interface ProgressDoc {
  updatedAt: string
  statuses: Record<string, string>
  phases: { id: string; title: string; features: ProgressFeature[] }[]
}

// 에이전트 작업 이벤트
export interface AgentEvent {
  seq: number
  at: string
  agentId: string
  kind: 'read' | 'plan' | 'tool' | 'draft' | 'check' | 'revise' | 'submit' | 'escalate' | 'done' | 'error'
  text: string
  // 첫인상 전에 보여도 되는 중립 문구 (단계 + 문장 번호)
  publicText?: string
  claimId: string | null
  nodeId?: string
  fromNode?: string
  reason?: string
  subjectAgentId?: string
  attempt?: number
}
// 에이전트별 작업 집계
export interface AgentStat { calls: number; revisions: number; escalated: number; seconds: number }
// 자율 범위 정책
export interface Policy { summaryEnabled: boolean; summaryThreshold: number; highRiskCategories: string[] }
// 대시보드 최근 활동
export interface ActivityItem { at: string; caseId: string; kind: 'ledger' | 'agent'; text: string }
// 대시보드
export interface Dashboard {
  cases: number
  inTrial: number
  finals: number
  activeJobs: Omit<JobInfo, 'events' | 'partial'>[]
  agentsWorking: number
  kpis: { screeningAccuracy: number | null; selfCorrectionRate: number | null; escalations: number; perjuryRate: number | null; humanOverrides: number }
  recent: ActivityItem[]
}
// 작업실 에이전트 역할
export type AgentRole = 'clerk' | 'prosecution' | 'defense' | 'cross' | 'officer' | 'checker'
// 작업실 에이전트
export interface AgentProfile {
  role: AgentRole
  label: string
  room: string
  skill: string | null
  skillVersion: string | null
  totals: { tasks: number; claims: number; evidence: number; verified: number; perjury: number; revisions: number; escalations: number; seconds: number }
  working: { caseId: string; instance: Instance | 0; text: string } | null
  queued: number
}
