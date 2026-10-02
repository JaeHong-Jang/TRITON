// 법정 화면에서 쓰는 파생 값 계산
import { useMemo } from 'react'
import type { Claim, Evidence, Instance, TrialRecord } from '../../api/types'
import { latestActivity } from '../../lib/activity'
import { balanceOf, evidenceWeights } from '../../lib/scale'
import { currentInstance, phaseOf, revealedClaims, seatCount, type Phase } from '../../lib/trial'
import { useCourt } from './store'

// 근거를 한 줄로 요약
export function evidenceText(e: Evidence): string {
  return e.kind === 'absence' ? `부재 · '${e.keyword}'` : `#${e.sentenceNo} · ${e.quote}`
}

// 법정 화면 파생 값 훅
export function useCourtView() {
  const caseData = useCourt((s) => s.caseData)
  const state = useCourt((s) => s.state)
  const records = useCourt((s) => s.records)
  const viewing = useCourt((s) => s.viewing)
  const focus = useCourt((s) => s.focus)
  const job = useCourt((s) => s.job)
  const events = useCourt((s) => s.events)
  const started = useCourt((s) => s.started)
  const jobError = useCourt((s) => s.jobError)

  return useMemo(() => {
    if (!caseData || !state) return null
    const current = currentInstance(state)
    const phase: Phase = phaseOf(state, records)
    const viewInstance: Instance = viewing ?? current
    const rec: TrialRecord | undefined = records[viewInstance]
    const shown: Claim[] = rec ? revealedClaims(state, rec) : []
    const weights = evidenceWeights(shown, state.rulings)
    const hidden = viewInstance === 1 && !state.first
    const live = viewInstance === current
    const writing = live && state.writing === current
    const activity = writing ? latestActivity(events, true, hidden) : []
    const needStart = live && !state.final && !job && (phase === 'need_record' || (phase === 'first_impression' && !started))
    const last = live && phase === 'hearing' ? shown.at(-1) : undefined
    const focusEvidence = focus ? Object.values(records).flatMap((r) => r?.claims ?? []).flatMap((c) => c.evidence).find((e) => e.id === focus) ?? null : null
    return {
      caseData, state, records, current, phase, viewInstance, rec, shown, weights, hidden, live,
      balance: balanceOf(weights),
      seatsLit: seatCount(viewInstance),
      speakingClaim: last ?? null,
      currentSeat: live && phase === 'seats' ? state.instances[viewInstance].seats.length + 1 : null,
      focusEvidence,
      writing,
      activity,
      needStart,
      job,
      events,
      jobError,
      total: rec?.claims.length ?? 0,
    }
  }, [caseData, state, records, viewing, focus, job, events, started, jobError])
}
