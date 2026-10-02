// 자동 공개 일정·심급 탭·단계 칩 논리 검증
import { describe, expect, it } from 'vitest'
import type { AgentEvent, Claim, Instance, Judge, TrialRecord } from '../api/types'
import { latestActivity, lastSeq, mergeEvents } from './activity'
import { FIRST_REVEAL_MS, REVEAL_MS, SKIP_REVEAL_MS, canAutoReveal, keepRevealOrder, nextRevealId, replayLedger, revealDelay, sectionOf, tabsOf } from './reveal'
import { phaseOf, replay, startTrial, type Records, type TrialEvent } from './trial'

// 테스트용 판사
const judge: Judge = { seat: 1, name: '판사', soloMode: false }
// 테스트용 주장
const claim = (id: string): Claim => ({
  id, agentId: 'p', round: 0, type: 'exaggeration', stance: 'pro', text: '주장', strength: 2, rebuts: null, revisions: 0, escalated: false, evidence: [],
})
// 테스트용 재판 기록
const record = (instance: Instance, ids: string[]): TrialRecord => ({
  caseId: 'c', instance, ontologyVersion: 1, model: { name: 'm', options: {} }, createdAt: '', bench: [], rounds: [],
  claims: ids.map(claim), screening: null, officer: null, calls: [], trace: [], agentStats: {},
})
const first: TrialEvent = { type: 'first_impression', instance: 1, judge, leaning: 'clickbait', confidence: 60 }
// 테스트용 이벤트
const ev = (seq: number, agentId: string, kind: AgentEvent['kind'], text = '문구'): AgentEvent => ({ seq, at: '', agentId, kind, text, claimId: null })

describe('revealDelay', () => {
  it('첫 주장은 짧게, 이후는 1.2초, 건너뛰기는 거의 즉시', () => {
    expect(revealDelay(0, false)).toBe(FIRST_REVEAL_MS)
    expect(revealDelay(3, false)).toBe(REVEAL_MS)
    expect(revealDelay(3, true)).toBe(SKIP_REVEAL_MS)
  })
})

describe('nextRevealId', () => {
  const records: Records = { 1: record(1, ['a', 'b']) }

  it('첫인상 전에는 공개할 주장이 없다', () => {
    expect(nextRevealId(startTrial('c'), records)).toBeNull()
  })

  it('첫인상 뒤에는 차례대로 하나씩 나온다', () => {
    const s = replay('c', [first], records)
    expect(nextRevealId(s, records)).toBe('a')
    const s2 = replay('c', [first, { type: 'reveal', instance: 1, judge, claimId: 'a' }], records)
    expect(nextRevealId(s2, records)).toBe('b')
  })

  it('모두 공개하면 더 나올 것이 없고, 작성 중이면 새 주장을 기다린다', () => {
    const all = replay('c', [first, { type: 'reveal', instance: 1, judge, claimId: 'a' }, { type: 'reveal', instance: 1, judge, claimId: 'b' }], records)
    expect(nextRevealId(all, records)).toBeNull()
    const grown: Records = { 1: record(1, ['a', 'b', 'c']) }
    expect(nextRevealId({ ...all, writing: 1 }, grown)).toBe('c')
  })
})

describe('keepRevealOrder', () => {
  it('이미 공개한 주장은 최종 기록에서도 앞에 남는다', () => {
    const merged = keepRevealOrder(record(1, ['c', 'a', 'b']), ['a', 'b'])
    expect(merged.claims.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('tabsOf', () => {
  it('1심만 있을 때 2심·3심은 열리는 조건을 안내한다', () => {
    const tabs = tabsOf(startTrial('c'), { 1: record(1, ['a']) })
    expect(tabs.map((t) => [t.status, t.viewable])).toEqual([['current', true], ['next', false], ['next', false]])
    expect(tabs[1].note).toContain('2심으로 항소')
    expect(tabs[2].note).toContain('2심')
  })

  it('항소 후 2심 기록이 생기면 볼 수 있고 1심은 완료로 표시된다', () => {
    const records: Records = { 1: record(1, ['a']), 2: record(2, ['x']) }
    const s = replay('c', [first, { type: 'reveal', instance: 1, judge, claimId: 'a' }, { type: 'seat_verdict', instance: 1, judge, verdict: 'clickbait', confidence: 70, reason: '충분히 긴 판결 사유입니다' }, { type: 'appeal', instance: 1, judge, reason: '충분히 긴 항소 사유입니다' }], records)
    const tabs = tabsOf(s, records)
    expect(tabs.map((t) => [t.status, t.viewable])).toEqual([['done', true], ['current', true], ['next', false]])
  })

  it('기록 없는 현재 심급은 시작 버튼을 안내한다', () => {
    const records: Records = { 1: record(1, ['a']) }
    const s = replay('c', [first, { type: 'reveal', instance: 1, judge, claimId: 'a' }, { type: 'seat_verdict', instance: 1, judge, verdict: 'clickbait', confidence: 70, reason: '충분히 긴 판결 사유입니다' }, { type: 'appeal', instance: 1, judge, reason: '충분히 긴 항소 사유입니다' }], records)
    expect(tabsOf(s, records)[1].note).toContain('2심 시작')
  })
})

describe('sectionOf', () => {
  it('첫인상·변론 듣기·판결 칩이 각 구역으로 간다', () => {
    expect(sectionOf('H1')).toBe('sec-first')
    expect(sectionOf('H2')).toBe('sec-claims')
    expect(['H3', 'H4', 'H5'].map(sectionOf)).toEqual(['sec-verdict', 'sec-verdict', 'sec-verdict'])
  })
})

describe('활동 이벤트', () => {
  it('seq가 겹치는 이벤트는 합치고 순서대로 정렬한다', () => {
    const merged = mergeEvents([ev(1, 'a', 'read'), ev(2, 'a', 'plan')], [ev(2, 'a', 'plan', '바뀜'), ev(3, 'b', 'read')])
    expect(merged.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(merged[1].text).toBe('바뀜')
    expect(lastSeq(merged)).toBe(3)
  })

  it('에이전트마다 최신 활동만 남기고 끝난 에이전트는 타자 표시가 꺼진다', () => {
    const list = latestActivity([ev(1, 'a', 'read'), ev(2, 'a', 'draft'), ev(3, 'b', 'submit'), ev(4, 'checker', 'done')], true, false)
    expect(list.map((x) => [x.agentId, x.kind, x.typing])).toEqual([['a', 'draft', true], ['b', 'submit', false]])
  })

  it('작업이 끝나면 아무도 타자 중이 아니다', () => {
    expect(latestActivity([ev(1, 'a', 'draft')], false, false)[0].typing).toBe(false)
  })

  it('변론이 가려진 동안은 제출 문구를 중립으로 바꾼다', () => {
    const [x] = latestActivity([{ ...ev(1, 'a', 'submit', '비밀 주장 내용'), claimId: 'c1' }], true, true)
    expect(x.text).toBe('주장 제출 완료')
  })

  it('가려진 동안은 publicText 또는 종류 라벨과 문장 번호만 보인다', () => {
    const leaky = '근거 3건 · 위증 의심 2건 · 핵심어 4개 · 노릴 유형 과장 주장 · 찬성'
    const pub = { ...ev(1, 'a', 'check', leaky), publicText: '근거 대조' } as AgentEvent
    expect(latestActivity([pub], true, true)[0].text).toBe('근거 대조')
    const [plan] = latestActivity([ev(1, 'a', 'plan', `3번·5번 문장 살펴보기 · 노릴 유형 과장 주장 · ${leaky}`)], true, true)
    expect(plan.text).toBe('계획 · 문장 3, 5')
    const [rev] = latestActivity([ev(2, 'b', 'revise', '위증 의심 1건 → 다시 작성 (1/2)')], true, true)
    expect(rev.text).toBe('고쳐 쓰기')
    for (const kind of ['draft', 'check', 'tool', 'read'] as const) {
      const [x] = latestActivity([ev(3, 'c', kind, leaky)], true, true)
      expect(x.text).not.toMatch(/위증|핵심어|과장|찬성|\d+건|\d+개/)
    }
  })

  it('가려진 동안은 판사 확인 필요 같은 실패 표시도 제출로 보인다', () => {
    const [x] = latestActivity([ev(1, 'a', 'escalate', '자기 수정 실패 · 판사 확인 필요')], true, true)
    expect(x.kind).toBe('submit')
    expect(x.text).toBe('주장 제출 완료')
  })

  it('공개된 뒤에는 원문 그대로 보인다', () => {
    expect(latestActivity([ev(1, 'a', 'plan', '3번 문장 살펴보기')], true, false)[0].text).toBe('3번 문장 살펴보기')
  })
})

describe('replayLedger (작업 중 다시 들어온 경우)', () => {
  const rev = (claimId: string): TrialEvent => ({ type: 'reveal', instance: 1, judge, claimId })
  const events = [first, rev('b'), rev('a')]

  it('저장 전 빈 기록에서도 첫인상을 복원하고 중복 기록하지 않는다', () => {
    const s = replayLedger('c', events, { 1: record(1, []) })
    expect(s.first).toEqual({ leaning: 'clickbait', confidence: 60 })
    expect(s.instances[1].revealed).toEqual([])
    expect(phaseOf({ ...s, writing: 1 }, { 1: record(1, []) })).toBe('hearing')
  })

  it('중간 기록의 주장 순서가 달라도 장부의 공개 순서대로 복원한다', () => {
    const records: Records = { 1: record(1, ['a', 'b', 'c']) }
    const s = replayLedger('c', events, records)
    expect(s.instances[1].revealed).toEqual(['b', 'a'])
    expect(nextRevealId(s, { 1: keepRevealOrder(records[1]!, ['b', 'a']) })).toBe('c')
  })

  it('작업이 끝나 기록이 채워지면 다시 복원해도 같은 상태이고 중복 공개가 없다', () => {
    const partial = replayLedger('c', events, { 1: record(1, ['b']) })
    expect(partial.instances[1].revealed).toEqual(['b'])
    const done = replayLedger('c', [...events, rev('a'), rev('b')], { 1: record(1, ['a', 'b', 'c']) })
    expect(done.instances[1].revealed).toEqual(['b', 'a'])
  })
})

describe('canAutoReveal', () => {
  const ok = { busy: false, error: null, viewing: null, judgeName: '판사' }
  it('평소에는 공개한다', () => expect(canAutoReveal(ok)).toBe(true))
  it('판사 이름이 비었거나 오류가 났거나 지난 심급을 보는 동안은 멈춘다', () => {
    expect(canAutoReveal({ ...ok, judgeName: '  ' })).toBe(false)
    expect(canAutoReveal({ ...ok, error: '422' })).toBe(false)
    expect(canAutoReveal({ ...ok, viewing: 1 })).toBe(false)
    expect(canAutoReveal({ ...ok, busy: true })).toBe(false)
  })
})
