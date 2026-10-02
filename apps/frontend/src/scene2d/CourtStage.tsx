// 2D SVG 법정 무대
import { useEffect, useRef, useState } from 'react'
import type { Agent, Case, Claim, Leaning } from '../api/types'
import { EVENT_LABEL, type AgentActivity } from '../lib/activity'
import type { WeightItem } from '../lib/scale'
import { claimLabel, specialtyLabel, useOntology } from '../ui/ontology'
import Backdrop, { Gallery } from './Backdrop'
import Bench from './Bench'
import Defendant2d from './Defendant2d'
import { counselXs, deskX, frameOf, measureBubble, miniViewBoxOf, packBubbles, textUnits, truncate, viewBoxOf, weightTag, wrapText } from './layout'
import { AGENT_COLORS, C } from './palette'
import Person, { type PersonRole } from './Person'
import Scale2d, { type AgentTone } from './Scale2d'
import './stage.css'

const TABLE_TOP = 604

// 무대에 그릴 법정 상태
export interface SceneView {
  c: Case
  bench: Agent[]
  weights: WeightItem[]
  hidden: boolean
  seatsLit: number
  focusId: string | null
  verdict: Leaning | null
  appealed: boolean
  onPick: (evidenceId: string) => void
}

// 무대 입력 값
export interface StageProps {
  view: SceneView
  speakingClaim: Claim | null
  activity: AgentActivity[]
  currentSeat: number | null
  mini?: boolean
}

interface Seat { id: string; role: PersonRole; name: string; x: number; y: number; eye: string; spec: string | null; look: number; tie?: string; suit?: string }

// 같은 편 에이전트를 구분하는 얼굴·넥타이·정장 (순서대로)
const PRO_LOOKS = [0, 2, 5]
const DEF_LOOKS = [1, 3, 6]
const PRO_TIES = ['#ea580c', '#b91c1c', '#ca8a04']
const DEF_TIES = ['#2f6df0', '#0e7490', '#0f766e']
const PRO_SUITS = ['#3a3d4d', '#4a3a35', '#2d3b3a']
const DEF_SUITS = ['#1f3263', '#2a4a6b', '#14405a']

// 컨테이너 크기 측정 훅
function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ...size }
}

// 변론석 탁자 앞면과 이름표
function TableFront({ seats, narrow, x0, x1 }: { seats: Seat[]; narrow: boolean; x0: number; x1: number }) {
  const h = narrow ? 56 : 84
  return (
    <g>
      <rect x={x0} y={TABLE_TOP} width={x1 - x0} height={118} fill={C.wood} />
      <rect x={x0} y={TABLE_TOP} width={x1 - x0} height={7} fill="#000" opacity={0.18} />
      <rect x={x0 + 6} y={TABLE_TOP + 14} width={x1 - x0 - 12} height={96} rx={6} fill={C.woodDark} opacity={0.3} />
      <rect x={x0 - 4} y={TABLE_TOP + 112} width={x1 - x0 + 8} height={10} rx={3} fill={C.woodDark} />
      {seats.map((s) => {
        const w = narrow ? 72 : 98
        const [kind, tag] = s.name.includes(' ') ? [s.name.split(' ')[0], s.name.split(' ').slice(1).join(' ')] : [s.name, '']
        return (
          <g key={s.id} transform={`translate(${s.x} ${TABLE_TOP + 20})`}>
            <rect x={-w / 2} width={w} height={h} rx={7} fill="#f4e7bf" stroke={C.brassDark} strokeWidth={2} />
            <circle cx={-w / 2 + 11} cy={12} r={5} fill={s.eye} stroke={C.ink} strokeWidth={1.2} />
            {narrow ? (
              <>
                <text y={tag ? 25 : 40} x={tag ? 4 : 0} textAnchor="middle" fontSize={tag ? 17 : 22} fontWeight={800} fill={C.ink}>{kind}</text>
                {tag ? <text y={51} textAnchor="middle" fontSize={28} fontWeight={800} fill={C.ink}>{tag}</text> : null}
                <text y={51} x={w / 2 - 14} textAnchor="middle" fontSize={13} fontWeight={800} fill={C.pro}>AI</text>
              </>
            ) : (
              <>
                <text y={36} textAnchor="middle" fontSize={14} fontWeight={800} fill={C.ink}>{s.name} · AI</text>
                <text y={55} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#6b4b22">AI 에이전트</text>
                {s.spec ? <text y={74} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.pro}>{truncate(s.spec, 7.2)}</text> : null}
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}

// 검사석·변호인석 한쪽
function Counsel({ seats, narrow, speakingId, workingIds }: { seats: Seat[]; narrow: boolean; speakingId: string | null; workingIds: string[] }) {
  const xs = seats.map((s) => s.x)
  const mid = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : 0
  const half = xs.length ? Math.max(110, (xs[xs.length - 1] - xs[0]) / 2 + (narrow ? 50 : 58)) : 0
  if (!seats.length) return null
  return (
    <g>
      <rect x={mid - half - 6} y={TABLE_TOP - 18} width={half * 2 + 12} height={22} rx={7} fill={C.woodHi} />
      {seats.map((s) => (
        <g key={s.id} transform={`translate(${s.x} ${TABLE_TOP})`}>
          <Person role={s.role} look={s.look} tone={s.eye} tie={s.tie} suit={s.suit} speaking={speakingId === s.id} working={workingIds.includes(s.id)} delay={s.x % 7} />
        </g>
      ))}
      <TableFront seats={seats} narrow={narrow} x0={mid - half} x1={mid + half} />
    </g>
  )
}

// 서기·재판연구관 책상
function Desk({ seat, narrow, speaking, working }: { seat: Seat; narrow: boolean; speaking: boolean; working: boolean }) {
  return (
    <g>
      <g transform={`translate(${seat.x} ${seat.y})`}>
        <Person role={seat.role} look={seat.look} tone={seat.eye} speaking={speaking} working={working} delay={2.2} />
      </g>
      <rect x={seat.x - 76} y={seat.y - 14} width={152} height={18} rx={6} fill={C.woodHi} />
      <rect x={seat.x - 70} y={seat.y + 4} width={140} height={74} fill={C.wood} />
      <rect x={seat.x - 70} y={seat.y + 4} width={140} height={6} fill="#000" opacity={0.18} />
      <rect x={seat.x - 62} y={seat.y + 16} width={124} height={56} rx={6} fill={C.woodDark} opacity={0.3} />
      <rect x={seat.x - 74} y={seat.y + 72} width={148} height={9} rx={3} fill={C.woodDark} />
      <g transform={`translate(${seat.x} ${seat.y + 22})`}>
        <rect x={-58} width={116} height={narrow ? 40 : 46} rx={6} fill="#f4e7bf" stroke={C.brassDark} strokeWidth={2} />
        <circle cx={-47} cy={12} r={5} fill={seat.eye} stroke={C.ink} strokeWidth={1.2} />
        <text x={5} y={narrow ? 29 : 22} textAnchor="middle" fontSize={Math.min(narrow ? 22 : 16, 84 / textUnits(seat.name))} fontWeight={800} fill={C.ink}>{seat.name}</text>
        {narrow ? null : <text x={5} y={38} textAnchor="middle" fontSize={12} fontWeight={700} fill="#6b4b22">AI 에이전트</text>}
      </g>
    </g>
  )
}

// 증거 제출대
function EvidenceStand({ narrow, focusTag }: { narrow: boolean; focusTag: string | null }) {
  return (
    <g>
      <rect x={724} y={784} width={152} height={14} rx={5} fill={C.woodHi} />
      <path d="M740 798 H860 L872 872 H728 Z" fill={C.wood} />
      <path d="M740 798 H760 L750 872 H728 Z" fill="#000" opacity={0.12} />
      {narrow ? null : (
        <g transform="translate(800 836)">
          <rect x={-56} y={-18} width={112} height={32} rx={6} fill={C.brass} stroke={C.brassDark} strokeWidth={2} />
          <text y={4} textAnchor="middle" fontSize={16} fontWeight={800} fill={C.ink}>증거 제출대</text>
        </g>
      )}
      {focusTag ? (
        <g transform="translate(800 766)">
          <rect x={-44} y={-22} width={88} height={34} rx={5} fill={C.paper} stroke="#fbbf24" strokeWidth={3} />
          <text y={2} textAnchor="middle" fontSize={20} fontWeight={800} fill={C.ink}>{focusTag}</text>
        </g>
      ) : null}
    </g>
  )
}

// 에이전트 좌석 정보 만들기
function seatsOf(bench: Agent[], narrow: boolean, ont: ReturnType<typeof useOntology.getState>['ont'], lit: number): { pros: Seat[]; defs: Seat[]; desk: Seat | null } {
  const make = (side: 'prosecution' | 'defense', role: PersonRole, looks: number[]): Seat[] => {
    const list = bench.filter((a) => a.side === side)
    const xs = counselXs(side, list.length, narrow)
    const ties = side === 'prosecution' ? PRO_TIES : DEF_TIES
    const suits = side === 'prosecution' ? PRO_SUITS : DEF_SUITS
    return list.map((a, i) => ({ id: a.id, role, name: a.name, x: xs[i], y: TABLE_TOP, eye: AGENT_COLORS[i % AGENT_COLORS.length], spec: specialtyLabel(ont, a.specialty), look: looks[i % looks.length], tie: ties[i % ties.length], suit: suits[i % suits.length] }))
  }
  const officer = bench.find((a) => a.side === 'officer')
  const desk: Seat | null = officer
    ? { id: officer.id, role: 'officer', name: officer.name, x: deskX(narrow), y: 506, eye: AGENT_COLORS[0], spec: null, look: 6 }
    : lit === 1
      ? { id: 'clerk', role: 'clerk', name: '서기', x: deskX(narrow), y: 506, eye: AGENT_COLORS[0], spec: null, look: 3 }
      : null
  return { pros: make('prosecution', 'prosecution', PRO_LOOKS), defs: make('defense', 'defense', DEF_LOOKS), desk }
}

// 이벤트 종류별 말풍선 색
function toneOf(a: AgentActivity, side: Seat['role']): string {
  if (a.kind === 'escalate' || a.kind === 'error') return '#b91c1c'
  return side === 'prosecution' ? C.pro : side === 'defense' ? C.con : C.green
}

// 말풍선 한 개에 들어갈 내용
interface BubbleSpec { seat: Seat; label: string; text: string; color: string; typing: boolean; claim: boolean }

interface PlacedBubble extends BubbleSpec { x: number; w: number; bottom: number; lines: string[]; lh: number; fs: number; h: number; chipH: number }

// 말풍선을 편별 칸에 겹치지 않게 놓기 (에이전트당 한 개, 서기·연구관은 변호석 말풍선 위 줄)
function placeBubbles(specs: BubbleSpec[], narrow: boolean, mini: boolean): PlacedBubble[] {
  const f = frameOf(narrow)
  const chipH = narrow ? 38 : 26
  const small = narrow || mini
  const regions = { prosecution: { lo: f.x0 + 12, hi: 505 }, desk: { lo: f.x0 + 12, hi: 505 }, defense: { lo: 1095, hi: f.x1 - 12 } }
  // 좌석이 속한 편
  const sideOf = (seat: Seat) => (seat.role === 'officer' || seat.role === 'clerk' ? 'desk' : seat.role === 'defense' ? 'defense' : 'prosecution')
  const out: PlacedBubble[] = []
  // 한 편의 말풍선 놓기
  const place = (side: 'prosecution' | 'defense' | 'desk', lift: (list: PlacedBubble[]) => number) => {
    const list = specs.filter((sp) => sideOf(sp.seat) === side)
    const wish = (sp: BubbleSpec) => (sp.claim ? (small ? 460 : 330) : small ? 330 : 262)
    const slots = packBubbles(list.map((sp) => ({ anchor: sp.seat.x, w: wish(sp) })), regions[side].lo, regions[side].hi)
    const placed = list.map((sp, i): PlacedBubble => {
      const fs = mini ? 32 : small ? (sp.claim ? 28 : 26) : sp.claim ? 21 : 19
      const m = measureBubble(sp.text, slots[i].w, { fs: fs, maxLines: mini || side === 'desk' ? 2 : 3, chipH })
      return { ...sp, x: slots[i].x, w: slots[i].w, bottom: 0, lines: m.lines, lh: m.lh, fs: slots[i].w < 200 ? fs * 0.86 : fs, h: m.h, chipH }
    })
    const base = lift(placed)
    placed.forEach((p) => (p.bottom = base))
    out.push(...placed)
    return placed
  }
  const pros = place('prosecution', () => TABLE_TOP - 206)
  place('defense', () => TABLE_TOP - 206)
  const top = pros.length ? Math.min(...pros.map((p) => p.bottom - p.h)) : null
  place('desk', (list) => {
    const own = 506 - 200
    const hit = top !== null && list.some((d) => pros.some((p) => d.x < p.x + p.w && p.x < d.x + d.w))
    return hit ? Math.min(own, top! - 12) : own
  })
  return out
}

// 에이전트 머리 위 말풍선 (활동 문구와 타자 점, 또는 지금 발언 중인 주장)
function SpeechBubble({ p }: { p: PlacedBubble }) {
  const { x, w, bottom, h, seat, lines, lh, fs, chipH } = p
  const top = bottom - h
  const tx = Math.max(x + 26, Math.min(x + w - 26, seat.x))
  const narrow = chipH > 30
  const dot = narrow ? 7 : 4.5
  const dots = p.typing && w >= 220
  const dotsW = dots ? dot * 5.2 + dot * 2 + 12 : 0
  const charW = chipH * 0.55
  const avail = w - 28 - dotsW
  const fits = (t: string) => textUnits(t) * charW + 20 <= avail
  const name = p.label.split(' · ')[0]
  const lab = fits(p.label) ? p.label : fits(name) ? name : truncate(name, Math.max(3, (avail - 20) / charW))
  const lw = Math.min(avail, textUnits(lab) * charW + 20)
  return (
    <g className="c2d-bubble" role="status" aria-label={`${seat.name} ${p.text}`}>
      <rect x={x + 4} y={top + 5} width={w} height={h} rx={18} fill="#000" opacity={0.14} />
      <path d={`M${tx - 13} ${bottom - 2} L${tx} ${seat.y - 194} L${tx + 13} ${bottom - 2} Z`} fill={p.claim ? '#fff' : p.color} opacity={p.claim ? 1 : 0.9} />
      <rect x={x} y={top} width={w} height={h} rx={18} fill="#fff" stroke={p.claim ? 'none' : p.color} strokeWidth={narrow ? 4 : 2.5} />
      <g transform={`translate(${x + 14} ${top + 12})`}>
        <rect className={p.typing && !dots ? 'c2d-pulse' : undefined} width={lw} height={chipH} rx={chipH / 2} fill={p.color} />
        <text x={lw / 2} y={chipH * 0.72} textAnchor="middle" fontSize={chipH * 0.55} fontWeight={800} fill="#fff">{lab}</text>
      </g>
      {dots ? (
        <g transform={`translate(${x + 14 + lw + 12 + dot} ${top + 12 + chipH / 2})`}>
          {[0, 1, 2].map((k) => <circle key={k} className="c2d-dot" cx={k * dot * 2.6} cy={0} r={dot} fill={p.color} />)}
        </g>
      ) : null}
      {lines.map((l, i) => (
        <text key={i} x={x + 16} y={top + 12 + chipH + 8 + i * lh + fs * 0.95} fontSize={fs} fontWeight={600} fill={C.ink}>{l}</text>
      ))}
    </g>
  )
}

// 증거 검증관(코드)의 활동 말풍선 (증거 제출대 왼쪽)
function CheckerBubble({ act, narrow }: { act: AgentActivity; narrow: boolean }) {
  const lines = wrapText(act.text, narrow ? 14 : 12, 1)
  const fs = narrow ? 24 : 19
  const w = narrow ? 400 : 282
  const h = narrow ? 72 : 66
  const x = 700 - w
  const y = 794
  return (
    <g className="c2d-bubble" role="status" aria-label={`증거 검증관 ${act.text}`}>
      <rect x={x + 4} y={y + 5} width={w} height={h} rx={16} fill="#000" opacity={0.14} />
      <path d={`M${x + w - 2} ${y + h / 2 - 12} L${x + w + 20} ${y + h / 2 + 10} L${x + w - 2} ${y + h / 2 + 12} Z`} fill="#fff" />
      <rect x={x} y={y} width={w} height={h} rx={16} fill="#fff" stroke={C.brassDark} strokeWidth={2.5} />
      <text x={x + 14} y={y + (narrow ? 26 : 24)} fontSize={narrow ? 19 : 13} fontWeight={800} fill={C.brassDark}>증거 검증관 · 코드 · {EVENT_LABEL[act.kind]}</text>
      {lines.map((l, i) => <text key={i} x={x + 14} y={y + (narrow ? 58 : 50)} fontSize={fs} fontWeight={600} fill={C.ink}>{l}</text>)}
      {act.typing ? (
        <g transform={`translate(${x + w - 52} ${y + (narrow ? 26 : 18)})`}>
          {[0, 1, 2].map((k) => <circle key={k} className="c2d-dot" cx={k * 14} cy={0} r={4} fill={C.brassDark} />)}
        </g>
      ) : null}
    </g>
  )
}

// 2D 법정 컴포넌트
export default function CourtStage({ view, speakingClaim, activity, currentSeat, mini = false }: StageProps) {
  const { ref, w, h } = useSize()
  const ont = useOntology((s) => s.ont)
  const narrow = mini || (w > 0 && w < 760)
  const vb = mini ? miniViewBoxOf(w, h) : viewBoxOf(w, h, narrow)
  const { pros, defs, desk } = seatsOf(view.bench, narrow, ont, view.seatsLit)
  const all = [...pros, ...defs, ...(desk ? [desk] : [])]
  const agents: Record<string, AgentTone> = Object.fromEntries(all.map((s) => [s.id, { name: s.name, color: s.eye }]))
  const speaker = speakingClaim ? all.find((s) => s.id === speakingClaim.agentId) : undefined
  const focus = view.focusId ? view.weights.find((x) => x.evidenceId === view.focusId) : undefined
  const workingIds = activity.filter((a) => a.typing).map((a) => a.agentId)
  const checker = activity.find((a) => a.agentId === 'checker')
  // 에이전트당 말풍선 하나 (발언 중이면 주장, 아니면 최신 활동)
  const specs = all.flatMap((seat): BubbleSpec[] => {
    if (speaker?.id === seat.id && speakingClaim) return [{ seat, label: claimLabel(ont, speakingClaim.type), text: speakingClaim.text, color: speakingClaim.stance === 'pro' ? C.pro : C.con, typing: false, claim: true }]
    const act = activity.find((a) => a.agentId === seat.id)
    return act ? [{ seat, label: `${truncate(seat.name, 8)} · ${EVENT_LABEL[act.kind]}`, text: act.text, color: toneOf(act, seat.role), typing: act.typing, claim: false }] : []
  })
  const bubbles = placeBubbles(specs, narrow, mini)
  return (
    <div ref={ref} className="h-full w-full overflow-hidden" style={{ background: `linear-gradient(${C.wall} 62%, ${C.floor} 62%)` }}>
      <svg className="c2d-svg block h-full w-full" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }} role="group" aria-label="법정 장면">
        <Backdrop narrow={narrow} />
        <Bench lit={view.seatsLit} currentSeat={currentSeat} narrow={narrow} />
        {desk ? <Desk seat={desk} narrow={narrow} speaking={speaker?.id === desk.id} working={workingIds.includes(desk.id)} /> : null}
        <Counsel seats={pros} narrow={narrow} speakingId={speaker?.id ?? null} workingIds={workingIds} />
        <Counsel seats={defs} narrow={narrow} speakingId={speaker?.id ?? null} workingIds={workingIds} />
        <g transform={narrow ? 'translate(1318 836)' : 'translate(1190 826)'}>
          <Defendant2d c={view.c} verdict={view.verdict} appealed={view.appealed} narrow={narrow} />
        </g>
        <Scale2d weights={view.weights} hidden={view.hidden} focusId={view.focusId} agents={agents} narrow={narrow} onPick={view.onPick} />
        <EvidenceStand narrow={narrow} focusTag={focus ? weightTag(focus) : null} />
        {mini ? null : <Gallery narrow={narrow} />}
        {checker && !mini ? <CheckerBubble act={checker} narrow={narrow} /> : null}
        {bubbles.map((b) => <SpeechBubble key={b.seat.id} p={b} />)}
      </svg>
    </div>
  )
}
