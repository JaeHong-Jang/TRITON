// 사람이 읽는 이름 단위 시험
import { describe, expect, it } from 'vitest'
import type { Agent, Claim, Evidence } from '../api/types'
import { actionLabel, evidenceName, leaningLabel } from './names'

// 시험용 근거
const ev = (id: string, o: Partial<Evidence> = {}): Evidence => ({ id, kind: 'quote', stance: 'pro', sentenceNo: 15, quote: 'q', keyword: null, status: 'verified', foundIn: 15, ...o })
// 시험용 주장
const claim = (id: string, agentId: string, evidence: Evidence[], o: Partial<Claim> = {}): Claim => ({ id, agentId, round: 0, type: 't', stance: 'pro', text: 'x', strength: 2, evidence, rebuts: null, revisions: 0, escalated: false, ...o })
const bench: Agent[] = [{ id: 'i2-P1', side: 'prosecution', name: '검사 A', specialty: null, skill: 's', skillVersion: '1' }]

describe('names', () => {
  const claims = [
    claim('c1', 'i2-P1', [ev('i2-E5')]),
    claim('c2', 'i2-D2', [ev('i2-E6', { kind: 'absence', sentenceNo: null, quote: null, keyword: 'TV', status: 'verified' })]),
    claim('c3', 'i2-P3', [ev('i2-E7')], { round: 1, rebuts: 'i2-E6' }),
    claim('c4', 'i2-P1', [ev('i2-E8', { sentenceNo: 0, status: 'title' })]),
  ]
  it('names evidence by owner and content', () => {
    expect(evidenceName(claims, bench, 'i2-E5')).toBe('검사 1의 근거 · 15번 문장 인용')
    expect(evidenceName(claims, bench, 'i2-E6')).toBe("변호인 2의 근거 · 핵심어 'TV' 부재")
    expect(evidenceName(claims, bench, 'i2-E7')).toBe('반대신문(검사 3)의 근거 · 15번 문장 인용')
    expect(evidenceName(claims, bench, 'i2-E8')).toBe('검사 1의 근거 · 제목 인용')
    expect(evidenceName(claims, bench, 'zzz')).toBe('상대 근거')
  })
  it('labels actions and leanings', () => {
    expect(actionLabel('L0')).toBe('조치 없음')
    expect(actionLabel('L3')).toBe('언론사 통보')
    expect(leaningLabel('clickbait')).toBe('낚시성이다')
    expect(leaningLabel('not_clickbait')).toBe('낚시성 아니다')
  })
})
