// 콘솔 공통 조각 (패널 · 얇은 막대 · 상대 시각)
import type { ReactNode } from 'react'

// 패널 바탕
export const PANEL = 'rounded-2xl border border-stone-200 bg-white'

// 제목이 있는 패널
export function Panel({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${PANEL} ${className}`} aria-label={title}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h2 className="text-[15px] font-black tracking-tight">{title}</h2>
        {aside ? <div className="text-xs text-stone-500">{aside}</div> : null}
      </div>
      <div className="p-5 pt-3">{children}</div>
    </section>
  )
}

// 얇은 진행 막대
export function Meter({ value, tone = 'bg-amber-500', label }: { value: number; tone?: string; label: string }) {
  const w = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label={label} aria-valuenow={Math.round(w)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${w}%` }} />
    </div>
  )
}

// 몇 분 전 같은 상대 시각
export function ago(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 10) return '방금'
  if (s < 60) return `${s}초 전`
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

// 모든 콘솔 화면의 공통 최대 너비
export const PAGE_MAX = 'max-w-[1320px]'

// 화면 공통 바깥 여백 틀
export function PageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full space-y-5 p-4 min-[900px]:p-6 ${PAGE_MAX} ${className}`}>{children}</div>
}

// 제목이 있는 화면 틀
export function PageFrame({ title, sub, actions, children }: { title: string; sub?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-tight">{title}</h2>
          {sub ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-600">{sub}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </PageShell>
  )
}

// 흰 바탕 보조 버튼
export const BTN = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-50'

// 검은 바탕 주 버튼
export const BTN_DARK = 'inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-stone-700 disabled:opacity-50'
