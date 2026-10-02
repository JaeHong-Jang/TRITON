// 책상에 앉은 작은 사람 캐릭터와 이름표
import type { AgentRole } from '../../api/types'
import { textWidth } from './iso'

// 역할별 옷차림
interface Look { suit: string; shirt: string; tie: string | 'split' | null; accent: string; glasses?: boolean; vest?: boolean }

const LOOKS: Record<Exclude<AgentRole, 'checker'>, Look> = {
  clerk: { suit: '#16a34a', shirt: '#ffffff', tie: null, accent: '#15803d', vest: true },
  prosecution: { suit: '#292524', shirt: '#fafaf9', tie: '#ea580c', accent: '#c2410c' },
  defense: { suit: '#1e3a8a', shirt: '#f8fafc', tie: '#2563eb', accent: '#1d4ed8' },
  cross: { suit: '#44403c', shirt: '#fafaf9', tie: 'split', accent: '#7c3aed' },
  officer: { suit: '#14532d', shirt: '#f0fdf4', tie: null, accent: '#15803d', glasses: true },
}
const SKINS = ['#f5cfae', '#e9b48c', '#d79d73', '#fbd9bf']
const HAIRS = ['#2b2118', '#0f172a', '#5b3a24', '#7c5a3a']

// 머리카락 모양 (모양 번호별)
function Hair({ kind, color }: { kind: number; color: string }) {
  const cap = 'M-10.2 -50 Q-10.6 -62.6 0 -62.6 Q10.6 -62.6 10.2 -50 Q6.5 -55.4 0 -55.4 Q-6.5 -55.4 -10.2 -50Z'
  if (kind === 1) return <><path d={cap} fill={color} /><path d="M-10.4 -51 Q-12 -42 -8.5 -40 L-7.5 -50Z M10.4 -51 Q12 -42 8.5 -40 L7.5 -50Z" fill={color} /></>
  if (kind === 2) return <><circle cx={0} cy={-64} r={4.4} fill={color} /><path d={cap} fill={color} /></>
  if (kind === 3) return <path d="M-10.4 -49 Q-11.4 -63 1 -62.8 Q11 -62 10.4 -49 Q9 -56 3 -57 Q-4 -57.6 -10.4 -49Z" fill={color} />
  return <path d={cap} fill={color} />
}

// 이름표 한 장
export function NameTag({ x, y, label, chip, accent, busy }: { x: number; y: number; label: string; chip: string; accent: string; busy: boolean }) {
  const cw = chip.length > 2 ? 22 : 15
  const w = cw + textWidth(label, 9.5) + 12
  return (
    <g transform={`translate(${x - w / 2} ${y})`}>
      <rect width={w} height={16} rx={8} fill="#fff" stroke={busy ? accent : '#d6dae1'} strokeWidth={busy ? 1.4 : 1} />
      <rect x={2} y={2} width={cw} height={12} rx={6} fill={accent} />
      <text x={2 + cw / 2} y={11} fontSize={7.5} fontWeight={800} textAnchor="middle" fill="#fff">{chip}</text>
      <text x={cw + 7} y={11.5} fontSize={9.5} fontWeight={700} fill="#1c1917">{label}</text>
    </g>
  )
}

// 앉아 일하는 사람
export function Person({ role, seed, working }: { role: Exclude<AgentRole, 'checker'>; seed: number; working: boolean }) {
  const look = LOOKS[role]
  const skin = SKINS[seed % SKINS.length]
  const hair = HAIRS[(seed * 3 + 1) % HAIRS.length]
  const kind = (seed + (role === 'officer' ? 1 : 0)) % 4
  return (
    <g>
      <ellipse cx={0} cy={3} rx={18} ry={6.5} fill="#0f172a" opacity={0.13} />
      <rect x={-13.5} y={-45} width={27} height={36} rx={10} fill="#64748b" />
      <rect x={-13.5} y={-45} width={27} height={36} rx={10} fill="#fff" opacity={0.08} />
      <g className="o-breathe">
        <path d="M-12.5 -13 V-30 Q-12.5 -38.5 -4.5 -38.5 H4.5 Q12.5 -38.5 12.5 -30 V-13Z" fill={look.vest ? look.shirt : look.suit} />
        {look.vest ? <path d="M-12.5 -13 V-30 Q-12.5 -38.5 -5 -38.5 L-3 -22 L-3 -13Z M12.5 -13 V-30 Q12.5 -38.5 5 -38.5 L3 -22 L3 -13Z" fill={look.suit} /> : <path d="M-4.6 -38.5 L0 -29.5 L4.6 -38.5Z" fill={look.shirt} />}
        {look.tie === 'split' ? <><path d="M0 -30 L-2.3 -26 L0 -17Z" fill="#ea580c" /><path d="M0 -30 L2.3 -26 L0 -17Z" fill="#2563eb" /></> : look.tie ? <path d="M0 -30 L-2.3 -26.5 L0 -17 L2.3 -26.5Z" fill={look.tie} /> : null}
        <g transform="translate(3.6 -29.5)">
          <rect width={9.4} height={6.2} rx={1.6} fill="#fff" stroke={look.accent} strokeWidth={0.9} />
          <text x={4.7} y={4.7} fontSize={4.7} fontWeight={800} textAnchor="middle" fill={look.accent}>AI</text>
        </g>
        <g className={working ? 'o-type-l' : undefined}>
          <path d="M-11.5 -34 Q-18.5 -25 -9.5 -16.5" stroke={look.suit} strokeWidth={6.4} strokeLinecap="round" fill="none" />
          <circle cx={-9} cy={-15.5} r={3.1} fill={skin} />
        </g>
        <g className={working ? 'o-type-r' : undefined}>
          <path d="M11.5 -34 Q18.5 -25 9.5 -16.5" stroke={look.suit} strokeWidth={6.4} strokeLinecap="round" fill="none" />
          <circle cx={9} cy={-15.5} r={3.1} fill={skin} />
        </g>
        <rect x={-3.2} y={-42.5} width={6.4} height={6} rx={2} fill={skin} />
        <circle cx={0} cy={-49.5} r={9.6} fill={skin} />
        <Hair kind={kind} color={hair} />
        <g className="o-blink"><circle cx={-3.6} cy={-49} r={1.35} fill="#1c1917" /><circle cx={3.6} cy={-49} r={1.35} fill="#1c1917" /></g>
        <ellipse cx={-6.3} cy={-46} rx={1.9} ry={1.2} fill="#f9a8a8" opacity={0.55} />
        <ellipse cx={6.3} cy={-46} rx={1.9} ry={1.2} fill="#f9a8a8" opacity={0.55} />
        <path d={working ? 'M-1.8 -45 Q0 -43.4 1.8 -45' : 'M-2.2 -44.8 Q0 -43 2.2 -44.8'} stroke="#7c2d12" strokeWidth={0.9} strokeLinecap="round" fill="none" />
        {look.glasses ? <g stroke="#1c1917" strokeWidth={0.9} fill="#fff" fillOpacity={0.35}><circle cx={-3.6} cy={-49} r={3.1} /><circle cx={3.6} cy={-49} r={3.1} /><path d="M-0.5 -49 H0.5" /></g> : null}
      </g>
    </g>
  )
}
