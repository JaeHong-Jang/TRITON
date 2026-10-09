// 근거 온톨로지 상호작용 그래프
import { useMemo, useState } from 'react'
import type { Ontology } from '../../api/types'
import { buildGraph, kindsOf, touching, wrap2, type ClaimTypeFull, type GEdge, type GNode, type Tone } from './graphModel'

// 색 종류별 칠
const PAINT: Record<Tone, { fill: string; stroke: string; text: string; solid: string }> = {
  pro: { fill: '#f7e8e5', stroke: '#922a22', text: '#7a211b', solid: '#922a22' },
  con: { fill: '#e7edf6', stroke: '#1f3a66', text: '#182f54', solid: '#1f3a66' },
  derived: { fill: '#f1f5f9', stroke: '#94a3b8', text: '#475569', solid: '#64748b' },
  ink: { fill: '#ffffff', stroke: '#44403c', text: '#1c1917', solid: '#1c1917' },
  ok: { fill: '#ecfdf5', stroke: '#059669', text: '#065f46', solid: '#059669' },
  warn: { fill: '#fffbeb', stroke: '#d97706', text: '#92400e', solid: '#d97706' },
  dim: { fill: '#f5f5f4', stroke: '#a8a29e', text: '#57534e', solid: '#78716c' },
  bad: { fill: '#fef2f2', stroke: '#dc2626', text: '#991b1b', solid: '#dc2626' },
  ai: { fill: '#ecfdf5', stroke: '#10b981', text: '#065f46', solid: '#10b981' },
  approval: { fill: '#fffbeb', stroke: '#f59e0b', text: '#92400e', solid: '#f59e0b' },
  human: { fill: '#1c1917', stroke: '#1c1917', text: '#ffffff', solid: '#1c1917' },
}

// 세 점으로 이은 곡선 위의 점
function bezierAt(a: [number, number], b: [number, number], c: [number, number], d: [number, number], t: number): [number, number] {
  const k = (i: number) => (1 - t) ** 3 * a[i] + 3 * (1 - t) ** 2 * t * b[i] + 3 * (1 - t) * t ** 2 * c[i] + t ** 3 * d[i]
  return [k(0), k(1)]
}

// 간선 하나
function Edge({ e, from, to, state }: { e: GEdge; from: GNode; to: GNode; state: 'idle' | 'on' | 'off' }) {
  const sideways = Math.abs(from.y - to.y) < 4
  const p0: [number, number] = sideways ? [from.x + from.w / 2, from.y] : [from.x, from.y + from.h / 2]
  const p3: [number, number] = sideways ? [to.x - to.w / 2, to.y] : [to.x, to.y - to.h / 2]
  const ym = (p0[1] + p3[1]) / 2
  const p1: [number, number] = sideways ? [p0[0] + 10, p0[1]] : [p0[0], ym]
  const p2: [number, number] = sideways ? [p3[0] - 10, p3[1]] : [p3[0], ym]
  const color = PAINT[e.tone].stroke
  const lp = e.label ? bezierAt(p0, p1, p2, p3, 0.74) : null
  const opacity = state === 'on' ? 1 : state === 'off' ? 0.07 : 0.4
  return (
    <g opacity={opacity} style={{ transition: 'opacity 0.15s' }}>
      <path d={`M${p0[0]} ${p0[1]} C${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`} fill="none" stroke={color} strokeWidth={state === 'on' ? 2.6 : 1.4} strokeDasharray={e.dashed ? '5 4' : undefined} />
      <circle cx={p3[0]} cy={p3[1]} r={state === 'on' ? 3.6 : 2.6} fill={color} />
      {lp && e.label ? (
        <g transform={`translate(${lp[0]} ${lp[1]})`}>
          <rect x={-14} y={-8} width={28} height={16} rx={8} fill="#fff" stroke={color} strokeWidth={1} />
          <text y={4} fontSize={10.5} fontWeight={800} textAnchor="middle" fill={color}>{e.label}</text>
        </g>
      ) : null}
    </g>
  )
}

// 노드 하나
function Node({ n, state, pinned, onHover, onPin }: { n: GNode; state: 'idle' | 'on' | 'off'; pinned: boolean; onHover: (id: string | null) => void; onPin: (id: string) => void }) {
  const p = PAINT[n.tone]
  const solid = n.solid
  const lines = wrap2(n.label, Math.floor((n.w - 14) / 12.4))
  const total = lines.length * 15 + (n.sub ? 13 : 0)
  const top = n.y - total / 2
  const fg = solid ? '#fff' : p.text
  return (
    <g
      data-node={n.id}
      transform={`translate(${n.x - n.w / 2} ${n.y - n.h / 2})`}
      opacity={state === 'off' ? 0.3 : 1}
      style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
      tabIndex={0}
      role="button"
      aria-pressed={pinned}
      aria-label={`${n.label} ${n.sub}`}
      onMouseEnter={() => onHover(n.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(n.id)}
      onBlur={() => onHover(null)}
      onClick={() => onPin(n.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPin(n.id))}
    >
      <rect width={n.w} height={n.h} rx={n.kind === 'stance' ? 14 : 11} fill={solid ? p.solid : p.fill} stroke={p.stroke} strokeWidth={state === 'on' || pinned ? 2.6 : 1.4} strokeDasharray={n.tone === 'derived' ? '5 3' : undefined} />
      {lines.map((l, i) => (
        <text key={i} x={n.w / 2} y={top - n.y + n.h / 2 + 11 + i * 15} fontSize={n.kind === 'stance' ? 15 : 12.4} fontWeight={n.kind === 'stance' ? 900 : 800} textAnchor="middle" fill={fg}>{l}</text>
      ))}
      {n.sub ? <text x={n.w / 2} y={top - n.y + n.h / 2 + 11 + lines.length * 15 + 1} fontSize={10.5} fontWeight={600} textAnchor="middle" fill={fg} opacity={0.82}>{n.sub}</text> : null}
    </g>
  )
}

// 노드 설명 내용 만들기
function describe(ont: Ontology, n: GNode): { title: string; tag: string; lines: string[]; bullets: string[]; bulletsTitle: string } {
  const key = n.id.split(':')[1]
  const cts = ont.claim_types as ClaimTypeFull[]
  const kindLabel = (k: string) => ont.evidence_kinds[k as 'quote']?.label ?? k
  if (n.kind === 'claim') {
    const c = cts.find((x) => x.id === key)!
    return { title: c.label, tag: c.stance === 'pro' ? '찬성 주장' : c.stance === 'con' ? '반대 주장' : '파생 주장', lines: [c.definition, `쓸 수 있는 근거: ${kindsOf(c).map(kindLabel).join(' · ')}`], bullets: c.signals ?? [], bulletsTitle: '이런 단서가 보이면' }
  }
  if (n.kind === 'stance') {
    const st = ont.stances[key as 'pro']
    return { title: `${st.label} · ${st.meaning}`, tag: '입장', lines: ['입장은 주장 유형에서 자동으로 정해지고, 천칭의 접시를 결정합니다.'], bullets: cts.filter((c) => c.stance === key).map((c) => c.label), bulletsTitle: '이 입장의 주장 유형' }
  }
  if (n.kind === 'kind') {
    return { title: ont.evidence_kinds[key as 'quote'].label, tag: '근거 종류', lines: ['코드로 원문과 대조할 수 있는 형태만 근거로 받습니다.'], bullets: cts.filter((c) => kindsOf(c).includes(key as 'quote')).map((c) => c.label), bulletsTitle: '이 근거를 쓰는 주장 유형' }
  }
  if (n.kind === 'status') {
    const s = ont.evidence_status[key as 'verified']
    const voids = key === 'fabricated' || (s as { voids_claim?: boolean }).voids_claim
    return {
      title: s.label,
      tag: `무게 ×${s.factor}`,
      lines: [s.factor === 0 ? '천칭에 올라가지 않는 근거입니다.' : '천칭에 그대로 반영되는 근거입니다.', ...(voids ? ['이 근거를 낸 주장은 위증 의심으로 무효 처리될 수 있습니다.'] : [])],
      bullets: [],
      bulletsTitle: '',
    }
  }
  const a = ont.actions[key as 'L0']
  const who = { ai: 'AI가 스스로 실행할 수 있습니다.', human_approval: '사람 판사가 승인해야 실행됩니다.', human_only: '사람만 결정할 수 있습니다. AI는 제안도 하지 못합니다.' }[a.autonomy]
  return { title: `${a.label} (${key})`, tag: { ai: '기록/안내', human_approval: '사람 승인', human_only: '사람만' }[a.autonomy], lines: [who, '판사가 조치 단계를 선택하고 장부에 승인 기록을 남깁니다.'], bullets: [], bulletsTitle: '' }
}

// 온톨로지 그래프 컴포넌트
export function OntologyGraph({ ont }: { ont: Ontology }) {
  const g = useMemo(() => buildGraph(ont), [ont])
  const byId = useMemo(() => new Map(g.nodes.map((n) => [n.id, n])), [g])
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const active = hover ?? pinned
  const t = active ? touching(g, active) : null
  const node = active ? byId.get(active) : null
  const info = node ? describe(ont, node) : null
  const firstHuman = g.nodes.filter((n) => n.kind === 'action').findIndex((n) => n.tone !== 'ai')
  const actions = g.nodes.filter((n) => n.kind === 'action')
  const split = firstHuman > 0 ? (actions[firstHuman - 1].x + actions[firstHuman - 1].w / 2 + actions[firstHuman].x - actions[firstHuman].w / 2) / 2 : null
  const actionY = actions[0]?.y ?? 0

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl bg-stone-50/70 ring-1 ring-stone-100">
        <svg viewBox={`0 0 ${g.width} ${g.height}`} className="block h-auto w-full min-w-[760px]" role="group" aria-label="근거 온톨로지 그래프">
          {g.rows.map((r) => (
            <text key={r.label} x={14} y={r.y - 34} fontSize={11} fontWeight={800} fill="#a8a29e">{r.label}</text>
          ))}
          {split !== null ? (
            <g>
              <line x1={split} x2={split} y1={actionY - 44} y2={actionY + 40} stroke="#a8a29e" strokeDasharray="4 4" />
              <text x={split - 8} y={actionY - 48} fontSize={10.5} fontWeight={800} textAnchor="end" fill="#059669">◀ AI가 스스로</text>
              <text x={split + 8} y={actionY - 48} fontSize={10.5} fontWeight={800} fill="#b45309">사람이 개입 ▶</text>
            </g>
          ) : null}
          {g.edges.map((e) => <Edge key={e.id} e={e} from={byId.get(e.from)!} to={byId.get(e.to)!} state={t ? (t.edges.has(e.id) ? 'on' : 'off') : 'idle'} />)}
          {g.nodes.map((n) => <Node key={n.id} n={n} state={t ? (t.nodes.has(n.id) ? 'on' : 'off') : 'idle'} pinned={pinned === n.id} onHover={setHover} onPin={(id) => setPinned((p) => (p === id ? null : id))} />)}
        </svg>
      </div>
      <aside className="min-h-[148px] rounded-xl border border-stone-200 bg-white p-4 text-sm" aria-live="polite" aria-label="선택한 노드 설명">
        {info && node ? (
          <div className="grid gap-x-8 gap-y-2 min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div>
            <p className="mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: PAINT[node.tone].fill, color: PAINT[node.tone].text, boxShadow: `inset 0 0 0 1px ${PAINT[node.tone].stroke}` }}>{info.tag}</p>
            <h3 className="text-[15px] font-black leading-snug">{info.title}</h3>
            {info.lines.map((l) => <p key={l} className="mt-2 leading-relaxed text-stone-700">{l}</p>)}
            </div>
            <div>
            {info.bullets.length ? (
              <>
                <p className="text-xs font-bold text-stone-500">{info.bulletsTitle}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-stone-700">{info.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
              </>
            ) : null}
            {pinned ? <button type="button" className="mt-3 text-xs font-bold text-stone-500 underline" onClick={() => setPinned(null)}>고정 해제</button> : <p className="mt-3 text-[11px] text-stone-400">클릭하면 설명을 고정합니다.</p>}
            </div>
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-2 min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div>
            <h3 className="text-[15px] font-black">그래프 읽는 법</h3>
            <p className="mt-2 leading-relaxed text-stone-700">위에서 아래로 읽습니다. 입장이 주장 유형을 낳고, 주장은 코드로 검증 가능한 근거를 내며, 검증 결과에 따라 천칭에 얹히는 무게가 정해집니다. 노드를 누르거나 마우스를 올리면 이어진 선이 강조되고 정의가 여기에 나옵니다.</p>
            </div>
            <ul className="space-y-1.5 text-[13px] text-stone-700">
              <li><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-pro" />주황 · 찬성(낚시성이다)</li>
              <li><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-con" />파랑 · 반대(낚시성 아니다)</li>
              <li><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-slate-400" />회색 점선 · 파생(반박)</li>
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}
