// 미래도시 법정의 정적 배경과 코드 검증관 표식

// 판결과 무관한 정적 법정 배경
export default function Backdrop({ narrow }: { narrow: boolean }) {
  return (
    <g>
      <defs>
        <linearGradient id="c2d-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f9fdff" />
          <stop offset="0.48" stopColor="#dcebf6" />
          <stop offset="1" stopColor="#bfd5e8" />
        </linearGradient>
        <linearGradient id="c2d-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.82} />
          <stop offset="0.5" stopColor="#c9e5f8" stopOpacity={0.52} />
          <stop offset="1" stopColor="#6f98ba" stopOpacity={0.64} />
        </linearGradient>
        <radialGradient id="c2d-atrium">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.96} />
          <stop offset="0.55" stopColor="#e5f5fb" stopOpacity={0.72} />
          <stop offset="1" stopColor="#93cbd7" stopOpacity={0} />
        </radialGradient>
        <pattern id="c2d-grid" width="84" height="84" patternUnits="userSpaceOnUse">
          <path d="M84 0 H0 V84" fill="none" stroke="#7aa9c5" strokeWidth={1} opacity={0.22} />
        </pattern>
      </defs>
      <rect x={-1800} y={-2400} width={5200} height={5700} fill="url(#c2d-sky)" />
      <image href="/art/future-city.png" x={-70} y={-520} width={1740} height={1320} preserveAspectRatio="xMidYMid slice" opacity={0.54} aria-hidden="true" />
      <rect x={-80} y={-620} width={1760} height={1510} fill="#f8fbff" opacity={0.18} />
      <rect x={-80} y={-620} width={1760} height={1610} fill="url(#c2d-grid)" opacity={0.54} />
      <path d="M120 -520 Q800 -820 1480 -520" fill="none" stroke="#ffffff" strokeWidth={28} opacity={0.52} />
      <path d="M205 -430 Q800 -650 1395 -430" fill="none" stroke="#4d83a6" strokeWidth={5} opacity={0.34} />
      {[78, 226, 378, 1222, 1374, 1522].map((x, i) => (
        <g key={x} opacity={narrow && (i === 0 || i === 5) ? 0.25 : 1}>
          <path d={`M${x - (x < 800 ? 70 : -70)} -620 L${x + (x < 800 ? 190 : -190)} 1070`} stroke="#ffffff" strokeWidth={20} opacity={0.82} />
          <path d={`M${x - (x < 800 ? 70 : -70)} -620 L${x + (x < 800 ? 190 : -190)} 1070`} stroke="#497c9e" strokeWidth={4} opacity={0.68} />
        </g>
      ))}
      {[180, 330, 1270, 1420].map((x, i) => (
        <g key={x} opacity={0.72}>
          <path d={`M${x} 118 H${x + (i < 2 ? 290 : -290)}`} stroke="#ffffff" strokeWidth={11} />
          <path d={`M${x} 118 H${x + (i < 2 ? 290 : -290)}`} stroke="#0e8fa1" strokeWidth={3} opacity={0.72} />
        </g>
      ))}
      <ellipse cx={800} cy={738} rx={690} ry={150} fill="url(#c2d-atrium)" />
      <path d="M178 762 Q800 520 1422 762 L1320 842 Q800 674 280 842 Z" fill="#f8fbff" stroke="#789fbc" strokeWidth={4} opacity={0.96} />
      <path d="M296 794 Q800 644 1304 794" fill="none" stroke="#0e8fa1" strokeWidth={4} opacity={0.6} />
      <path d="M420 824 Q800 716 1180 824" fill="none" stroke="#c49525" strokeWidth={3} opacity={0.64} />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${360 + i * 110} 850 L${760 + i * 20} 675 L${1240 - i * 110} 850`} fill="none" stroke="#668eac" strokeWidth={1.8} opacity={0.52} />
      ))}
      <g transform="translate(800 162)">
        <circle className="c2d-scanner" r={96} fill="none" stroke="#10b9c8" strokeWidth={8} opacity={0.42} />
        <circle r={68} fill="#ffffff" stroke="#8eb0c8" strokeWidth={2.5} opacity={0.86} />
        <path d="M-38 -4 H38 M-24 -25 H24 M-20 18 H20" stroke="#122033" strokeWidth={5} strokeLinecap="round" opacity={0.78} />
        <circle cx={0} cy={0} r={9} fill="#e9b949" />
        <g transform="translate(0 -116)">
          <path d="M-150 -22 H150 L164 0 L150 22 H-150 L-164 0 Z" fill="#ffffff" stroke="#8eb0c8" strokeWidth={2} />
          <text y={7} textAnchor="middle" fontSize={narrow ? 22 : 18} fontWeight={900} fill="#122033">증거 검증관 · 코드 스캐너</text>
        </g>
      </g>
      <rect x={-80} y={890} width={1760} height={440} fill="#cfe0ef" opacity={0.72} />
      <path d="M-80 890 H1680" stroke="#ffffff" strokeWidth={8} opacity={0.68} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={`floor-h-${i}`} d={`M-80 ${930 + i * 62} H1680`} stroke="#ffffff" strokeWidth={2} opacity={0.2 + i * 0.03} />
      ))}
      {[160, 360, 560, 1040, 1240, 1440].map((x) => (
        <path key={x} d={`M${x} 890 L${x + (x < 800 ? -120 : 120)} 1330`} stroke="#668eac" strokeWidth={2.2} opacity={0.28} />
      ))}
    </g>
  )
}

// 법정을 둘러싼 유리 난간
export function Gallery({ narrow }: { narrow: boolean }) {
  return (
    <g aria-hidden="true">
      <path d="M-100 890 L540 852 M1060 852 L1700 890" fill="none" stroke="#ffffff" strokeWidth={26} opacity={0.68} />
      <path d="M-100 876 L540 838 M1060 838 L1700 876" fill="none" stroke="#10b9c8" strokeWidth={3} opacity={0.56} />
      {narrow ? null : [90, 260, 430, 1170, 1340, 1510].map((x) => <path key={x} d={`M${x} 854 V918`} stroke="#7ea4bf" strokeWidth={8} opacity={0.45} />)}
    </g>
  )
}
