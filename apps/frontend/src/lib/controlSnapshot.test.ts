// 사건 전환과 첫인상 공개 경계 검증
import { describe, expect, it } from 'vitest'
import type { ExecutionView, Records, TrialRecord } from '../api/types'
import { controlRecord, controlUrl } from './controlSnapshot'

const record = { caseId: 'a', instance: 1, claims: [{ text: '비공개 주장' }] } as TrialRecord
const records = { case: { id: 'a' }, trials: [record] } as Records
const view = { caseId: 'a', instance: 1, disclosure: 'open', run: null } as ExecutionView

describe('관제 조회 경계', () => {
  it('원시 기록에 주장이 있어도 공개 전에는 그래프 입력 차단', () => {
    expect(controlRecord('a', 1, { ...view, disclosure: 'hidden' }, records)).toBeNull()
  })
  it('다른 사건과 심급 응답 거부', () => {
    expect(() => controlRecord('b', 1, view, records)).toThrow()
    expect(() => controlRecord('a', 2, view, records)).toThrow()
  })
  it('현재 실행의 부분 기록을 저장 기록과 분리', () => {
    const run = { status: 'running', partial: null } as NonNullable<ExecutionView['run']>
    expect(controlRecord('a', 1, { ...view, run }, records)).toBeNull()
    expect(controlRecord('a', 1, { ...view, run: { ...run, partial: record } }, records)).toBe(record)
    expect(controlRecord('a', 1, view, records)).toBe(record)
  })
  it('항소 이후 과거 심급을 섞지 않음', () => {
    expect(controlRecord('a', 2, { ...view, instance: 2 }, records)).toBeNull()
  })
  it('선택한 사건과 심급의 링크 보존', () => {
    expect(controlUrl('a/b', 2, 'connected')).toBe('/agents?caseId=a%2Fb&instance=2&view=connected')
  })
})
