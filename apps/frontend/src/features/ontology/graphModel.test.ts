// 온톨로지 그래프 배치 검증
import { describe, expect, it } from 'vitest'
import { ONTOLOGY } from '../../api/mock/ontology'
import { buildGraph, touching } from './graphModel'

describe('buildGraph', () => {
  const g = buildGraph(ONTOLOGY)

  it('찬성은 왼쪽 반대는 오른쪽에 놓는다', () => {
    const pro = g.nodes.find((n) => n.id === 'stance:pro')!
    const con = g.nodes.find((n) => n.id === 'stance:con')!
    expect(pro.x).toBeLessThan(con.x)
  })

  it('같은 줄의 노드끼리 겹치지 않는다', () => {
    const rows = new Map<number, typeof g.nodes>()
    for (const n of g.nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n])
    for (const list of rows.values()) {
      const sorted = [...list].sort((a, b) => a.x - b.x)
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].x - sorted[i].w / 2).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].w / 2)
    }
  })

  it('반박은 파생 노드이고 모든 간선 끝점이 존재한다', () => {
    expect(g.nodes.find((n) => n.id === 'claim:rebuttal')?.tone).toBe('derived')
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const e of g.edges) expect(ids.has(e.from) && ids.has(e.to)).toBe(true)
  })

  it('검증 상태 간선에 무게 배수를 붙인다', () => {
    expect(g.edges.find((e) => e.id === 'e:quote:fabricated')?.label).toBe('×0')
    expect(touching(g, 'kind:quote').edges.size).toBeGreaterThan(4)
  })
})
