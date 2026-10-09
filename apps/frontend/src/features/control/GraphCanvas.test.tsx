// 작업실 그래프의 역할 색상 회귀 검증
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { ControlGraph, ControlGroup } from '../../lib/controlTypes'
import { GROUP_LABELS } from '../../lib/controlTypes'
import { GraphCanvas } from './GraphCanvas'

it('검사와 변호 노드·선택 테두리·범례는 새 찬반 팔레트를 사용한다', () => {
  const groups: ControlGroup[] = ['source', 'prosecution', 'defense', 'checker', 'human', 'ontology']
  const graph: ControlGraph = {
    nodes: groups.map((group) => ({ id: group, kind: 'claim', group, label: GROUP_LABELS[group], detail: '', fields: [] })),
    edges: [],
    notice: null,
  }
  const html = renderToStaticMarkup(<GraphCanvas graph={graph} selectedId="prosecution" selectedEdgeId={null} onSelect={vi.fn()} onSelectEdge={vi.fn()} />)
  const dots = new Map([...html.matchAll(/data-node-id="([^"]+)"[\s\S]*?<circle class="gc-dot"[^>]*style="fill:([^"]+)"/g)].map((match) => [match[1], match[2]]))
  expect(dots).toEqual(new Map([
    ['source', '#dbd8cf'], ['prosecution', '#922a22'], ['defense', '#1f3a66'],
    ['checker', '#8fac85'], ['human', '#d4b370'], ['ontology', '#a092bc'],
  ]))
  expect(html).toMatch(/class="gc-node-ring"[^>]*style="stroke:#922a22"/)
  expect(html).toContain('<i style="background:#922a22"></i>검사 주장')
  expect(html).toContain('<i style="background:#1f3a66"></i>변호 주장')
})
