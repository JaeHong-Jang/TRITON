// 피고인 신문 캐릭터 일러스트
import type { Case, Leaning } from '../api/types'
import { wrapText } from './layout'
import { C } from './palette'

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

// 판결 후에만 표정이 바뀌는 눈
function Eyes({ verdict }: { verdict: Leaning | null }) {
  return (
    <g className={verdict ? undefined : 'c2d-blink'}>
      {[-25, 25].map((x) => (
        <g key={x} transform={`translate(${x} -242)`}>
          {verdict === 'not_clickbait' ? (
            <path d="M-12 4 Q0 -12 12 4" stroke={C.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
          ) : (
            <>
              <circle r={16} fill="#fff" stroke={C.steelShade} strokeWidth={2} />
              <circle cx={verdict === 'clickbait' ? 0 : x > 0 ? -3 : 3} cy={verdict === 'clickbait' ? 6 : 1} r={7} fill={C.ink} />
              <circle cx={verdict === 'clickbait' ? 2 : x > 0 ? -1 : 5} cy={verdict === 'clickbait' ? 3 : -2} r={2.2} fill="#fff" />
            </>
          )}
        </g>
      ))}
      {verdict === 'clickbait' ? <path d="M62 -226 q-7 12 0 18 q7 -6 0 -18 z" fill="#7dd3fc" /> : null}
    </g>
  )
}

// 피고인 컴포넌트 (원점은 발 가운데)
export default function Defendant2d({ c, verdict, appealed, narrow }: Props) {
  const lines = wrapText(c.title, 8.4, 4)
  const happy = verdict === 'not_clickbait'
  const armUp = happy ? 'M-70 -160 Q-102 -170 -104 -204' : 'M-70 -160 Q-100 -130 -92 -96'
  const armUpR = happy ? 'M70 -160 Q102 -170 104 -204' : 'M70 -160 Q100 -130 92 -96'
  const handL = happy ? [-104, -210] : [-92, -90]
  const handR = happy ? [104, -210] : [92, -90]
  return (
    <g transform={`scale(${narrow ? 0.72 : 1})`}>
      <ellipse cx={0} cy={4} rx={76} ry={10} fill="#000" opacity={0.18} />
      <g className={happy ? 'c2d-hop' : undefined}>
        <g className={verdict === 'clickbait' ? undefined : 'c2d-sway'}>
          <g stroke={C.ink} strokeWidth={7} strokeLinecap="round" fill="none">
            <path d="M-26 -64 V-12" />
            <path d="M26 -64 V-12" />
            <path d={armUp} strokeWidth={6} />
            <path d={armUpR} strokeWidth={6} />
          </g>
          {[-26, 26].map((x) => (
            <path key={x} d={`M${x - 14} -2 Q${x - 14} -16 ${x} -16 Q${x + 16} -16 ${x + 16} -2 Z`} fill={C.ink} />
          ))}
          <g transform={verdict === 'clickbait' ? 'rotate(-6 0 -150)' : undefined}>
            <rect x={-70} y={-240} width={140} height={178} rx={9} fill={C.paper} />
            <path d="M44 -240 H61 Q70 -240 70 -231 V-62 H44 Z" fill={C.wallShade} opacity={0.55} />
            <path d="M70 -240 V-218 L48 -240 Z" fill={C.steelShade} opacity={0.7} />
            <rect x={-70} y={-240} width={140} height={5} rx={2.5} fill={C.ink} opacity={0.12} />
            <rect x={-58} y={-214} width={116} height={20} fill={C.ink} />
            <text y={-199} textAnchor="middle" fontSize={13} fontWeight={800} fill={C.paper} letterSpacing={1.5}>피고 · 기사</text>
            <text x={-58} y={-178} fontSize={9.5} fontWeight={600} fill="#78716c">{c.category}</text>
            {lines.map((l, i) => (
              <text key={i} x={-58} y={-158 + i * 18} fontSize={14} fontWeight={800} fill={C.ink}>{l}</text>
            ))}
            {[0, 1, 2].map((i) => (
              <rect key={i} x={-58} y={-82 + i * 7} width={i === 2 ? 70 : 116} height={3.5} rx={1.75} fill={C.steelShade} />
            ))}
            <Eyes verdict={verdict} />
          </g>
          {[handL, handR].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r={10} fill="#fff" stroke={C.steelShade} strokeWidth={2} />
          ))}
        </g>
        {verdict === 'clickbait' ? (
          <g className="c2d-hook">
            <path d="M0 -304 V-262" stroke={C.steelDark} strokeWidth={2.5} />
            <circle cx={0} cy={-306} r={5} fill="none" stroke={C.steelDark} strokeWidth={2.5} />
            <path d="M0 -262 Q0 -246 -10 -246 Q-20 -246 -20 -258" stroke={C.steelShade} strokeWidth={5} fill="none" strokeLinecap="round" />
            <path d="M-23 -262 l5 -8 l5 8 z" fill={C.steelShade} />
          </g>
        ) : null}
      </g>
      {appealed && !verdict ? (
        <g transform="translate(86 -262)">
          <g className="c2d-sway">
            <circle r={22} fill={C.paper} stroke={C.ink} strokeWidth={3} />
            <text y={9} textAnchor="middle" fontSize={26} fontWeight={800} fill={C.ink}>?</text>
          </g>
        </g>
      ) : null}
      <g transform="translate(0 26)">
        <rect x={-68} y={-16} width={136} height={30} rx={15} fill={C.ink} opacity={0.88} />
        <text y={5} textAnchor="middle" fontSize={16} fontWeight={800} fill="#fff">{statusOf(verdict, appealed)}</text>
      </g>
    </g>
  )
}
