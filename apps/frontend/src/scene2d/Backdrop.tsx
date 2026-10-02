// 법정 배경 (벽·판넬·바닥·창·방청석 난간)
import Person from './Person'
import { C } from './palette'

const PANELS = Array.from({ length: 17 }, (_, i) => i * 110 - 130)
const PLANKS = Array.from({ length: 12 }, (_, i) => 580 + i * 36)
const BALUSTERS = Array.from({ length: 44 }, (_, i) => i * 40 - 120)
// 방청석 사람 (의자 폭 92가 안전 여백 70 안쪽에 들어오는 가운데 좌표)
const AUDIENCE = [
  { x: 150, look: 2, suit: '#4b5563', narrow: false },
  { x: 262, look: 5, suit: '#7c2d12', narrow: false },
  { x: 374, look: 7, suit: '#1e3a5f', narrow: false },
  { x: 486, look: 4, suit: '#4d6b4a', narrow: false },
  { x: 1352, look: 1, suit: '#7f6a4d', narrow: false },
  { x: 1464, look: 0, suit: '#4b5563', narrow: false },
  { x: 270, look: 2, suit: '#4b5563', narrow: true },
  { x: 374, look: 5, suit: '#7c2d12', narrow: true },
  { x: 478, look: 7, suit: '#1e3a5f', narrow: true },
  { x: 1120, look: 1, suit: '#7f6a4d', narrow: true },
  { x: 1216, look: 4, suit: '#4d6b4a', narrow: true },
]

// 아치형 창
function Window({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 70)`}>
      <path d="M-8 266 V80 A78 78 0 0 1 148 80 V266 Z" fill={C.woodDark} />
      <path d="M6 252 V82 A64 64 0 0 1 134 82 V252 Z" fill="url(#c2d-sky)" />
      <path d="M6 252 V82 A64 64 0 0 1 40 28 L90 252 Z" fill="#fff" opacity={0.18} />
      <g stroke={C.woodDark} strokeWidth={6}>
        <path d="M70 18 V252 M6 130 H134" />
      </g>
      <rect x={-18} y={262} width={176} height={14} rx={4} fill={C.woodLight} />
    </g>
  )
}

// 기둥 장식
function Pilaster({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x={0} y={-800} width={36} height={1192} fill={C.wallLight} />
      <rect x={24} y={-800} width={12} height={1192} fill={C.wallShade} />
      {[9, 18].map((dx) => (
        <rect key={dx} x={dx} y={-800} width={3} height={1176} fill={C.wallShade} />
      ))}
      <rect x={-6} y={380} width={48} height={14} rx={3} fill={C.woodLight} />
    </g>
  )
}

// 법정 배경 컴포넌트
export default function Backdrop({ narrow }: { narrow: boolean }) {
  return (
    <g>
      <defs>
        <linearGradient id="c2d-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.wallLight} />
          <stop offset="1" stopColor={C.wall} />
        </linearGradient>
        <linearGradient id="c2d-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.floorDark} />
          <stop offset="1" stopColor={C.floor} />
        </linearGradient>
        <linearGradient id="c2d-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe1f2" />
          <stop offset="1" stopColor="#eaf5f6" />
        </linearGradient>
        <radialGradient id="c2d-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6c9" stopOpacity={0.9} />
          <stop offset="1" stopColor="#fff6c9" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x={-600} y={-700} width={2800} height={1280} fill="url(#c2d-wall)" />
      <rect x={-600} y={560} width={2800} height={1100} fill="url(#c2d-floor)" />
      {PLANKS.map((y, i) => (
        <rect key={y} x={-600} y={y} width={2800} height={2 + i * 0.25} fill={C.woodDark} opacity={0.16} />
      ))}
      <rect x={-600} y={386} width={2800} height={14} fill={C.woodLight} />
      <rect x={-600} y={400} width={2800} height={160} fill={C.woodDark} />
      {PANELS.map((x) => (
        <g key={x}>
          <rect x={x + 14} y={414} width={82} height={132} rx={6} fill={C.wood} />
          <rect x={x + 22} y={422} width={66} height={116} rx={4} fill={C.woodDark} opacity={0.35} />
        </g>
      ))}
      <rect x={-600} y={556} width={2800} height={14} fill={C.woodLight} />
      <rect x={-600} y={570} width={2800} height={10} fill="#000" opacity={0.14} />
      {narrow ? null : (
        <>
          <Window x={120} />
          <Window x={1300} />
        </>
      )}
      <Pilaster x={462} />
      <Pilaster x={1102} />
      <ellipse cx={800} cy={150} rx={360} ry={150} fill="url(#c2d-glow)" />
      <g transform="translate(800 72)">
        <circle r={44} fill={C.woodDark} />
        <circle r={39} fill={C.brass} />
        <circle r={39} fill="none" stroke={C.brassLight} strokeWidth={3} strokeDasharray="2 6" />
        <circle r={30} fill={C.brassDark} opacity={0.35} />
        <g stroke={C.woodDark} strokeWidth={3} strokeLinecap="round" fill="none">
          <path d="M0 -22 V20 M-12 22 H12 M-22 -10 H22" />
          <path d="M-22 -10 L-28 6 H-16 Z M22 -10 L16 6 H28 Z" fill={C.woodDark} />
        </g>
      </g>
      {narrow ? null : (
        <g transform="translate(800 127)">
          <path d="M-210 -14 H210 L196 0 L210 14 H-210 L-196 0 Z" fill={C.woodDark} />
          <text textAnchor="middle" y={6} fontSize={16} fontWeight={800} fill={C.brassLight}>판사는 사람입니다 · AI는 판결하지 않습니다</text>
        </g>
      )}
      <rect x={-600} y={868} width={2800} height={14} rx={4} fill={C.woodLight} />
    </g>
  )
}

// 방청석 (난간 뒤 의자에 앉은 상반신 사람들과 낮은 난간)
export function Gallery({ narrow }: { narrow: boolean }) {
  const people = AUDIENCE.filter((p) => p.narrow === narrow)
  return (
    <g>
      {people.map((p, k) => (
        <g key={p.x} transform={`translate(${p.x} 872)`}>
          <rect x={-46} y={-118} width={92} height={120} rx={20} fill={C.woodDark} />
          <rect x={-38} y={-110} width={76} height={106} rx={14} fill={C.wood} opacity={0.55} />
          <g transform="scale(0.6)">
            <Person role="defense" look={p.look} ai={false} delay={k * 0.9} suit={p.suit} />
          </g>
        </g>
      ))}
      <rect x={-600} y={866} width={2800} height={34} fill={C.woodDark} />
      <rect x={-600} y={866} width={2800} height={7} fill={C.woodHi} />
      {BALUSTERS.map((x) => (
        <rect key={x} x={x - 6} y={884} width={12} height={16} rx={3} fill={C.wood} />
      ))}
    </g>
  )
}
