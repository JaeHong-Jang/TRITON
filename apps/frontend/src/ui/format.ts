// 표시용 문자열 변환

// 주격 조사 붙이기
export function withGa(name: string): string {
  const last = name.trim().at(-1) ?? ''
  const code = last.charCodeAt(0)
  const hangul = code >= 0xac00 && code <= 0xd7a3
  return `${name}${hangul && (code - 0xac00) % 28 !== 0 ? '이' : '가'}`
}

// 낚시성 여부 라벨
export const leaningLabel = (l: string | null) => (l === 'clickbait' ? '낚시성이다' : l === 'not_clickbait' ? '낚시성 아니다' : '미정')

// 원문 일치 검증 종류 라벨
export function verifiedLabel(kind?: 'quote' | 'absence'): string {
  return kind === 'quote' ? '인용 원문 일치' : kind === 'absence' ? '핵심어 부재 확인' : '원문 일치(인용·부재)'
}

// 서기 권고 방향 비공개 여부
export function screeningDirectionHidden(screening: { isClickbait?: boolean } | null): boolean {
  return typeof screening?.isClickbait !== 'boolean'
}

// 한국 시각 문자열
export function fmtTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 비율을 퍼센트 문자열로
export const pct = (n: number | null) => (n === null ? '-' : `${Math.round(n * 100)}%`)
