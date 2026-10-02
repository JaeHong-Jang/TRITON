// 에이전트별 작업 기록(trace) 타임라인
import type { AgentEvent, TrialRecord } from '../../api/types'

const KIND: Record<AgentEvent['kind'], { label: string; chip: string }> = {
  read: { label: '읽기', chip: 'bg-stone-100 text-stone-600' },
  plan: { label: '계획', chip: 'bg-sky-50 text-sky-700' },
  tool: { label: '도구', chip: 'bg-violet-50 text-violet-700' },
  draft: { label: '초안', chip: 'bg-stone-100 text-stone-700' },
  check: { label: '검증', chip: 'bg-teal-50 text-teal-700' },
  revise: { label: '고쳐 쓰기', chip: 'bg-amber-100 text-amber-900' },
  submit: { label: '제출', chip: 'bg-emerald-50 text-emerald-700' },
  escalate: { label: '사람에게 넘김', chip: 'bg-red-600 text-white' },
  done: { label: '완료', chip: 'bg-stone-100 text-stone-600' },
  error: { label: '오류', chip: 'bg-red-100 text-red-800' },
}

// 시각을 시:분:초로
function clock(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { hour12: false })
}

// 에이전트 작업 기록 컴포넌트
export function AgentLog({ rec }: { rec: TrialRecord }) {
  const trace = rec.trace ?? []
  if (!trace.length) return <p className="text-sm text-stone-500">이 심급에는 에이전트 작업 기록이 없습니다.</p>
  const names = new Map(rec.bench.map((a) => [a.id, a.name]))
  const ids = [...new Set(trace.map((e) => e.agentId))].sort((a, b) => (a === 'checker' ? 1 : b === 'checker' ? -1 : rec.bench.findIndex((x) => x.id === a) - rec.bench.findIndex((x) => x.id === b)))
  return (
    <div className="grid gap-3 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3">
      {ids.map((id) => {
        const mine = trace.filter((e) => e.agentId === id)
        const st = rec.agentStats?.[id]
        return (
          <section key={id} className="overflow-hidden rounded-xl border border-stone-200" aria-label={`${names.get(id) ?? '증거 검증관'} 작업 기록`}>
            <header className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-stone-100 bg-stone-50 px-3 py-2">
              <h4 className="text-[13.5px] font-black">{names.get(id) ?? '증거 검증관(코드)'}</h4>
              {id !== 'checker' ? <span className="rounded bg-stone-800 px-1 py-px text-[10px] font-black text-white">AI</span> : <span className="rounded bg-sky-700 px-1 py-px text-[10px] font-black text-white">코드</span>}
              {st ? <span className="ml-auto text-[11px] tabular-nums text-stone-500">호출 {st.calls} · 고침 <b className={st.revisions ? 'text-amber-700' : ''}>{st.revisions}</b> · 사람에게 넘김 <b className={st.escalated ? 'text-red-700' : ''}>{st.escalated}</b> · {st.seconds}초</span> : null}
            </header>
            <ol className="max-h-72 space-y-1 overflow-auto p-2.5">
              {mine.map((e) => {
                const k = KIND[e.kind]
                const tone = e.kind === 'escalate' ? 'bg-red-50 ring-1 ring-red-200' : e.kind === 'revise' ? 'bg-amber-50 ring-1 ring-amber-200' : ''
                return (
                  <li key={e.seq} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12.5px] leading-snug ${tone}`}>
                    <span className={`mt-px shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${k.chip}`}>{k.label}</span>
                    <span className="min-w-0 flex-1 text-stone-800">{e.text}</span>
                    <time className="shrink-0 text-[10px] tabular-nums text-stone-400" dateTime={e.at}>{clock(e.at)}</time>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
