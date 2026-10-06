// 신문 피고 애니메이션 일러스트
import type { Case, Leaning } from '../api/types'
import { wrapText } from './layout'

interface Props {
  c: Case
  verdict: Leaning | null
  appealed: boolean
  narrow: boolean
}

// 피고 상태 문구
function statusOf(verdict: Leaning | null, appealed: boolean): string {
  if (verdict === 'clickbait') return '유죄 · 낚시성'
  if (verdict === 'not_clickbait') return '무죄'
  return appealed ? '항소 중' : '피고'
}

// 판결 후 표정
function Eyes({ verdict }: { verdict: Leaning | null }) {
  return (
    <g className={verdict ? undefined : 'c2d-blink'}>
      {[-25, 25].map((x) => (
        <g key={x} transform={`translate(${x} -242)`}>
          {verdict === 'not_clickbait' ? (
            <path d="M-13 3 L0 -10 L13 3" stroke="#0b1017" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <>
              <path d="M-16 -2 L-4 -14 L14 -7 L17 9 L2 17 L-14 11 Z" fill="#e5dfcf" stroke="#293745" strokeWidth={2.4} />
              <circle cx={verdict === 'clickbait' ? 1 : x > 0 ? -3 : 3} cy={verdict === 'clickbait' ? 5 : 0} r={6.5} fill="#0b1017" />
              <circle cx={verdict === 'clickbait' ? 3 : x > 0 ? -1 : 5} cy={verdict === 'clickbait' ? 2 : -3} r={2} fill="#fff" />
            </>
          )}
        </g>
      ))}
      {verdict === 'clickbait' ? <path d="M63 -226 q-8 12 0 20 q8 -7 0 -20 z" fill="#7fa8bd" /> : null}
    </g>
  )
}

// 신문 피고 캐릭터
export default function Defendant2d({ c, verdict, appealed, narrow }: Props) {
  const lines = wrapText(c.title, 8.4, 4)
  const happy = verdict === 'not_clickbait'
  const armUp = happy ? 'M-68 -160 Q-105 -176 -110 -212' : 'M-68 -160 Q-100 -130 -92 -96'
  const armUpR = happy ? 'M68 -160 Q105 -176 110 -212' : 'M68 -160 Q100 -130 92 -96'
  const handL = happy ? [-110, -218] : [-92, -90]
  const handR = happy ? [110, -218] : [92, -90]
  return (
    <g transform={`scale(${narrow ? 0.72 : 1})`}>
      <ellipse cx={0} cy={4} rx={78} ry={10} fill="#000" opacity={0.24} />
      <g className={happy ? 'c2d-hop' : undefined}>
        <g className={verdict === 'clickbait' ? undefined : 'c2d-sway'}>
          <g stroke="#0b1017" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M-27 -65 L-22 -12" />
            <path d="M27 -65 L22 -12" />
            <path d={armUp} strokeWidth={6} />
            <path d={armUpR} strokeWidth={6} />
          </g>
          {[-26, 26].map((x) => (
            <path key={x} d={`M${x - 16} -1 L${x - 3} -18 L${x + 17} -3 Z`} fill="#0b1017" />
          ))}
          <g transform={verdict === 'clickbait' ? 'rotate(-6 0 -150)' : undefined}>
            <path d="M-72 -240 H49 L72 -217 V-63 H-63 L-72 -74 Z" fill="#e5dfcf" />
            <path d="M49 -240 L72 -217 H51 Z" fill="#7fa8bd" opacity={0.62} />
            <path d="M-72 -240 H49 L72 -217 V-63 H-63 L-72 -74 Z" fill="none" stroke="#0b1017" strokeWidth={4} strokeLinejoin="round" />
            <path d="M47 -238 V-218 H70" stroke="#0b1017" strokeWidth={3} fill="none" />
            <path d="M-58 -217 H58 V-194 H-58 Z" fill="#0b1017" />
            <text y={-200} textAnchor="middle" fontSize={13} fontWeight={900} fill="#e5dfcf" letterSpacing={1.2}>피고 · 기사</text>
            <text x={-58} y={-178} fontSize={9.5} fontWeight={700} fill="#6b6258">{c.category}</text>
            {lines.map((l, i) => (
              <text key={i} x={-58} y={-158 + i * 18} fontSize={14} fontWeight={900} fill="#0b1017">{l}</text>
            ))}
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M-58 ${-82 + i * 7} H${i === 2 ? 12 : 58}`} stroke="#293745" strokeWidth={3.5} strokeLinecap="round" opacity={0.7} />
            ))}
            <Eyes verdict={verdict} />
          </g>
          {[handL, handR].map(([x, y]) => (
            <path key={x} d={`M${x - 10} ${y} L${x} ${y - 10} L${x + 11} ${y} L${x + 1} ${y + 10} Z`} fill="#e5dfcf" stroke="#293745" strokeWidth={2} />
          ))}
        </g>
        {verdict === 'clickbait' ? (
          <g className="c2d-hook">
            <path d="M0 -304 V-263" stroke="#293745" strokeWidth={2.5} />
            <circle cx={0} cy={-306} r={5} fill="none" stroke="#293745" strokeWidth={2.5} />
            <path d="M0 -263 Q0 -246 -11 -246 Q-22 -246 -22 -259" stroke="#7fa8bd" strokeWidth={5} fill="none" strokeLinecap="round" />
            <path d="M-25 -263 l5 -8 l5 8 z" fill="#7fa8bd" />
          </g>
        ) : null}
      </g>
      {appealed && !verdict ? (
        <g transform="translate(86 -262)">
          <g className="c2d-sway">
            <path d="M-22 0 L0 -24 L23 -2 L3 22 Z" fill="#e5dfcf" stroke="#0b1017" strokeWidth={3} />
            <text y={9} textAnchor="middle" fontSize={26} fontWeight={900} fill="#0b1017">?</text>
          </g>
        </g>
      ) : null}
      <g transform="translate(0 26)">
        <path d="M-70 -16 H70 L62 15 H-62 Z" fill="#0b1017" opacity={0.9} />
        <text y={5} textAnchor="middle" fontSize={16} fontWeight={900} fill="#e5dfcf">{statusOf(verdict, appealed)}</text>
      </g>
    </g>
  )
}
