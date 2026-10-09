// 판결 입력용 공통 폼 조각
import { useState, type ReactNode } from 'react'
import type { Leaning } from '../api/types'
import { MIN_REASON } from '../lib/trial'
import { INPUT } from './styles'

// 낚시성 여부 선택 버튼
export function LeaningPicker({ value, onChange }: { value: Leaning | null; onChange: (l: Leaning) => void }) {
  const opts: { v: Leaning; label: string; on: string }[] = [
    { v: 'clickbait', label: '낚시성이다', on: 'border-pro bg-pro text-white' },
    { v: 'not_clickbait', label: '낚시성 아니다', on: 'border-con bg-con text-white' },
  ]
  return (
    <div role="radiogroup" aria-label="낚시성 여부" className="grid grid-cols-2 gap-2">
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className={`rounded-lg border-2 px-2 py-2 text-sm font-bold ${value === o.v ? o.on : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// 확신도 슬라이더
export function Confidence({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-sm">
      확신도 <b>{value}</b>점
      <input type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-amber-600" />
    </label>
  )
}

// 사유 입력칸
export function ReasonBox({ value, onChange, label }: { value: string; onChange: (s: string) => void; label: string }) {
  const n = value.trim().length
  const ok = n >= MIN_REASON
  return (
    <label className="block text-sm">
      {label} <span className={`text-xs font-semibold ${ok ? 'text-emerald-800' : 'text-amber-900'}`} aria-live="polite">{ok ? `✓ ${n}자` : `${n}/${MIN_REASON}자 (${MIN_REASON - n}자 더)`}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={`${INPUT} mt-1`} />
    </label>
  )
}

// 막힌 이유를 처음엔 차분히, 눌러 본 뒤엔 붉게 알리는 버튼
export function GuardedButton({ why, onGo, className, children, blockedPrefix = '아직 기록할 수 없어요 · ' }: { why: string | null; onGo: () => void; className: string; children: ReactNode; blockedPrefix?: string }) {
  const [tried, setTried] = useState(false)
  return (
    <div>
      <button type="button" className={className} aria-disabled={!!why} onClick={() => (why ? setTried(true) : onGo())}>{children}</button>
      {why ? (
        <p role="status" className={`mt-1.5 text-xs ${tried ? 'font-semibold text-red-700' : 'text-stone-600'}`}>
          {tried ? blockedPrefix : ''}{why}
        </p>
      ) : null}
    </div>
  )
}

// 도움말 말풍선이 붙은 용어
export function Term({ children, tip }: { children: ReactNode; tip: string }) {
  return <abbr title={tip} className="cursor-help underline decoration-dotted underline-offset-2">{children}</abbr>
}
