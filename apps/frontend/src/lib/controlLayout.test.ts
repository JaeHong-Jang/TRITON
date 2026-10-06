// 관제 그래프 레이아웃 검증
import { describe, expect, it } from 'vitest'
import type { ControlEdge, ControlGroup, ControlKind, ControlNode } from './controlTypes'
import { GROUP_ORDER, layoutNodes, nodeBounds, positionKey } from './controlLayout'

const kinds: ControlKind[] = ['article', 'sentence', 'claim', 'evidence', 'check', 'concept', 'rule', 'judgment']

// 테스트 노드 생성
function node(index: number, group: ControlGroup): ControlNode {
  return {
    id: `${group}:${index}`,
    kind: kinds[index % kinds.length],
    group,
    label: `노드 ${index}`,
    detail: '레이아웃 테스트',
    fields: [],
  }
}

// 테스트 그래프 생성
function nodes(count: number): ControlNode[] {
  return Array.from({ length: count }, (_, index) => node(index, GROUP_ORDER[index % GROUP_ORDER.length]))
}

// 테스트 간선 생성
function edge(from: string, to: string, index: number): ControlEdge {
  return { id: `edge:${index}:${from}->${to}`, from, to, label: '연결', detail: '테스트 연결' }
}

// 노드별 좌표 문자열
function positionMap(placed: Map<string, ControlNode & { x: number; y: number }>): Record<string, string> {
  return Object.fromEntries([...placed.entries()].map(([id, position]) => [id, positionKey(position)]))
}

// 가장 가까운 노드 거리
function minimumDistance(placed: Map<string, ControlNode & { x: number; y: number }>): number {
  const positions = [...placed.values()]
  let minimum = Number.POSITIVE_INFINITY
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      minimum = Math.min(minimum, Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y))
    }
  }
  return minimum
}

describe('control graph layout', () => {
  it('keeps dense graphs on unique finite positions', () => {
    const graphNodes = nodes(132)
    const cache = new Map()
    const graphEdges = graphNodes.slice(1).map((item, index) => edge(graphNodes[index].id, item.id, index))
    const first = layoutNodes(graphNodes, cache, graphEdges)
    const second = layoutNodes(graphNodes, cache, graphEdges)
    const positions = [...first.values()].map(positionKey)

    expect(new Set(positions).size).toBe(graphNodes.length)
    expect([...first.values()].every((position) => Number.isFinite(position.x) && Number.isFinite(position.y))).toBe(true)
    expect([...second.values()].map(positionKey)).toEqual(positions)
    expect(cache.size).toBe(graphNodes.length)
  })

  it('is deterministic when nodes and edges arrive in a different order', () => {
    const graphNodes = nodes(42)
    const graphEdges = graphNodes.slice(1).map((item, index) => edge(graphNodes[Math.floor(index / 2)].id, item.id, index))
    const first = layoutNodes(graphNodes, new Map(), graphEdges)
    const second = layoutNodes([...graphNodes].reverse(), new Map(), [...graphEdges].reverse())

    expect(positionMap(second)).toEqual(positionMap(first))
  })

  it('centers sparse graphs without fake spread', () => {
    const empty = layoutNodes([], new Map())
    expect(empty.size).toBe(0)

    const pair = [node(0, 'source'), node(1, 'checker')]
    const placed = layoutNodes(pair, new Map(), [edge(pair[0].id, pair[1].id, 0)])
    expect(placed.get(pair[0].id)?.y).toBe(450)
    expect(placed.get(pair[1].id)?.y).toBe(450)
    expect(Math.abs((placed.get(pair[1].id)?.x ?? 0) - (placed.get(pair[0].id)?.x ?? 0))).toBeGreaterThan(150)
    expect(Math.abs((placed.get(pair[0].id)?.x ?? 0) - 800)).toBeLessThan(120)
  })

  it('keeps connected nodes closer than disconnected components', () => {
    const graphNodes = Array.from({ length: 6 }, (_, index) => node(index, index < 3 ? 'source' : 'ontology'))
    const graphEdges = [edge(graphNodes[0].id, graphNodes[1].id, 0), edge(graphNodes[1].id, graphNodes[2].id, 1)]
    const placed = layoutNodes(graphNodes, new Map(), graphEdges)
    const distance = (a: string, b: string) => {
      const pa = placed.get(a)!
      const pb = placed.get(b)!
      return Math.hypot(pa.x - pb.x, pa.y - pb.y)
    }

    expect(distance(graphNodes[0].id, graphNodes[1].id)).toBeLessThan(distance(graphNodes[0].id, graphNodes[4].id))
  })

  it('preserves existing positions when new nodes arrive', () => {
    const base = nodes(7)
    const baseEdges = base.slice(1).map((item, index) => edge(base[index].id, item.id, index))
    const cache = new Map()
    const first = layoutNodes(base, cache, baseEdges)
    const added = [...base, node(99, 'human')]
    const next = layoutNodes(added, cache, [...baseEdges, edge(base[3].id, 'human:99', 99)])

    base.forEach((item) => expect(positionKey(next.get(item.id)!)).toBe(positionKey(first.get(item.id)!)))
    expect(next.get('human:99')).toBeDefined()
    expect(minimumDistance(next)).toBeGreaterThan(8)
  })

  it('keeps several added neighbor nodes separated while preserving existing nodes', () => {
    const base = nodes(10)
    const baseEdges = base.slice(1).map((item, index) => edge(base[0].id, item.id, index))
    const cache = new Map()
    const first = layoutNodes(base, cache, baseEdges)
    const added = Array.from({ length: 8 }, (_, index) => node(100 + index, 'checker'))
    const nextEdges = [
      ...baseEdges,
      ...added.map((item, index) => edge(base[index % base.length].id, item.id, index + 100)),
    ]
    const next = layoutNodes([...base, ...added], cache, nextEdges)

    base.forEach((item) => expect(positionKey(next.get(item.id)!)).toBe(positionKey(first.get(item.id)!)))
    expect(new Set([...next.values()].map(positionKey)).size).toBe(next.size)
    expect(minimumDistance(next)).toBeGreaterThan(8)
  })

  it('returns real bounds for force positioned graphs', () => {
    const groupNodes = nodes(48)
    const graphEdges = groupNodes.slice(1).map((item, index) => edge(groupNodes[Math.max(0, index - 2)].id, item.id, index))
    const placed = layoutNodes(groupNodes, new Map(), graphEdges)
    const bounds = nodeBounds(groupNodes, placed, () => 18)

    expect(bounds).not.toBeNull()
    expect(bounds!.maxX).toBeGreaterThan(bounds!.minX)
    expect(bounds!.maxY).toBeGreaterThan(bounds!.minY)
  })
})
