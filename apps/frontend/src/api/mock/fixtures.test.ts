// 모의 에이전트 루프 기록의 일관성 검증
import { describe, expect, it } from 'vitest'
import type { Instance, TrialRecord } from '../types'
import { buildTrial, DEFS } from './fixtures'

// 심급 1~3 기록을 순서대로 만들기
function records(def: (typeof DEFS)[number]): TrialRecord[] {
  const out: TrialRecord[] = []
  for (const i of [1, 2, 3] as Instance[]) out.push(buildTrial(def, i, out, '2026-01-01T00:00:00.000Z'))
  return out
}

describe('buildTrial', () => {
  it('제출 이벤트 순서가 주장 순서와 같아 중간 기록이 항상 앞부분이다', () => {
    for (const def of DEFS) {
      for (const rec of records(def)) {
        const submitted = rec.trace.filter((e) => (e.kind === 'submit' || e.kind === 'escalate') && e.claimId).map((e) => e.claimId)
        expect(submitted).toEqual(rec.claims.map((c) => c.id))
      }
    }
  })

  it('이벤트 번호와 시각은 늘어나기만 한다', () => {
    for (const def of DEFS) {
      for (const rec of records(def)) {
        rec.trace.forEach((e, k) => {
          expect(e.seq).toBe(k + 1)
          if (k) expect(Date.parse(e.at)).toBeGreaterThanOrEqual(Date.parse(rec.trace[k - 1].at))
        })
      }
    }
  })

  it('근거가 끝내 검증되지 않은 주장만 에스컬레이션되고 두 번 고쳐 쓴다', () => {
    for (const def of DEFS) {
      for (const rec of records(def)) {
        for (const c of rec.claims) {
          const unresolved = c.evidence.some((e) => e.status !== 'verified')
          expect(c.escalated).toBe(unresolved)
          if (unresolved) expect(c.revisions).toBe(2)
        }
        const total = Object.values(rec.agentStats).reduce((n, s) => n + s.escalated, 0)
        expect(total).toBe(rec.claims.filter((c) => c.escalated).length)
      }
    }
  })
})
