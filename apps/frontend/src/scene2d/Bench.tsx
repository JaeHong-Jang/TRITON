// 법대 (판사석 3석)
import { C } from './palette'
import Judge from './Judge'

interface Props { lit: number; currentSeat: number | null; narrow: boolean }

const SEATS = [640, 800, 960]
const JUDGE_LOOKS = [6, 4, 1]

// 법대와 판사석 컴포넌트
export default function Bench({ lit, currentSeat, narrow }: Props) {
  return (
    <g>
      <rect x={520} y={112} width={560} height={150} rx={18} fill={C.woodDark} />
      {SEATS.map((cx, k) => {
        const on = k < lit
        const cur = currentSeat === k + 1
        return (
          <g key={cx}>
            {cur ? <ellipse className="c2d-pulse" cx={cx} cy={190} rx={80} ry={86} fill="#fde68a" opacity={0.55} /> : null}
            <rect x={cx - 64} y={132} width={128} height={140} rx={34} fill={on ? '#4a2c18' : '#3a2414'} stroke={cur ? '#fbbf24' : 'none'} strokeWidth={4} />
            <rect x={cx - 50} y={146} width={100} height={116} rx={26} fill={on ? '#5c3820' : '#4a2c18'} />
            {[-40, 40].map((dx) => (
              <circle key={dx} cx={cx + dx} cy={150} r={3.5} fill={C.brass} />
            ))}
            {on ? (
              <g transform={`translate(${cx} 270)`}>
                <Judge look={JUDGE_LOOKS[k]} delay={k * 1.3} />
              </g>
            ) : (
              <text x={cx} y={206} textAnchor="middle" fontSize={15} fontWeight={700} fill="#8b6b4b">빈 판사석</text>
            )}
          </g>
        )
      })}
      <rect x={500} y={262} width={600} height={18} rx={6} fill={C.woodHi} />
      <rect x={500} y={262} width={600} height={5} rx={2.5} fill="#d6a572" />
      <rect x={520} y={280} width={560} height={72} fill={C.wood} />
      <rect x={520} y={340} width={560} height={14} fill={C.woodDark} opacity={0.7} />
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x={532 + k * 138} y={288} width={126} height={48} rx={5} fill={C.woodDark} opacity={0.3} />
      ))}
      {SEATS.map((cx, k) => {
        const on = k < lit
        const cur = currentSeat === k + 1
        return (
          <g key={cx} transform={`translate(${cx} 294)`}>
            <rect x={-72} width={144} height={34} rx={7} fill={on ? (cur ? '#fde68a' : C.brass) : '#a8896a'} stroke={on ? C.brassDark : '#8a6d4d'} strokeWidth={2} />
            <text y={23} textAnchor="middle" fontSize={narrow ? 17 : 16} fontWeight={800} fill={on ? C.ink : '#5b452e'}>
              {narrow ? `${k + 1}` : on ? `판사석 ${k + 1} · 사람` : `판사석 ${k + 1}`}
            </text>
          </g>
        )
      })}
      <g transform="translate(1040 262)">
        <rect x={-26} y={-8} width={44} height={8} rx={3} fill={C.woodDark} />
        <rect x={-10} y={-30} width={34} height={16} rx={4} fill={C.woodDark} transform="rotate(-14 -10 -22)" />
        <rect x={-6} y={-12} width={4} height={6} fill={C.woodDark} />
      </g>
    </g>
  )
}
