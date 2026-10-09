// 사건별 근거 그래프 (에이전트 → 주장 → 근거 → 기사 문장)
import { useMemo, useState } from 'react'
import type { EvidenceStatus, Sentence, Stance, TrialRecord } from '../../api/types'
import { verifiedLabel } from '../../ui/format'
import { claimLabel, statusLabel, useOntology } from '../../ui/ontology'
import { chainOf, COLS, layoutEvidence, type LEdge, type LNode } from './evidenceLayout'
import { wrap2 } from './graphModel'

const STANCE_PAINT: Record<Stance | 'derived', { fill: string; stroke: string; text: string }> = {
  pro: { fill: '#f7e8e5', stroke: '#922a22', text: '#7a211b' },
  con: { fill: '#e7edf6', stroke: '#1f3a66', text: '#182f54' },
  derived: { fill: '#f1f5f9', stroke: '#94a3b8', text: '#475569' },
}
const STATUS_PAINT: Record<EvidenceStatus, { fill: string; stroke: string; text: string }> = {
  verified: { fill: '#ecfdf5', stroke: '#059669', text: '#065f46' },
  misnumbered: { fill: '#fffbeb', stroke: '#d97706', text: '#92400e' },
  title: { fill: '#f5f5f4', stroke: '#a8a29e', text: '#57534e' },
  present: { fill: '#f5f5f4', stroke: '#a8a29e', text: '#57534e' },
  fabricated: { fill: '#fef2f2', stroke: '#dc2626', text: '#991b1b' },
}

// 노드가 오른쪽·왼쪽 끝에서 간선과 만나는 점
function anchor(n: LNode, side: 'l' | 'r'): [number, number] {
  return [side === 'r' ? n.x + n.w : n.x, n.y + n.h / 2]
}

// 간선 하나
function Edge({ e, a, b, state }: { e: LEdge; a: LNode; b: LNode; state: 'idle' | 'on' | 'off' }) {
  const [x1, y1] = anchor(a, 'r')
  const [x2, y2] = anchor(b, 'l')
  const xm = (x1 + x2) / 2
  const color = e.kind === 'cite' ? '#a8a29e' : e.stance ? STANCE_PAINT[e.stance].stroke : '#a8a29e'
  const opacity = state === 'on' ? 1 : state === 'off' ? 0.06 : e.kind === 'rebut' ? 0.9 : 0.45
  const mid: [number, number] = [(x1 + x2) / 2, (y1 + y2) / 2]
  return (
    <g opacity={opacity} style={{ transition: 'opacity 0.15s' }}>
      <path d={`M${x1} ${y1} C${xm} ${y1} ${xm} ${y2} ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={e.kind === 'rebut' ? 2.4 : state === 'on' ? 2.4 : 1.4} strokeDasharray={e.kind === 'rebut' ? '6 4' : undefined} />
      <circle cx={x2} cy={y2} r={2.8} fill={color} />
      {e.kind === 'rebut' ? (
        <g transform={`translate(${mid[0]} ${mid[1]})`}>
          <rect x={-17} y={-8.5} width={34} height={17} rx={8.5} fill="#fff" stroke={color} />
          <text y={4} fontSize={10.5} fontWeight={800} textAnchor="middle" fill={color}>반박</text>
        </g>
      ) : null}
    </g>
  )
}

// 노드 하나
function Node({ n, state, selected, onPick, statusText }: { n: LNode; state: 'idle' | 'on' | 'off'; selected: boolean; onPick: (id: string) => void; statusText: string }) {
  const p = n.col === 'ev' && n.status ? STATUS_PAINT[n.status] : n.col === 'sent' ? { fill: '#fafaf9', stroke: '#a8a29e', text: '#44403c' } : STANCE_PAINT[n.stance ?? 'derived']
  const lines = n.col === 'claim' || n.col === 'sent' ? wrap2(n.text, n.col === 'claim' ? 21 : 22) : []
  return (
    <g
      data-node={n.id}
      transform={`translate(${n.x} ${n.y})`}
      opacity={state === 'off' ? 0.25 : 1}
      style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${n.title} ${n.col === 'ev' ? statusText : n.text}`}
      onClick={() => onPick(n.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(n.id))}
    >
      <rect width={n.w} height={n.h} rx={n.col === 'agent' ? 21 : 10} fill={p.fill} stroke={n.warn ? '#dc2626' : p.stroke} strokeWidth={selected ? 3 : n.warn ? 2 : 1.3} />
      {n.col === 'agent' ? (
        <>
          <rect x={8} y={n.h / 2 - 9} width={20} height={18} rx={9} fill={p.stroke} />
          <text x={18} y={n.h / 2 + 3.6} fontSize={9.5} fontWeight={800} textAnchor="middle" fill="#fff">AI</text>
          <text x={36} y={n.h / 2 + 4.5} fontSize={12.5} fontWeight={800} fill={p.text}>{n.title}</text>
        </>
      ) : null}
      {n.col === 'claim' ? (
        <>
          <text x={12} y={21} fontSize={12.5} fontWeight={800} fill={p.text}>{n.title}</text>
          {n.badge ? (
            <g transform={`translate(${n.w - 12 - (n.warn ? 84 : 46)} 8)`}>
              <rect width={n.warn ? 84 : 46} height={17} rx={8.5} fill={n.warn ? '#dc2626' : '#f59e0b'} />
              <text x={(n.warn ? 84 : 46) / 2} y={12.2} fontSize={10} fontWeight={800} textAnchor="middle" fill="#fff">{n.badge}</text>
            </g>
          ) : null}
          {lines.map((l, i) => <text key={i} x={12} y={41 + i * 16} fontSize={11.5} fill="#44403c">{l}</text>)}
        </>
      ) : null}
      {n.col === 'ev' ? (
        <>
          <text x={12} y={20} fontSize={12} fontWeight={700} fill={p.text}>{n.title}</text>
          <text x={12} y={37} fontSize={10.5} fontWeight={800} fill={p.stroke}>● {statusText}</text>
        </>
      ) : null}
      {n.col === 'sent' ? (
        <>
          <text x={12} y={19} fontSize={12} fontWeight={800} fill={p.text}>{n.title}</text>
          <text x={12} y={34} fontSize={11} fill="#57534e">{lines[0]}</text>
          {lines[1] ? <text x={12} y={46} fontSize={11} fill="#57534e">{lines[1]}</text> : null}
        </>
      ) : null}
    </g>
  )
}

// 근거 그래프 컴포넌트
export function EvidenceGraph({ rec, sentences }: { rec: TrialRecord; sentences: Sentence[] }) {
  const ont = useOntology((s) => s.ont)
  const g = useMemo(() => layoutEvidence(rec, sentences, (t) => claimLabel(ont, t)), [rec, sentences, ont])
  const evidenceKinds = useMemo(() => new Map(rec.claims.flatMap((claim) => claim.evidence.map((evidence) => [evidence.id, evidence.kind] as const))), [rec])
  const byId = useMemo(() => new Map(g.nodes.map((n) => [n.id, n])), [g])
  const [pick, setPick] = useState<string | null>(null)
  const chain = pick && byId.has(pick) ? chainOf(g, pick) : null
  const heads: [string, string][] = [['agent', '에이전트'], ['claim', '주장'], ['ev', '근거'], ['sent', '기사 문장']]
  if (!g.nodes.length) return <p className="text-sm text-stone-500">이 심급에는 그래프로 그릴 주장이 없습니다.</p>
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-stone-600">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-pro" />찬성</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-con" />반대</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600" />{verifiedLabel()}</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-600" />번호 오류</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-red-600" />위증 의심</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-stone-400" />무게 0</span>
        <span className="flex items-center gap-1"><svg width="22" height="6" aria-hidden><path d="M0 3H22" stroke="#78716c" strokeWidth="2" strokeDasharray="5 3" /></svg>반박(상대 근거를 겨냥)</span>
        <span className="ml-auto text-stone-400">{chain ? <button type="button" className="font-bold text-stone-600 underline" onClick={() => setPick(null)}>선택 해제</button> : '노드를 누르면 연결된 흐름만 보입니다'}</span>
      </div>
      <div className="overflow-x-auto rounded-xl bg-stone-50/70 ring-1 ring-stone-100">
        <svg viewBox={`0 0 ${g.width} ${g.height + 22}`} className="block h-auto w-full min-w-[860px]" role="group" aria-label="근거 그래프" onClick={(e) => e.target === e.currentTarget && setPick(null)}>
          {heads.map(([c, label]) => <text key={c} x={COLS[c as 'agent'].x + 4} y={14} fontSize={11} fontWeight={800} fill="#a8a29e">{label}</text>)}
          <g transform="translate(0 22)">
            {g.edges.map((e) => <Edge key={e.id} e={e} a={byId.get(e.from)!} b={byId.get(e.to)!} state={chain ? (chain.edges.has(e.id) ? 'on' : 'off') : 'idle'} />)}
            {g.nodes.map((n) => <Node key={n.id} n={n} selected={pick === n.id} state={chain ? (chain.nodes.has(n.id) ? 'on' : 'off') : 'idle'} onPick={(id) => setPick((p) => (p === id ? null : id))} statusText={n.status === 'verified' ? verifiedLabel(evidenceKinds.get(n.id)) : n.status ? statusLabel(ont, n.status) : ''} />)}
          </g>
        </svg>
      </div>
    </div>
  )
}
