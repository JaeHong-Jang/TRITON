// 천칭 무게 규칙 검증
import { describe, expect, it } from 'vitest'
import type { Claim, Evidence } from '../api/types'
import { balanceOf, checkerWeight, evidenceWeights } from './scale'

// 테스트용 근거
const ev = (id: string, status: Evidence['status'] = 'verified', stance: Evidence['stance'] = 'pro'): Evidence => ({
  id, kind: 'quote', stance, sentenceNo: 1, quote: '문장', keyword: null, status, foundIn: 1,
})
// 테스트용 주장
const claim = (id: string, evidence: Evidence[], extra: Partial<Claim> = {}): Claim => ({
  id, agentId: 'a1', round: 0, type: 'exaggeration', stance: 'pro', text: '주장', strength: 2, evidence, rebuts: null, revisions: 0, escalated: false, ...extra,
})

describe('evidenceWeights', () => {
  it('원문 확인 근거는 주장 강도만큼 무게를 갖는다', () => {
    const w = evidenceWeights([claim('c1', [ev('e1'), ev('e2')])], {})
    expect(w.map((x) => x.weight)).toEqual([2, 2])
  })

  it('제목 인용·핵심어 존재 근거는 0이다', () => {
    const w = evidenceWeights([claim('c1', [ev('e1', 'title'), ev('e2', 'present')])], {})
    expect(w.map((x) => [x.weight, x.voidReason])).toEqual([[0, 'status'], [0, 'status']])
  })

  it('위증 의심 근거가 하나라도 있으면 같은 주장의 모든 근거가 무효다', () => {
    const w = evidenceWeights([claim('c1', [ev('e1'), ev('e2', 'fabricated')])], {})
    expect(w.map((x) => [x.weight, x.voidReason])).toEqual([[0, 'perjury'], [0, 'perjury']])
  })

  it('판사 기각은 0, 채택은 다른 규칙을 무시하고 강도다', () => {
    const c = claim('c1', [ev('e1'), ev('e2', 'fabricated')], { strength: 3 })
    const w = evidenceWeights([c], { e1: 'struck', e2: 'admitted' })
    expect(w.map((x) => x.weight)).toEqual([0, 3])
  })

  it('검증된 반박이 겨냥한 근거는 절반이다', () => {
    const target = claim('c1', [ev('e1')])
    const rebuttal = claim('c2', [ev('e2', 'verified', 'con')], { type: 'rebuttal', stance: 'con', rebuts: 'e1' })
    const w = evidenceWeights([target, rebuttal], {})
    expect(w.find((x) => x.evidenceId === 'e1')).toMatchObject({ weight: 1, fate: 'halved' })
  })

  it('무게 없는 반박은 대상을 줄이지 못한다', () => {
    const target = claim('c1', [ev('e1')])
    const rebuttal = claim('c2', [ev('e2', 'title', 'con')], { type: 'rebuttal', stance: 'con', rebuts: 'e1' })
    expect(evidenceWeights([target, rebuttal], {}).find((x) => x.evidenceId === 'e1')?.weight).toBe(2)
  })

  it('기각된 반박은 대상을 줄이지 못한다', () => {
    const target = claim('c1', [ev('e1')])
    const rebuttal = claim('c2', [ev('e2', 'verified', 'con')], { type: 'rebuttal', stance: 'con', rebuts: 'e1' })
    expect(evidenceWeights([target, rebuttal], { e2: 'struck' }).find((x) => x.evidenceId === 'e1')?.weight).toBe(2)
  })

  it('채택된 위증 반박은 대상을 절반으로 줄인다', () => {
    const target = claim('c1', [ev('e1')])
    const rebuttal = claim('c2', [ev('e2', 'fabricated', 'con')], { type: 'rebuttal', stance: 'con', rebuts: 'e1' })
    expect(evidenceWeights([target, rebuttal], {}).find((x) => x.evidenceId === 'e1')?.weight).toBe(2)
    expect(evidenceWeights([target, rebuttal], { e2: 'admitted' }).find((x) => x.evidenceId === 'e1')).toMatchObject({ weight: 1, fate: 'halved' })
  })

  it('같은 근거를 여러 반박이 겨냥해도 한 번만 절반이다', () => {
    const target = claim('c1', [ev('e1')], { strength: 3 })
    const r1 = claim('c2', [ev('e2', 'verified', 'con')], { type: 'rebuttal', stance: 'con', rebuts: 'e1' })
    const r2 = claim('c3', [ev('e3', 'verified', 'con')], { type: 'rebuttal', stance: 'con', rebuts: 'e1' })
    expect(evidenceWeights([target, r1, r2], {}).find((x) => x.evidenceId === 'e1')?.weight).toBe(1.5)
  })

  it('접시는 제출한 쪽이 아니라 근거 입장으로 정해진다', () => {
    const concede = claim('c1', [ev('e1', 'verified', 'con')], { agentId: 'prosecutor', stance: 'con' })
    expect(balanceOf(evidenceWeights([concede], {}))).toMatchObject({ pro: 0, con: 2 })
  })
})

describe('balanceOf', () => {
  it('찬성이 무거우면 양수 기울기이고 합이 0이면 0이다', () => {
    expect(balanceOf([]).tilt).toBe(0)
    const b = balanceOf(evidenceWeights([claim('c1', [ev('e1')])], {}))
    expect(b.tilt).toBeCloseTo(0.35)
  })

  it('같은 입력은 같은 기울기를 낸다', () => {
    const claims = [claim('c1', [ev('e1')]), claim('c2', [ev('e2', 'verified', 'con')], { stance: 'con', strength: 1 })]
    expect(balanceOf(evidenceWeights(claims, {})).tilt).toBeCloseTo(balanceOf(evidenceWeights(claims, {})).tilt)
    expect(balanceOf(evidenceWeights(claims, {})).tilt).toBeCloseTo(((2 - 1) / 3) * 0.35)
  })
})

describe('checkerWeight', () => {
  it('판사 결정을 빼고 코드 무게를 돌려준다', () => {
    const c = claim('c1', [ev('e1', 'title')])
    expect(checkerWeight([c], { e1: 'admitted' }, 'e1')).toBe(0)
  })
})
