// 공용 AI 로봇 아바타
interface Props {
  tone?: string
  variant?: number
  working?: boolean
  label?: string
}

const EYES = ['M-28 -128 Q-18 -139 -8 -128', 'M8 -128 Q18 -139 28 -128']

// 얼굴 눈 모양
function Eyes({ variant, tone }: { variant: number; tone: string }) {
  if (variant === 3) {
    return (
      <g fill={tone}>
        <circle cx={-18} cy={-128} r={7} />
        <circle cx={18} cy={-128} r={7} />
      </g>
    )
  }
  return (
    <g fill="none" stroke={tone}>
      {EYES.map((d) => <path key={d} d={d} strokeLinecap="round" strokeWidth={6} />)}
    </g>
  )
}

// 흰색 AI 로봇
export default function RobotAvatar({ tone = '#12b7c8', variant = 0, working = false, label = 'AI' }: Props) {
  const v = ((variant % 4) + 4) % 4
  const face = v === 1 ? 'M-44 -149 H44 L37 -101 H-37 Z' : v === 2 ? 'M-40 -151 Q0 -166 40 -151 V-104 Q0 -91 -40 -104 Z' : 'M-46 -146 Q-40 -164 0 -166 Q40 -164 46 -146 L39 -101 Q0 -88 -39 -101 Z'
  return (
    <g className={working ? 'robot-working' : undefined} aria-label={`${label} 로봇`}>
      <ellipse cx={0} cy={4} rx={48} ry={10} fill="#0f2135" opacity={0.18} />
      <g className="robot-breathe">
        <path d="M-24 -23 L-42 0 H-18 L-8 -22 Z" fill="#d7e5f3" stroke="#7790a9" strokeWidth={3} />
        <path d="M24 -23 L42 0 H18 L8 -22 Z" fill="#d7e5f3" stroke="#7790a9" strokeWidth={3} />
        <path d="M-41 -81 Q-64 -60 -57 -22" stroke="#b7c8db" strokeWidth={16} strokeLinecap="round" fill="none" />
        <path d="M41 -81 Q64 -60 57 -22" stroke="#b7c8db" strokeWidth={16} strokeLinecap="round" fill="none" />
        <path d="M-38 -91 Q0 -118 38 -91 L49 -26 Q0 2 -49 -26 Z" fill="#f8fbff" stroke="#8aa4bd" strokeWidth={4} />
        <path d="M8 -105 Q31 -95 38 -75 L46 -28 Q25 -12 4 -8 Q19 -45 8 -105 Z" fill="#c9d9ea" opacity={0.72} />
        <path d="M-27 -85 H27 L36 -34 Q0 -19 -36 -34 Z" fill="#14233a" opacity={0.94} />
        <path d="M-17 -76 H17" stroke="#eef8ff" strokeWidth={3} opacity={0.36} strokeLinecap="round" />
        <g transform="translate(0 -8) scale(.42 .34)">
          <Eyes variant={v} tone={tone} />
        </g>
        <circle className="robot-core" cx={0} cy={-47} r={9} fill={tone} />
        <path d="M-16 -31 Q0 -24 16 -31" stroke="#e9f6ff" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.75} />
        <g className={working ? 'robot-hands' : undefined}>
          <circle cx={-58} cy={-18} r={10} fill="#f8fbff" stroke="#7b95ae" strokeWidth={3} />
          <circle cx={58} cy={-18} r={10} fill="#f8fbff" stroke="#7b95ae" strokeWidth={3} />
        </g>
        <g transform="translate(0 -174)">
          <path d="M-33 -10 H25 L35 0 L25 10 H-33 Z" fill="#ffffff" stroke="#90a7bf" strokeWidth={2} />
          <circle cx={-19} r={4.5} fill={tone} />
          <text x={8} y={5} textAnchor="middle" fontSize={13} fontWeight={900} fill="#122033">{label}</text>
          <path d="M-2 10 L4 17 L10 10 Z" fill="#ffffff" stroke="#90a7bf" strokeWidth={1.5} />
        </g>
        <path d={face} fill="#f8fbff" stroke="#8aa4bd" strokeWidth={4} />
        <path d="M-36 -145 Q0 -162 36 -145" stroke="#ffffff" strokeWidth={5} opacity={0.78} strokeLinecap="round" />
        <path d={face} fill="#13243b" opacity={0.94} transform="scale(.78 .72) translate(0 -50)" />
        <g transform="translate(0 -8)">
          <Eyes variant={v} tone={tone} />
        </g>
        <path d="M-13 -111 Q0 -105 13 -111" stroke="#dff9ff" strokeWidth={3} fill="none" strokeLinecap="round" />
        <circle className="robot-core" cx={0} cy={-181} r={6} fill={tone} />
      </g>
    </g>
  )
}
