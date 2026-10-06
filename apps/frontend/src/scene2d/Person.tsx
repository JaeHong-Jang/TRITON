// 각진 애니메이션 법정 인물 캐릭터
import RobotAvatar from '../ui/RobotAvatar'
import { C } from './palette'

// 사람 역할
export type PersonRole = 'prosecution' | 'defense' | 'clerk' | 'officer' | 'judge'
// 머리 모양
export type HairStyle = 'short' | 'side' | 'bob' | 'bun' | 'curl' | 'buzz'

// 얼굴 생김새 한 벌
export interface Look { skin: string; skinShade: string; hair: string; style: HairStyle }

// 서로 다른 얼굴 모음
export const LOOKS: Look[] = [
  { skin: '#f0c4a1', skinShade: '#c98d68', hair: '#11141b', style: 'short' },
  { skin: '#e2aa81', skinShade: '#b77850', hair: '#2b1b17', style: 'bob' },
  { skin: '#b97650', skinShade: '#855033', hair: '#0f1218', style: 'buzz' },
  { skin: '#ebbc94', skinShade: '#b9825e', hair: '#3c261f', style: 'bun' },
  { skin: '#f0c4a1', skinShade: '#c98d68', hair: '#251912', style: 'side' },
  { skin: '#ca8f66', skinShade: '#935d3d', hair: '#17151c', style: 'curl' },
  { skin: '#e4b58f', skinShade: '#a77455', hair: '#b5b0a8', style: 'short' },
  { skin: '#edc19c', skinShade: '#be8764', hair: '#462b24', style: 'bob' },
]

// 역할별 옷 색과 포인트 색
const OUTFIT: Record<PersonRole, { suit: string; shadow: string; accent: string; badge: string }> = {
  prosecution: { suit: '#1d1f29', shadow: '#4b1d20', accent: '#d24d2e', badge: C.pro },
  defense: { suit: '#151f32', shadow: '#203f67', accent: '#5d8df1', badge: C.con },
  clerk: { suit: '#1b322c', shadow: '#224f43', accent: '#c4a56e', badge: C.green },
  officer: { suit: '#182a2d', shadow: '#2b5554', accent: '#c4a56e', badge: C.green },
  judge: { suit: '#090b10', shadow: '#2a2530', accent: '#e5dfcf', badge: C.ink },
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

// 머리 뒤 윤곽
function HairBack({ look }: { look: Look }) {
  const c = look.hair
  if (look.style === 'bob') return <path d="M-35 -126 L-28 -159 L-2 -171 L25 -161 L37 -127 L31 -91 L-27 -91 Z" fill={c} />
  if (look.style === 'bun') return <path d="M-13 -165 L1 -181 L18 -170 L13 -154 Z" fill={c} />
  if (look.style === 'curl') {
    return (
      <g fill={c}>
        {[-31, -16, 0, 16, 31].map((x, k) => <path key={x} d={`M${x - 11} ${k === 2 ? -157 : -146} L${x + 3} ${k === 2 ? -169 : -160} L${x + 16} ${k === 2 ? -151 : -139} L${x + 5} ${k === 2 ? -135 : -125} Z`} />)}
      </g>
    )
  }
  return null
}

// 머리 앞 윤곽
function HairFront({ look }: { look: Look }) {
  const c = look.hair
  const fringe: Record<HairStyle, string> = {
    short: 'M-34 -124 L-25 -154 L2 -168 L28 -154 L35 -124 L20 -139 L1 -133 L-17 -143 Z',
    side: 'M-35 -124 L-23 -158 L8 -170 L35 -148 L34 -123 L7 -147 L-8 -136 L-21 -137 Z',
    bob: 'M-36 -124 L-27 -158 L2 -170 L29 -158 L36 -124 L18 -139 L-2 -132 L-22 -141 Z',
    bun: 'M-34 -124 L-23 -157 L4 -169 L31 -152 L34 -123 L16 -143 L-4 -137 L-20 -141 Z',
    curl: 'M-35 -124 L-25 -151 L-2 -160 L24 -153 L35 -124 L17 -136 L1 -132 L-18 -137 Z',
    buzz: 'M-33 -126 L-25 -148 L2 -158 L28 -148 L34 -126 L12 -140 L-11 -139 Z',
  }
  return (
    <g>
      <path d={fringe[look.style]} fill={c} />
      <path d="M-25 -147 L-2 -158 L21 -146" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.13} />
    </g>
  )
}

// 얼굴 표정
function Face({ role, speaking, look }: { role: PersonRole; speaking: boolean; look: Look }) {
  const brow = role === 'prosecution' ? 3 : role === 'defense' ? -2 : role === 'judge' ? 1 : 0
  return (
    <g>
      <path d="M-25 -113 L-14 -110 L-21 -106 Z" fill="#a4413d" opacity={0.28} />
      <path d="M25 -113 L14 -110 L21 -106 Z" fill="#a4413d" opacity={0.28} />
      <g className="c2d-blink">
        {[-12, 12].map((x) => (
          <g key={x}>
            <path d={`M${x - 6} -122 L${x + 1} -126 L${x + 8} -122 L${x + 2} -119 Z`} fill="#101018" />
            <circle cx={x + 2} cy={-123} r={1.5} fill="#e5dfcf" opacity={0.75} />
          </g>
        ))}
      </g>
      <g stroke={look.hair} strokeWidth={2.8} strokeLinecap="round">
        <path d={`M-20 ${-133 - brow} L-6 ${-130 + brow}`} />
        <path d={`M20 ${-133 - brow} L6 ${-130 + brow}`} />
      </g>
      <path d="M1 -119 L-3 -111 L3 -112" stroke={look.skinShade} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      {speaking ? <path className="c2d-talk" d="M-6 -104 L0 -109 L7 -104 L1 -99 Z" fill="#5b1b1f" /> : <path d="M-7 -104 L1 -101 L8 -105" stroke="#5b1b1f" strokeWidth={2.4} fill="none" strokeLinecap="round" />}
    </g>
  )
}

// 역할별 옷
function Outfit({ role, tie }: { role: PersonRole; tie?: string }) {
  const o = tie ? { ...OUTFIT[role], accent: tie } : OUTFIT[role]
  if (role === 'judge') {
    return (
      <g>
        <path d="M-18 -88 L0 -62 L18 -88 Z" fill="#e5dfcf" />
        <path d="M-21 -88 L-36 -44 L-31 0 H-7 L0 -62 Z" fill="#07080c" />
        <path d="M21 -88 L36 -44 L31 0 H7 L0 -62 Z" fill="#13131a" />
        <path d="M-5 -78 H5 L8 -51 L0 -44 L-8 -51 Z" fill="#c8beb0" />
      </g>
    )
  }
  if (role === 'clerk') {
    return (
      <g>
        <path d="M-18 -88 L0 -59 L18 -88 Z" fill="#e5dfcf" />
        <path d="M-18 -88 L-34 -62 L-23 -26 L0 -59 Z" fill={o.shadow} />
        <path d="M18 -88 L34 -62 L23 -26 L0 -59 Z" fill={o.suit} />
        <rect x={-3.2} y={-55} width={6.4} height={29} rx={2} fill={o.accent} />
      </g>
    )
  }
  return (
    <g>
      <path d="M-17 -88 L0 -61 L17 -88 Z" fill="#e5dfcf" />
      <path d="M-17 -88 L-35 -64 L-19 -28 L0 -61 Z" fill={o.shadow} />
      <path d="M17 -88 L35 -64 L19 -28 L0 -61 Z" fill={o.suit} />
      {role === 'officer' ? (
        <path d="M-5 -64 H5 L5 -34 L0 -27 L-5 -34 Z" fill={o.accent} />
      ) : (
        <g>
          <path d="M-5 -68 H5 L3 -61 H-3 Z" fill={o.accent} />
          <path d="M-3 -61 H3 L6 -28 L0 -19 L-6 -28 Z" fill={o.accent} />
          <path d="M0 -61 H3 L6 -28 L0 -19 Z" fill="#000" opacity={0.24} />
        </g>
      )}
    </g>
  )
}

// 역할별 소품
function Prop({ role }: { role: PersonRole }) {
  if (role === 'clerk') {
    return (
      <g transform="rotate(-13 -45 -23)">
        <path d="M-65 -38 H-36 L-31 -7 H-61 Z" fill="#e5dfcf" stroke="#5d4a2d" strokeWidth={2} />
        {[-29, -21, -13].map((y) => <path key={y} d={`M-58 ${y} H-42`} stroke="#71685f" strokeWidth={2.2} strokeLinecap="round" />)}
        <circle cx={-50} cy={-40} r={4} fill={C.brass} />
      </g>
    )
  }
  if (role === 'officer') {
    return (
      <g transform="rotate(-8 -45 -24)">
        <path d="M-67 -34 H-33 L-31 -9 H-64 Z" fill="#151b23" stroke="#6d5637" strokeWidth={2} />
        <path d="M-61 -28 H-38" stroke="#c4a56e" strokeWidth={2.5} strokeLinecap="round" />
      </g>
    )
  }
  if (role === 'prosecution') return <path d="M-34 -54 l3 7 7 1 -5 5 1 7 -6 -3.5 -6 3.5 1 -7 -5 -5 7 -1 z" fill={C.brass} stroke="#5c4524" strokeWidth={1.1} transform="translate(-4 -2) scale(.9)" />
  return null
}

// 인물 캐릭터
export default function Person({ role, look = 0, ai = role !== 'judge', speaking = false, working = false, tone, delay = 0, suit, tie }: Props) {
  if (ai) {
    return (
      <g className={speaking ? 'c2d-bob' : undefined}>
        <g className="c2d-breathe" style={{ animationDelay: `-${delay}s` }}>
          <RobotAvatar tone={tone ?? OUTFIT[role].badge} variant={look} working={working || speaking} />
        </g>
      </g>
    )
  }
  const o = suit ? { ...OUTFIT[role], suit } : OUTFIT[role]
  const l = LOOKS[((look % LOOKS.length) + LOOKS.length) % LOOKS.length]
  const glasses = role === 'officer' || (role === 'clerk' && look % 2 === 0)
  return (
    <g className={speaking ? 'c2d-bob' : undefined}>
      <g className="c2d-breathe" style={{ animationDelay: `-${delay}s` }}>
        <path d="M-43 0 L-48 -48 L-34 -78 L-13 -90 H13 L34 -78 L48 -48 L43 0 Z" fill={o.suit} />
        <path d="M10 -90 H14 L34 -78 L48 -48 L43 0 H10 Z" fill="#000" opacity={0.28} />
        <path d="M-40 -55 L-31 -82 L-15 -90 H-5 L-22 -62 Z" fill="#fff" opacity={0.07} />
        <path d="M-8 -98 H8 L10 -85 L0 -77 L-10 -85 Z" fill={l.skinShade} />
        <Outfit role={role} tie={tie} />
        <Prop role={role} />
        {ai ? (
          <g>
            <path d="M15 -60 H42 L39 -43 H14 Z" fill={o.badge} stroke="#e5dfcf" strokeWidth={1.5} />
            <text x={28} y={-48} textAnchor="middle" fontSize={12} fontWeight={800} fill="#fff">AI</text>
          </g>
        ) : null}
        <g stroke={o.suit} strokeWidth={17} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M-38 -70 Q-62 -47 -51 -9" />
          <g className={speaking ? 'c2d-gesture' : undefined}>
            <path d="M38 -70 Q61 -46 52 -9" />
          </g>
        </g>
        <g className={working ? 'c2d-type' : undefined}>
          <path d="M-58 -10 L-49 -19 L-39 -9 L-48 1 Z" fill={l.skin} />
          <path d="M58 -10 L49 -19 L39 -9 L48 1 Z" fill={l.skin} style={working ? { animationDelay: '-0.15s' } : undefined} />
        </g>
        <g className={working ? 'c2d-nod' : undefined}>
          <HairBack look={l} />
          <path d="M-36 -122 L-31 -131 L-23 -121 L-30 -112 Z" fill={l.skinShade} />
          <path d="M36 -122 L31 -131 L23 -121 L30 -112 Z" fill={l.skinShade} />
          <path d="M-29 -129 L-22 -148 L0 -158 L23 -148 L31 -128 L26 -106 L8 -91 H-8 L-26 -106 Z" fill={l.skin} />
          <path d="M12 -151 L28 -139 L31 -123 L24 -105 L8 -91 C19 -108 21 -132 12 -151 Z" fill={l.skinShade} opacity={0.48} />
          <Face role={role} speaking={speaking} look={l} />
          <HairFront look={l} />
          {glasses ? (
            <g fill="none" stroke="#1f1a18" strokeWidth={2.1}>
              <path d="M-21 -123 L-4 -124 L-5 -116 L-20 -116 Z" />
              <path d="M4 -124 L21 -123 L20 -116 L5 -116 Z" />
              <path d="M-4 -120 H4" />
            </g>
          ) : null}
          {ai ? (
            <g className={working || speaking ? 'c2d-pulse' : undefined} transform="translate(0 -184)">
              <path d="M-24 -11 H18 L25 -2 L18 11 H-24 Z" fill={o.badge} stroke="#e5dfcf" strokeWidth={1.7} />
              <circle cx={-12} cy={0} r={3.5} fill={tone ?? '#e5dfcf'} stroke="#fff" strokeWidth={1} />
              <text x={5} y={5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">AI</text>
              <path d="M-2 11 L3 16 L7 11 Z" fill={o.badge} />
            </g>
          ) : null}
        </g>
      </g>
    </g>
  )
}
