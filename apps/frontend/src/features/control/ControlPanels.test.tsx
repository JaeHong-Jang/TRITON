// 관제 패널의 공개 경계와 판정 취소 회귀
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildTrial, DEFS } from '../../api/mock/fixtures'
import type { LedgerEntry } from '../../api/types'
import { ControlEvidence } from './ControlEvidence'
import { ControlLog } from './ControlLog'
import { EvidenceGraph } from '../ontology/EvidenceGraph'
import { leaningLabel, screeningDirectionHidden, verifiedLabel } from '../../ui/format'

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
    expect(html).toContain('aria-label="검사 1의 근거 · 15번 문장 인용 · 인용 원문 일치')
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


describe('표시 용어 통일', () => {
  it('공유 검증 라벨과 판결 방향은 법정 용어를 따른다', () => {
    expect(verifiedLabel('quote')).toBe('인용 원문 일치')
    expect(verifiedLabel('absence')).toBe('핵심어 부재 확인')
    expect(verifiedLabel()).toBe('원문 일치(인용·부재)')
    expect(leaningLabel('clickbait')).toBe('낚시성이다')
    expect(leaningLabel('not_clickbait')).toBe('낚시성 아니다')
    expect(leaningLabel(null)).toBe('미정')
  })

  it('부재 근거 셀과 기록 그래프는 종류별 라벨과 집계 범례를 표시한다', () => {
    const rec = { ...record, claims: [{ ...record.claims[0], evidence: [
      { ...evidence, status: 'verified' as const, kind: 'quote' as const },
      { ...evidence, id: 'absence-test', status: 'verified' as const, kind: 'absence' as const, keyword: '시험 핵심어', quote: null, sentenceNo: null, foundIn: null },
    ] }] }
    const html = renderToStaticMarkup(<><ControlEvidence record={rec} ledger={[]} hidden={false} instance={1} selectedId={null} onSelect={vi.fn()} /><EvidenceGraph rec={rec} sentences={[]} /></>)
    expect(html).toContain('<b>인용 원문 일치</b>')
    expect(html).toContain('<b>핵심어 부재 확인</b>')
    expect(html).toContain('● 인용 원문 일치')
    expect(html).toContain('● 핵심어 부재 확인')
    expect(html).toContain('원문 일치(인용·부재)')
    expect(html).not.toContain('원문 대조 통과')
  })

  it('에이전트 식별자는 역할 이름으로 표시하고 검색 대상에도 같은 이름을 쓴다', () => {
    const trace = ['i3-O1', 'i3-P1', 'i3-D2', 'clerk', 'unknown'].map((agentId, seq) => ({ ...record.trace[0], agentId, seq, kind: 'plan' as const, text: '검토 중', subjectAgentId: 'i3-P2' }))
    const rec = { ...record, bench: [], trace }
    const html = renderToStaticMarkup(<ControlLog record={rec} run={null} ledger={[]} hidden={false} instance={1} onSelect={vi.fn()} />)
    for (const name of ['재판연구관', '검사 1', '변호인 2', '서기', '에이전트']) expect(html).toContain(`<strong>${name}</strong>`)
    expect(html).toContain('대상 검사 2')
    expect(html).not.toMatch(/i3-[PDO]\d/)
  })

  it('권고 방향이 반환되면 비공개 안내를 숨기고 누락된 경우에만 표시한다', () => {
    expect(screeningDirectionHidden({ isClickbait: true })).toBe(false)
    expect(screeningDirectionHidden({ isClickbait: false })).toBe(false)
    expect(screeningDirectionHidden({})).toBe(true)
    expect(screeningDirectionHidden(null)).toBe(true)
  })
})
