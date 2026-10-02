// 지금 일어나는 일 안내 배너와 에이전트 활동 목록
import './court.css'
import { Link } from 'react-router'
import type { AgentEvent } from '../../api/types'
import { EVENT_LABEL, visibleKind, visibleText } from '../../lib/activity'
import { Badge, type Tone } from '../../ui/Badge'
import { useOntology } from '../../ui/ontology'
import { narrate } from './narrate'
import { useCourt } from './store'
import { useCourtView } from './view'

const KIND_TONE: Record<AgentEvent['kind'], Tone> = { read: 'gray', plan: 'gray', tool: 'amber', draft: 'dark', check: 'green', revise: 'amber', submit: 'green', escalate: 'red', done: 'green', error: 'red' }

// 에이전트가 일하는 모습을 한 줄씩 보여 주는 목록
function ActivityFeed() {
  const v = useCourtView()
  if (!v || !v.writing) return null
  const names = new Map((v.rec?.bench ?? []).map((a) => [a.id, a.name]))
  const rows = v.events.filter((e) => e.kind !== 'done').slice(-5).reverse()
  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-white/80 p-2" aria-label="에이전트 활동">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-900">
        AI 에이전트 작업 중
        <span className="inline-flex gap-0.5" aria-hidden>{[0, 1, 2].map((k) => <span key={k} className="court-dot h-1.5 w-1.5 rounded-full bg-amber-600" />)}</span>
        {v.job && v.job.total ? <span className="ml-auto font-normal text-stone-600">주장 {v.job.done}/{v.job.total} 제출</span> : null}
      </p>
      {rows.length ? (
        <ul className="space-y-1">
          {rows.map((e, k) => (
            <li key={e.seq} className={`flex items-start gap-1.5 text-xs ${k === 0 ? 'font-semibold text-stone-900' : 'text-stone-600'}`}>
              <Badge tone={KIND_TONE[visibleKind(e, v.hidden)]}>{EVENT_LABEL[visibleKind(e, v.hidden)]}</Badge>
              <span className="min-w-0"><b>{e.agentId === 'checker' ? '증거 검증관' : names.get(e.agentId) ?? e.agentId}</b> · {visibleText(e, v.hidden)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-stone-600">작업을 시작하는 중입니다…</p>}
    </div>
  )
}

// 지금 일어나는 일 배너
export function NowBanner() {
  const v = useCourtView()
  const ont = useOntology((s) => s.ont)
  const started = useCourt((s) => s.started)
  if (!v) return null
  const n = narrate(v.state, v.records, ont, started)
  return (
    <section id="sec-now" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
      <div aria-live="polite">
        <p className="text-xs font-bold tracking-wide text-amber-900">지금 일어나는 일</p>
        <p className="mt-1 text-lg font-black leading-snug">{n.title}</p>
        <p className="mt-1 text-sm text-stone-700">{n.detail}</p>
      </div>
      <ActivityFeed />
      {v.state.final ? <Link to={`/records/${v.caseData.id}`} className="mt-3 inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-bold text-amber-200 hover:bg-stone-700">기록실에서 판결문 보기</Link> : null}
    </section>
  )
}
