// 자율 범위 정책 설정 카드
import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { CaseSummary, Policy, Stats } from '../../api/types'
import { BTN_DARK, Meter, Panel } from '../../console/parts'
import { pct } from '../../ui/format'

// 서기 정확도에 대한 쉬운 경고 문구
export function clerkWarning(stats: Stats | null): { tone: 'none' | 'ok' | 'warn' | 'bad'; text: string } {
  if (!stats || stats.screening.total === 0) return { tone: 'none', text: '아직 확정된 판결이 없어 서기 정확도를 잴 수 없습니다. 판결이 쌓이면 여기에 나옵니다.' }
  const acc = stats.screening.correct / stats.screening.total
  const wrong = stats.screening.total - stats.screening.correct
  if (stats.screening.total < 20) return { tone: 'warn', text: `표본이 ${stats.screening.total}건뿐이라 정확도(${pct(acc)})를 아직 믿기 어렵습니다. 약식 처리 기준을 높게 유지하세요.` }
  if (acc < 0.6) return { tone: 'bad', text: `서기가 ${stats.screening.total}건 중 ${wrong}건을 틀렸습니다. 이 정확도로는 약식 권고로 넘기기 위험하니 끄거나 기준을 크게 높이세요.` }
  if (acc < 0.8) return { tone: 'warn', text: `서기가 ${stats.screening.total}건 중 ${wrong}건을 틀렸습니다. 약식 처리 기준을 높이거나 고위험 분야를 넓혀 사람이 더 보게 하세요.` }
  return { tone: 'ok', text: `서기가 ${stats.screening.total}건 중 ${stats.screening.correct}건을 맞혔습니다. 지금 기준으로 약식 권고로 분류해도 괜찮은 수준입니다.` }
}

const WARN_STYLE = { none: 'border-stone-200 bg-stone-50 text-stone-600', ok: 'border-emerald-200 bg-emerald-50 text-emerald-900', warn: 'border-amber-300 bg-amber-50 text-amber-900', bad: 'border-red-300 bg-red-50 text-red-900' }

// 정책 카드 컴포넌트
export function PolicyCard() {
  const [saved, setSaved] = useState<Policy | null>(null)
  const [draft, setDraft] = useState<Policy | null>(null)
  const [cases, setCases] = useState<CaseSummary[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.policy().then((p) => (setSaved(p), setDraft(p))).catch((e: Error) => setError(e.message))
    api.cases().then(setCases).catch(() => undefined)
    api.stats().then(setStats).catch(() => undefined)
  }, [])

  if (!draft || !saved) return <Panel title="자율 범위 정책">{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <p className="text-sm text-stone-500">불러오는 중입니다…</p>}</Panel>

  const categories = [...new Set([...(cases ?? []).map((c) => c.category), ...draft.highRiskCategories])]
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const summary = cases?.filter((c) => c.docket.track === 'summary').length ?? 0
  const trial = cases?.filter((c) => c.docket.track === 'trial').length ?? 0
  const warn = clerkWarning(stats)
  const acc = stats && stats.screening.total ? stats.screening.correct / stats.screening.total : null

  const toggleCat = (c: string) => setDraft({ ...draft, highRiskCategories: draft.highRiskCategories.includes(c) ? draft.highRiskCategories.filter((x) => x !== c) : [...draft.highRiskCategories, c] })
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const p = await api.savePolicy(draft)
      setSaved(p)
      setDraft(p)
      setCases(await api.cases())
      setDone(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="자율 범위 정책" aside="AI가 어디까지 혼자 처리할지">
      <div className="space-y-5">
        <label className="flex items-start gap-3">
          <input type="checkbox" role="switch" checked={draft.summaryEnabled} onChange={(e) => (setDraft({ ...draft, summaryEnabled: e.target.checked }), setDone(false))} className="mt-0.5 h-5 w-5 accent-amber-600" />
          <span>
            <b className="text-sm">약식 처리 사용</b>
            <span className="block text-[12.5px] leading-relaxed text-stone-600">서기가 충분히 확신하는 사건은 약식 권고로 분류됩니다. 최종 판결과 조치 승인 기록은 사람이 남깁니다. 끄면 모든 사건이 재판으로 갑니다.</span>
          </span>
        </label>

        <div className={draft.summaryEnabled ? '' : 'pointer-events-none opacity-40'}>
          <label className="block text-sm font-bold" htmlFor="threshold">서기 확신도 기준 <span className="ml-1 text-lg font-black tabular-nums text-amber-700">{draft.summaryThreshold}점</span></label>
          <input id="threshold" type="range" min={50} max={100} step={1} value={draft.summaryThreshold} disabled={!draft.summaryEnabled} onChange={(e) => (setDraft({ ...draft, summaryThreshold: Number(e.target.value) }), setDone(false))} className="mt-2 w-full accent-amber-600" />
          <p className="mt-1 text-[12.5px] leading-relaxed text-stone-600">이 점수 이상일 때만 약식 처리합니다. 높일수록 사람이 보는 사건이 늘고 더 안전해집니다.</p>
        </div>

        <fieldset>
          <legend className="text-sm font-bold">고위험 분야 <span className="text-[12px] font-normal text-stone-500">· 점수가 높아도 항상 재판으로</span></legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = draft.highRiskCategories.includes(c)
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => (toggleCat(c), setDone(false))} className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${on ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}>
                  {on ? '✓ ' : ''}{c}
                </button>
              )
            })}
            {!categories.length ? <span className="text-sm text-stone-400">분야 정보가 없습니다.</span> : null}
          </div>
        </fieldset>

        <div className={`rounded-xl border p-3.5 text-[13px] leading-relaxed ${WARN_STYLE[warn.tone]}`} role="status">
          <div className="flex items-center justify-between gap-3">
            <b>측정된 서기 정확도</b>
            <span className="text-base font-black tabular-nums">{acc === null ? '-' : pct(acc)}{stats && stats.screening.total ? <span className="ml-1 text-xs font-semibold opacity-70">({stats.screening.correct}/{stats.screening.total}건)</span> : null}</span>
          </div>
          <div className="mt-1.5"><Meter value={acc ?? 0} tone={warn.tone === 'bad' ? 'bg-red-500' : warn.tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'} label="서기 정확도" /></div>
          <p className="mt-2">{warn.text}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={BTN_DARK} onClick={save} disabled={busy || !dirty}>{busy ? '저장 중…' : '정책 저장'}</button>
          {done && !dirty ? (
            <p className="text-sm font-bold text-emerald-800" role="status">저장했습니다. 이 기준이면 약식 처리 {summary}건 · 재판 회부 {trial}건</p>
          ) : dirty ? (
            <p className="text-xs text-stone-500">저장해야 접수 분류에 반영됩니다.</p>
          ) : (
            <p className="text-xs text-stone-500">현재 기준: 약식 처리 {summary}건 · 재판 회부 {trial}건</p>
          )}
          {error ? <p role="alert" className="text-sm font-semibold text-red-700">{error}</p> : null}
        </div>
      </div>
    </Panel>
  )
}
