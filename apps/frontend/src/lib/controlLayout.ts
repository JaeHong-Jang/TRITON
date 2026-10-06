// 관제 그래프 순수 레이아웃
import type { ControlEdge, ControlGroup, ControlNode } from './controlTypes'

// 그래프 좌표
export type NodePosition = { x: number; y: number }
// 좌표가 붙은 노드
export type LayoutNode = ControlNode & NodePosition
// 노드 위치 캐시
export type LayoutCache = Map<string, NodePosition>

export const VIEWPORT_WIDTH = 1600
export const VIEWPORT_HEIGHT = 900
export const GROUP_ORDER: ControlGroup[] = ['source', 'prosecution', 'defense', 'checker', 'human', 'ontology']

const CENTER: NodePosition = { x: VIEWPORT_WIDTH / 2, y: VIEWPORT_HEIGHT / 2 }
const MIN_X = 150
const MAX_X = VIEWPORT_WIDTH - 150
const MIN_Y = 110
const MAX_Y = VIEWPORT_HEIGHT - 110
const SPRING_LENGTH = 108
const REPULSION = 2200
const DAMPING = 0.82

// 안정적인 문자열 해시
function hashId(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash
}

// 위치 키
export function positionKey(position: NodePosition): string {
  return `${Math.round(position.x)}:${Math.round(position.y)}`
}

// 캐시 키
function cacheKey(node: ControlNode): string {
  return `${node.group}:${node.id}`
}

// 숫자 범위 제한
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// 안정적인 초기 각도
function seededAngle(id: string): number {
  return (hashId(id) % 6283) / 1000
}

// 연결 성분 추출
function connectedComponents(nodes: ControlNode[], edges: ControlEdge[]): string[][] {
  const ids = new Set(nodes.map((node) => node.id))
  const adjacency = new Map<string, string[]>()
  ids.forEach((id) => adjacency.set(id, []))
  edges.forEach((edge) => {
    if (!ids.has(edge.from) || !ids.has(edge.to)) return
    adjacency.get(edge.from)?.push(edge.to)
    adjacency.get(edge.to)?.push(edge.from)
  })
  const visited = new Set<string>()
  const components: string[][] = []
  ;[...ids].sort().forEach((id) => {
    if (visited.has(id)) return
    const queue = [id]
    const component: string[] = []
    visited.add(id)
    while (queue.length) {
      const current = queue.shift()!
      component.push(current)
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        queue.push(next)
      }
    }
    components.push(component.sort())
  })
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}

// 성분 중심 좌표
function componentCenter(index: number, count: number): NodePosition {
  if (count <= 1) return CENTER
  if (count === 2) return { x: CENTER.x + (index === 0 ? -270 : 270), y: CENTER.y }
  const radiusX = Math.min(430, 155 + count * 28)
  const radiusY = Math.min(250, 110 + count * 18)
  const angle = (-Math.PI / 2) + (index / count) * Math.PI * 2
  return { x: CENTER.x + Math.cos(angle) * radiusX, y: CENTER.y + Math.sin(angle) * radiusY }
}

// 새 노드 초기 좌표
function initialPosition(node: ControlNode, index: number, total: number, center: NodePosition): NodePosition {
  if (total === 1) return center
  const angle = seededAngle(node.id) + (index / Math.max(1, total)) * Math.PI * 2
  const radius = Math.min(230, 44 + Math.sqrt(total) * 26)
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  }
}

// 가까운 이웃 좌표
function neighborPosition(node: ControlNode, edges: ControlEdge[], positions: Map<string, NodePosition>): NodePosition | null {
  const neighbors = edges.flatMap((edge) => edge.from === node.id ? [edge.to] : edge.to === node.id ? [edge.from] : [])
  const placed = neighbors.map((id) => positions.get(id)).filter((position): position is NodePosition => Boolean(position))
  if (!placed.length) return null
  const x = placed.reduce((sum, position) => sum + position.x, 0) / placed.length
  const y = placed.reduce((sum, position) => sum + position.y, 0) / placed.length
  const angle = seededAngle(node.id)
  return { x: x + Math.cos(angle) * 88, y: y + Math.sin(angle) * 88 }
}

// 좌표 정리
function normalizePosition(position: NodePosition): NodePosition {
  return {
    x: clamp(Number(position.x.toFixed(2)), MIN_X, MAX_X),
    y: clamp(Number(position.y.toFixed(2)), MIN_Y, MAX_Y),
  }
}

// 좌표 반올림
function roundPosition(position: NodePosition): NodePosition {
  return { x: Number(position.x.toFixed(2)), y: Number(position.y.toFixed(2)) }
}

// 첫 배치 화면 맞춤
function fitPositionsToViewport(positions: Map<string, NodePosition>): void {
  const values = [...positions.values()]
  if (!values.length) return
  const minX = Math.min(...values.map((position) => position.x))
  const maxX = Math.max(...values.map((position) => position.x))
  const minY = Math.min(...values.map((position) => position.y))
  const maxY = Math.max(...values.map((position) => position.y))
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const scale = Math.min(1, (MAX_X - MIN_X) / width, (MAX_Y - MIN_Y) / height)
  const sourceCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  positions.forEach((position, id) => {
    positions.set(id, normalizePosition({
      x: CENTER.x + (position.x - sourceCenter.x) * scale,
      y: CENTER.y + (position.y - sourceCenter.y) * scale,
    }))
  })
}

// 중복 좌표 분산
function separateOverlaps(positions: Map<string, NodePosition>): void {
  const used = new Set<string>()
  ;[...positions.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([id, position]) => {
    const base = normalizePosition(position)
    if (!used.has(positionKey(base))) {
      used.add(positionKey(base))
      positions.set(id, base)
      return
    }
    const angle = seededAngle(id)
    for (let step = 1; step < 220; step += 1) {
      const ring = Math.ceil(step / 12)
      const theta = angle + step * 2.399963
      const candidate = normalizePosition({ x: base.x + Math.cos(theta) * ring * 13, y: base.y + Math.sin(theta) * ring * 13 })
      const key = positionKey(candidate)
      if (used.has(key)) continue
      used.add(key)
      positions.set(id, candidate)
      return
    }
    used.add(`${positionKey(base)}:${id}`)
    positions.set(id, base)
  })
}

// 힘 기반 좌표 계산
function solveLayout(nodes: ControlNode[], edges: ControlEdge[], positions: Map<string, NodePosition>, movable: Set<string>, componentTargets: Map<string, NodePosition>): void {
  const velocities = new Map<string, NodePosition>()
  movable.forEach((id) => velocities.set(id, { x: 0, y: 0 }))
  const iterations = movable.size === nodes.length ? 180 : 80
  const ids = nodes.map((node) => node.id)
  for (let step = 0; step < iterations; step += 1) {
    const forces = new Map<string, NodePosition>()
    movable.forEach((id) => forces.set(id, { x: 0, y: 0 }))

    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = ids[i]
        const b = ids[j]
        if (!movable.has(a) && !movable.has(b)) continue
        const pa = positions.get(a)
        const pb = positions.get(b)
        if (!pa || !pb) continue
        const dx = pa.x - pb.x
        const dy = pa.y - pb.y
        const distanceSq = Math.max(1600, dx * dx + dy * dy)
        const distance = Math.sqrt(distanceSq)
        const force = REPULSION / distanceSq
        const fx = (dx / distance) * force * 100
        const fy = (dy / distance) * force * 100
        if (movable.has(a)) {
          const value = forces.get(a)!
          value.x += fx
          value.y += fy
        }
        if (movable.has(b)) {
          const value = forces.get(b)!
          value.x -= fx
          value.y -= fy
        }
      }
    }

    edges.forEach((edge) => {
      if (!positions.has(edge.from) || !positions.has(edge.to)) return
      if (!movable.has(edge.from) && !movable.has(edge.to)) return
      const from = positions.get(edge.from)!
      const to = positions.get(edge.to)!
      const dx = to.x - from.x
      const dy = to.y - from.y
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const force = (distance - SPRING_LENGTH) * 0.018
      const fx = (dx / distance) * force
      const fy = (dy / distance) * force
      if (movable.has(edge.from)) {
        const value = forces.get(edge.from)!
        value.x += fx
        value.y += fy
      }
      if (movable.has(edge.to)) {
        const value = forces.get(edge.to)!
        value.x -= fx
        value.y -= fy
      }
    })

    movable.forEach((id) => {
      const position = positions.get(id)
      const target = componentTargets.get(id) ?? CENTER
      const force = forces.get(id)
      const velocity = velocities.get(id)
      if (!position || !force || !velocity) return
      force.x += (target.x - position.x) * 0.012
      force.y += (target.y - position.y) * 0.012
      velocity.x = (velocity.x + force.x) * DAMPING
      velocity.y = (velocity.y + force.y) * DAMPING
      const cooling = 1 - step / iterations
      const maxVelocity = 26 * Math.max(0.18, cooling)
      const speed = Math.max(1, Math.hypot(velocity.x, velocity.y))
      const factor = Math.min(1, maxVelocity / speed)
      velocity.x *= factor
      velocity.y *= factor
      positions.set(id, roundPosition({ x: position.x + velocity.x, y: position.y + velocity.y }))
    })
  }
}

// 그래프 레이아웃
export function layoutNodes(nodes: ControlNode[], cache: LayoutCache, edges: ControlEdge[] = []): Map<string, LayoutNode> {
  const placed = new Map<string, LayoutNode>()
  if (!nodes.length) return placed

  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id))
  const validIds = new Set(sorted.map((node) => node.id))
  const validEdges = edges.filter((edge) => validIds.has(edge.from) && validIds.has(edge.to))
  const positions = new Map<string, NodePosition>()
  const movable = new Set<string>()

  if (sorted.length === 1) {
    const position = normalizePosition(cache.get(cacheKey(sorted[0])) ?? CENTER)
    cache.set(cacheKey(sorted[0]), position)
    placed.set(sorted[0].id, { ...sorted[0], ...position })
    return placed
  }

  if (sorted.length === 2 && !cache.size) {
    const left = normalizePosition({ x: CENTER.x - 95, y: CENTER.y })
    const right = normalizePosition({ x: CENTER.x + 95, y: CENTER.y })
    const ordered = sorted.map((node, index) => [node, index === 0 ? left : right] as const)
    ordered.forEach(([node, position]) => {
      cache.set(cacheKey(node), position)
      placed.set(node.id, { ...node, ...position })
    })
    return placed
  }

  const components = connectedComponents(sorted, validEdges)
  const componentTargets = new Map<string, NodePosition>()
  components.forEach((component, index) => {
    const center = componentCenter(index, components.length)
    component.forEach((id) => componentTargets.set(id, center))
  })

  sorted.forEach((node) => {
    const cached = cache.get(cacheKey(node))
    if (cached) {
      positions.set(node.id, normalizePosition(cached))
      return
    }
    movable.add(node.id)
  })

  components.forEach((component, componentIndex) => {
    const center = componentCenter(componentIndex, components.length)
    component.forEach((id, index) => {
      if (positions.has(id)) return
      const node = sorted.find((item) => item.id === id)
      if (!node) return
      const nearNeighbor = neighborPosition(node, validEdges, positions)
      positions.set(id, normalizePosition(nearNeighbor ?? initialPosition(node, index, component.length, center)))
    })
  })

  if (movable.size) solveLayout(sorted, validEdges, positions, movable, componentTargets)
  if (movable.size === sorted.length) fitPositionsToViewport(positions)
  separateOverlaps(positions)

  sorted.forEach((node) => {
    const position = normalizePosition(positions.get(node.id) ?? CENTER)
    cache.set(cacheKey(node), position)
    placed.set(node.id, { ...node, ...position })
  })
  return placed
}

// 보이는 노드 경계
export function nodeBounds(nodes: ControlNode[], placed: Map<string, LayoutNode>, radiusFor: (node: ControlNode) => number): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!nodes.length) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  nodes.forEach((node) => {
    const position = placed.get(node.id)
    if (!position) return
    const pad = radiusFor(node) + 34
    minX = Math.min(minX, position.x - pad)
    minY = Math.min(minY, position.y - pad)
    maxX = Math.max(maxX, position.x + pad)
    maxY = Math.max(maxY, position.y + pad)
  })
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}
