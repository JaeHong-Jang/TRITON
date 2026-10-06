// 1심·2심·3심 재판 진행 상태기계
import type { ActionLevel, AgentEvent, Claim, Instance, Judge, Leaning, Ruling, TrialRecord } from '../api/types'

// 판결·사유 최소 글자 수
export const MIN_REASON = 10

// 심급 진행 단계
export type Phase = 'first_impression' | 'hearing' | 'review' | 'seats' | 'decision' | 'need_record' | 'final'
// 심급별 재판 기록
export type Records = Partial<Record<Instance, TrialRecord>>

// 판사석 판결
export interface SeatVerdict { seat: 1 | 2 | 3; judge: string; soloMode: boolean; verdict: Leaning; confidence: number; reason: string }
// 심급 진행 상태
export interface InstanceState { revealed: string[]; seats: SeatVerdict[]; appeal: string | null }
// 최종 판결
export interface FinalState { verdict: Leaning; action: ActionLevel; reason: string; votes: { seat: number; verdict: Leaning }[] }
// 재판 전체 상태
export interface TrialState {
  caseId: string
  first: { leaning: Leaning; confidence: number } | null
  rulings: Record<string, Ruling>
  instances: Record<Instance, InstanceState>
  final: FinalState | null
  writing: Instance | null
}

// 판사 행동 이벤트
export type TrialEvent =
  | { type: 'first_impression'; instance: Instance; judge: Judge; leaning: Leaning; confidence: number }
  | { type: 'reveal'; instance: Instance; judge: Judge; claimId: string }
  | { type: 'rule'; instance: Instance; judge: Judge; evidenceId: string; ruling: Ruling | null }
  | { type: 'seat_verdict'; instance: Instance; judge: Judge; verdict: Leaning; confidence: number; reason: string }
  | { type: 'appeal'; instance: Instance; judge: Judge; reason: string }
  | { type: 'final'; instance: Instance; judge: Judge; verdict: Leaning; action: ActionLevel; reason: string }

// 새 사건의 초기 상태
export function startTrial(caseId: string): TrialState {
  // 빈 심급 상태
  const blank = (): InstanceState => ({ revealed: [], seats: [], appeal: null })
  return { caseId, first: null, rulings: {}, instances: { 1: blank(), 2: blank(), 3: blank() }, final: null, writing: null }
}

// 지금 진행 중인 심급
export function currentInstance(s: TrialState): Instance {
  if (s.instances[1].appeal === null) return 1
  return s.instances[2].appeal === null ? 2 : 3
}

// 심급별 판사석 수
export const seatCount = (i: Instance) => i

// 판사석 다수결 결과
export function majorityOf(seats: { verdict: Leaning }[]): Leaning | null {
  const pro = seats.filter((v) => v.verdict === 'clickbait').length
  const con = seats.length - pro
  if (pro === con) return null
  return pro > con ? 'clickbait' : 'not_clickbait'
}

// 현재 화면 단계 계산
export function phaseOf(s: TrialState, records: Records): Phase {
  if (s.final) return 'final'
  const i = currentInstance(s)
  const rec = records[i]
  if (i === 1 && !s.first) return 'first_impression'
  if (!rec) return 'need_record'
  const inst = s.instances[i]
  if (inst.revealed.length < rec.claims.length || s.writing === i) return 'hearing'
  if (!reviewedFailedEvidence(s, rec)) return 'review'
  return inst.seats.length < seatCount(i) ? 'seats' : 'decision'
}

// 현재 심급에서 공개된 주장 목록
export function revealedClaims(s: TrialState, rec: TrialRecord): Claim[] {
  const ids = s.instances[rec.instance].revealed
  return rec.claims.filter((c) => ids.includes(c.id))
}

// 판결 전 명시 판정이 필요한 실패 근거 id 목록
export function failedEvidenceIds(rec: TrialRecord): string[] {
  return rec.claims.flatMap((c) => c.evidence.filter((e) => e.status !== 'verified').map((e) => e.id))
}

// 빈 주장으로 사람 검토가 필요한 주장 목록
export function claimsNeedingManualReview(rec: TrialRecord): Claim[] {
  return rec.claims.filter((c) => c.escalated && c.evidence.length === 0)
}

// 주장 없이 사람 검토로 넘어간 에이전트 목록
export function agentsNeedingManualReview(rec: TrialRecord): { agentId: string; label: string }[] {
  const fromClaims = new Set(claimsNeedingManualReview(rec).map((c) => c.agentId))
  const byId = new Map(rec.bench.map((a) => [a.id, a.name]))
  const ids = new Set<string>()
  for (const [agentId, st] of Object.entries(rec.agentStats)) if (st.escalated > 0 && !fromClaims.has(agentId)) ids.add(agentId)
  for (const e of rec.trace as AgentEvent[]) if (e.kind === 'escalate' && !e.claimId && e.agentId && !fromClaims.has(e.agentId)) ids.add(e.agentId)
  return [...ids].map((agentId) => ({ agentId, label: byId.get(agentId) ?? agentId }))
}

// 실패 근거를 모두 판정했는지 여부
export function reviewedFailedEvidence(s: TrialState, rec: TrialRecord): boolean {
  return failedEvidenceIds(rec).every((id) => !!s.rulings[id])
}

// 판사석 의견이 갈렸는지 여부
export function seatsDisagree(s: TrialState, i: Instance): boolean {
  const seats = s.instances[i].seats
  return seats.length === seatCount(i) && seats.length > 1 && new Set(seats.map((v) => v.verdict)).size > 1
}

// 2심 판사석 불일치 시 자동 항소 사건
export function autoAppeal(s: TrialState, records: Records): TrialEvent | null {
  if (phaseOf(s, records) !== 'decision' || currentInstance(s) !== 2 || !seatsDisagree(s, 2)) return null
  const name = s.instances[2].seats[0]?.judge ?? ''
  return { type: 'appeal', instance: 2, judge: { seat: 1, name, soloMode: s.instances[2].seats[0]?.soloMode ?? false }, reason: '판사석 의견 불일치로 3심 자동 회부' }
}

// 판사 행동 하나 적용
export function step(s: TrialState, e: TrialEvent, records: Records): TrialState {
  const i = currentInstance(s)
  const rec = records[i]
  const phase = phaseOf(s, records)
  if (e.instance !== i) return s
  if (e.type === 'first_impression') {
    if (phase !== 'first_impression' || !Number.isFinite(e.confidence) || e.confidence < 0 || e.confidence > 100) return s
    return { ...s, first: { leaning: e.leaning, confidence: e.confidence } }
  }
  if (!rec) return s
  const inst = s.instances[i]
  // 현재 심급 상태 갱신
  const withInst = (patch: Partial<InstanceState>): TrialState => ({ ...s, instances: { ...s.instances, [i]: { ...inst, ...patch } } })
  // 확신도 범위 검사
  const validConfidence = (c: number) => Number.isFinite(c) && c >= 0 && c <= 100

  switch (e.type) {
    case 'reveal':
      if (phase !== 'hearing' || rec.claims[inst.revealed.length]?.id !== e.claimId) return s
      return withInst({ revealed: [...inst.revealed, e.claimId] })
    case 'rule': {
      if (phase === 'first_impression' || phase === 'need_record' || phase === 'final') return s
      const owned = revealedClaims(s, rec).some((c) => c.evidence.some((ev) => ev.id === e.evidenceId))
      if (!owned || (s.rulings[e.evidenceId] ?? null) === e.ruling) return s
      const rulings = { ...s.rulings }
      if (e.ruling) rulings[e.evidenceId] = e.ruling
      else delete rulings[e.evidenceId]
      return { ...s, rulings }
    }
    case 'seat_verdict':
      if (phase !== 'seats' || e.judge.seat !== inst.seats.length + 1 || !validConfidence(e.confidence) || e.reason.trim().length < MIN_REASON) return s
      return withInst({ seats: [...inst.seats, { seat: e.judge.seat, judge: e.judge.name, soloMode: e.judge.soloMode, verdict: e.verdict, confidence: e.confidence, reason: e.reason.trim() }] })
    case 'appeal':
      if (phase !== 'decision' || i === 3 || e.reason.trim().length < MIN_REASON) return s
      return withInst({ appeal: e.reason.trim() })
    case 'final': {
      const majority = majorityOf(inst.seats)
      if (phase !== 'decision' || majority === null || e.verdict !== majority || e.reason.trim().length < MIN_REASON) return s
      return { ...s, final: { verdict: majority, action: e.action, reason: e.reason.trim(), votes: inst.seats.map((v) => ({ seat: v.seat, verdict: v.verdict })) } }
    }
  }
}

// 이벤트 목록으로 상태 복원
export function replay(caseId: string, events: TrialEvent[], records: Records): TrialState {
  return events.reduce((s, e) => step(s, e, records), startTrial(caseId))
}

// 판사 단계 표시 정보
export interface StepInfo { code: string; label: string }

// 심급별 판사 단계 목록
export function stepsFor(i: Instance): StepInfo[] {
  const hearing = { code: 'H2', label: '변론 듣기' }
  if (i === 1) return [{ code: 'H1', label: '첫인상' }, hearing, { code: 'H3', label: '판결' }]
  return [hearing, i === 2 ? { code: 'H4', label: '합의 판결' } : { code: 'H5', label: '판결·조치' }]
}

// 현재 판사 단계 코드
export function currentStepCode(phase: Phase, i: Instance): string | null {
  if (phase === 'first_impression') return 'H1'
  if (phase === 'hearing' || phase === 'review') return 'H2'
  if (phase === 'seats' || phase === 'decision') return i === 1 ? 'H3' : i === 2 ? 'H4' : 'H5'
  return null
}
