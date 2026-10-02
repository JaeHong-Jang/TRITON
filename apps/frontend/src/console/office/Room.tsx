// 방 하나의 바닥 · 벽 · 가구 · 사람과 위에 띄우는 말풍선
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { AgentProfile, AgentRole } from '../../api/types'
import { HW, IsoBox, poly, proj, shade, textWidth, type Origin, type Pt } from './iso'
import { NameTag, Person } from './Person'

// 방 가로(x) 칸 수
export const RW = 5.6
// 방 세로(y) 칸 수
export const RD = 4.2
// 방 사이 복도 칸 수
export const GAP = 2.4
// 벽 높이
export const WALL = 84
const THICK = 9

// 방 하나의 배치 정의
export interface RoomSpec { role: AgentRole; c: number; r: number; tint: string; wall: string; accent: string; seats: number; name: string }

// 좌석 x 위치
function seatXs(n: number): number[] {
  return n === 2 ? [2.6, 4.4] : n === 1 ? [3.4] : []
}

// 방 이름 순서 글자
const LETTERS = ['A', 'B', 'C']

// 책 꽂이 칸의 책들
function Books({ o, x, y, w, z, h, seed }: { o: Origin; x: number; y: number; w: number; z: number; h: number; seed: number }) {
  const cols = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#0ea5e9']
  const out = []
  let cx = x + 0.06
  let i = 0
  while (cx < x + w - 0.1) {
    const bw = 0.07 + ((i * 7 + seed) % 3) * 0.025
    const bh = h - ((i + seed) % 3) * 3
    const col = cols[(i * 3 + seed) % cols.length]
    out.push(<polygon key={i} points={poly([proj(o, cx, y, z), proj(o, cx + bw, y, z), proj(o, cx + bw, y, z + bh), proj(o, cx, y, z + bh)])} fill={col} />)
    cx += bw + 0.012
    i += 1
  }
  return <>{out}</>
}

// 책장
function Shelf({ o, x, y, seed }: { o: Origin; x: number; y: number; seed: number }) {
  const w = 1.05
  const d = 0.5
  return (
    <g>
      <IsoBox o={o} x={x} y={y} w={w} d={d} h={64} color="#a87447" />
      {[7, 26, 45].map((z, k) => (
        <g key={z}>
          <polygon points={poly([proj(o, x + 0.05, y + d, z - 1), proj(o, x + w - 0.05, y + d, z - 1), proj(o, x + w - 0.05, y + d, z + 15), proj(o, x + 0.05, y + d, z + 15)])} fill="#5b3a21" />
          <Books o={o} x={x + 0.05} y={y + d} w={w - 0.1} z={z} h={14} seed={seed + k} />
        </g>
      ))}
    </g>
  )
}

// 화분
function Plant({ o, x, y }: { o: Origin; x: number; y: number }) {
  const [px, py] = proj(o, x, y, 0)
  return (
    <g transform={`translate(${px} ${py})`}>
      <ellipse cx={0} cy={2} rx={11} ry={4.5} fill="#0f172a" opacity={0.12} />
      <path d="M-8 -14 L8 -14 L6 0 L-6 0Z" fill="#e2e8f0" />
      <path d="M-8 -14 L8 -14 L7.6 -11 L-7.6 -11Z" fill="#cbd5e1" />
      <path d="M0 -14 Q-12 -26 -9 -36 Q-2 -28 0 -14Z" fill="#22c55e" />
      <path d="M0 -14 Q12 -28 9 -38 Q2 -30 0 -14Z" fill="#16a34a" />
      <path d="M0 -14 Q-3 -30 0 -42 Q4 -30 0 -14Z" fill="#4ade80" />
    </g>
  )
}

// 벽 평면(y=const, 정면)에 붙이는 틀
function OnPlane({ o, x, y, z, children }: { o: Origin; x: number; y: number; z: number; children: ReactNode }) {
  const [px, py] = proj(o, x, y, z)
  return <g transform={`translate(${px} ${py}) matrix(1 0.5 0 1 0 0)`}>{children}</g>
}

// 벽·책상 위 모니터 (작업 중이면 빛과 줄이 움직임)
function Monitor({ cx, working, accent, w = 60, h = 30, code }: { cx: number; working: boolean; accent: string; w?: number; h?: number; code?: boolean }) {
  const lines = code ? [38, 26, 44, 20] : [40, 26, 46, 18]
  const col = working ? '#67e8f9' : '#475569'
  return (
    <g transform={`translate(${cx - w / 2} ${-h - 4})`}>
      {working ? <rect x={-4} y={-4} width={w + 8} height={h + 8} rx={8} fill="#22d3ee" className="o-glow" filter="url(#o-blur)" /> : null}
      <rect width={w} height={h} rx={3.5} fill="#1e293b" />
      <rect x={2.5} y={2.5} width={w - 5} height={h - 5} rx={2} fill={working ? '#0b2433' : '#111827'} />
      {lines.map((lw, i) => (
        code ? (
          <text key={i} x={6} y={9.4 + i * 5.2} fontSize={4.6} fontFamily="ui-monospace, Menlo, monospace" fill={col} className={working ? 'o-line' : undefined} style={working ? { animationDelay: `${i * 0.28}s` } : { opacity: 0.55 }}>
            {['if q in s:', '  r >= 0.8', '  ok(q)', '=> 확인'][i]}
          </text>
        ) : (
          <rect key={i} x={6} y={6 + i * 5.3} width={lw * (w / 60)} height={2.4} rx={1.2} fill={col} className={working ? 'o-line' : undefined} style={working ? { animationDelay: `${i * 0.28}s` } : { opacity: 0.45 }} />
        )
      ))}
      {working ? [0, 1, 2].map((i) => <circle key={i} cx={w - 17 + i * 5.5} cy={h - 6} r={1.5} fill="#22d3ee" className="o-dot" style={{ animationDelay: `${i * 0.18}s` }} />) : <circle cx={w - 8} cy={h - 6} r={1.4} fill="#64748b" />}
      <circle cx={w / 2} cy={h - 1.2} r={0.9} fill={working ? '#4ade80' : accent} opacity={working ? 1 : 0.6} />
    </g>
  )
}

// 책상과 책상 위 물건
function Desk({ o, xc, role, working }: { o: Origin; xc: number; role: AgentRole; working: boolean }) {
  const x = xc - 0.85
  const y = 2.0
  const kb: Pt[] = [proj(o, xc - 0.5, y + 0.18, 20.6), proj(o, xc + 0.5, y + 0.18, 20.6), proj(o, xc + 0.5, y + 0.52, 20.6), proj(o, xc - 0.5, y + 0.52, 20.6)]
  const [mx, my] = proj(o, xc + 0.62, y + 0.65, 20)
  const [px, py] = proj(o, xc - 0.58, y + 0.6, 20)
  return (
    <g>
      <IsoBox o={o} x={x} y={y} w={1.7} d={1.0} h={20} color="#b98557" />
      <polygon points={poly(kb)} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={0.5} />
      {working ? <polygon points={poly(kb)} fill="#67e8f9" className="o-led" opacity={0.5} /> : null}
      <g transform={`translate(${mx} ${my})`}><rect x={-3.6} y={-6.5} width={7.2} height={6.5} rx={1.5} fill="#fff" /><path d="M3.6 -4.6 q3 0 3 2.2 q0 2 -3 2" stroke="#fff" strokeWidth={1.4} fill="none" /><ellipse cx={0} cy={-6.4} rx={3.2} ry={1} fill="#7c2d12" /></g>
      {role === 'officer' ? <g transform={`translate(${px} ${py})`}><path d="M-9 -4 L0 -7 L9 -4 L0 -1Z" fill="#fde68a" /><path d="M-9 -4 L0 -1 L0 2 L-9 -1Z" fill="#b45309" /><path d="M9 -4 L0 -1 L0 2 L9 -1Z" fill="#92400e" /></g> : null}
      {role === 'clerk' ? <g transform={`translate(${px} ${py})`}><path d="M-8 -3 L0 -6 L8 -3 L0 0Z" fill="#fff" /><path d="M-8 -3 L0 0 L0 1.6 L-8 -1.4Z" fill="#cbd5e1" /><path d="M8 -3 L0 0 L0 1.6 L8 -1.4Z" fill="#94a3b8" /></g> : null}
    </g>
  )
}

// 방 바닥 · 벽 · 가구 · 사람
export function RoomScene({ spec, o, profile }: { spec: RoomSpec; o: Origin; profile?: AgentProfile }) {
  const working = !!profile?.working
  const xs = seatXs(spec.seats)
  const [rpx, rpy] = proj(o, 0, 0, 0)
  const [lpx, lpy] = proj(o, 0, RD, 0)
  const topFloor: Pt[] = [proj(o, 0, 0), proj(o, RW, 0), proj(o, RW, RD), proj(o, 0, RD)]
  const tile = shade(spec.tint, -0.07)
  const plaqueW = Math.max(70, textWidth(spec.name, 12) + 22)
  const plaqueMid = (RD - 2.1) * HW
  const role = spec.role
  return (
    <g>
      <polygon points={poly([proj(o, 0, RD, 0), proj(o, RW, RD, 0), proj(o, RW, RD, -THICK), proj(o, 0, RD, -THICK)])} fill={shade(spec.tint, -0.28)} />
      <polygon points={poly([proj(o, RW, 0, 0), proj(o, RW, RD, 0), proj(o, RW, RD, -THICK), proj(o, RW, 0, -THICK)])} fill={shade(spec.tint, -0.42)} />
      <polygon points={poly(topFloor)} fill={spec.tint} />
      {Array.from({ length: Math.floor(RW) }, (_, i) => <line key={`a${i}`} x1={proj(o, i + 1, 0)[0]} y1={proj(o, i + 1, 0)[1]} x2={proj(o, i + 1, RD)[0]} y2={proj(o, i + 1, RD)[1]} stroke={tile} strokeWidth={1} />)}
      {Array.from({ length: Math.floor(RD) }, (_, i) => <line key={`b${i}`} x1={proj(o, 0, i + 1)[0]} y1={proj(o, 0, i + 1)[1]} x2={proj(o, RW, i + 1)[0]} y2={proj(o, RW, i + 1)[1]} stroke={tile} strokeWidth={1} />)}
      {working ? <polygon points={poly(topFloor)} fill="none" stroke={spec.accent} strokeWidth={2.4} strokeLinejoin="round" className="o-ring" /> : null}
      <polygon points={poly([proj(o, 0, 0, 0), proj(o, 0, RD, 0), proj(o, 0, RD, WALL), proj(o, 0, 0, WALL)])} fill={shade(spec.wall, -0.07)} />
      <polygon points={poly([proj(o, 0, 0, 0), proj(o, RW, 0, 0), proj(o, RW, 0, WALL), proj(o, 0, 0, WALL)])} fill={spec.wall} />
      <polygon points={poly([proj(o, 0, 0, 0), proj(o, RW, 0, 0), proj(o, RW, 0, 7), proj(o, 0, 0, 7)])} fill={shade(spec.wall, -0.1)} />
      <polygon points={poly([proj(o, 0, 0, 0), proj(o, 0, RD, 0), proj(o, 0, RD, 7), proj(o, 0, 0, 7)])} fill={shade(spec.wall, -0.17)} />
      <polygon points={poly([proj(o, 0, 0, WALL - 4), proj(o, RW, 0, WALL - 4), proj(o, RW, 0, WALL), proj(o, 0, 0, WALL)])} fill={spec.accent} opacity={0.85} />
      <polygon points={poly([proj(o, 0, 0, WALL - 4), proj(o, 0, RD, WALL - 4), proj(o, 0, RD, WALL), proj(o, 0, 0, WALL)])} fill={shade(spec.accent, -0.18)} opacity={0.85} />
      <g transform={`translate(${lpx} ${lpy}) matrix(1 -0.5 0 1 0 0)`}>
        <rect x={plaqueMid - plaqueW / 2} y={-72} width={plaqueW} height={22} rx={5} fill={spec.accent} />
        <text x={plaqueMid} y={-57} fontSize={12} fontWeight={800} textAnchor="middle" fill="#fff">{spec.name}</text>
        {working ? <circle cx={plaqueMid + plaqueW / 2 - 7} cy={-61} r={2.6} fill="#bbf7d0" className="o-ring" /> : null}
      </g>
      <g transform={`translate(${rpx} ${rpy}) matrix(1 0.5 0 1 0 0)`}>
        {xs.map((xc) => <Monitor key={xc} cx={(xc - 1.5) * HW} working={working && xc === xs[0]} accent={spec.accent} />)}
        {role === 'checker' ? <Monitor cx={4.3 * HW} working={working} accent={spec.accent} w={66} h={32} code /> : null}
      </g>
      {role === 'checker' ? null : <Shelf o={o} x={RW - 1.25} y={0.14} seed={spec.c + spec.r * 3} />}
      {role === 'clerk' ? <IsoBox o={o} x={0.4} y={2.7} w={0.8} d={0.7} h={42} color="#94a3b8" /> : null}
      {role === 'prosecution' || role === 'defense' ? <IsoBox o={o} x={0.45} y={2.9} w={0.8} d={0.7} h={22} color={role === 'prosecution' ? '#d4a373' : '#c8a273'} /> : null}
      {role === 'cross' ? <><IsoBox o={o} x={0.45} y={2.9} w={0.8} d={0.6} h={16} color="#d4a373" /><IsoBox o={o} x={0.5} y={2.95} z={16} w={0.7} d={0.5} h={10} color="#e7c9a0" /></> : null}
      {role === 'officer' ? <><IsoBox o={o} x={0.45} y={2.8} w={0.9} d={0.7} h={12} color="#2563eb" /><IsoBox o={o} x={0.5} y={2.85} z={12} w={0.8} d={0.6} h={10} color="#dc2626" /><IsoBox o={o} x={0.55} y={2.9} z={22} w={0.7} d={0.5} h={9} color="#16a34a" /></> : null}
      {role === 'checker' ? (
        <g>
          {[1.0, 2.3].map((x, k) => (
            <g key={x}>
              <IsoBox o={o} x={x} y={0.5} w={1.0} d={0.9} h={60} color="#334155" />
              <polygon points={poly([proj(o, x + 0.08, 1.4, 6), proj(o, x + 0.92, 1.4, 6), proj(o, x + 0.92, 1.4, 54), proj(o, x + 0.08, 1.4, 54)])} fill="#1e293b" />
              {[0, 1, 2, 3, 4].map((i) => {
                const [lx, ly] = proj(o, x + 0.22, 1.4, 12 + i * 9)
                return (
                  <g key={i}>
                    <circle cx={lx} cy={ly} r={1.5} fill={i % 2 ? '#fbbf24' : '#4ade80'} className={working ? 'o-led' : undefined} style={working ? { animationDelay: `${(i + k * 2) * 0.17}s` } : { opacity: 0.55 }} />
                  </g>
                )
              })}
            </g>
          ))}
          <IsoBox o={o} x={3.6} y={2.0} w={1.6} d={1.0} h={20} color="#b98557" />
          <OnPlane o={o} x={4.4} y={2.0} z={20}><Monitor cx={0} working={working} accent={spec.accent} w={52} h={28} code /></OnPlane>
        </g>
      ) : null}
      {xs.map((xc, i) => {
        const [px, py] = proj(o, xc, 1.5, 0)
        return (
          <g key={xc}>
            <g transform={`translate(${px} ${py}) scale(1.2)`}><Person role={role as Exclude<AgentRole, 'checker'>} seed={spec.c * 5 + spec.r * 11 + i * 2 + 1} working={working && i === 0} /></g>
            <Desk o={o} xc={xc} role={role} working={working && i === 0} />
          </g>
        )
      })}
      <Plant o={o} x={0.5} y={1.2} />
      {spec.role === 'checker' ? null : <Plant o={o} x={RW - 0.45} y={RD - 0.45} />}
    </g>
  )
}

// 글자 폭에 맞춘 둥근 말풍선
function Bubble({ cx, top, text, accent, onOpen, limit }: { cx: number; top: number; text: string; accent: string; onOpen: () => void; limit: [number, number] }) {
  const w = textWidth(text, 11) + 30
  const x = Math.max(limit[0], Math.min(limit[1] - w, cx - w / 2))
  const tail = Math.max(x + 12, Math.min(x + w - 12, cx))
  return (
    <g key={text} className="o-pop" role="link" tabIndex={0} aria-label={`${text} · 법정에서 보기`} style={{ cursor: 'pointer' }} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}>
      <path d={`M${tail - 5} ${top + 23} L${tail} ${top + 29} L${tail + 5} ${top + 23}Z`} fill="#0f172a" />
      <rect x={x} y={top} width={w} height={24} rx={12} fill="#0f172a" />
      <circle cx={x + 12} cy={top + 12} r={3.2} fill={accent === '#0369a1' ? '#38bdf8' : '#4ade80'} className="o-ring" />
      <text x={x + 21} y={top + 15.6} fontSize={11} fontWeight={700} fill="#fff">{text}</text>
    </g>
  )
}

// 이름표와 말풍선 겹치지 않게 맨 위에 그리는 층
export function RoomOverlay({ spec, o, profile, width }: { spec: RoomSpec; o: Origin; profile?: AgentProfile; width: number }) {
  const nav = useNavigate()
  const w = profile?.working ?? null
  const xs = seatXs(spec.seats)
  const label = profile?.label.replace('(코드)', '') ?? spec.name
  const open = () => w && nav(`/court/${w.caseId}`)
  const spots: { x: number; y: number; wallX: number; name: string; chip: string; first: boolean }[] =
    spec.role === 'checker'
      ? [{ x: proj(o, 4.4, 2.5, 0)[0], y: proj(o, 4.4, 2.0, 20)[1] - 24, wallX: 4.3, name: label, chip: '코드', first: true }]
      : xs.map((xc, i) => ({ x: proj(o, xc, 1.5, 0)[0], y: proj(o, xc, 1.5, 0)[1] - 96, wallX: xc - 1.5, name: xs.length > 1 ? `${label} ${LETTERS[i]}` : label, chip: 'AI', first: i === 0 }))
  return (
    <g>
      {spots.map((s) => (
        <g key={s.name}>
          <NameTag x={s.x} y={s.y} label={s.name} chip={s.chip} accent={spec.accent} busy={!!w && s.first} />
          {w && s.first ? <Bubble cx={spec.role === 'checker' ? s.x + 56 : s.x} top={proj(o, s.wallX, 0, WALL)[1] - 40} text={`${label.split(' ')[0]} · ${w.text}`} accent={spec.accent} onOpen={open} limit={[6, width - 6]} /> : null}
        </g>
      ))}
    </g>
  )
}
