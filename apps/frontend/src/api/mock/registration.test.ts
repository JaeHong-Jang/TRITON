// 직접 등록 모의 API 검증
import { describe, expect, it } from 'vitest'
import { ApiError } from '../error'
import type { Case, CaseSummary } from '../types'
import { handle } from './handlers'

// 테스트용 UUID 문자열
const req = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-${String(n).padStart(12, '0')}`

describe('mock article registration', () => {
  it('직접 등록 기사를 저장하고 목록에서 의견 비공개로 보여 준다', async () => {
    const saved = await handle('POST', '/cases', {
      requestId: req(1),
      title: ' 직접 등록 제목 ',
      body: '첫 줄\n\n둘째 줄',
    }) as Case

    expect(saved.id).toMatch(/^manual-/)
    expect(saved.origin).toBe('manual')
    expect(saved.category).toBe('직접 등록')
    expect(saved.sentences.map((s) => s.text)).toEqual(['첫 줄', '둘째 줄'])
    expect(JSON.stringify(saved)).not.toContain('manualRequestId')

    const duplicate = await handle('POST', '/cases', { requestId: req(1), title: '직접 등록 제목', body: '첫 줄\n둘째 줄' }) as Case
    expect(duplicate.id).toBe(saved.id)
    const detail = await handle('GET', `/cases/${saved.id}`, {}) as Case
    expect(JSON.stringify(detail)).not.toContain('manualRequestId')

    const rows = await handle('GET', '/cases', {}) as CaseSummary[]
    const row = rows.find((c) => c.id === saved.id)
    expect(row?.origin).toBe('manual')
    expect(row?.docket.screening).toBeNull()
  })

  it('같은 requestId의 다른 본문과 빈 입력을 거절한다', async () => {
    await expect(handle('POST', '/cases', { requestId: req(2), title: '제목', body: '본문' })).resolves.toMatchObject({ origin: 'manual' })
    await expect(handle('POST', '/cases', { requestId: req(2), title: '다른 제목', body: '본문' })).rejects.toMatchObject({ status: 409 })
    await expect(handle('POST', '/cases', { requestId: req(3), title: '제목', body: '\n\n' })).rejects.toMatchObject({ status: 422 })
    await expect(handle('POST', '/cases', { requestId: req(4), title: '제목', body: '본문', category: '' })).rejects.toMatchObject({ status: 422 })
    await expect(handle('POST', '/cases', { requestId: 'bad', title: '제목', body: '본문' })).rejects.toMatchObject({ status: 422 })
    await expect(handle('POST', '/cases', { requestId: req(7), title: '제목', body: '본문', id: 'c1' })).rejects.toMatchObject({ status: 422 })
    await expect(handle('POST', '/cases', { requestId: req(8), title: ['제목'], body: '본문' })).rejects.toMatchObject({ status: 422 })
  })

  it('직접 등록 기사의 모의 AI 변론과 정답 조회를 차단한다', async () => {
    const saved = await handle('POST', '/cases', { requestId: req(5), title: '차단 테스트', body: '본문' }) as Case
    await expect(handle('POST', `/cases/${saved.id}/trials/1`, {})).rejects.toMatchObject({ status: 409 })
    await expect(handle('GET', `/cases/${saved.id}/answer`, {})).rejects.toMatchObject({ status: 403 })
    const ledgerBody = {
      caseId: saved.id,
      instance: 1,
      judge: { seat: 1, name: '판사A', soloMode: false },
      labSessionId: null,
      type: 'final',
      data: { verdict: 'not_clickbait', action: 'L0', reason: '모의 판결', votes: [{ seat: 1, verdict: 'not_clickbait' }] },
      context: { balance: null, aiRecommendationShown: false, scaleVisible: false },
    }
    await handle('POST', '/ledger', ledgerBody)
    await expect(handle('GET', `/cases/${saved.id}/answer`, {})).rejects.toMatchObject({ status: 404 })
  })

  it('ApiError 형태로 실패를 반환한다', async () => {
    await expect(handle('POST', '/cases', { requestId: req(6), title: '', body: '본문' })).rejects.toBeInstanceOf(ApiError)
  })
})
