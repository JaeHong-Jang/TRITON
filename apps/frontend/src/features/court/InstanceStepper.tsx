// 심급 탭과 판사 단계 칩 (둘 다 눌러서 이동)
import './court.css'
import { useEffect, useState } from 'react'
import { currentStepCode, stepsFor, type Phase } from '../../lib/trial'
import { sectionOf, tabsOf } from '../../lib/reveal'
import { Num } from '../../ui/Badge'
import { useCourt } from './store'
import { useCourtView } from './view'

const HINTS = { 1: '판사 1명', 2: '판사 2명', 3: '판사 3명 다수결' } as const

// 1심 · 2심 · 3심 탭 (기록이 있으면 그 심급을 보고, 없으면 열리는 조건을 칩 줄 아래에 안내)
export function InstanceStepper() {
  const v = useCourtView()
  const setViewing = useCourt((s) => s.setViewing)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 7000)
    return () => clearTimeout(t)
  }, [note])
  if (!v) return null
  const tabs = tabsOf(v.state, v.records)
  return (
    <>
      <ol className="flex items-center gap-1 whitespace-nowrap" aria-label="심급 탭">
        {tabs.map((t) => {
          const tone = t.status === 'current' ? 'bg-amber-400 text-stone-900 font-bold' : t.status === 'done' ? 'bg-emerald-700 text-white' : 'bg-stone-200 text-stone-600'
          return (
            <li key={t.instance} className="flex items-center gap-1">
              {t.instance > 1 ? <span className="text-stone-600" aria-hidden>▸</span> : null}
              <button
                aria-current={t.instance === v.viewInstance ? 'step' : undefined}
                aria-disabled={!t.viewable}
                onClick={() => {
                  if (t.viewable) {
                    setNote(null)
                    setViewing(t.instance === v.current ? null : t.instance)
                  } else setNote(`${t.instance}심 · ${t.note}`)
                }}
                className={`rounded-md px-3 py-1 text-sm ${tone} ${t.instance === v.viewInstance ? 'ring-2 ring-stone-900' : ''} ${t.viewable ? '' : 'opacity-70'}`}
              >
                {t.status === 'done' ? '✓ ' : ''}{t.instance}심
                <span className="ml-1 hidden text-[11px] font-normal sm:inline">{HINTS[t.instance]}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {note ? <p role="status" className="order-last basis-full rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold leading-relaxed text-amber-100">{note}</p> : null}
    </>
  )
}

// 판사 단계 칩 (눌러서 오른쪽 패널의 해당 구역으로 이동)
export function StepIndicator({ phase }: { phase: Phase }) {
  const v = useCourtView()
  if (!v) return null
  const steps = stepsFor(v.viewInstance)
  const code = currentStepCode(phase, v.viewInstance)
  const at = phase === 'final' ? steps.length : phase === 'need_record' ? -1 : steps.findIndex((s) => s.code === code)
  // 구역으로 부드럽게 이동하고 잠깐 강조
  const jump = (stepCode: string) => {
    const el = document.getElementById(sectionOf(stepCode))
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.remove('court-flash')
    void el.offsetWidth
    el.classList.add('court-flash')
  }
  return (
    <ol className="flex items-center gap-1 whitespace-nowrap text-xs" aria-label="판사 단계">
      {steps.map((s, k) => {
        const status = k < at ? 'done' : k === at ? 'current' : 'next'
        const tone = status === 'current' ? 'bg-stone-900 text-amber-200 font-bold' : status === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-stone-600 border border-stone-300'
        return (
          <li key={s.code}>
            <button onClick={() => jump(s.code)} title={`${s.label} 구역으로 이동`} aria-current={status === 'current' ? 'step' : undefined} className={`rounded-full px-2.5 py-1 hover:ring-2 hover:ring-amber-400 ${tone}`}>
              {status === 'done' ? '✓ ' : ''}<Num n={k + 1} />{s.label}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
