// 관제 스냅샷의 사건 일치와 공개 범위 판정
import type { ExecutionView, Instance, Records, TrialRecord } from '../api/types'

// 선택한 사건과 심급의 공개 기록 추출
export function controlRecord(caseId: string, instance: Instance, view: ExecutionView, records: Records): TrialRecord | null {
  if (view.caseId !== caseId || view.instance !== instance || records.case.id !== caseId) throw new Error('선택한 사건과 응답이 달라 다시 불러옵니다.')
  if (view.disclosure !== 'open') return null
  const partial = view.run?.partial
  const saved = records.trials.find((r) => r.caseId === caseId && r.instance === instance)
  const candidate = view.run && view.run.status !== 'done' ? partial : saved ?? partial
  return candidate?.caseId === caseId && candidate.instance === instance ? candidate : null
}

// 사건 내부 경로의 쿼리 보존
export function controlUrl(caseId: string, instance: Instance, mode?: string): string {
  const params = new URLSearchParams({ caseId, instance: String(instance) })
  if (mode) params.set('view', mode)
  return `/agents?${params}`
}
