// 신뢰도 장부 항목 생성·복원
import type { ActionLevel, Leaning, LedgerEntry, NewLedgerEntry } from '../api/types'
import { balanceOf, checkerWeight, evidenceWeights } from './scale'
import { currentInstance, phaseOf, revealedClaims, type Records, type TrialEvent, type TrialState } from './trial'

// 이벤트가 일어나던 순간 판사에게 보인 것
function contextFor(prev: TrialState, records: Records) {
  const phase = phaseOf(prev, records)
  const i = currentInstance(prev)
  const rec = records[i]
  const scaleVisible = phase !== 'first_impression' && phase !== 'need_record'
  const balance = scaleVisible && rec ? balanceOf(evidenceWeights(revealedClaims(prev, rec), prev.rulings)) : null
  return { balance, aiRecommendationShown: i === 1 && (phase === 'seats' || phase === 'decision'), scaleVisible }
}

// 이벤트를 장부 항목으로 변환
export function entryFor(prev: TrialState, e: TrialEvent, records: Records, labSessionId: string | null = null): NewLedgerEntry {
  const base = { caseId: prev.caseId, instance: e.instance, judge: e.judge, labSessionId, context: contextFor(prev, records) }
  switch (e.type) {
    case 'first_impression':
      return { ...base, type: 'first_impression', data: { leaning: e.leaning, confidence: e.confidence } }
    case 'reveal':
      return { ...base, type: 'reveal', data: { claimId: e.claimId } }
    case 'rule': {
      const rec = records[e.instance]
      const checker = rec ? checkerWeight(revealedClaims(prev, rec), prev.rulings, e.evidenceId) : 0
      return { ...base, type: 'evidence_ruling', data: { evidenceId: e.evidenceId, ruling: e.ruling, checkerWeight: checker } }
    }
    case 'seat_verdict':
      return { ...base, type: 'seat_verdict', data: { verdict: e.verdict, confidence: e.confidence, reason: e.reason } }
    case 'appeal':
      return { ...base, type: 'appeal', data: { reason: e.reason } }
    case 'final':
      return {
        ...base,
        type: 'final',
        data: { verdict: e.verdict, action: e.action, reason: e.reason, votes: prev.instances[e.instance].seats.map((v) => ({ seat: v.seat, verdict: v.verdict })) },
      }
  }
}

// 장부 항목을 이벤트로 복원
export function eventFromEntry(en: LedgerEntry): TrialEvent | null {
  if (en.labSessionId) return null
  const d = en.data as Record<string, unknown>
  const common = { instance: en.instance, judge: en.judge }
  switch (en.type) {
    case 'first_impression':
      return { ...common, type: 'first_impression', leaning: d.leaning as Leaning, confidence: Number(d.confidence) }
    case 'reveal':
      return { ...common, type: 'reveal', claimId: String(d.claimId) }
    case 'evidence_ruling':
      return { ...common, type: 'rule', evidenceId: String(d.evidenceId), ruling: (d.ruling as 'admitted' | 'struck' | null) ?? null }
    case 'seat_verdict':
      return { ...common, type: 'seat_verdict', verdict: d.verdict as Leaning, confidence: Number(d.confidence), reason: String(d.reason) }
    case 'appeal':
      return { ...common, type: 'appeal', reason: String(d.reason) }
    case 'final':
      return { ...common, type: 'final', verdict: d.verdict as Leaning, action: d.action as ActionLevel, reason: String(d.reason) }
    default:
      return null
  }
}

// 장부 한 줄 요약 문장
export function describeEntry(en: LedgerEntry): string {
  const d = en.data as Record<string, unknown>
  // 낚시성 여부 라벨
  const lean = (v: unknown) => (v === 'clickbait' ? '낚시성' : '낚시성 아님')
  switch (en.type) {
    case 'first_impression':
      return `첫인상 ${lean(d.leaning)} (확신 ${d.confidence})`
    case 'reveal':
      return `주장 ${d.claimId} 공개`
    case 'evidence_ruling':
      return `근거 ${d.evidenceId} ${d.ruling === 'admitted' ? '채택' : d.ruling === 'struck' ? '기각' : '결정 취소'} (코드 무게 ${d.checkerWeight})`
    case 'seat_verdict':
      return `판사석 ${en.judge.seat} 판결 ${lean(d.verdict)} (확신 ${d.confidence})`
    case 'appeal':
      return `항소 · ${d.reason}`
    case 'final':
      return `최종 판결 ${lean(d.verdict)} · 조치 ${d.action}`
  }
}
