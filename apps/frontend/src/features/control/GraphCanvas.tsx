// 공개 근거 관계 탐색 캔버스
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { ControlGraph, ControlGroup, ControlKind } from '../../lib/controlTypes'
import { GROUP_LABELS, KIND_LABELS } from '../../lib/controlTypes'
import { GROUP_ORDER, layoutNodes, nodeBounds } from '../../lib/controlLayout'
import type { LayoutCache, NodePosition } from '../../lib/controlLayout'
import './graph-canvas.css'

// 그래프 시점
type Camera = { x: number; y: number; k: number }
// 드래그 시작점
type Drag = { pointer: number; x: number; y: number; moved: boolean; nodeId?: string; origin: NodePosition }
const COLORS: Record<ControlGroup, string> = { source: '#dbd8cf', prosecution: '#922a22', defense: '#1f3a66', checker: '#8fac85', human: '#d4b370', ontology: '#a092bc' }
const KINDS: ControlKind[] = ['article', 'sentence', 'claim', 'evidence', 'check', 'concept', 'rule', 'judgment']

// 표시 길이 제한
function shorten(value: string, max = 20) { return value.length > max ? `${value.slice(0, max - 1)}…` : value }

// 라벨의 화면 폭 추정
function labelWidth(value: string) { return [...shorten(value)].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 11 : 6), 0) }

// 검증 상태 이름
function statusName(value?: string | null) {
  const names: Record<string, string> = { verified: '원문 일치', misnumbered: '문장 번호 오류', title: '제목 근거', present: '핵심어 존재', fabricated: '원문 없음', admitted: '채택', struck: '기각' }
  return value ? names[value] ?? value : ''
}

// 공개된 노드와 관계 탐색
export function GraphCanvas({ graph, selectedId, selectedEdgeId, onSelect, onSelectEdge, focusGroup = null }: {
  graph: ControlGraph; selectedId: string | null; selectedEdgeId: string | null
  onSelect: (id: string | null) => void; onSelectEdge: (id: string | null) => void; focusGroup?: ControlGroup | null
}) {
  const titleId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const layoutCache = useRef<LayoutCache>(new Map())
  const drag = useRef<Drag | null>(null)
  const skipClick = useRef(false)
  const fitOnce = useRef(false)
  const sizeRef = useRef({ width: 800, height: 560 })
  const previousFocus = useRef<ControlGroup | null>(null)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<ControlGroup | 'all'>('all')
  const [kind, setKind] = useState<ControlKind | 'all'>('all')
  const [status, setStatus] = useState('all')
  const [folded, setFolded] = useState<Set<ControlGroup>>(new Set())
  const [labels, setLabels] = useState(true)
  const [neighborsOnly, setNeighborsOnly] = useState(false)
  const [listMode, setListMode] = useState(false)
  const [filters, setFilters] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 800, height: 560 })
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, k: 1 })
  const [manual, setManual] = useState<Map<string, NodePosition>>(new Map())
  const layout = useMemo(() => layoutNodes(graph.nodes, layoutCache.current, graph.edges), [graph.nodes, graph.edges])
  const placed = useMemo(() => new Map([...layout].map(([id, node]) => [id, { ...node, ...manual.get(id) }])), [layout, manual])
  const selectedEdge = graph.edges.find((edge) => edge.id === selectedEdgeId)
  const focusedId = hovered ?? selectedId
  const neighbors = useMemo(() => {
    const ids = new Set<string>()
    if (focusedId) {
      ids.add(focusedId)
      graph.edges.forEach((edge) => { if (edge.from === focusedId) ids.add(edge.to); if (edge.to === focusedId) ids.add(edge.from) })
    } else if (selectedEdge) { ids.add(selectedEdge.from); ids.add(selectedEdge.to) }
    return ids
  }, [graph.edges, focusedId, selectedEdge])
  const degree = useMemo(() => {
    const counts = new Map<string, number>()
    graph.edges.forEach((edge) => { counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1); counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1) })
    return counts
  }, [graph.edges])
  const selectedNeighbors = useMemo(() => {
    const ids = new Set([selectedId])
    graph.edges.forEach((edge) => { if (edge.from === selectedId) ids.add(edge.to); if (edge.to === selectedId) ids.add(edge.from) })
    return ids
  }, [graph.edges, selectedId])
  const nodes = useMemo(() => graph.nodes.filter((node) => {
    if (node.id === selectedId || node.id === selectedEdge?.from || node.id === selectedEdge?.to) return true
    if (folded.has(node.group) || (group !== 'all' && node.group !== group) || (kind !== 'all' && node.kind !== kind)) return false
    if (status !== 'all' && (node.status ?? node.ruling) !== status) return false
    if (neighborsOnly && selectedId && !selectedNeighbors.has(node.id)) return false
    const haystack = `${node.id} ${node.label} ${node.detail} ${node.fields.map((field) => field.value).join(' ')}`.toLowerCase()
    return !query.trim() || haystack.includes(query.trim().toLowerCase())
  }), [graph.nodes, group, kind, status, folded, query, neighborsOnly, selectedNeighbors, selectedId, selectedEdge])
  const visibleIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes])
  const edges = useMemo(() => graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)), [graph.edges, visibleIds])
  const statuses = [...new Set(graph.nodes.flatMap((node) => {
    const value = node.status ?? node.ruling
    return value ? [value] : []
  }))]
  const hasFocus = neighbors.size > 0

  // 보이는 관계망의 여백을 포함한 맞춤
  function fit() {
    const bounds = nodeBounds(nodes, placed, () => 8)
    if (!bounds) return
    const width = Math.max(420, bounds.maxX - bounds.minX + 90)
    const height = Math.max(300, bounds.maxY - bounds.minY + 80)
    const k = Math.max(0.08, Math.min(1.6, (size.width - 80) / width, (size.height - 80) / height))
    setCamera({ k, x: size.width / 2 - (bounds.minX + bounds.maxX) / 2 * k, y: size.height / 2 - (bounds.minY + bounds.maxY) / 2 * k })
  }

  // 기준점을 보존한 확대
  function zoom(factor: number, point = { x: size.width / 2, y: size.height / 2 }) {
    setCamera((old) => {
      const k = Math.max(0.08, Math.min(6, old.k * factor))
      return { k, x: point.x - (point.x - old.x) * k / old.k, y: point.y - (point.y - old.y) * k / old.k }
    })
  }

  useEffect(() => {
    if (focusGroup) setGroup(focusGroup)
    else if (previousFocus.current) setGroup('all')
    previousFocus.current = focusGroup
  }, [focusGroup])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(() => {
      const rect = svg.getBoundingClientRect()
      const old = sizeRef.current
      const next = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) }
      if (old.width === next.width && old.height === next.height) return
      sizeRef.current = next
      setCamera((view) => ({ ...view, x: view.x + (next.width - old.width) / 2, y: view.y + (next.height - old.height) / 2 }))
      setSize(next)
    })
    observer.observe(svg)
    // 캔버스에 한정된 포인터 중심 확대
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      zoom(Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); svg.removeEventListener('wheel', wheel) }
  }, [listMode])

  useEffect(() => {
    if (fitOnce.current || !nodes.length || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    if (Math.abs(rect.width - size.width) > 1) return
    fitOnce.current = true
    fit()
  })

  useEffect(() => {
    // 전체 화면 종료 키
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])

  // 선택 노드를 화면 중앙으로 이동
  function centerSelected() {
    const node = selectedId ? placed.get(selectedId) : null
    if (node) setCamera((view) => ({ ...view, x: size.width / 2 - node.x * view.k, y: size.height / 2 - node.y * view.k }))
  }

  // 포인터 드래그 시작
  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    const target = event.target as Element
    if (target.closest('[data-edge-id]')) return
    const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id') ?? undefined
    const point = nodeId ? placed.get(nodeId) : camera
    if (!point) return
    skipClick.current = false
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false, nodeId, origin: { x: point.x, y: point.y } }
  }

  // 노드 또는 배경 드래그
  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    const dx = event.clientX - active.x
    const dy = event.clientY - active.y
    if (Math.hypot(dx, dy) < 3 && !active.moved) return
    if (!active.moved) event.currentTarget.setPointerCapture(event.pointerId)
    active.moved = true
    if (active.nodeId) {
      const id = active.nodeId
      setManual((old) => new Map(old).set(id, { x: active.origin.x + dx / camera.k, y: active.origin.y + dy / camera.k }))
    } else setCamera((old) => ({ ...old, x: active.origin.x + dx, y: active.origin.y + dy }))
  }

  // 드래그 종료와 클릭 구분
  function endDrag(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.pointer !== event.pointerId) return
    skipClick.current = !!drag.current.moved
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  // 원형 노드 선택
  function selectNode(id: string) { if (!skipClick.current) { onSelect(id); onSelectEdge(null) } }

  // 필터 초기화
  function resetFilters() { setQuery(''); setGroup('all'); setKind('all'); setStatus('all'); setFolded(new Set()); setNeighborsOnly(false) }

  // 확대 수준과 라벨 충돌에 따른 표시
  const labelIds = useMemo(() => {
    const kept = new Set<string>()
    const boxes: { x: number; y: number; width: number }[] = []
    const compact = size.width < 560
    const labelLimit = compact ? 7 : nodes.length > 80 ? 34 : 60
    const ordered = [...nodes].sort((a, b) => Number(b.id === focusedId) - Number(a.id === focusedId) || Number(neighbors.has(b.id)) - Number(neighbors.has(a.id)) || (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    for (const node of ordered) {
      const active = node.id === focusedId || node.id === selectedId
      if (!active && kept.size >= labelLimit) continue
      if (!active && compact && nodes.length > 12 && (degree.get(node.id) ?? 0) < 2) continue
      if (!active && (!labels || (nodes.length > 100 && camera.k < 1 && (degree.get(node.id) ?? 0) < 3))) continue
      const point = placed.get(node.id)
      if (!point) continue
      const x = point.x * camera.k + camera.x
      const y = point.y * camera.k + camera.y + 14
      const width = labelWidth(node.label)
      if (x < 12 || x > size.width - 12 || y < 12 || y > size.height - 12) continue
      const left = Math.max(8, Math.min(size.width - width - 8, x - width / 2))
      if (!active && boxes.some((box) => Math.abs(box.y - y) < (compact ? 28 : 18) && left < box.x + box.width + 12 && left + width + 12 > box.x)) continue
      kept.add(node.id)
      boxes.push({ x: left, y, width })
    }
    return kept
  }, [nodes, focusedId, selectedId, neighbors, degree, labels, camera, placed, size])

  return <section className={`gc-shell ${fullscreen ? 'gc-shell-fullscreen' : ''}`} aria-labelledby={titleId}>
    <header className="gc-toolbar"><div><h2 id={titleId}>관계 그래프</h2><p>{nodes.length}개 노드 · {edges.length}개 연결{nodes.length !== graph.nodes.length ? ` · 전체 ${graph.nodes.length}개` : ''}</p></div><div className="gc-actions">
      <button type="button" onClick={() => zoom(1.25)} aria-label="확대">＋</button><button type="button" onClick={() => zoom(0.8)} aria-label="축소">−</button><button type="button" onClick={fit}>맞춤</button><button type="button" disabled={!selectedId} onClick={centerSelected}>선택 중심</button><button type="button" aria-pressed={fullscreen} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? '닫기' : '확대보기'}</button>
    </div></header>
    <div className="gc-searchbar"><label><span className="gc-sr-only">검색</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="노드 이름이나 근거 검색" /></label><button type="button" aria-expanded={filters} onClick={() => setFilters(!filters)}>필터 {filters ? '−' : '＋'}</button><label className="gc-view-switch"><input type="checkbox" checked={listMode} onChange={(e) => setListMode(e.target.checked)} />목록 보기</label></div>
    {filters ? <div className="gc-filter-panel">
      <div className="gc-filters"><label><span>군집</span><select value={group} onChange={(e) => setGroup(e.target.value as ControlGroup | 'all')}><option value="all">전체</option>{GROUP_ORDER.map((value) => <option key={value} value={value}>{GROUP_LABELS[value]}</option>)}</select></label><label><span>종류</span><select value={kind} onChange={(e) => setKind(e.target.value as ControlKind | 'all')}><option value="all">전체</option>{KINDS.map((value) => <option key={value} value={value}>{KIND_LABELS[value]}</option>)}</select></label><label><span>상태</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">전체</option>{statuses.map((value) => <option key={value} value={value}>{statusName(value)}</option>)}</select></label></div>
      <div className="gc-switches"><label><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />노드 이름</label><label><input type="checkbox" disabled={!selectedId} checked={neighborsOnly} onChange={(e) => setNeighborsOnly(e.target.checked)} />인접만 보기</label><button type="button" onClick={resetFilters}>초기화</button></div>
      <div className="gc-clusters" aria-label="군집 접기">{GROUP_ORDER.filter((value) => graph.nodes.some((node) => node.group === value)).map((value) => <button type="button" key={value} aria-pressed={folded.has(value)} onClick={() => setFolded((old) => { const next = new Set(old); if (next.has(value)) next.delete(value); else next.add(value); return next })}><i style={{ background: COLORS[value] }} />{GROUP_LABELS[value]}{folded.has(value) ? ' · 숨김' : ''}</button>)}</div>
    </div> : null}
    {graph.notice ? <p className="gc-notice">{graph.notice}</p> : null}
    {listMode ? <div className="gc-list" role="list" aria-label="그래프 목록">{nodes.map((node) => <button type="button" role="listitem" key={node.id} aria-current={node.id === selectedId ? 'true' : undefined} onClick={() => { onSelect(node.id); onSelectEdge(null) }}><i style={{ background: COLORS[node.group] }} /><span>{KIND_LABELS[node.kind]}</span><strong>{node.label}</strong><small>{GROUP_LABELS[node.group]}{statusName(node.status ?? node.ruling) ? ` · ${statusName(node.status ?? node.ruling)}` : ''}</small></button>)}</div> : <div className="gc-stage">
      <svg ref={svgRef} viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="근거와 온톨로지 관계 그래프" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={(event) => { if (!skipClick.current && !(event.target as Element).closest('[data-node-id], [data-edge-id]')) { onSelect(null); onSelectEdge(null) } }}>
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
          {edges.map((edge) => {
            const from = placed.get(edge.from), to = placed.get(edge.to)
            if (!from || !to) return null
            const active = selectedEdgeId === edge.id || hoveredEdge === edge.id
            const related = focusedId === edge.from || focusedId === edge.to
            return <g key={edge.id} className={`gc-edge ${active || related ? 'gc-related' : ''} ${hasFocus && !related && !active ? 'gc-dim' : ''}`} data-edge-id={edge.id}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} vectorEffect="non-scaling-stroke" />
              <line className="gc-edge-hit" x1={from.x} y1={from.y} x2={to.x} y2={to.y} vectorEffect="non-scaling-stroke" role="button" tabIndex={0} aria-label={`${edge.label}: ${edge.detail}`} onMouseEnter={() => setHoveredEdge(edge.id)} onMouseLeave={() => setHoveredEdge(null)} onClick={() => { onSelect(null); onSelectEdge(edge.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(null); onSelectEdge(edge.id) } }} />
              {active ? <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8 / camera.k} style={{ fontSize: 12 / camera.k, strokeWidth: 3 / camera.k }}>{edge.label} →</text> : null}
            </g>
          })}
          {nodes.map((node) => {
            const position = placed.get(node.id)
            if (!position) return null
            const active = node.id === focusedId || node.id === selectedId
            const radius = Math.min(9, 3.4 + Math.sqrt(degree.get(node.id) ?? 0) * 1.05)
            const screenX = position.x * camera.k + camera.x
            const width = labelWidth(node.label)
            const labelOffset = Math.max(8 + width / 2, Math.min(size.width - width / 2 - 8, screenX)) - screenX
            return <g key={node.id} transform={`translate(${position.x} ${position.y})`} className={`gc-node ${active ? 'gc-selected' : ''} ${hasFocus && !neighbors.has(node.id) ? 'gc-dim' : ''}`} data-node-id={node.id} role="button" tabIndex={0} aria-label={`${KIND_LABELS[node.kind]} ${node.label}, ${GROUP_LABELS[node.group]}`} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(node.id)} onBlur={() => setHovered(null)} onClick={() => selectNode(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); skipClick.current = false; selectNode(node.id) } }}>
              <title>{`${KIND_LABELS[node.kind]} · ${node.label}`}</title>
              <circle className="gc-node-hit" r={Math.max(12, radius + 4) / camera.k} />
              {active ? <circle className="gc-node-ring" r={(radius + 4) / camera.k} style={{ stroke: COLORS[node.group] }} vectorEffect="non-scaling-stroke" /> : null}
              <circle className="gc-dot" r={radius / camera.k} style={{ fill: COLORS[node.group] }} />
              {labelIds.has(node.id) ? <text className="gc-node-label" x={labelOffset / camera.k} y={(radius + 14) / camera.k} style={{ fontSize: (active ? 12 : 11) / camera.k, strokeWidth: 2.5 / camera.k }}>{shorten(node.label)}</text> : null}
            </g>
          })}
        </g>
      </svg>
      {!nodes.length ? <div className="gc-empty">표시할 노드가 없습니다.<button type="button" onClick={resetFilters}>필터 초기화</button></div> : null}
      <span className="gc-hint">드래그로 이동 · 휠로 확대 · 노드 선택으로 근거 확인</span>
    </div>}
    <footer className="gc-legend" aria-label="범례">{GROUP_ORDER.filter((value) => graph.nodes.some((node) => node.group === value)).map((value) => <span key={value}><i style={{ background: COLORS[value] }} />{GROUP_LABELS[value]}</span>)}<span className="gc-count">공개된 항목만 표시</span></footer>
  </section>
}
