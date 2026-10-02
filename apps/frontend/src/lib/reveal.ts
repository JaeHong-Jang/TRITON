// 주장 자동 공개 일정과 심급 탭·단계 칩 논리
import type { Instance, TrialRecord } from '../api/types'
import { currentInstance, phaseOf, replay, type Records, type TrialEvent, type TrialState } from './trial'

// 주장 하나당 공개 간격 (밀리초)
export const REVEAL_MS = 1200
// 첫 주장 공개까지 대기 (밀리초)
export const FIRST_REVEAL_MS = 800
// 건너뛰기 중 공개 간격 (밀리초)
export const SKIP_REVEAL_MS = 40

// 다음 공개까지 기다릴 시간
export function revealDelay(revealedCount: number, skipping: boolean): number {
  if (skipping) return SKIP_REVEAL_MS
  return revealedCount === 0 ? FIRST_REVEAL_MS : REVEAL_MS
}

// 자동 공개를 지금 해도 되는지 (기록 중·오류·지난 심급 보는 중·판사 이름 없음이면 멈춤)
export function canAutoReveal(c: { busy: boolean; error: string | null; viewing: Instance | null; judgeName: string }): boolean {
  return !c.busy && !c.error && c.viewing === null && c.judgeName.trim().length > 0
}

// 지금 공개할 다음 주장 id (공개 단계가 아니면 없음)
export function nextRevealId(s: TrialState, records: Records): string | null {
  if (phaseOf(s, records) !== 'hearing') return null
  const i = currentInstance(s)
  return records[i]?.claims[s.instances[i].revealed.length]?.id ?? null
}

// 최종 기록으로 바뀔 때 이미 공개한 순서를 앞에 유지
export function keepRevealOrder(rec: TrialRecord, revealed: string[]): TrialRecord {
  const byId = new Map(rec.claims.map((c) => [c.id, c]))
  const head = revealed.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  const seen = new Set(head.map((c) => c.id))
  return { ...rec, claims: [...head, ...rec.claims.filter((c) => !seen.has(c.id))] }
}

// 장부의 공개 순서를 기록 앞에 맞춰 두고 이벤트로 상태 복원 (작성 중인 중간 기록에도 사용)
export function replayLedger(caseId: string, events: TrialEvent[], records: Records): TrialState {
  const ordered: Records = {}
  for (const key of Object.keys(records)) {
    const n = Number(key) as Instance
    const rec = records[n]
    if (!rec) continue
    const ids = [...new Set(events.flatMap((e) => (e.type === 'reveal' && e.instance === n ? [e.claimId] : [])))]
    ordered[n] = ids.length ? keepRevealOrder(rec, ids) : rec
  }
  return replay(caseId, events, ordered)
}

// 심급 탭 표시 정보
export interface TabInfo { instance: Instance; status: 'done' | 'current' | 'next'; viewable: boolean; note: string | null }

// 열리지 않은 심급의 안내 문구
function lockedNote(s: TrialState, i: Instance, current: Instance): string {
  if (s.final) return `이 사건은 ${currentInstance(s)}심에서 확정되어 ${i}심은 열리지 않았습니다.`
  if (i === current) return `아래 「${i}심 시작」을 누르면 AI 에이전트가 변론을 준비하고 ${i}심이 열립니다.`
  if (i === 2) return '1심 판결 단계에서 「2심으로 항소」를 누르면 열립니다.'
  return current === 1 ? '2심을 거쳐야 열립니다. 2심 판사석 의견이 갈리거나 2심에서 항소하면 3심이 열립니다.' : '2심 판사석 의견이 갈리거나 2심에서 「3심으로 항소」하면 자동으로 열립니다.'
}

// 심급 탭 세 개의 상태 계산
export function tabsOf(s: TrialState, records: Records): TabInfo[] {
  const current = currentInstance(s)
  return ([1, 2, 3] as Instance[]).map((i) => {
    const status = i < current || (i === current && s.final !== null) ? 'done' : i === current ? 'current' : 'next'
    const viewable = !!records[i]
    return { instance: i, status, viewable, note: viewable ? null : lockedNote(s, i, current) }
  })
}

// 오른쪽 패널 구역 id
export type SectionId = 'sec-first' | 'sec-claims' | 'sec-verdict'

// 판사 단계 코드가 가리키는 구역
export function sectionOf(code: string): SectionId {
  if (code === 'H1') return 'sec-first'
  if (code === 'H2') return 'sec-claims'
  return 'sec-verdict'
}

// 작업을 막 시작했을 때 쓰는 빈 재판 기록
export function emptyRecord(caseId: string, instance: Instance): TrialRecord {
  return {
    caseId, instance, ontologyVersion: 0, model: { name: '', options: {} }, createdAt: '', bench: [], rounds: [],
    claims: [], screening: null, officer: null, calls: [], trace: [], agentStats: {},
  }
}
