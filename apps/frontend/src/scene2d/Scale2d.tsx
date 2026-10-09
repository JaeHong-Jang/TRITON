// 놋쇠 천칭과 근거 추
import type { KeyboardEvent } from 'react'
import type { Stance } from '../api/types'
import { balanceOf, type WeightItem } from '../lib/scale'
import { ARM, HANG, PAN_R, PIVOT, beamEnds, clampTilt, floorSlot, legendText, stackSlots, textUnits, visibleOf, weightAria, weightTag } from './layout'
import { C } from './palette'

// 에이전트 표시 정보
export interface AgentTone { name: string; color: string }

interface Props {
  weights: WeightItem[]
  hidden: boolean
  focusId: string | null
  agents: Record<string, AgentTone>
  narrow: boolean
  onPick: (evidenceId: string) => void
}

interface BlockProps {
  item: WeightItem
  x: number
  y: number
  w: number
  h: number
  delay: number
  focused: boolean
  tone: AgentTone | undefined
  narrow: boolean
  floor?: boolean
  onPick: (evidenceId: string) => void
}

const STANCE_FILL: Record<Stance, { base: string; light: string }> = { pro: { base: C.pro, light: C.proLight }, con: { base: C.con, light: C.conLight } }

// 무게 처리 결과 설명 문구
const FATE_NOTE = { challenged: '이의 제기됨 · 판사가 반박을 채택하면 절반', halved: '반박 채택으로 절반' }

// 근거 하나를 나타내는 추
function Block({ item, x, y, w, h, delay, focused, tone, narrow, floor, onPick }: BlockProps) {
  const isVoid = item.fate === 'void'
  const fill = isVoid ? C.void : STANCE_FILL[item.stance].base
  const light = isVoid ? '#d1d5db' : STANCE_FILL[item.stance].light
  const edge = tone?.color ?? '#57534e'
  const press = () => onPick(item.evidenceId)
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      press()
    }
  }
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="c2d-drop" style={{ animationDelay: `${delay}ms` }}>
        <g className="c2d-weight" role="button" tabIndex={0} aria-label={weightAria(item, tone?.name ?? '')} data-on={focused ? '1' : '0'} onClick={press} onKeyDown={key}>
          <g className="c2d-lift">
            <title>{weightAria(item, tone?.name ?? '') + (item.fate === 'challenged' ? ` · ${FATE_NOTE.challenged}` : item.fate === 'halved' ? ` · ${FATE_NOTE.halved}` : '')}</title>
            <rect x={-4} y={-4} width={w + 8} height={h + 8} rx={9} fill="none" stroke="#fbbf24" strokeWidth={4} className="c2d-focus" />
            <rect x={0} y={0} width={w} height={h} rx={7} fill={fill} stroke={edge} strokeWidth={4} />
            <rect x={3} y={3} width={w - 6} height={h * 0.38} rx={4} fill={light} opacity={0.55} />
            {floor || isVoid ? (
              <>
                <text x={w / 2} y={h * 0.5} textAnchor="middle" fontSize={floor ? 17 : 18} fontWeight={800} fill="#4b5563">✕</text>
                <text x={w / 2} y={h - 5} textAnchor="middle" fontSize={floor ? 12 : 13} fontWeight={800} fill="#374151">{weightTag(item)}</text>
              </>
            ) : (
              <text x={w / 2} y={h / 2 + 6.5} textAnchor="middle" fontSize={narrow ? 24 : 18} fontWeight={800} fill="#fff">{weightTag(item)}</text>
            )}
            {item.fate === 'challenged' ? (
              <g transform={`translate(${w - 4} 2)`}>
                <circle r={11} fill="#fff" stroke="#78716c" strokeWidth={2.5} strokeDasharray="4 3" />
                <text y={6} textAnchor="middle" fontSize={16} fontWeight={800} fill="#57534e">?</text>
              </g>
            ) : null}
            {item.fate === 'halved' ? (
              <g transform={`translate(${w - 4} 2)`}>
                <circle r={11} fill="#fff" stroke={edge} strokeWidth={2.5} />
                <text y={5.5} textAnchor="middle" fontSize={16} fontWeight={800} fill={C.ink}>½</text>
              </g>
            ) : null}
          </g>
        </g>
      </g>
    </g>
  )
}

// 접시 한쪽 (줄·접시·추 쌓기)
function Pan({ stance, items, hiddenCount, offset, focusId, agents, narrow, onPick }: { stance: Stance; items: WeightItem[]; hiddenCount: number; offset: { x: number; y: number }; focusId: string | null; agents: Record<string, AgentTone>; narrow: boolean; onPick: (id: string) => void }) {
  const { slots, top } = stackSlots(items, narrow)
  return (
    <g className="c2d-pan" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
      <g stroke={C.brassDark} strokeWidth={2.5} strokeLinecap="round">
        <path d={`M0 0 L${-PAN_R + 6} ${HANG}`} />
        <path d={`M0 0 L${PAN_R - 6} ${HANG}`} />
        <path d={`M0 0 L0 ${HANG}`} opacity={0.6} />
      </g>
      <circle cx={0} cy={-2} r={9} fill={C.brass} stroke={C.brassDark} strokeWidth={2} />
      <path d={`M${-PAN_R} ${HANG - 4} Q0 ${HANG + 56} ${PAN_R} ${HANG - 4} Z`} fill={C.brass} />
      <path d={`M${-PAN_R + 14} ${HANG + 12} Q0 ${HANG + 54} ${PAN_R - 14} ${HANG + 12} Q0 ${HANG + 36} ${-PAN_R + 14} ${HANG + 12} Z`} fill={C.brassDark} opacity={0.35} />
      {items.map((w, i) => (
        <Block key={w.evidenceId} item={w} x={slots[i].x} y={HANG - 4 + slots[i].y} w={slots[i].w} h={slots[i].h} delay={Math.min(i, 8) * 70} focused={focusId === w.evidenceId} tone={agents[w.agentId]} narrow={narrow} onPick={onPick} />
      ))}
      <rect x={-PAN_R - 4} y={HANG - 9} width={PAN_R * 2 + 8} height={10} rx={5} fill={C.brassLight} />
      {hiddenCount > 0 ? (
        <g transform={`translate(${PAN_R - 6} ${HANG - 4 - top - 6})`}>
          <rect x={-24} y={-15} width={48} height={28} rx={14} fill={C.ink} />
          <text y={5.5} textAnchor="middle" fontSize={narrow ? 19 : 17} fontWeight={800} fill="#fff">+{hiddenCount}</text>
        </g>
      ) : null}
      <title>{stance === 'pro' ? '찬성 접시' : '반대 접시'}</title>
    </g>
  )
}

// 접시 아래 범례
function Legend({ stance, total, narrow }: { stance: Stance; total: number; narrow: boolean }) {
  const text = legendText(stance, total, narrow)
  const size = narrow ? 30 : 19
  const w = textUnits(text) * size + 36
  const cx = PIVOT.x + (stance === 'pro' ? -ARM : ARM)
  return (
    <g transform={`translate(${cx} ${narrow ? 744 : 752})`}>
      <rect x={-w / 2} y={0} width={w} height={size + 20} rx={(size + 20) / 2} fill={stance === 'pro' ? C.pro : C.con} />
      <text y={size + 4} textAnchor="middle" fontSize={size} fontWeight={800} fill="#fff">{text}</text>
    </g>
  )
}

// 첫인상 전 천 덮개
function Cloth({ narrow }: { narrow: boolean }) {
  return (
    <g>
      <path d="M600 396 Q800 344 1000 396 C1040 470 1062 600 1084 722 Q1062 738 1042 722 Q1020 744 998 722 Q976 744 954 722 Q932 744 910 722 Q888 744 866 722 Q844 744 822 722 Q800 744 778 722 Q756 744 734 722 Q712 744 690 722 Q668 744 646 722 Q624 740 604 722 Q582 738 560 722 L516 722 C538 600 560 470 600 396 Z" fill="#e7f2fb" stroke="#8aa9c4" strokeWidth={2} opacity={0.96} />
      <path d="M800 360 C776 470 774 600 790 724 H880 C862 600 870 470 864 366 Z" fill="#9ecfe0" opacity={0.35} />
      <path d="M632 414 C612 520 600 620 596 722 H668 C668 620 676 520 690 424 Z" fill="#9ecfe0" opacity={0.25} />
      <path d="M940 414 C960 520 970 620 972 722 H1040 C1034 620 1020 520 990 424 Z" fill="#9ecfe0" opacity={0.25} />
      <path d="M600 396 Q800 344 1000 396" fill="none" stroke="#fff" strokeWidth={4} opacity={0.86} />
      <g transform="translate(800 590)">
        <rect x={narrow ? -150 : -130} y={-36} width={narrow ? 300 : 260} height={narrow ? 88 : 76} rx={14} fill="#122033" opacity={0.9} />
        <text y={narrow ? -4 : -6} textAnchor="middle" fontSize={narrow ? 30 : 23} fontWeight={800} fill="#fff">첫인상 기록 전</text>
        <text y={narrow ? 36 : 26} textAnchor="middle" fontSize={narrow ? 28 : 21} fontWeight={700} fill={C.brassLight}>천칭 가림</text>
      </g>
    </g>
  )
}

// 천칭 컴포넌트
export default function Scale2d({ weights, hidden, focusId, agents, narrow, onPick }: Props) {
  const shownWeights = hidden ? [] : weights
  const bal = balanceOf(shownWeights)
  const a = clampTilt(hidden ? 0 : bal.tilt)
  const ends = beamEnds(a)
  const side = (st: Stance) => {
    const all = shownWeights.filter((w) => w.stance === st && w.weight > 0)
    const v = visibleOf(all, focusId)
    const voids = shownWeights.filter((w) => w.stance === st && w.weight === 0)
    return { items: v.shown, hiddenCount: v.hidden, voids }
  }
  const pro = side('pro')
  const con = side('con')
  const tone = (id: string) => agents[id]
  return (
    <g>
      <rect x={792} y={430} width={16} height={284} rx={8} fill="#7d96ad" />
      <rect x={796} y={430} width={5} height={284} rx={2.5} fill="#ffffff" opacity={0.72} />
      <path d="M778 700 Q800 680 822 700 Z" fill={C.brass} />
      <rect x={742} y={706} width={116} height={26} rx={11} fill="#ffffff" stroke="#8aa9c4" strokeWidth={2} />
      <rect x={752} y={730} width={96} height={6} rx={3} fill="#10b9c8" opacity={0.45} />
      <g transform={`translate(${PIVOT.x} ${PIVOT.y})`}>
        <g className="c2d-beam" style={{ transform: `rotate(${-a}rad)` }}>
          <rect x={-ARM - 8} y={-6} width={ARM * 2 + 16} height={12} rx={6} fill={C.brass} />
          <rect x={-ARM - 8} y={-6} width={ARM * 2 + 16} height={4} rx={2} fill={C.brassLight} opacity={0.8} />
          <circle cx={-ARM - 6} cy={0} r={10} fill={C.brassLight} stroke={C.brassDark} strokeWidth={2} />
          <circle cx={ARM + 6} cy={0} r={10} fill={C.brassLight} stroke={C.brassDark} strokeWidth={2} />
          <path d="M0 -46 L14 0 H-14 Z" fill={C.brassDark} />
        </g>
        <circle r={19} fill={C.brass} stroke={C.brassDark} strokeWidth={3} />
        <circle r={7} fill={C.brassLight} />
        {hidden ? null : (
          <>
            <Pan stance="pro" items={pro.items} hiddenCount={pro.hiddenCount} offset={ends.left} focusId={focusId} agents={agents} narrow={narrow} onPick={onPick} />
            <Pan stance="con" items={con.items} hiddenCount={con.hiddenCount} offset={ends.right} focusId={focusId} agents={agents} narrow={narrow} onPick={onPick} />
          </>
        )}
      </g>
      {hidden ? <Cloth narrow={narrow} /> : null}
      {hidden
        ? null
        : (['pro', 'con'] as const).map((st) => {
            const s = st === 'pro' ? pro : con
            const shown = s.voids.slice(0, 5)
            const extra = s.voids.length - shown.length
            return (
              <g key={st} transform="translate(800 728)">
                {shown.map((w, i) => {
                  const f = floorSlot(i, st)
                  return <Block key={w.evidenceId} item={w} x={f.x} y={-f.h} w={f.w} h={f.h} delay={i * 80} focused={focusId === w.evidenceId} tone={tone(w.agentId)} narrow={narrow} floor onPick={onPick} />
                })}
                {extra > 0 ? (
                  <g transform={`translate(${(st === 'pro' ? -1 : 1) * (66 + 5 * 54 + 22)} -17)`}>
                    <rect x={-20} y={-12} width={40} height={24} rx={12} fill={C.ink} />
                    <text y={5} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fff">+{extra}</text>
                  </g>
                ) : null}
              </g>
            )
          })}
      {hidden ? null : (
        <>
          <Legend stance="pro" total={bal.pro} narrow={narrow} />
          <Legend stance="con" total={bal.con} narrow={narrow} />
        </>
      )}
    </g>
  )
}
