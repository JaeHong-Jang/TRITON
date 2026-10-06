// 미래도시 사람 판사 법대
import { C } from './palette'
import Judge from './Judge'

interface Props { lit: number; currentSeat: number | null; narrow: boolean }

const SEATS = [640, 800, 960]
const JUDGE_LOOKS = [6, 4, 1]

// 법대와 사람 판사석
export default function Bench({ lit, currentSeat, narrow }: Props) {
  return (
    <g>
      <path d="M468 224 H1132 L1092 380 H508 Z" fill="#ffffff" stroke="#9eb8cf" strokeWidth={3} opacity={0.96} />
      <path d="M502 246 H1098 L1068 362 H532 Z" fill="#e4eff8" stroke="#b4cadf" strokeWidth={2} />
      <path d="M502 246 H1098 L1084 286 H516 Z" fill="#f8fbff" opacity={0.9} />
      <path d="M480 224 H1120 L1102 258 H498 Z" fill="#d4e5f3" stroke="#ffffff" strokeWidth={2} />
      <path d="M514 236 H1086" stroke="#10b9c8" strokeWidth={4} opacity={0.64} />
      {[0, 1, 2, 3].map((k) => (
        <path key={k} d={`M${536 + k * 138} 278 H${650 + k * 138} L${642 + k * 138} 350 H${544 + k * 138} Z`} fill="#9fc4dc" opacity={0.2} />
      ))}
      {SEATS.map((cx, k) => {
        const on = k < lit
        const cur = currentSeat === k + 1
        return (
          <g key={cx}>
            {cur ? <ellipse className="c2d-pulse" cx={cx} cy={218} rx={78} ry={64} fill="#10b9c8" opacity={0.32} /> : null}
            <path d={`M${cx - 61} 190 H${cx + 61} L${cx + 54} 306 H${cx - 54} Z`} fill={on ? '#ffffff' : '#d0dce8'} stroke={cur ? '#e9b949' : '#91abc3'} strokeWidth={cur ? 4 : 2} />
            <path d={`M${cx - 44} 204 H${cx + 44} L${cx + 38} 294 H${cx - 38} Z`} fill={on ? '#dfeef8' : '#c0cedd'} />
            <path d={`M${cx - 34} 211 H${cx + 34}`} stroke="#10b9c8" strokeWidth={2.5} opacity={on ? 0.58 : 0.25} />
            {[cx - 39, cx + 39].map((x) => <circle key={x} cx={x} cy={203} r={3.6} fill={on ? C.brass : '#9dafc2'} />)}
            {on ? (
              <g transform={`translate(${cx} 306)`}>
                <Judge look={JUDGE_LOOKS[k]} delay={k * 1.3} />
              </g>
            ) : (
              <text x={cx} y={246} textAnchor="middle" fontSize={15} fontWeight={800} fill="#50687f">빈 판사석</text>
            )}
          </g>
        )
      })}
      <path d="M492 300 H1108 L1098 323 H502 Z" fill="#b8cee4" />
      <path d="M512 318 H1088 L1076 374 H524 Z" fill="#ffffff" stroke="#9eb8cf" strokeWidth={2} />
      <path d="M526 328 H1074 L1068 362 H532 Z" fill="#10b9c8" opacity={0.08} />
      {SEATS.map((cx, k) => {
        const on = k < lit
        const cur = currentSeat === k + 1
        return (
          <g key={cx} transform={`translate(${cx} 320)`}>
            <path d="M-72 0 H72 L66 34 H-66 Z" fill={on ? (cur ? '#fff1b8' : '#e9b949') : '#c1cfdb'} stroke={on ? '#9b7b23' : '#8398aa'} strokeWidth={2} />
            <text y={22} textAnchor="middle" fontSize={narrow ? 17 : 15.5} fontWeight={800} fill="#122033">
              {narrow ? (on ? `사람 판사 ${k + 1}` : `판사석 ${k + 1}`) : on ? `판사석 ${k + 1} · 사람` : `판사석 ${k + 1}`}
            </text>
          </g>
        )
      })}
      <g transform="translate(1046 305)">
        <path d="M-28 -6 H20 L15 2 H-30 Z" fill="#122033" />
        <path d="M-10 -29 H22 L24 -14 H-10 Z" fill="#ffffff" stroke="#10b9c8" strokeWidth={1.5} transform="rotate(-14 -10 -22)" />
        <path d="M-5 -14 H0 V1 H-7 Z" fill="#122033" />
      </g>
    </g>
  )
}
