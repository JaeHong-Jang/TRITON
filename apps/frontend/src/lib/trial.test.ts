// 재판 상태기계 검증
import { describe, expect, it } from 'vitest'
import type { Claim, Dashboard, Instance, Judge, Leaning, Stats, TrialRecord } from '../api/types'
import { correctionCounts, DEFS, buildTrial } from '../api/mock/fixtures'
import { handle } from '../api/mock/handlers'
import { entryFor } from './ledger'
import { autoAppeal, canRule, claimsNeedingManualReview, currentInstance, majorityOf, phaseOf, replay, rulingLockReason, startTrial, step, type Records, type TrialEvent, type TrialState } from './trial'

// 테스트용 판사
const judge = (seat: 1 | 2 | 3 = 1): Judge => ({ seat, name: '판사', soloMode: seat > 1 })
// 테스트용 주장
const claim = (id: string, status: Claim['evidence'][number]['status'] = 'verified', empty = false): Claim => ({
  id, agentId: 'p', round: 0, type: 'exaggeration', stance: 'pro', text: '주장', strength: 2, rebuts: null, revisions: empty ? 2 : 0, escalated: empty,
  evidence: empty ? [] : [{ id: `${id}-E`, kind: 'quote', stance: 'pro', sentenceNo: 1, quote: '문장', keyword: null, status, foundIn: 1 }],
})
// 테스트용 재판 기록
const record = (instance: Instance, n = 2, bad: string[] = []): TrialRecord => ({
  caseId: 'c', instance, ontologyVersion: 1, model: { name: 'm', options: {} }, createdAt: '', bench: [], rounds: [],
  claims: Array.from({ length: n }, (_, k) => {
    const id = `i${instance}-C${k + 1}`
    return claim(id, bad.includes(id) ? 'fabricated' : 'verified')
  }), screening: null, officer: null, calls: [], trace: [], agentStats: {},
})
const reason = '충분히 긴 판결 사유입니다'

// 이벤트 열 적용
function run(records: Records, events: TrialEvent[]): TrialState {
  return replay('c', events, records)
}
// 1심 변론 끝까지 듣기
const hear = (i: Instance, n = 2): TrialEvent[] => Array.from({ length: n }, (_, k) => ({ type: 'reveal', instance: i, judge: judge(), claimId: `i${i}-C${k + 1}` }))
// 판사석 판결
const seat = (i: Instance, s: 1 | 2 | 3, verdict: Leaning): TrialEvent => ({ type: 'seat_verdict', instance: i, judge: judge(s), verdict, confidence: 70, reason })
const first: TrialEvent = { type: 'first_impression', instance: 1, judge: judge(), leaning: 'clickbait', confidence: 60 }

describe('1심', () => {
  const records: Records = { 1: record(1) }

  it('AI 기록 없이도 첫인상을 저장하고 재생하며 판결은 대기한다', () => {
    expect(phaseOf(startTrial('c'), {})).toBe('first_impression')
    const s = run({}, [first])
    expect(s.first).toEqual({ leaning: 'clickbait', confidence: 60 })
    expect(phaseOf(s, {})).toBe('need_record')
    expect(step(s, seat(1, 1, 'clickbait'), {})).toBe(s)
    expect(step(s, first, {})).toBe(s)
    expect(phaseOf(s, records)).toBe('hearing')
  })

  it('첫인상 전에는 변론을 들을 수 없다', () => {
    expect(phaseOf(run(records, hear(1)), records)).toBe('first_impression')
  })

  it('변론은 순서대로만 공개된다', () => {
    const s = run(records, [first, { type: 'reveal', instance: 1, judge: judge(), claimId: 'i1-C2' }])
    expect(s.instances[1].revealed).toEqual([])
  })

  it('끝까지 들으면 판결 단계가 된다', () => {
    expect(phaseOf(run(records, [first, ...hear(1)]), records)).toBe('seats')
  })

  it('사유가 짧으면 판결이 거부된다', () => {
    const bad: TrialEvent = { type: 'seat_verdict', instance: 1, judge: judge(), verdict: 'clickbait', confidence: 70, reason: '짧음' }
    expect(phaseOf(run(records, [first, ...hear(1), bad]), records)).toBe('seats')
  })

  it('판결 후 확정하면 최종 상태가 된다', () => {
    const s = run(records, [first, ...hear(1), seat(1, 1, 'clickbait'), { type: 'final', instance: 1, judge: judge(), verdict: 'clickbait', action: 'L1', reason }])
    expect(phaseOf(s, records)).toBe('final')
    expect(s.final?.votes).toEqual([{ seat: 1, verdict: 'clickbait' }])
  })

  it('항소하면 2심 기록이 있어야 진행된다', () => {
    const s = run(records, [first, ...hear(1), seat(1, 1, 'clickbait'), { type: 'appeal', instance: 1, judge: judge(), reason }])
    expect(currentInstance(s)).toBe(2)
    expect(phaseOf(s, records)).toBe('need_record')
    expect(phaseOf(s, { ...records, 2: record(2) })).toBe('hearing')
  })

  it('판사 근거 결정은 공개된 근거에만 적용된다', () => {
    // 테스트용 근거 결정 이벤트
    const e = (id: string): TrialEvent => ({ type: 'rule', instance: 1, judge: judge(), evidenceId: id, ruling: 'struck' })
    const s = run(records, [first, ...hear(1).slice(0, 1), e('i1-C1-E'), e('i1-C2-E')])
    expect(s.rulings).toEqual({ 'i1-C1-E': 'struck' })
  })

  it('첫 판사석 판결 뒤에는 근거 채택과 기각 및 취소가 잠긴다', () => {
    const heard = run(records, [first, ...hear(1)])
    expect(canRule(heard, records)).toBe(true)
    expect(rulingLockReason(heard)).toBeNull()
    const ruled = step(heard, { type: 'rule', instance: 1, judge: judge(), evidenceId: 'i1-C1-E', ruling: 'struck' }, records)
    const decided = step(ruled, seat(1, 1, 'clickbait'), records)
    expect(phaseOf(decided, records)).toBe('decision')
    expect(canRule(decided, records)).toBe(false)
    expect(rulingLockReason(decided)).toBe('판사석 판결 뒤에는 근거 판정을 바꿀 수 없습니다')
    for (const ruling of ['admitted', 'struck', null] as const) {
      expect(step(decided, { type: 'rule', instance: 1, judge: judge(), evidenceId: 'i1-C1-E', ruling }, records)).toBe(decided)
    }
  })

  it('첫인상 전과 재판 기록 대기 및 최종 확정 뒤에는 근거 판정이 불가하다', () => {
    expect(canRule(startTrial('c'), records)).toBe(false)
    expect(canRule(run({}, [first]), {})).toBe(false)
    const final = run(records, [first, ...hear(1), seat(1, 1, 'clickbait'), { type: 'final', instance: 1, judge: judge(), verdict: 'clickbait', action: 'L1', reason }])
    expect(canRule(final, records)).toBe(false)
  })

  it('검증 실패 근거를 명시적으로 판정해야 판결 단계로 간다', () => {
    const recs: Records = { 1: record(1, 2, ['i1-C2']) }
    const heard = run(recs, [first, ...hear(1)])
    expect(phaseOf(heard, recs)).toBe('review')
    const ruled = step(heard, { type: 'rule', instance: 1, judge: judge(), evidenceId: 'i1-C2-E', ruling: 'struck' }, recs)
    expect(phaseOf(ruled, recs)).toBe('seats')
  })

  it('빈 주장으로 사람에게 넘어간 역할은 별도 검토 대상으로 표시된다', () => {
    const rec = record(1)
    rec.claims[1] = claim('i1-C2', 'verified', true)
    expect(claimsNeedingManualReview(rec).map((c) => c.id)).toEqual(['i1-C2'])
    expect(phaseOf(run({ 1: rec }, [first, ...hear(1)]), { 1: rec })).toBe('seats')
  })
})

describe('2심·3심', () => {
  const records: Records = { 1: record(1), 2: record(2), 3: record(3) }
  const toSecond: TrialEvent[] = [first, ...hear(1), seat(1, 1, 'clickbait'), { type: 'appeal', instance: 1, judge: judge(), reason }, ...hear(2)]

  it('2심은 판사석 2개가 모두 판결해야 결정 단계다', () => {
    expect(phaseOf(run(records, [...toSecond, seat(2, 1, 'clickbait')]), records)).toBe('seats')
    expect(phaseOf(run(records, [...toSecond, seat(2, 1, 'clickbait'), seat(2, 2, 'clickbait')]), records)).toBe('decision')
  })

  it('하급심 판결은 새 심급 근거 판정을 잠그지 않고 현재 심급의 첫 판결부터 잠긴다', () => {
    const heard = run(records, toSecond)
    expect(canRule(heard, records)).toBe(true)
    expect(rulingLockReason(heard)).toBeNull()
    const decided = step(heard, seat(2, 1, 'clickbait'), records)
    expect(phaseOf(decided, records)).toBe('seats')
    expect(canRule(decided, records)).toBe(false)
    expect(step(decided, { type: 'rule', instance: 2, judge: judge(), evidenceId: 'i2-C1-E', ruling: 'struck' }, records)).toBe(decided)
  })

  it('판사석 순서를 건너뛸 수 없다', () => {
    expect(run(records, [...toSecond, seat(2, 2, 'clickbait')]).instances[2].seats).toEqual([])
  })

  it('2심 불일치는 확정할 수 없고 3심으로 자동 회부된다', () => {
    const s = run(records, [...toSecond, seat(2, 1, 'clickbait'), seat(2, 2, 'not_clickbait')])
    expect(run(records, [...toSecond, seat(2, 1, 'clickbait'), seat(2, 2, 'not_clickbait'), { type: 'final', instance: 2, judge: judge(), verdict: 'clickbait', action: 'L0', reason }]).final).toBeNull()
    const auto = autoAppeal(s, records)
    expect(auto?.type).toBe('appeal')
    expect(currentInstance(step(s, auto!, records))).toBe(3)
  })

  it('3심은 다수결로 최종 판결한다', () => {
    const toThird: TrialEvent[] = [...toSecond, seat(2, 1, 'clickbait'), seat(2, 2, 'not_clickbait'), { type: 'appeal', instance: 2, judge: judge(), reason }, ...hear(3)]
    const votes = [seat(3, 1, 'clickbait'), seat(3, 2, 'not_clickbait'), seat(3, 3, 'not_clickbait')]
    const wrong: TrialEvent = { type: 'final', instance: 3, judge: judge(), verdict: 'clickbait', action: 'L2', reason }
    const right: TrialEvent = { ...wrong, verdict: 'not_clickbait' }
    expect(run(records, [...toThird, ...votes, wrong]).final).toBeNull()
    expect(run(records, [...toThird, ...votes, right]).final).toMatchObject({ verdict: 'not_clickbait', action: 'L2' })
  })

  it('3심에서는 항소할 수 없다', () => {
    const toThird: TrialEvent[] = [...toSecond, seat(2, 1, 'clickbait'), seat(2, 2, 'not_clickbait'), { type: 'appeal', instance: 2, judge: judge(), reason }, ...hear(3)]
    const s = run(records, [...toThird, seat(3, 1, 'clickbait'), seat(3, 2, 'clickbait'), seat(3, 3, 'clickbait'), { type: 'appeal', instance: 3, judge: judge(), reason }])
    expect(s.instances[3].appeal).toBeNull()
  })
})

describe('작성 중인 심급', () => {
  const records: Records = { 1: record(1) }

  it('작성 중이면 모두 공개해도 판결 단계로 넘어가지 않는다', () => {
    const s = { ...run(records, [first, ...hear(1)]), writing: 1 as Instance }
    expect(phaseOf(s, records)).toBe('hearing')
    expect(phaseOf({ ...s, writing: null }, records)).toBe('seats')
  })

  it('작성 중에는 판결을 기록할 수 없다', () => {
    const s = { ...run(records, [first, ...hear(1)]), writing: 1 as Instance }
    expect(step(s, seat(1, 1, 'clickbait'), records)).toBe(s)
  })
})

describe('majorityOf', () => {
  it('동수면 null이다', () => {
    expect(majorityOf([{ verdict: 'clickbait' }, { verdict: 'not_clickbait' }])).toBeNull()
  })
})

describe('entryFor', () => {
  const records: Records = { 1: record(1) }

  it('첫인상 항목은 천칭 정보 없이 기록된다', () => {
    const en = entryFor(startTrial('c'), first, records)
    expect(en).toMatchObject({ type: 'first_impression', context: { balance: null, scaleVisible: false, aiRecommendationShown: false } })
  })

  it('판결 단계에서는 AI 권고가 보였다고 기록된다', () => {
    const s = run(records, [first, ...hear(1)])
    const en = entryFor(s, seat(1, 1, 'clickbait'), records)
    expect(en.context).toMatchObject({ aiRecommendationShown: true, scaleVisible: true })
    expect(en.context.balance?.pro).toBe(4)
  })

  it('근거 결정에는 코드 무게가 함께 남는다', () => {
    const s = run(records, [first, ...hear(1)])
    const en = entryFor(s, { type: 'rule', instance: 1, judge: judge(), evidenceId: 'i1-C1-E', ruling: 'struck' }, records)
    expect(en.data).toEqual({ evidenceId: 'i1-C1-E', ruling: 'struck', checkerWeight: 2 })
  })
})

describe('모의 통계 계약', () => {
  it('실패 호출 수와 분야별 재현율의 표본 수를 반환한다', async () => {
    const stats = await handle('GET', '/stats', undefined) as Stats
    expect(stats.cost.failedCalls).toBe(0)
    expect(stats.cost.failedCalls).toBeLessThanOrEqual(stats.cost.calls)
    expect(stats.cost.byRole.reduce((n, r) => n + r.calls, 0)).toBe(stats.cost.calls)
    expect(stats.byCategory.map((c) => c.screeningSample)).toEqual([9, 8, 10, 7, 0])
    for (const c of stats.byCategory) {
      expect(c.screeningSample).toBeLessThanOrEqual(c.cases)
      expect(c.screeningRecall === null).toBe(c.screeningSample === 0)
    }
  })

  it('대시보드 표본은 확정 사건과 공개된 근거 및 초안 실패 근거를 따른다', async () => {
    const initial = await handle('GET', '/dashboard', undefined) as Dashboard
    expect(initial.kpis.samples).toEqual({ screening: 0, selfCorrection: 0, perjury: 0 })
    expect(initial.kpis.selfCorrectionRate).toBeNull()
    const def = DEFS.find((d) => d.case.id === 'mock-002')!
    const rec = buildTrial(def, 1, [])
    const { firstFailed, fixed } = correctionCounts(rec.claims)
    expect({ firstFailed, fixed }).toEqual({ firstFailed: 2, fixed: 1 })
    const evidence = rec.claims.flatMap((c) => c.evidence)
    const base = { caseId: def.case.id, instance: 1, judge: judge(), labSessionId: null, context: { balance: null, aiRecommendationShown: false, scaleVisible: false } }
    await handle('POST', '/ledger', { ...base, type: 'first_impression', data: { leaning: 'not_clickbait', confidence: 70 } })
    const open = await handle('GET', '/dashboard', undefined) as Dashboard
    expect(open.kpis.samples).toEqual({ screening: 0, selfCorrection: firstFailed, perjury: evidence.length })
    expect(open.kpis.selfCorrectionRate).toBe(fixed / firstFailed)
    expect(open.kpis.perjuryRate).toBe(evidence.filter((e) => e.status === 'fabricated').length / evidence.length)
    await handle('POST', '/ledger', { ...base, type: 'final', data: { verdict: 'not_clickbait', action: 'L0', reason } })
    const final = await handle('GET', '/dashboard', undefined) as Dashboard
    expect(final.kpis.samples).toEqual({ ...open.kpis.samples, screening: 1 })
    expect(final.kpis.screeningAccuracy).toBe(1)
  })
})
