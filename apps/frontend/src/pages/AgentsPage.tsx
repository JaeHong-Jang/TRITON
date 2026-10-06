// 실행과 근거를 연결하는 그래프 관제 작업실
import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api/client'
import type { CaseSummary, Instance, Ontology, WorkflowDefinition } from '../api/types'
import { usePoll } from '../console/usePoll'
import { ControlDetails } from '../features/control/ControlDetails'
import { ControlEvidence } from '../features/control/ControlEvidence'
import { ControlLog } from '../features/control/ControlLog'
import { ControlPipeline } from '../features/control/ControlPipeline'
import { GraphCanvas } from '../features/control/GraphCanvas'
import { useControlSnapshot } from '../features/control/useControlSnapshot'
import { buildControlGraph } from '../lib/controlGraph'
import { controlRecord } from '../lib/controlSnapshot'
import type { ControlGroup, GraphMode } from '../lib/controlTypes'
import { runStatusLabel } from '../lib/execution'
import { ErrorNote, Loading } from '../ui/Feedback'
import { useAsync } from '../ui/useAsync'
import '../features/control/control-room.css'

const MOCK = import.meta.env.VITE_MOCK === '1'
const MODES: { id: GraphMode; label: string; help: string }[] = [
  { id: 'evidence', label: '근거 그래프', help: '주장 → 제출 근거 → 원문 대조 → 사람의 검토' },
  { id: 'ontology', label: '온톨로지', help: '주장 유형과 허용되는 근거·검증 규칙의 정적 정의' },
  { id: 'connected', label: '연결 보기', help: '실제 제출된 주장·근거와 적용되는 개념·규칙의 연결' },
]

// 사건과 심급별로 독립된 관제 화면
function CaseControl({ chosen, instance, ontology, workflow, mode, setMode, setInstance }: { chosen: CaseSummary; instance: Instance; ontology: Ontology | null; workflow: WorkflowDefinition | null; mode: GraphMode; setMode: (v: GraphMode) => void; setInstance: (v: Instance) => void }) {
  const { data, error, refreshing, refresh } = useControlSnapshot(chosen.id, instance)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [focusGroup, setFocusGroup] = useState<ControlGroup | null>(null)
  const [busy, setBusy] = useState(false)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [logClaimId, setLogClaimId] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<HTMLElement>(null)
  const lock = useRef(false)
  const record = data ? controlRecord(chosen.id, instance, data.view, data.records) : null
  const hidden = data?.view.disclosure !== 'open'
  const ledger = useMemo(() => data?.records.ledger.filter((e) => e.caseId === chosen.id && e.instance === instance && !e.labSessionId) ?? [], [data, chosen.id, instance])
  const graph = useMemo(() => buildControlGraph({ article: data?.records.case ?? null, record, ledger, ontology, disclosure: hidden ? 'hidden' : 'open', mode, instance }), [data?.records.case, record, ledger, ontology, hidden, mode, instance])
  // 그래프 선택의 통일
  function select(id: string | null) { setSelectedId(id); setSelectedEdgeId(null); setFocusGroup(null) }
  // 선택 근거에서 그래프 상세로 이동
  function inspect(id: string) { setMode('evidence'); select(id); graphRef.current?.scrollIntoView({ block: 'start' }) }
  // 선택 주장에 연결된 실제 로그로 이동
  function showLog(claimId: string) { setLogClaimId(claimId); logRef.current?.scrollIntoView({ block: 'start' }) }
  // 실행 API의 중복 전송 방지
  async function command(action: 'start' | 'retry' | 'cancel') {
    if (!data?.view.controls?.[action].allowed || lock.current || error || refreshing) return
    lock.current = true
    setBusy(true)
    setCommandError(null)
    setNotice(null)
    try {
      if (action === 'start') await api.createTrial(chosen.id, instance)
      else if (data.view.run && action === 'retry') await api.retryJob(data.view.run.id)
      else if (data.view.run) await api.cancelJob(data.view.run.id)
      setNotice(action === 'cancel' ? '취소 요청을 처리했습니다. 이미 진행 중인 모델 호출의 늦은 결과는 반영되지 않습니다.' : '요청을 접수했습니다. 서버의 실행 상태를 확인합니다.')
    } catch (e) {
      setCommandError(e instanceof Error ? e.message : '실행 요청에 실패했습니다.')
    } finally { lock.current = false; setBusy(false); refresh() }
  }
  if (!data) return error ? <ErrorNote message={error} onRetry={refresh} /> : <Loading />
  const { view, health, at } = data
  const canModel = MOCK ? chosen.origin !== 'manual' : health?.ollama === true
  const modelReason = MOCK && chosen.origin === 'manual' ? '직접 등록한 기사는 실제 모델 연결이 필요합니다.' : !health ? '모델 연결 상태를 확인할 수 없습니다.' : !health.ollama && !MOCK ? 'Ollama 모델 연결이 필요합니다.' : ''
  const run = view.run
  const source = MOCK ? '모의 시연' : view.mode === 'replay' ? '저장된 기록' : view.mode === 'live' ? '실제 실행 기록' : '실행 전'
  return <>
    <section className="cr-panel cr-command" aria-label="선택 사건 실행 제어">
      <div className="cr-command-title"><div className="cr-tags"><span className={`cr-tag ${MOCK ? 'cr-tag-warn' : ''}`}>{source}</span><span className="cr-tag">{instance}심</span><span className="cr-tag">{run ? runStatusLabel(run.status) : view.mode === 'replay' ? '기록 조회' : '시작 대기'}</span><span className="cr-tag">{hidden ? 'AI 의견 비공개' : 'AI 의견 공개'}</span></div><h3>{data.records.case.title}</h3><p className="cr-mono cr-muted">{chosen.id}</p></div>
      <div className="cr-command-actions">
        <label className="cr-field">심급<select aria-label="심급 선택" value={instance} onChange={(e) => setInstance(Number(e.target.value) as Instance)}>{([1, 2, 3] as Instance[]).map((n) => <option key={n} value={n} disabled={!view.availableInstances?.includes(n) && n !== instance}>{n}심{!view.availableInstances?.includes(n) && n !== instance ? ' · 항소 후 열림' : ''}</option>)}</select></label>
        <div className="cr-action-buttons">{(['start', 'retry', 'cancel'] as const).map((action) => {
          const control = view.controls?.[action]
          const blocked = busy || refreshing || !!error || !control?.allowed || (action !== 'cancel' && !canModel)
          const reason = error ? '서버 연결을 복구한 후 사용할 수 있습니다.' : refreshing ? '최신 상태 확인 중' : !control?.allowed ? control?.reason ?? '서버 제어 정보를 기다립니다.' : action !== 'cancel' && !canModel ? modelReason : control.reason
          return <button key={action} type="button" className={action === 'start' ? 'cr-button cr-primary' : 'cr-button'} disabled={blocked} title={reason} onClick={() => void command(action)}>{action === 'start' ? '▶ 실행 시작' : action === 'retry' ? run?.status === 'interrupted' ? '중단된 실행 재시도' : '↻ 재시도' : '실행 취소'}</button>
        })}</div>
        <Link className="cr-button cr-court-link" to={`/court/${chosen.id}`}>{hidden ? '첫인상 기록하러 가기' : '사람 판결하러 가기'} ↗</Link>
      </div>
      <div className="cr-runtime"><span className={error ? 'cr-danger' : ''}>{error ? '연결 끊김 · 마지막 조회 상태' : refreshing ? '상태 갱신 중' : '서버 상태 수신'}</span><span>{MOCK ? '시연 데이터 · 실제 모델 호출 없음' : health ? `${health.model} · ${health.ollama ? '연결됨' : '연결 안 됨'}` : '모델 연결 확인 불가'}</span><time dateTime={at}>조회 {new Date(at).toLocaleTimeString('ko-KR')}</time>{run ? <span className="cr-mono">{run.id} · attempt {run.attempt ?? '—'} / graph {run.graphVersion ?? '이전 형식'}</span> : null}<button type="button" disabled={refreshing || busy} onClick={refresh}>새로고침</button></div>
      {error ? <p role="alert" className="cr-alert">{error} · 이전 상태를 유지하고 있습니다. 연결이 복구될 때까지 실행 제어가 잠깁니다.</p> : null}
      {modelReason ? <p className="cr-notice">{modelReason} 저장된 공개 기록과 절차는 확인할 수 있습니다.</p> : null}
      {commandError ? <p role="alert" className="cr-alert">{commandError}</p> : null}
      {notice ? <p role="status" className="cr-notice">{notice}</p> : null}
      {record ? <p className="cr-muted">기록된 모델 호출 {record.calls.length}회 · 모델 소요 {record.calls.reduce((total, call) => total + call.seconds, 0).toFixed(1)}초{view.mode === 'replay' ? ' · 저장 기록 조회 (시간순 재생 아님)' : ''}</p> : null}
      {run?.error ? <p className="cr-alert">{hidden ? '준비 작업에 오류가 발생했습니다.' : run.error}</p> : null}
      {!view.controls?.start.allowed && !run ? <p className="cr-muted">{view.controls?.start.reason}</p> : null}
      {run && ['error', 'interrupted', 'cancelled'].includes(run.status) ? <p className="cr-muted">{view.controls?.retry.reason} 재시도는 같은 사건의 보존된 원문과 버전을 사용합니다.</p> : null}
    </section>
    <ControlPipeline view={view} workflow={workflow} record={record} onFocus={setFocusGroup} />
    <section ref={graphRef} className="cr-graph-section" aria-label="근거와 온톨로지 관제">
      <header className="cr-section-head"><div><span className="cr-kicker">02 / KNOWLEDGE</span><h3>근거와 규칙의 연결</h3></div><div className="cr-tabs" aria-label="그래프 보기">{MODES.map((m) => <button type="button" key={m.id} aria-pressed={mode === m.id} onClick={() => { setMode(m.id); setFocusGroup(null) }}>{m.label}</button>)}</div></header>
      <p className="cr-graph-explain">{MODES.find((m) => m.id === mode)?.help} <span>· 원문 대조 결과와 주장의 타당성, 사람의 판결은 각각 구분됩니다.</span></p>
      {hidden ? <div className="cr-disclosure"><b>첫인상을 먼저 기록해 주세요.</b> 공개 기사와 정적 규칙만 표시합니다. AI 주장·근거·검증 결과·관련 집계는 첫인상 이후 공개됩니다.</div> : null}
      {graph.notice ? <p className="cr-notice">{graph.notice}</p> : null}
      <div className="cr-workspace"><GraphCanvas key={mode} graph={graph} selectedId={selectedId} selectedEdgeId={selectedEdgeId} onSelect={select} onSelectEdge={(id) => { setSelectedEdgeId(id); if (id) setSelectedId(null) }} focusGroup={focusGroup} /><ControlDetails graph={graph} selectedId={selectedId} selectedEdgeId={selectedEdgeId} article={data.records.case} record={record} caseId={chosen.id} instance={instance} onSelect={select} onShowLog={showLog} /></div>
    </section>
    <div className="cr-bottom" ref={logRef}><ControlEvidence record={record} ledger={ledger} hidden={hidden} instance={instance} onSelect={inspect} selectedId={selectedId} /><ControlLog record={record} run={run} ledger={ledger} hidden={hidden} instance={instance} onSelect={inspect} claimId={logClaimId} onClearClaim={() => setLogClaimId(null)} /></div>
    <footer className="cr-footer"><span>TRITON · {instance}심 · ontology {record?.ontologyVersion ?? ontology?.version ?? '—'} · workflow {view.version}</span><Link to={`/records/${chosen.id}`}>감사 장부 전체 보기 ↗</Link><span>최종 판결은 사람이 내립니다.</span></footer>
  </>
}

// 사건 선택과 관제 화면 진입
export default function AgentsPage() {
  const [params, setParams] = useSearchParams()
  const { data: cases, error: casesError } = usePoll(() => api.cases(), 5000)
  const { data: definitions, error: definitionError, reload } = useAsync(() => Promise.all([api.ontology(), api.workflow()]), [])
  const caseId = params.get('caseId') ?? cases?.[0]?.id ?? ''
  const chosen = cases?.find((c) => c.id === caseId)
  const instanceParam = Number(params.get('instance'))
  const instance = ([1, 2, 3].includes(instanceParam) ? instanceParam : Math.max(1, chosen?.progress.instance ?? 0, ...(chosen?.trials ?? []))) as Instance
  const mode = MODES.find((m) => m.id === params.get('view'))?.id ?? 'evidence'
  // URL에 저장하는 화면 선택
  function update(values: Record<string, string>) { setParams((old) => { const next = new URLSearchParams(old); for (const [k, v] of Object.entries(values)) next.set(k, v); return next }, { replace: true }) }
  return <div className="cr-page">
    <header className="cr-page-head"><div><span className="cr-kicker">TRITON / CONTROL ROOM</span><h2>그래프 관제 작업실</h2><p>실행의 흐름을 따라, 판단의 근거까지.</p></div><div className="cr-case-select"><label htmlFor="cr-case">살펴볼 사건</label><select id="cr-case" value={caseId} onChange={(e) => update({ caseId: e.target.value, instance: String(Math.max(1, cases?.find((c) => c.id === e.target.value)?.progress.instance ?? 0, ...(cases?.find((c) => c.id === e.target.value)?.trials ?? []))) })}>{!chosen && caseId ? <option value={caseId}>사건을 찾을 수 없음</option> : null}{cases?.map((c) => <option value={c.id} key={c.id}>{c.title}</option>)}</select></div></header>
    {casesError ? <p className="cr-alert" role="alert">사건 목록을 갱신하지 못했습니다. {casesError}</p> : null}
    {definitionError ? <div className="cr-alert">규칙 정의를 불러오지 못했습니다. {definitionError} <button type="button" onClick={reload}>다시 불러오기</button></div> : null}
    {!cases ? !casesError ? <Loading /> : null : !cases.length ? <div className="cr-panel cr-empty"><h3>아직 등록된 사건이 없습니다.</h3><p>기사를 등록하면 실행 상태와 근거 관계를 여기에서 확인할 수 있습니다.</p><Link className="cr-button cr-primary" to="/cases">기사 등록하러 가기</Link></div> : !chosen ? <p className="cr-alert">선택한 사건을 찾지 못했습니다. 위 목록에서 사건을 선택해 주세요.</p> : <CaseControl key={`${caseId}:${instance}`} chosen={chosen} instance={instance} ontology={definitions?.[0] ?? null} workflow={definitions?.[1] ?? null} mode={mode} setMode={(v) => update({ view: v })} setInstance={(v) => update({ caseId, instance: String(v) })} />}
  </div>
}
