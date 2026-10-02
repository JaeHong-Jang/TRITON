// 근거 그래프 배치 검증
import { describe, expect, it } from 'vitest'
import { buildTrial, DEFS } from '../../api/mock/fixtures'
import { chainOf, layoutEvidence } from './evidenceLayout'

describe('layoutEvidence', () => {
  const def = DEFS[0]
  const t1 = buildTrial(def, 1, [])
  const t2 = buildTrial(def, 2, [t1])
  const g = layoutEvidence(t2, def.case.sentences, (t) => t)

  it('같은 열의 노드가 겹치지 않는다', () => {
    for (const col of ['agent', 'claim', 'ev', 'sent'] as const) {
      const list = g.nodes.filter((n) => n.col === col).sort((a, b) => a.y - b.y)
      for (let i = 1; i < list.length; i++) expect(list[i].y).toBeGreaterThanOrEqual(list[i - 1].y + list[i - 1].h)
    }
  })

  it('모든 간선의 양 끝 노드가 있고 반박 간선이 대상 근거를 가리킨다', () => {
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const e of g.edges) expect(ids.has(e.from) && ids.has(e.to)).toBe(true)
    const rebut = g.edges.filter((e) => e.kind === 'rebut')
    expect(rebut.length).toBeGreaterThan(0)
    for (const e of rebut) expect(g.nodes.find((n) => n.id === e.to)?.col).toBe('ev')
  })

  it('주장을 고르면 에이전트와 근거와 문장이 함께 이어진다', () => {
    const claim = g.nodes.find((n) => n.col === 'claim')!
    const chain = chainOf(g, claim.id)
    expect([...chain.nodes].some((id) => id.startsWith('agent:'))).toBe(true)
    expect([...chain.nodes].some((id) => g.nodes.find((n) => n.id === id)?.col === 'ev')).toBe(true)
  })
})
