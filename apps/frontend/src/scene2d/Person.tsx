// 작고 귀여운 사람 캐릭터 (법정·작업실 공용, AI 에이전트는 「AI」 배지를 단다)
import { C } from './palette'

// 사람 역할
export type PersonRole = 'prosecution' | 'defense' | 'clerk' | 'officer' | 'judge'
// 머리 모양
export type HairStyle = 'short' | 'side' | 'bob' | 'bun' | 'curl' | 'buzz'

// 얼굴 생김새 한 벌
export interface Look { skin: string; skinShade: string; hair: string; style: HairStyle }

// 서로 다른 얼굴 모음
export const LOOKS: Look[] = [
  { skin: '#f6d3b3', skinShade: '#e6b994', hair: '#2b211c', style: 'short' },
  { skin: '#e9b98f', skinShade: '#d39d72', hair: '#6a3f23', style: 'bob' },
  { skin: '#c98f64', skinShade: '#b27649', hair: '#1c1a1f', style: 'buzz' },
  { skin: '#f3cba6', skinShade: '#deae86', hair: '#8a5a2f', style: 'bun' },
  { skin: '#f6d3b3', skinShade: '#e6b994', hair: '#4a2f22', style: 'side' },
  { skin: '#dba67c', skinShade: '#c48b60', hair: '#2a2430', style: 'curl' },
  { skin: '#efc29b', skinShade: '#d8a47b', hair: '#9a9a9f', style: 'short' },
  { skin: '#f6d3b3', skinShade: '#e6b994', hair: '#7a4b34', style: 'bob' },
]

// 역할별 옷 색과 포인트 색
const OUTFIT: Record<PersonRole, { suit: string; accent: string; badge: string }> = {
  prosecution: { suit: '#3a3d4d', accent: '#ea580c', badge: C.pro },
  defense: { suit: '#1f3263', accent: '#2f6df0', badge: C.con },
  clerk: { suit: '#2f8f5b', accent: '#fbbf24', badge: C.green },
  officer: { suit: '#2c5f4a', accent: '#d9a441', badge: C.green },
  judge: { suit: '#26232b', accent: '#ffffff', badge: C.ink },
}

interface Props {
  role: PersonRole
  look?: number
  ai?: boolean
  speaking?: boolean
  working?: boolean
  tone?: string
  delay?: number
  suit?: string
  tie?: string
}

// 뒤쪽 머리카락 (얼굴 아래에 깔림)
function HairBack({ look }: { look: Look }) {
  const c = look.hair
  if (look.style === 'bob') return <path d="M-37 -124 C-42 -172 42 -172 37 -124 C41 -104 37 -90 27 -87 H-27 C-37 -90 -41 -104 -37 -124 Z" fill={c} />
  if (look.style === 'bun') return <circle cx={0} cy={-168} r={13} fill={c} />
  if (look.style === 'curl')
    return (
      <g fill={c}>
        {[-30, -18, 0, 18, 30].map((x, k) => <circle key={x} cx={x} cy={-134 - (k === 2 ? 30 : Math.abs(x) > 25 ? 8 : 24)} r={14} />)}
      </g>
    )
  return null
}

// 앞쪽 머리카락 (머리 덮개와 앞머리)
function HairFront({ look }: { look: Look }) {
  const c = look.hair
  const fringe: Record<HairStyle, string> = {
    short: 'M-34 -122 C-37 -160 -6 -170 10 -166 C32 -162 38 -140 34 -122 C31 -134 22 -145 4 -146 C-10 -146 -26 -140 -34 -122 Z',
    side: 'M-34 -122 C-38 -162 -4 -172 12 -166 C34 -160 40 -140 34 -122 C34 -138 18 -152 -6 -144 C-18 -140 -28 -134 -34 -122 Z',
    bob: 'M-34 -122 C-38 -162 -6 -170 10 -166 C32 -162 38 -140 34 -122 C30 -138 14 -146 0 -146 C-14 -146 -28 -138 -34 -122 Z',
    bun: 'M-34 -122 C-37 -160 -6 -170 10 -166 C32 -162 38 -140 34 -122 C30 -138 14 -148 0 -148 C-14 -148 -28 -138 -34 -122 Z',
    curl: 'M-34 -122 C-36 -150 -6 -158 10 -156 C30 -154 38 -140 34 -122 C28 -136 14 -144 0 -144 C-14 -144 -28 -136 -34 -122 Z',
    buzz: 'M-33 -124 C-35 -152 -6 -160 10 -158 C30 -156 36 -140 33 -124 C28 -138 14 -142 0 -142 C-14 -142 -26 -138 -33 -124 Z',
  }
  return (
    <g>
      <path d={fringe[look.style]} fill={c} />
      <path d="M-14 -156 C-6 -160 6 -160 14 -156" stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.18} />
    </g>
  )
}

// 얼굴 (눈·볼터치·입)
function Face({ role, speaking, look }: { role: PersonRole; speaking: boolean; look: Look }) {
  const brow = role === 'prosecution' ? 1.6 : role === 'defense' ? -1.4 : 0
  return (
    <g>
      <ellipse cx={-19} cy={-111} rx={5.5} ry={3.2} fill="#f08a80" opacity={0.42} />
      <ellipse cx={19} cy={-111} rx={5.5} ry={3.2} fill="#f08a80" opacity={0.42} />
      <g className="c2d-blink">
        {[-11, 11].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy={-121} rx={3.6} ry={4.4} fill={C.ink} />
            <circle cx={x + 1.2} cy={-122.6} r={1.3} fill="#fff" />
          </g>
        ))}
      </g>
      <g stroke={look.hair} strokeWidth={2.4} strokeLinecap="round">
        <path d={`M-16 ${-131 - brow} L-7 ${-130 + brow}`} />
        <path d={`M16 ${-131 - brow} L7 ${-130 + brow}`} />
      </g>
      <path d="M0 -118 Q1.8 -113.5 -0.5 -113" stroke={look.skinShade} strokeWidth={2} fill="none" strokeLinecap="round" />
      {speaking ? <ellipse className="c2d-talk" cx={0} cy={-104} rx={5} ry={3.4} fill="#7a2f2a" /> : <path d="M-5.5 -105 Q0 -100 5.5 -105" stroke="#7a2f2a" strokeWidth={2.4} fill="none" strokeLinecap="round" />}
    </g>
  )
}

// 역할별 옷 (몸통 위에 얹는 부분)
function Outfit({ role, tie }: { role: PersonRole; tie?: string }) {
  const o = tie ? { ...OUTFIT[role], accent: tie } : OUTFIT[role]
  if (role === 'judge') {
    return (
      <g>
        <path d="M-17 -88 L0 -64 L17 -88 Z" fill="#fff" />
        <path d="M-17 -88 L-30 -60 L-18 -2 H-5 L0 -64 Z" fill="#0c0a09" opacity={0.55} />
        <path d="M17 -88 L30 -60 L18 -2 H5 L0 -64 Z" fill="#0c0a09" opacity={0.35} />
        <path d="M-6 -80 H6 V-58 L0 -52 L-6 -58 Z" fill="#f3efe6" />
      </g>
    )
  }
  if (role === 'clerk') {
    return (
      <g>
        <path d="M-17 -88 L0 -60 L17 -88 Z" fill="#fff" />
        <path d="M-17 -88 L0 -60 L-4 -44 L-30 -52 L-34 -70 C-30 -80 -24 -86 -17 -88 Z" fill={o.suit} />
        <path d="M17 -88 L0 -60 L4 -44 L30 -52 L34 -70 C30 -80 24 -86 17 -88 Z" fill="#1f6f45" />
        <circle cx={0} cy={-46} r={2.6} fill={o.accent} />
        <circle cx={0} cy={-30} r={2.6} fill={o.accent} />
      </g>
    )
  }
  return (
    <g>
      <path d="M-16 -88 L0 -62 L16 -88 Z" fill="#fff" />
      <path d="M-16 -88 L-30 -66 L-14 -40 L0 -62 Z" fill="#000" opacity={0.22} />
      <path d="M16 -88 L30 -66 L14 -40 L0 -62 Z" fill="#000" opacity={0.12} />
      {role === 'officer' ? (
        <g>
          <rect x={-3.5} y={-64} width={7} height={26} rx={3} fill={o.accent} />
        </g>
      ) : (
        <g>
          <path d="M-5 -68 H5 L3 -62 H-3 Z" fill={o.accent} />
          <path d="M-3.4 -62 H3.4 L6 -28 L0 -20 L-6 -28 Z" fill={o.accent} />
          <path d="M0 -62 H3.4 L6 -28 L0 -20 Z" fill="#000" opacity={0.18} />
        </g>
      )}
    </g>
  )
}

// 소품 (서기 메모장·재판연구관 책·검사 배지)
function Prop({ role }: { role: PersonRole }) {
  if (role === 'clerk') {
    return (
      <g transform="rotate(-10 -44 -14)">
        <rect x={-62} y={-34} width={26} height={32} rx={4} fill="#fdf8e8" stroke="#c9b27a" strokeWidth={2} />
        {[-26, -19, -12].map((y) => <rect key={y} x={-57} y={y} width={16} height={2.4} rx={1.2} fill="#c9c2b0" />)}
        <rect x={-53} y={-39} width={8} height={8} rx={3} fill={C.brass} />
      </g>
    )
  }
  if (role === 'officer') {
    return (
      <g transform="rotate(-8 -44 -14)">
        <rect x={-66} y={-30} width={34} height={26} rx={3} fill="#7c4a26" />
        <rect x={-64} y={-30} width={32} height={22} rx={3} fill="#2f8f5b" />
        <rect x={-62} y={-26} width={28} height={3} rx={1.5} fill="#fdf8e8" opacity={0.8} />
      </g>
    )
  }
  if (role === 'prosecution') return <path d="M-34 -52 l3 6 6.6 1 -4.8 4.6 1.2 6.6 -6 -3.2 -6 3.2 1.2 -6.6 -4.8 -4.6 6.6 -1 z" fill={C.brass} stroke={C.brassDark} strokeWidth={1} transform="translate(-4 -2) scale(.9)" />
  return null
}

// 사람 캐릭터 (원점은 책상에 가려지는 허리 가운데, 위로 그려진다)
export default function Person({ role, look = 0, ai = role !== 'judge', speaking = false, working = false, tone, delay = 0, suit, tie }: Props) {
  const o = suit ? { ...OUTFIT[role], suit } : OUTFIT[role]
  const l = LOOKS[((look % LOOKS.length) + LOOKS.length) % LOOKS.length]
  const glasses = role === 'officer' || (role === 'clerk' && look % 2 === 0)
  return (
    <g className={speaking ? 'c2d-bob' : undefined}>
      <g className="c2d-breathe" style={{ animationDelay: `-${delay}s` }}>
        <path d="M-46 0 V-56 C-46 -77 -34 -86 -14 -88 H14 C34 -86 46 -77 46 -56 V0 Z" fill={o.suit} />
        <path d="M12 -88 H14 C34 -86 46 -77 46 -56 V0 H12 Z" fill="#000" opacity={0.17} />
        <path d="M-46 -56 C-46 -72 -40 -82 -30 -86 V0 H-46 Z" fill="#fff" opacity={0.07} />
        <rect x={-9} y={-98} width={18} height={16} rx={6} fill={l.skinShade} />
        <Outfit role={role} tie={tie} />
        <Prop role={role} />
        {ai ? (
          <g>
            <rect x={14} y={-60} width={28} height={17} rx={4.5} fill={o.badge} stroke="#fff" strokeWidth={1.6} />
            <text x={28} y={-47.5} textAnchor="middle" fontSize={12} fontWeight={800} fill="#fff">AI</text>
          </g>
        ) : null}
        <g stroke={o.suit} strokeWidth={19} strokeLinecap="round" fill="none">
          <path d="M-38 -72 Q-60 -48 -50 -8" />
          <g className={speaking ? 'c2d-gesture' : undefined}>
            <path d="M38 -72 Q60 -48 50 -8" />
          </g>
        </g>
        <g className={working ? 'c2d-type' : undefined} fill={l.skin}>
          <circle cx={-50} cy={-6} r={8.5} />
          <circle cx={50} cy={-6} r={8.5} style={working ? { animationDelay: '-0.15s' } : undefined} />
        </g>
        <g className={working ? 'c2d-nod' : undefined}>
          <HairBack look={l} />
          <circle cx={-31} cy={-120} r={6.5} fill={l.skinShade} />
          <circle cx={31} cy={-120} r={6.5} fill={l.skinShade} />
          <circle cx={0} cy={-122} r={32} fill={l.skin} />
          <path d="M12 -152 C32 -146 38 -126 30 -106 C24 -98 16 -94 10 -92 C22 -108 24 -134 12 -152 Z" fill={l.skinShade} opacity={0.45} />
          <Face role={role} speaking={speaking} look={l} />
          <HairFront look={l} />
          {glasses ? (
            <g fill="none" stroke="#3b2f2a" strokeWidth={2.4}>
              <circle cx={-11} cy={-121} r={8.5} />
              <circle cx={11} cy={-121} r={8.5} />
              <path d="M-2.5 -121 H2.5" />
            </g>
          ) : null}
          {ai ? (
            <g className={working || speaking ? 'c2d-pulse' : undefined} transform="translate(0 -184)">
              <rect x={-21} y={-10.5} width={42} height={21} rx={10.5} fill={o.badge} stroke="#fff" strokeWidth={1.8} />
              <circle cx={-11} cy={0} r={3.4} fill={tone ?? '#fff'} stroke="#fff" strokeWidth={1} />
              <text x={5} y={5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">AI</text>
              <path d="M-4 10 L0 15 L4 10 Z" fill={o.badge} />
            </g>
          ) : null}
        </g>
      </g>
    </g>
  )
}
