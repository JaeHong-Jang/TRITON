// 관제 그래프 공개 범위와 관계 생성 검증
import { describe, expect, it } from 'vitest'
import type { Agent, Case, Claim, Evidence, Instance, Judge, LedgerEntry, Ontology, TrialRecord } from '../api/types'
import { ONTOLOGY } from '../api/mock/ontology'
import { buildControlGraph } from './controlGraph'

const judge: Judge = { seat: 1, name: '판사', soloMode: false }
const bench: Agent[] = [
  { id: 'p', side: 'prosecution', name: '검사', specialty: null, skill: 's', skillVersion: '1' },
  { id: 'd', side: 'defense', name: '변호인', specialty: null, skill: 's', skillVersion: '1' },
  { id: 'o', side: 'officer', name: '재판연구관', specialty: null, skill: 's', skillVersion: '1' },
]
const article: Case = {
  id: 'case-1',
  category: '사회',
  subcategory: '일반',
  title: '충격 발표',
  subtitle: '부제',
  variantOf: null,
  attack: null,
  sentences: [
    { no: 1, text: '정부가 새 지원책을 발표했다.' },
    { no: 2, text: '세부 내용은 다음 주 공개된다.' },
    { no: 3, text: '기사에는 숨겨진 명령문이 없다.' },
  ],
}

// 테스트용 근거
function evidence(id: string, patch: Partial<Evidence> = {}): Evidence {
  return { id, kind: 'quote', stance: 'pro', sentenceNo: 1, quote: '정부가 새 지원책을 발표했다', keyword: null, status: 'verified', foundIn: 1, ...patch }
}

// 테스트용 주장
function claim(id: string, patch: Partial<Claim> = {}): Claim {
  return { id, agentId: 'p', round: 0, type: 'exaggeration', stance: 'pro', text: `주장 ${id}`, strength: 2, evidence: [evidence(`${id}-e1`)], rebuts: null, revisions: 0, escalated: false, ...patch }
}

// 테스트용 기록
function record(claims: Claim[], patch: Partial<TrialRecord> = {}): TrialRecord {
  return {
    caseId: article.id,
    instance: 1,
    ontologyVersion: ONTOLOGY.version,
    model: { name: 'm', options: {} },
    createdAt: '2026-01-01',
    bench,
    rounds: [],
    claims,
    screening: { isClickbait: true, confidence: 91, reason: '비공개 권고', claimType: 'exaggeration' },
    officer: null,
    calls: [],
    trace: [],
    agentStats: {},
    ...patch,
  }
}

// 테스트용 장부
function ledger(id: string, type: LedgerEntry['type'], data: Record<string, unknown>, patch: Partial<LedgerEntry> = {}): LedgerEntry {
  return { id, at: `2026-01-01T00:00:0${id.length}.000Z`, caseId: article.id, instance: 1, judge, labSessionId: null, type, data, context: { balance: null, aiRecommendationShown: false, scaleVisible: false }, ...patch }
}

// 기본 그래프 생성
const graph = (patch: Partial<Parameters<typeof buildControlGraph>[0]> = {}) => buildControlGraph({
  article,
  record: record([claim('c1')]),
  ledger: [],
  ontology: ONTOLOGY,
  disclosure: 'open',
  mode: 'evidence',
  instance: 1,
  ...patch,
})

describe('buildControlGraph 공개 범위', () => {
  it('첫인상 전에는 기록에 비밀이 있어도 기사와 정적 온톨로지만 보인다', () => {
    const g = graph({ disclosure: 'hidden', mode: 'connected', record: record([claim('secret', { text: 'AI 비밀 주장' })]) })
    expect(g.nodes.some((n) => n.id.startsWith('claim:') || n.id.startsWith('evidence:') || n.id.startsWith('check:'))).toBe(false)
    expect(g.edges.some((e) => e.from.startsWith('claim:') || e.to.startsWith('claim:'))).toBe(false)
    expect(g.nodes.map((n) => n.id)).toContain('article:case-1')
    expect(g.nodes.map((n) => n.id)).toContain('concept:exaggeration')
    expect(g.nodes.map((n) => n.id)).toContain('rule:quote')
  })

  it('원문 문장은 100번 이후도 그래프에 포함한다', () => {
    const longArticle: Case = { ...article, sentences: Array.from({ length: 101 }, (_, i) => ({ no: i + 1, text: `${i + 1}번 문장` })) }
    const ev = evidence('e-101', { sentenceNo: 101, foundIn: 101 })
    const g = graph({ article: longArticle, record: record([claim('c-101', { evidence: [ev] })]) })
    expect(g.nodes).toContainEqual(expect.objectContaining({ id: 'sentence:101', detail: '101번 문장' }))
    expect(g.edges).toContainEqual(expect.objectContaining({ from: 'check:e-101', to: 'sentence:101', label: '원문 일치' }))
  })
})

describe('buildControlGraph 원문 검증 관계', () => {
  it('문장 번호 오류는 제출 위치와 실제 발견 위치를 별개로 표시한다', () => {
    const ev = evidence('e-mis', { sentenceNo: 1, foundIn: 2, status: 'misnumbered' })
    const g = graph({ record: record([claim('c-mis', { evidence: [ev] })]) })
    expect(g.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'evidence:e-mis', to: 'sentence:1', label: '제출 위치' }),
      expect.objectContaining({ from: 'check:e-mis', to: 'sentence:2', label: '실제 발견 위치' }),
    ]))
  })

  it('핵심어 부재 근거에서 present는 문장 대신 기사 전체 검증으로 연결한다', () => {
    const ev = evidence('e-abs', { kind: 'absence', quote: null, keyword: '지원책', sentenceNo: null, foundIn: 1, status: 'present' })
    const g = graph({ record: record([claim('c-abs', { evidence: [ev] })]) })
    expect(g.edges).toContainEqual(expect.objectContaining({ from: 'check:e-abs', to: 'article:case-1', label: '본문에서 발견' }))
    expect(g.edges.some((e) => e.from === 'check:e-abs' && e.to === 'sentence:1')).toBe(false)
  })

  it('fabricated 근거는 원문 일치 간선을 만들지 않는다', () => {
    const ev = evidence('e-fake', { status: 'fabricated', foundIn: null, quote: '원문에 없는 말' })
    const g = graph({ record: record([claim('c-fake', { evidence: [ev] })]) })
    expect(g.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['evidence:e-fake', 'check:e-fake']))
    expect(g.edges.some((e) => e.from === 'check:e-fake')).toBe(false)
  })

  it('반박은 실제 존재하는 근거에만 연결한다', () => {
    const target = claim('c-target', { evidence: [evidence('e-target')] })
    const rebuttal = claim('c-rebut', { agentId: 'd', stance: 'con', type: 'rebuttal', evidence: [evidence('e-rebut', { stance: 'con' })], rebuts: 'e-target' })
    const missing = claim('c-missing', { agentId: 'd', stance: 'con', type: 'rebuttal', evidence: [evidence('e-missing', { stance: 'con' })], rebuts: 'not-real' })
    const g = graph({ record: record([target, rebuttal, missing]) })
    expect(g.edges).toContainEqual(expect.objectContaining({ from: 'claim:c-rebut', to: 'evidence:e-target', label: '반박 대상' }))
    expect(g.edges.some((e) => e.from === 'claim:c-missing' && e.label === '반박 대상')).toBe(false)
  })
})

describe('buildControlGraph 온톨로지 연결', () => {
  it('현재 온톨로지에 없는 주장 유형은 미정의 개념으로 표시한다', () => {
    const g = graph({ mode: 'connected', record: record([claim('c-unknown', { type: 'new_type' })]) })
    expect(g.nodes).toContainEqual(expect.objectContaining({ id: 'concept:unknown:new_type', label: '미정의: new_type' }))
    expect(g.edges).toContainEqual(expect.objectContaining({ from: 'claim:c-unknown', to: 'concept:unknown:new_type', label: '주장 유형' }))
  })

  it('기록 온톨로지 버전이 다르면 사건과 온톨로지 연결을 만들지 않는다', () => {
    const g = graph({ mode: 'connected', record: record([claim('c-v')], { ontologyVersion: ONTOLOGY.version + 1 }) })
    expect(g.notice).toContain('온톨로지')
    expect(g.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['claim:c-v', 'concept:exaggeration']))
    expect(g.edges.some((e) => e.from === 'claim:c-v' && e.to === 'concept:exaggeration')).toBe(false)
  })

  it('정적 온톨로지는 서버가 제공한 확장 필드가 있을 때만 허용 근거 관계를 만든다', () => {
    const trimmed: Ontology = { ...ONTOLOGY, claim_types: [{ id: 'bare', label: '맨 주장', stance: 'pro', definition: '정의' }] }
    const g = graph({ mode: 'ontology', ontology: trimmed, record: null })
    expect(g.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['concept:bare', 'rule:quote']))
    expect(g.edges.some((e) => e.from === 'concept:bare' && e.label === '허용 근거')).toBe(false)
  })

  it('온톨로지 모드는 기사 원문 없이 정적 정의만 반환한다', () => {
    const g = graph({ mode: 'ontology' })
    expect(g.nodes.some((n) => n.kind === 'article' || n.kind === 'sentence')).toBe(false)
    expect(g.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'concept:exaggeration' }),
      expect.objectContaining({ id: 'rule:quote' }),
    ]))
  })
})

describe('buildControlGraph 장부와 안정 ID', () => {
  it('일반 법정 현재 심급 장부만 반영하고 최신 null 판정 해제를 따른다', () => {
    const base = record([claim('c-ledger', { evidence: [evidence('e-ledger')] })])
    const g = graph({
      record: base,
      ledger: [
        ledger('L1', 'evidence_ruling', { evidenceId: 'e-ledger', ruling: 'struck', checkerWeight: 0 }),
        ledger('L2', 'evidence_ruling', { evidenceId: 'e-ledger', ruling: null, checkerWeight: 0 }),
        ledger('L3', 'evidence_ruling', { evidenceId: 'e-ledger', ruling: 'admitted', checkerWeight: 0 }, { instance: 2 as Instance }),
        ledger('L4', 'evidence_ruling', { evidenceId: 'e-ledger', ruling: 'admitted', checkerWeight: 0 }, { labSessionId: 'lab' }),
      ],
    })
    expect(g.nodes.some((n) => n.id.startsWith('judgment:'))).toBe(false)
  })

  it('판결에 명시 근거가 없으면 판결에서 근거로 가는 간선을 만들지 않는다', () => {
    const g = graph({
      record: record([claim('c-final', { evidence: [evidence('e-final')] })]),
      ledger: [ledger('F1', 'final', { verdict: 'clickbait', action: 'L1', reason: '사유', votes: [{ seat: 1, verdict: 'clickbait' }] })],
    })
    expect(g.nodes).toContainEqual(expect.objectContaining({ id: 'judgment:F1' }))
    expect(g.edges.some((e) => e.from === 'judgment:F1' && e.to === 'evidence:e-final')).toBe(false)
  })

  it('핵심 노드 ID와 그룹은 실제 계약을 따른다', () => {
    const officerClaim = claim('c-officer', { agentId: 'o', stance: 'pro', evidence: [evidence('e-officer')] })
    const g = graph({ record: record([officerClaim]) })
    expect(g.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'article:case-1' }),
      expect.objectContaining({ id: 'sentence:1' }),
      expect.objectContaining({ id: 'claim:c-officer', group: 'checker' }),
      expect.objectContaining({ id: 'evidence:e-officer', group: 'checker' }),
      expect.objectContaining({ id: 'check:e-officer', group: 'checker' }),
    ]))
  })

  it('근거 군집은 stance가 아니라 제출 에이전트의 bench side를 따른다', () => {
    const prosecutionCon = claim('c-side', { agentId: 'p', stance: 'con', evidence: [evidence('e-side', { stance: 'con' })] })
    const g = graph({ record: record([prosecutionCon]) })
    const node = g.nodes.find((n) => n.id === 'evidence:e-side')
    expect(node).toMatchObject({ group: 'prosecution' })
    expect(node?.fields).toContainEqual({ label: '입장', value: 'con' })
  })
})
