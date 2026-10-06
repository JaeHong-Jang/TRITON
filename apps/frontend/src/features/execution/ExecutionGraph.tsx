// 실행 그래프 패널
import type { AgentEvent, ExecutionView, JobInfo, WorkflowDefinition } from '../../api/types'
import { canCancelJob, canRetryJob, executionModeLabel, jobAttemptLabel, runStatusLabel, sourceLabel, stepStatusLabel } from '../../lib/execution'
import { Badge, type Tone } from '../../ui/Badge'
import { SECONDARY } from '../../ui/styles'

const ACTOR_TONE: Record<WorkflowDefinition['nodes'][number]['actor'], Tone> = { code: 'green', llm: 'amber', human: 'dark' }
const STEP_RING: Record<string, string> = {
  pending: 'border-stone-200 bg-white',
  active: 'border-amber-500 bg-amber-50 shadow',
  complete: 'border-emerald-500 bg-emerald-50',
  blocked: 'border-stone-400 bg-stone-100',
  error: 'border-red-500 bg-red-50',
}


// 에이전트 상태 표시 톤
function agentTone(status: ExecutionView['agents'][number]['status']): Tone {
  if (status === 'error') return 'red'
  if (status === 'running') return 'amber'
  if (status === 'complete') return 'green'
  if (status === 'review') return 'red'
  return 'gray'
}

// 실행 이벤트 한 줄
function EventLine({ e }: { e: AgentEvent }) {
  return (
    <li className="rounded-md bg-white px-2 py-1">
      <span className="font-mono text-[10px] font-black text-stone-500">#{e.seq}</span>{' '}
      <span className="font-bold">{e.agentId}</span>{' · '}{e.text}
      {e.fromNode || e.nodeId ? <span className="text-stone-500"> · {e.fromNode ? `${e.fromNode} → ` : ''}{e.nodeId}</span> : null}
      {e.reason ? <span className="text-stone-500"> · {e.reason}</span> : null}
      {e.at ? <span className="ml-1 text-[10px] text-stone-400">{new Date(e.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> : null}
    </li>
  )
}

// 작업 제어 버튼 묶음
function JobControls({ job, busy, onRetry, onCancel }: { job: JobInfo | null; busy?: boolean; onRetry?: () => void; onCancel?: () => void }) {
  if (!job || (!onRetry && !onCancel)) return null
  return (
    <div className="flex flex-wrap gap-2">
      {onRetry ? <button type="button" className={SECONDARY} disabled={!canRetryJob(job) || busy} onClick={onRetry}>재시도</button> : null}
      {onCancel ? <button type="button" className={SECONDARY} disabled={!canCancelJob(job) || busy} onClick={onCancel}>취소</button> : null}
    </div>
  )
}

// 실행 그래프 보기
export function ExecutionGraph({ view, workflow, mock = false, title = '실행 그래프', compact = false, busy = false, onRetry, onCancel }: { view: ExecutionView | null; workflow?: WorkflowDefinition | null; mock?: boolean; title?: string; compact?: boolean; busy?: boolean; onRetry?: () => void; onCancel?: () => void }) {
  const nodes = view?.steps ?? workflow?.nodes.map((n) => ({ ...n, status: 'pending' as const, reason: '정적 절차 정의' })) ?? []
  const edges = view?.edges ?? workflow?.edges ?? []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const run = view?.run ?? null
  const summary = view ? executionModeLabel(view, mock) : workflow ? '정적 실행 그래프 · 실제 사건 상태와 분리된 절차 정의입니다.' : executionModeLabel(null, mock)
  const current = (view?.phase ? nodes.find((n) => n.id === view.phase) : undefined) ?? nodes.find((n) => n.status === 'active')
  const currentAgents = view?.agents.filter((a) => a.nodeId === view.phase || a.status === 'running' || a.status === 'error' || a.status === 'review') ?? []
  const events = run?.events ?? []
  const agentsBlock = view?.agents.length ? (
    <div className="mt-3 rounded-lg bg-stone-50 p-3">
      <p className="mb-2 text-xs font-black text-stone-600">에이전트 상태</p>
      <ul className="grid gap-1.5 text-xs min-[720px]:grid-cols-2">
        {view.agents.map((a) => (
          <li key={a.agentId} className="rounded-md bg-white p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <b>{a.label}</b>
              <Badge tone={agentTone(a.status)}>{a.status === 'running' ? '작업 중' : a.status === 'complete' ? '완료' : a.status === 'review' ? '검토 필요' : a.status === 'error' ? '오류' : '대기'}</Badge>
              {a.revisions !== null ? <span className="text-stone-500">고침 {a.revisions}</span> : null}
            </div>
            <p className="mt-1 text-stone-600">{a.nodeLabel} <span className="font-mono text-[10px]">({a.nodeId})</span></p>
          </li>
        ))}
      </ul>
    </div>
  ) : null
  const eventsBlock = events.length ? (
    <div className="mt-3 rounded-lg bg-stone-50 p-3">
      <p className="mb-2 text-xs font-black text-stone-600">실행 이력 · {jobAttemptLabel(run)}</p>
      <ol className="space-y-1 text-xs text-stone-700">{events.map((e) => <EventLine key={`${e.seq}-${e.at}`} e={e} />)}</ol>
    </div>
  ) : null
  const flow = (
    <>
      {nodes.length ? (
        <ol className="mt-3 grid gap-2 min-[820px]:grid-cols-2">
          {nodes.map((n) => (
            <li key={n.id} className={`rounded-xl border-2 p-3 ${STEP_RING[n.status] ?? STEP_RING.pending}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-black text-stone-500">{n.id}</span>
                <Badge tone={ACTOR_TONE[n.actor]}>{n.actor === 'llm' ? 'AI' : n.actor === 'human' ? '사람' : '코드'}</Badge>
                <Badge tone={n.status === 'error' ? 'red' : n.status === 'complete' ? 'green' : n.status === 'active' ? 'amber' : 'gray'}>{stepStatusLabel(n.status)}</Badge>
              </div>
              <p className="mt-1 text-sm font-black">{n.label}</p>
              <p className="mt-1 text-xs leading-snug text-stone-600">{n.reason}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-stone-300 p-3 text-sm text-stone-600">이 기록에는 실행 그래프가 없습니다.</p>
      )}
      {agentsBlock}
      {eventsBlock}
      {edges.length ? (
        <div className="mt-3 rounded-lg bg-stone-50 p-3">
          <p className="mb-2 text-xs font-black text-stone-600">허용 전이</p>
          <ul className="grid gap-1 text-xs text-stone-700 min-[720px]:grid-cols-2">
            {edges.map((e) => (
              <li key={`${e.from}-${e.to}-${e.condition}`} className="flex gap-1.5">
                <span className="font-mono font-bold">{byId.get(e.from)?.label ?? e.from}</span>
                <span aria-hidden>→</span>
                <span className="font-mono font-bold">{byId.get(e.to)?.label ?? e.to}</span>
                <span className="text-stone-500">({e.condition})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
  return (
    <section className="rounded-xl border border-stone-300 bg-white p-4 shadow-sm" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-stone-700">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">{summary}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-500">절차 검증은 코드가 맡고, 최종 판결은 사람 판사가 기록합니다. 근거 그래프와 달리 이 그래프는 실제 실행 전이만 보여 줍니다.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={mock ? 'amber' : run?.status === 'done' ? 'green' : run?.status === 'error' || run?.status === 'interrupted' || run?.status === 'cancelled' ? 'red' : 'gray'}>
            {mock ? 'MOCK' : sourceLabel(view, false)}
          </Badge>
          {run ? <Badge tone="gray">{runStatusLabel(run.status)} · {jobAttemptLabel(run)}</Badge> : null}
          <JobControls job={run} busy={busy} onRetry={onRetry} onCancel={onCancel} />
        </div>
      </div>
      {run?.error ? <p role="alert" className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{run.error}</p> : null}
      {view?.phase ? <p className="mt-3 rounded-lg bg-stone-50 p-2 text-sm"><b>현재 상태</b> {current?.label ?? view.phase} · {view.reason}</p> : null}
      {compact && currentAgents.length ? (
        <div className="mt-2 rounded-lg bg-stone-50 p-2 text-xs text-stone-700">
          <b className="text-stone-800">현재 역할</b>{' '}
          {currentAgents.map((a) => `${a.label} · ${a.nodeLabel}${a.status === 'error' ? ' · 오류' : a.status === 'review' ? ' · 검토 필요' : a.status === 'running' ? ' · 작업 중' : ''}`).join(' / ')}
        </div>
      ) : null}
      {compact ? (
        <details className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-bold text-stone-700">실행 흐름 자세히</summary>
          {flow}
        </details>
      ) : flow}
    </section>
  )
}
