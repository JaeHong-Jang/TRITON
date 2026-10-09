// 관제 패널의 공개 경계와 판정 취소 회귀
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildTrial, DEFS } from '../../api/mock/fixtures'
import type { LedgerEntry } from '../../api/types'
import { ControlEvidence } from './ControlEvidence'
import { ControlLog } from './ControlLog'

const record = buildTrial(DEFS[0], 1, [])
const evidence = record.claims[0].evidence[0]

// 동일 시각에도 장부 순서를 보존하는 근거 판정
function ruling(id: string, value: string | null): LedgerEntry {
  return { id, at: '2026-10-03T00:00:00Z', caseId: record.caseId, instance: 1, judge: { seat: 1, name: '시험 판사', soloMode: false }, labSessionId: null, type: 'evidence_ruling', data: { evidenceId: evidence.id, ruling: value }, context: { balance: null, aiRecommendationShown: true, scaleVisible: true } }
}

describe('관제 패널 공개 경계', () => {
  it('근거 셀은 읽기 쉬운 이름을 표시하고 내부 식별자는 툴팁과 선택에 유지한다', () => {
    const namedRecord = {
      ...record,
      bench: [{ ...record.bench[0], name: '검사 1' }],
      claims: [{ ...record.claims[0], evidence: [{ ...evidence, id: 'i3-E1', kind: 'quote' as const, sentenceNo: 15, status: 'verified' as const }] }],
    }
    const html = renderToStaticMarkup(<ControlEvidence record={namedRecord} ledger={[]} hidden={false} instance={1} selectedId="evidence:i3-E1" onSelect={vi.fn()} />)
    expect(html).toContain('<strong>✓ 검사 1의 근거 · 15번 문장 인용</strong>')
    expect(html).toContain('aria-label="검사 1의 근거 · 15번 문장 인용 · 원문 대조 통과')
    expect(html).toContain('title="i3-E1 · ')
    expect(html).toContain('aria-pressed="true"')
    expect(html.replace(/<[^>]*>/g, '')).not.toContain('i3-E1')
  })

  it('숨겨진 입력에 실제 기록이 있어도 근거와 이벤트를 렌더링하지 않는다', () => {
    const html = renderToStaticMarkup(<><ControlEvidence record={record} ledger={[]} hidden instance={1} selectedId={null} onSelect={vi.fn()} /><ControlLog record={record} run={null} ledger={[]} hidden instance={1} onSelect={vi.fn()} /></>)
    expect(html).not.toContain(evidence.id)
    expect(html).not.toContain(record.claims[0].text)
    expect(html).not.toContain(record.trace[0].text)
    expect(html).not.toContain('cr-evidence-cell')
    expect(html).not.toContain('cr-log-item')
    expect(html).toContain('AI 이벤트 비공개')
  })

  it('동일 시각의 채택 취소는 UUID 순서가 아닌 장부 추가 순서로 처리한다', () => {
    const html = renderToStaticMarkup(<ControlEvidence record={record} ledger={[ruling('z-admit', 'admitted'), ruling('a-undo', null)]} hidden={false} instance={1} selectedId={null} onSelect={vi.fn()} />)
    expect(html).not.toContain('사람 채택')
    expect(html).toContain('사람 미검토')
    expect(html).toContain('검증 통과율은 기사 판별 정확도가 아닙니다')
  })

  it('관련 로그에는 실제로 주장 식별자가 연결된 이벤트만 남긴다', () => {
    const claimId = record.claims[0].id
    const html = renderToStaticMarkup(<ControlLog record={record} run={null} ledger={[]} hidden={false} instance={1} claimId={claimId} onSelect={vi.fn()} />)
    expect(html).toContain(`주장 ${claimId}에 식별자로 연결된 로그`)
    expect(html).not.toContain(record.trace.find((event) => event.kind === 'read')!.text)
    expect(html).toContain('주장 제출')
  })
})
