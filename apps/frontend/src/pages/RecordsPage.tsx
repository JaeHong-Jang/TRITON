// 감사 장부 화면
import { Link, useParams } from 'react-router'
import { api } from '../api/client'
import type { Instance, LedgerEntry, Records, TrialRecord } from '../api/types'
import { BTN, PageFrame, PANEL } from '../console/parts'
import { AnswerCard } from '../features/court/AnswerCard'
import { ExecutionGraph } from '../features/execution/ExecutionGraph'
import { AgentLog } from '../features/ontology/AgentLog'
import { EvidenceGraph } from '../features/ontology/EvidenceGraph'
import { describeEntry, eventFromEntry } from '../lib/ledger'
import { replay, type Records as RecordMap, type TrialEvent, type TrialState } from '../lib/trial'
import { Badge, StatusBadge } from '../ui/Badge'
import { ErrorNote, Loading } from '../ui/Feedback'
import { fmtTime, leaningLabel } from '../ui/format'
import { actionLabel, claimLabel, needsHuman, specialtyLabel, useOntology } from '../ui/ontology'
import { useAsync } from '../ui/useAsync'

// 장부 카드 바탕
const CARD = `${PANEL} p-5`

// 사건 목록
function RecordsIndex() {
  const { data, error, loading, reload } = useAsync(() => api.cases(), [])
  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorNote message={error ?? '불러오지 못했습니다'} onRetry={reload} />
  const list = data.filter((c) => c.trials.length)
  return (
    <PageFrame title="감사 장부" sub="사건별 재판 기록과 판사 장부 · AI의 근거와 사람의 결정을 나중에 따져 봅니다">
      {list.length ? (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id}>
              <Link to={`/records/${c.id}`} className={`${PANEL} flex flex-wrap items-center gap-2 p-3.5 hover:bg-stone-50`}>
                <span className="text-xs font-bold text-stone-600">{c.id}</span>
                <span className="min-w-0 flex-1 basis-60 font-bold">{c.title}</span>
                <Badge tone={c.progress.stage === 'final' ? 'green' : 'amber'}>{c.progress.stage === 'final' ? `확정 · ${leaningLabel(c.progress.finalVerdict)}` : c.progress.stage === 'new' ? '신규' : '진행 중'}</Badge>
                <Badge>{c.trials.length}개 심급 기록</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-sm text-stone-600">아직 기록이 없습니다. 사건 접수에서 재판을 열어 보세요.</p>
      )}
    </PageFrame>
  )
}

// 심급 하나의 판결문 섹션
function InstanceSection({ rec, state, ledger, sentences }: { rec: TrialRecord; state: TrialState; ledger: LedgerEntry[]; sentences: Records['case']['sentences'] }) {
  const ont = useOntology((s) => s.ont)
  const { data: execution } = useAsync(() => api.execution(rec.caseId, rec.instance), [rec.caseId, rec.instance])
  const inst = state.instances[rec.instance]
  const rulings = ledger.filter((e) => !e.labSessionId && e.instance === rec.instance && e.type === 'evidence_ruling')
  const evidenceIds = new Set(rec.claims.flatMap((c) => c.evidence.map((e) => e.id)))
  const ruled = Object.entries(state.rulings).filter(([id]) => evidenceIds.has(id))
  return (
    <section className={`${CARD} space-y-3`} aria-label={`${rec.instance}심 판결문`} id={`inst-${rec.instance}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-black">{rec.instance}심 판결문</h2><Link className={BTN} to={`/agents?caseId=${encodeURIComponent(rec.caseId)}&instance=${rec.instance}`}>관제 그래프로 보기 ↗</Link></div>
      <p className="text-xs text-stone-600">
        재판부: {rec.bench.map((a) => `${a.name}${a.specialty ? `(${specialtyLabel(ont, a.specialty)})` : ''}`).join(', ')} · 모델 {rec.model.name}
      </p>
      {rec.officer ? <p className="rounded-md bg-emerald-50 p-2 text-sm"><b>재판연구관 보고</b> {rec.officer.summary} (권고 {rec.officer.recommendedAction})</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {(['pro', 'con'] as const).map((st) => (
          <div key={st} className="overflow-hidden rounded-xl border border-stone-200">
            <h3 className={`flex flex-wrap items-baseline gap-x-2 px-3 pt-3 text-sm font-black ${st === 'pro' ? 'text-pro' : 'text-con'}`}>
              {st === 'pro' ? '찬성 · 낚시성이다' : '반대 · 낚시성 아니다'}
              <span className="text-xs font-normal text-stone-600">주장 {rec.claims.filter((c) => c.stance === st).length}</span>
            </h3>
            <ul className="space-y-2.5 p-3 text-sm">
              {rec.claims.filter((c) => c.stance === st).map((c) => (
                <li key={c.id}>
                  <p><Badge tone={st}>{claimLabel(ont, c.type)}</Badge> <b>{rec.bench.find((a) => a.id === c.agentId)?.name}</b> {c.text}</p>
                  <ul className="mt-1 space-y-0.5 pl-3 text-xs text-stone-700">
                    {c.evidence.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-1">
                        {e.kind === 'absence' ? `부재 '${e.keyword}'` : `#${e.sentenceNo} “${e.quote}”`} <StatusBadge status={e.status} />
                        {state.rulings[e.id] ? <Badge tone={state.rulings[e.id] === 'admitted' ? 'green' : 'red'}>판사 {state.rulings[e.id] === 'admitted' ? '채택' : '기각'}</Badge> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-sm">판사 근거 결정: {ruled.length ? `채택 ${ruled.filter(([, r]) => r === 'admitted').length} · 기각 ${ruled.filter(([, r]) => r === 'struck').length}` : '없음'} <span className="text-xs text-stone-600">(결정 기록 {rulings.length}건)</span></p>
      <div id={`execution-${rec.instance}`} className="scroll-mt-4">
        <ExecutionGraph view={execution ?? null} title={`${rec.instance}심 실행 그래프`} mock={import.meta.env.VITE_MOCK === '1'} />
        {!rec.execution ? <p className="mt-2 rounded-lg bg-stone-100 p-2 text-xs text-stone-600">이전 형식의 기록이라 실행 그래프 스냅샷이 없습니다.</p> : null}
      </div>
      <div id={`graph-${rec.instance}`} className="scroll-mt-4">
        <h3 className="mb-2 text-sm font-black">근거 그래프 <span className="text-xs font-normal text-stone-500">누가 어떤 주장을 어떤 근거로 어느 문장에서 폈는지</span></h3>
        <EvidenceGraph rec={rec} sentences={sentences} />
      </div>
      <div id={`log-${rec.instance}`} className="scroll-mt-4">
        <h3 className="mb-2 text-sm font-black">에이전트 작업 기록 <span className="text-xs font-normal text-stone-500">{(rec.trace ?? []).length}건 · 고쳐 쓰기와 사람에게 넘긴 주장은 색으로 표시</span></h3>
        <AgentLog rec={rec} />
      </div>
      <div className="rounded-xl bg-stone-50 p-3 text-sm">
        <p className="font-bold">판결</p>
        {inst.seats.length ? (
          <ul>
            {inst.seats.map((s) => (
              <li key={s.seat}>판사석 {s.seat} · {s.judge}{s.soloMode ? ' (시연 모드: 독립성 미보장)' : ''}: {leaningLabel(s.verdict)} · 확신 {s.confidence} — {s.reason}</li>
            ))}
          </ul>
        ) : <p className="text-stone-600">판결 전입니다.</p>}
        {inst.appeal ? <p className="mt-1 text-amber-800">항소: {inst.appeal}</p> : null}
      </div>
    </section>
  )
}

// 장부 타임라인
function Timeline({ ledger }: { ledger: LedgerEntry[] }) {
  return (
    <section className={CARD} aria-label="장부 타임라인">
      <h2 className="mb-2 text-lg font-black">장부 타임라인 <span className="text-sm font-normal text-stone-600">{ledger.length}건</span></h2>
      {ledger.length ? (
        <ol className="space-y-1 border-l-2 border-stone-300 pl-3 text-sm">
          {ledger.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[1.1rem] top-1.5 h-2 w-2 rounded-full bg-stone-500" />
              <span className="text-xs text-stone-600">{fmtTime(e.at)} · {e.instance}심 · {e.judge.name}{e.judge.soloMode ? ' (시연 모드)' : ''}{e.labSessionId ? ` · 실험실 ${e.labSessionId}` : ''}</span>
              <p>{describeEntry(e)}</p>
              <p className="flex gap-1 text-[11px] text-stone-600">
                천칭 {e.context.scaleVisible ? '보임' : '가림'}{e.context.balance ? ` (${e.context.balance.pro}:${e.context.balance.con})` : ''} · AI 권고 {e.context.aiRecommendationShown ? '보임' : '가림'}
              </p>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-stone-600">기록이 없습니다.</p>}
    </section>
  )
}

// 해당 구역으로 부드럽게 이동
function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 사건 하나의 판결문과 장부
function CaseRecords({ caseId }: { caseId: string }) {
  const ont = useOntology((s) => s.ont)
  const { data, error, loading, reload } = useAsync<Records>(() => api.records(caseId), [caseId])
  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorNote message={error ?? '불러오지 못했습니다'} onRetry={reload} />
  const map: RecordMap = Object.fromEntries(data.trials.map((t) => [t.instance as Instance, t]))
  const events = data.ledger.map(eventFromEntry).filter((e): e is TrialEvent => e !== null)
  const state = replay(caseId, events, map)
  const f = state.final
  const last = data.trials[data.trials.length - 1]?.instance
  return (
    <PageFrame
      title={`판결문 · ${data.case.title}`}
      sub={`${data.case.id} · ${data.case.category} · ${data.case.subcategory}`}
      actions={<><Link to={`/court/${caseId}`} className={BTN}>법정에서 열기</Link><Link to="/records" className={BTN}>장부 목록</Link></>}
    >
      {data.trials.length ? (
        <div className="space-y-1.5">
          <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="바로가기">
            <span className="font-semibold text-stone-600">바로가기</span>
            {data.trials.length > 1 ? data.trials.map((t) => <button key={t.instance} type="button" className={BTN} onClick={() => jump(`inst-${t.instance}`)}>{t.instance}심 판결문</button>) : null}
            <button type="button" className={BTN} onClick={() => jump(`graph-${last}`)}>근거 그래프 보기</button>
            <button type="button" className={BTN} onClick={() => jump(`execution-${last}`)}>실행 그래프 보기</button>
            <button type="button" className={BTN} onClick={() => jump(`log-${last}`)}>에이전트 작업 기록</button>
            <button type="button" className={BTN} onClick={() => document.querySelector('[aria-label="장부 타임라인"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>장부</button>
          </nav>
          <p className="text-[12.5px] text-stone-600">근거 그래프는 어느 AI가 어떤 주장을 어떤 근거로, 기사의 어느 문장에서 폈는지를 왼쪽에서 오른쪽으로 이어서 보여 줍니다.</p>
        </div>
      ) : null}
      {f ? (
        <section className={`space-y-2 rounded-2xl border p-5 ${f.verdict === 'clickbait' ? 'border-pro/30 bg-pro-soft/60' : 'border-con/30 bg-con-soft/60'}`} aria-label="최종 판결">
          <p className="text-xs font-bold text-stone-600">최종 판결</p>
          <p className={`text-xl font-black ${f.verdict === 'clickbait' ? 'text-pro' : 'text-con'}`}>{f.verdict === 'clickbait' ? '유죄 · 낚시성 기사' : '무죄 · 낚시성 아님'}</p>
          <p className="text-sm">표결 {f.votes.map((v) => `${v.seat}석 ${leaningLabel(v.verdict)}`).join(' · ')} · 조치 {f.action} ({actionLabel(ont, f.action)}) <Badge tone={needsHuman(ont, f.action) ? 'amber' : 'gray'}>{needsHuman(ont, f.action) ? '사람 승인 기록' : '판사 기록/안내'}</Badge></p>
          <p className="text-sm text-stone-700">사유: {f.reason}</p>
          <AnswerCard caseId={caseId} verdict={f.verdict} noGroundTruth={data.case.origin === 'manual'} />
        </section>
      ) : <p className="rounded-lg bg-amber-50 p-3 text-sm">아직 최종 판결이 없습니다. 정답은 최종 판결 이후에만 공개됩니다.</p>}
      {data.trials.map((t) => <InstanceSection key={t.instance} rec={t} state={state} ledger={data.ledger} sentences={data.case.sentences} />)}
      <Timeline ledger={data.ledger} />
    </PageFrame>
  )
}

// 기록실 컴포넌트
export default function RecordsPage() {
  const { caseId } = useParams()
  return caseId ? <CaseRecords caseId={caseId} /> : <RecordsIndex />
}
