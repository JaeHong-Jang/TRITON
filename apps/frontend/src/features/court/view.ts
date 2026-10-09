// 법정 화면에서 쓰는 파생 값 계산
import { useMemo } from 'react'
import type { Claim, Evidence, Instance, JobInfo, TrialRecord } from '../../api/types'
import { latestActivity } from '../../lib/activity'
import { balanceOf, evidenceWeights } from '../../lib/scale'
import { canRule, currentInstance, phaseOf, revealedClaims, rulingLockReason, seatCount, type Phase, type Records, type TrialState } from '../../lib/trial'
import { useCourt } from './store'

// 근거를 한 줄로 요약
export function evidenceText(e: Evidence): string {
  return e.kind === 'absence' ? `부재 · '${e.keyword}'` : `#${e.sentenceNo} · ${e.quote}`
}


// 작업 상태까지 반영한 법정 단계
export function courtPhase(state: TrialState, records: Records, job: JobInfo | null): Phase {
  const base = phaseOf(state, records)
  const unfinishedJob = !!job && job.status !== 'done'
  return unfinishedJob && base !== 'need_record' && base !== 'first_impression' ? 'hearing' : base
}

// 보고 있는 심급의 근거 판정 허용 상태
export function courtRulingGuard(state: TrialState, records: Records, viewInstance: Instance) {
  return { canRule: viewInstance === currentInstance(state) && canRule(state, records), rulingLockReason: rulingLockReason(state, viewInstance) }
}

// 법정 화면 파생 값 훅
export function useCourtView() {
  const caseData = useCourt((s) => s.caseData)
  const state = useCourt((s) => s.state)
  const records = useCourt((s) => s.records)
  const viewing = useCourt((s) => s.viewing)
  const focus = useCourt((s) => s.focus)
  const job = useCourt((s) => s.job)
  const execution = useCourt((s) => s.execution)
  const workflow = useCourt((s) => s.workflow)
  const controlBusy = useCourt((s) => s.controlBusy)
  const events = useCourt((s) => s.events)
  const started = useCourt((s) => s.started)
  const jobError = useCourt((s) => s.jobError)

  return useMemo(() => {
    if (!caseData || !state) return null
    const current = currentInstance(state)
    const unfinishedJob = !!job && job.status !== 'done'
    const phase = courtPhase(state, records, job)
    const viewInstance: Instance = viewing ?? current
    const rec: TrialRecord | undefined = records[viewInstance]
    const shown: Claim[] = rec ? revealedClaims(state, rec) : []
    const weights = evidenceWeights(shown, state.rulings)
    const hidden = viewInstance === 1 && !state.first
    const live = viewInstance === current
    const writing = live && state.writing === current
    const activity = writing ? latestActivity(events, true, hidden) : []
    const mockManual = import.meta.env.VITE_MOCK === '1' && caseData.origin === 'manual'
    const needStart = !mockManual && live && !state.final && (!job || (!job.id && job.status === 'error')) && (phase === 'need_record' || (phase === 'first_impression' && !started))
    const pendingRulings = shown.flatMap((c) => c.evidence).filter((e) => e.status !== 'verified' && !state.rulings[e.id]).map((e) => e.id)
    const last = live && phase === 'hearing' ? shown.at(-1) : undefined
    const focusEvidence = focus ? Object.values(records).flatMap((r) => r?.claims ?? []).flatMap((c) => c.evidence).find((e) => e.id === focus) ?? null : null
    return {
      caseData, state, records, current, phase, viewInstance, rec, shown, weights, hidden, live,
      ...courtRulingGuard(state, records, viewInstance),
      balance: balanceOf(weights),
      seatsLit: seatCount(viewInstance),
      speakingClaim: last ?? null,
      currentSeat: live && phase === 'seats' ? state.instances[viewInstance].seats.length + 1 : null,
      focusEvidence,
      pendingRulings,
      writing,
      activity,
      needStart, mockManual,
      job,
      unfinishedJob,
      execution,
      workflow,
      controlBusy,
      events,
      jobError,
      total: rec?.claims.length ?? 0,
    }
  }, [caseData, state, records, viewing, focus, job, execution, workflow, controlBusy, events, started, jobError])
}
