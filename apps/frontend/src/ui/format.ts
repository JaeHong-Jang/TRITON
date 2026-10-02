// 표시용 문자열 변환

// 주격 조사 붙이기
export function withGa(name: string): string {
  const last = name.trim().at(-1) ?? ''
  const code = last.charCodeAt(0)
  const hangul = code >= 0xac00 && code <= 0xd7a3
  return `${name}${hangul && (code - 0xac00) % 28 !== 0 ? '이' : '가'}`
}

// 낚시성 여부 라벨
export const leaningLabel = (l: string | null) => (l === 'clickbait' ? '낚시성' : l === 'not_clickbait' ? '낚시성 아님' : '미정')

// 한국 시각 문자열
export function fmtTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 비율을 퍼센트 문자열로
export const pct = (n: number | null) => (n === null ? '-' : `${Math.round(n * 100)}%`)
