// 진행률 막대와 로딩·오류 안내
import type { ReactNode } from 'react'

// 진행률 막대
export function ProgressBar({ value, label, tone = 'bg-amber-500' }: { value: number; label?: ReactNode; tone?: string }) {
  const w = Math.max(0, Math.min(1, value)) * 100
  return (
    <div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={Math.round(w)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${w}%` }} />
      </div>
      {label ? <p className="mt-1 text-sm text-stone-700">{label}</p> : null}
    </div>
  )
}

// 불러오는 중 안내
export function Loading({ text = '불러오는 중입니다…' }: { text?: string }) {
  return <p className="p-6 text-sm text-stone-600">{text}</p>
}

// 오류 안내 문구
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      <p>{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-2 rounded-md border border-red-400 px-3 py-1 font-semibold hover:bg-red-100">
          다시 시도
        </button>
      ) : null}
    </div>
  )
}

// 쪽 제목과 부제
export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl font-black tracking-tight">{title}</h2>
      {sub ? <p className="mt-1 text-sm text-stone-600">{sub}</p> : null}
    </div>
  )
}
