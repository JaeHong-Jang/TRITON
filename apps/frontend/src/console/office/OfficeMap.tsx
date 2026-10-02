// 여섯 방이 있는 등각 사무실 지도
import type { AgentProfile } from '../../api/types'
import { GAP, RD, RoomOverlay, RoomScene, RW, type RoomSpec } from './Room'
import { poly, proj, type Origin } from './iso'
import './office.css'

// 방 배치 목록
export const ROOMS: RoomSpec[] = [
  { role: 'clerk', c: 0, r: 0, tint: '#e1f1e6', wall: '#f1f7f3', accent: '#16a34a', seats: 1, name: '서기실' },
  { role: 'prosecution', c: 1, r: 0, tint: '#fbe6d8', wall: '#fcf2ec', accent: '#c2410c', seats: 2, name: '검사실' },
  { role: 'defense', c: 2, r: 0, tint: '#e0e8fa', wall: '#eff3fc', accent: '#1d4ed8', seats: 2, name: '변호인실' },
  { role: 'cross', c: 0, r: 1, tint: '#ebe4f4', wall: '#f4f0f8', accent: '#7c3aed', seats: 2, name: '반대신문실' },
  { role: 'officer', c: 1, r: 1, tint: '#dcefe9', wall: '#edf6f2', accent: '#0f766e', seats: 1, name: '재판연구관실' },
  { role: 'checker', c: 2, r: 1, tint: '#dfebf3', wall: '#edf3f8', accent: '#0369a1', seats: 0, name: '증거 검증실' },
]

const W = 1100
const H = 670
const BASE: Origin = { ox: 390, oy: 150 }

// 방 원점의 화면 좌표
function originOf(s: RoomSpec): Origin {
  const [ox, oy] = proj(BASE, s.c * (RW + GAP), s.r * (RD + GAP))
  return { ox, oy }
}

// 사무실 지도 컴포넌트
export function OfficeMap({ agents }: { agents: AgentProfile[] }) {
  const by = new Map(agents.map((a) => [a.role, a]))
  const order = [...ROOMS].sort((a, b) => a.c + a.r - (b.c + b.r) || a.r - b.r)
  const pad = 1.3
  const gx = 3 * RW + 2 * GAP
  const gy = 2 * RD + GAP
  const ground = [proj(BASE, -pad, -pad), proj(BASE, gx + pad, -pad), proj(BASE, gx + pad, gy + pad), proj(BASE, -pad, gy + pad)]
  const thick = (p: [number, number]): [number, number] => [p[0], p[1] + 12]
  return (
    <svg viewBox={`0 30 ${W} ${H - 30}`} className="office block h-auto w-full min-w-[760px]" role="img" aria-label="AI 사무실 지도. 여섯 방에서 에이전트가 일하는 모습">
      <defs>
        <filter id="o-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
        <linearGradient id="o-ground" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3f5f8" /><stop offset="1" stopColor="#e6eaf0" /></linearGradient>
      </defs>
      <polygon points={poly([ground[3], ground[2], thick(ground[2]), thick(ground[3])])} fill="#cdd4de" />
      <polygon points={poly([ground[1], ground[2], thick(ground[2]), thick(ground[1])])} fill="#b9c2cf" />
      <polygon points={poly(ground)} fill="url(#o-ground)" />
      {Array.from({ length: 12 }, (_, i) => {
        const t = ((i + 1) * gx) / 13
        return <line key={i} x1={proj(BASE, t, -pad)[0]} y1={proj(BASE, t, -pad)[1]} x2={proj(BASE, t, gy + pad)[0]} y2={proj(BASE, t, gy + pad)[1]} stroke="#fff" strokeOpacity={0.6} />
      })}
      {order.map((s) => (
        <RoomScene key={s.role} spec={s} o={originOf(s)} profile={by.get(s.role)} />
      ))}
      {order.map((s) => (
        <RoomOverlay key={s.role} spec={s} o={originOf(s)} profile={by.get(s.role)} width={W} />
      ))}
    </svg>
  )
}
