// 서버 상태와 전이 조건을 표시하는 재판 절차
import { useEffect, useRef, useState } from 'react'
import type { ExecutionView, TrialRecord, WorkflowDefinition } from '../../api/types'
import type { ControlGroup } from '../../lib/controlTypes'
import { stepStatusLabel } from '../../lib/execution'

const POINTS: Record<string, [number, number]> = { prepare: [12, 70], generate: [182, 16], first_impression: [182, 124], reveal: [352, 70], review: [522, 70], seat_verdict: [692, 70], final: [862, 16], appeal: [862, 124] }
const ACTORS = { code: '코드', llm: 'AI', human: '사람' }

// 절차 노드 사이의 허용 전이 경로
function edgePath(from: string, to: string): string {
  const a = POINTS[from], b = POINTS[to]
  if (!a || !b) return ''
  if (from === 'appeal') return `M ${a[0] + 72} ${a[1] + 78} V 222 H ${b[0] + 72} V ${b[1] + 78}`
  return `M ${a[0] + 144} ${a[1] + 39} C ${a[0] + 156} ${a[1] + 39}, ${b[0] - 12} ${b[1] + 39}, ${b[0]} ${b[1] + 39}`
}

// 실행 파이프라인과 선택 단계의 조건
export function ControlPipeline({ view, workflow, record, onFocus }: { view: ExecutionView; workflow: WorkflowDefinition | null; record: TrialRecord | null; onFocus: (group: ControlGroup | null) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [agentId, setAgentId] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let intersects = false
    const update = () => setVisible(intersects && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => { intersects = entry.isIntersecting; update() })
    if (panelRef.current) observer.observe(panelRef.current)
    document.addEventListener('visibilitychange', update)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [])
  const step = view.steps.find((s) => s.id === selected) ?? view.steps.find((s) => s.id === view.phase)
  const names = new Map(view.steps.map((s) => [s.id, s.label]))
  const agents = view.disclosure === 'open' ? view.agents : []
  const agent = agents.find((a) => a.agentId === agentId) ?? agents[0]
  const trace = view.disclosure === 'open' ? view.run?.events.length ? view.run.events : record?.trace ?? [] : []
  const visited = new Set(trace.filter((e) => (!view.run?.attempt || !e.attempt || e.attempt === view.run.attempt) && (e.agentId === agent?.agentId || e.subjectAgentId === agent?.agentId)).map((e) => e.nodeId ?? e.kind))
  const live = visible && view.run?.status === 'running' && agent?.status === 'running'
  // 사용자 선택에 대응하는 근거 군집
  function selectStep(id: string) {
    setSelected(id)
    onFocus(id === 'prepare' || id === 'first_impression' ? 'source' : ['review', 'seat_verdict', 'appeal', 'final'].includes(id) ? 'human' : null)
  }
  return (
    <section ref={panelRef} className="cr-panel cr-pipeline" aria-label="사건 실행 흐름">
      <header className="cr-section-head"><div><span className="cr-kicker">01 / EXECUTION</span><h3>재판 실행 흐름</h3></div><span className="cr-muted">실선 · 허용 전이　선택 · 조건 보기</span></header>
      <div className="cr-flow-scroll">
        <div className="cr-flow-board">
          <svg width="1020" height="234" aria-hidden className="cr-flow-lines">
            <defs><marker id="cr-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8Z" fill="currentColor" /></marker></defs>
            {view.edges.map((e) => <path key={`${e.from}-${e.to}`} d={edgePath(e.from, e.to)} className={step?.id === e.from ? 'selected' : ''} markerEnd="url(#cr-arrow)" />)}
          </svg>
          {view.steps.map((s, i) => <button key={s.id} type="button" className={`cr-step cr-step-${s.status} ${step?.id === s.id ? 'cr-step-selected' : ''}`} style={{ left: POINTS[s.id]?.[0] ?? i * 160, top: POINTS[s.id]?.[1] ?? 16 }} onClick={() => selectStep(s.id)} aria-pressed={step?.id === s.id}>
            <span className="cr-step-meta"><span>{String(i + 1).padStart(2, '0')} · {ACTORS[s.actor]}</span><span>{stepStatusLabel(s.status)}</span></span><strong>{s.label}</strong>
          </button>)}
        </div>
      </div>
      <div className="cr-flow-context"><p><b>{step?.label ?? '절차'}</b> · {step?.reason ?? view.reason}</p><p className="cr-muted">AI 준비와 첫인상 기록은 함께 진행할 수 있습니다. 두 조건이 충족되면 법정에서 변론 공개가 시작됩니다.</p>
        <div className="cr-conditions">{view.edges.filter((e) => e.from === step?.id || e.to === step?.id).map((e) => <span key={`${e.from}-${e.to}`}><b>{names.get(e.from)} → {names.get(e.to)}</b>{e.condition}</span>)}</div>
      </div>
      <details className="cr-internal"><summary>에이전트 내부 절차 <span>읽기 → 계획 → 도구 → 초안 → 검증 → 제출 / 수정 / 사람 검토</span></summary>
        {agents.length ? <div className="cr-agent-picker">{agents.map((a) => <button key={a.agentId} type="button" aria-pressed={agent?.agentId === a.agentId} onClick={() => { setAgentId(a.agentId); onFocus(record?.bench.find((b) => b.id === a.agentId)?.side === 'prosecution' ? 'prosecution' : record?.bench.find((b) => b.id === a.agentId)?.side === 'defense' ? 'defense' : null) }}>{a.label} · {a.nodeLabel}{a.revisions !== null ? ` · 수정 ${a.revisions}/${view.limits.maxRevisions}` : ''}</button>)}</div> : <p className="cr-muted">{view.disclosure === 'hidden' ? '첫인상 전에는 내부 작업 경로와 수정 횟수를 공개하지 않습니다.' : '기록된 에이전트 작업이 없습니다.'}</p>}
        <div className="cr-internal-nodes">{workflow?.nodes.map((n) => <button type="button" key={n.id} className={`${visited.has(n.id) ? 'visited' : ''} ${agent?.nodeId === n.id ? 'current' : ''} ${live && agent?.nodeId === n.id ? 'working' : ''}`} onClick={() => onFocus(n.id === 'check' ? 'checker' : n.id === 'escalate' ? 'human' : null)} title={workflow.edges.filter((e) => e.from === n.id).map((e) => `${e.condition} → ${e.to}`).join('\n')}><span>{ACTORS[n.actor]}</span><b>{n.label}</b></button>)}</div>
        <p className="cr-muted">{view.disclosure === 'hidden' ? '위 노드는 정적 절차 정의입니다.' : '테두리: 현재 노드 · 채워진 바탕: 기록에서 방문한 노드'} · 역할별 모델 호출 최대 {view.limits.maxCalls}회 · 수정 최대 {view.limits.maxRevisions}회 · 실행 최대 {view.limits.maxRunAttempts}회</p>
        <details><summary>모든 내부 분기 조건</summary><ul className="cr-transition-list">{workflow?.edges.map((e) => <li key={`${e.from}-${e.to}`}>{workflow.nodes.find((n) => n.id === e.from)?.label} → {workflow.nodes.find((n) => n.id === e.to)?.label} · {e.condition}</li>)}</ul></details>
        <p className="cr-muted">검사와 변호인은 별도 역할로 준비하며, 현재 로컬 모델 호출은 작업 큐에서 순서대로 실행됩니다.</p>
      </details>
    </section>
  )
}
