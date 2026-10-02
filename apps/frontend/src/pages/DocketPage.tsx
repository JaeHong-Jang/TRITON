// 접수처 화면
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import type { CaseSummary } from '../api/types'
import { Badge, type Tone } from '../ui/Badge'
import { ErrorNote, Loading, PageTitle } from '../ui/Feedback'
import { leaningLabel } from '../ui/format'
import { PageShell } from '../console/parts'
import { Term } from '../ui/Forms'
import { INPUT, PRIMARY, SECONDARY } from '../ui/styles'
import { useAsync } from '../ui/useAsync'

const STAGES: Record<CaseSummary['progress']['stage'], { label: string; tone: Tone }> = {
  new: { label: '신규', tone: 'gray' },
  in_trial: { label: '재판 중', tone: 'amber' },
  appealed: { label: '항소 중', tone: 'amber' },
  final: { label: '확정', tone: 'green' },
}

// 사건 카드 하나
function CaseCard({ c, start }: { c: CaseSummary; start: boolean }) {
  const stage = STAGES[c.progress.stage]
  const s = c.docket.screening
  return (
    <li className={`flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm md:flex-row md:items-center ${start ? 'border-amber-500 ring-2 ring-amber-300' : 'border-stone-300'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {start ? <Badge tone="dark">★ 처음이라면 여기부터</Badge> : null}
          <Badge>{c.category} · {c.subcategory}</Badge>
          <Badge tone={c.docket.track === 'summary' ? 'green' : 'amber'} title={c.docket.track === 'summary' ? '서기가 확신해 AI가 가벼운 조치만 하는 사건' : '사람 판사가 재판으로 가려야 하는 사건'}>{c.docket.track === 'summary' ? '약식 처리' : '재판 회부'}</Badge>
          <Badge tone={stage.tone}>{stage.label}{c.progress.instance ? ` · ${c.progress.instance}심` : ''}</Badge>
          {c.progress.stage === 'final' ? <Badge tone={c.progress.finalVerdict === 'clickbait' ? 'pro' : 'con'}>{leaningLabel(c.progress.finalVerdict)} · {c.progress.action}</Badge> : null}
          {c.attack ? <Badge tone="red" title={`레드팀 실험용으로 일부러 비튼 기사입니다 · 원 사건 ${c.variantOf}`}>조작 실험 사건 · {c.attack === 'inject_command' ? '명령 주입' : '문장 이동'}</Badge> : null}
        </div>
        <h2 className="mt-1.5 text-base font-black leading-snug">{c.title}</h2>
        <p className="mt-1 text-sm text-stone-600">
          {c.docket.track === 'summary' ? '약식 사유' : '회부 사유'}: {c.docket.reasons.length ? c.docket.reasons.join(' · ') : '없음'}
        </p>
        {s ? <p className="mt-0.5 text-xs text-stone-600">AI 서기 확신도 {s.confidence}점 <span className="text-stone-600">(어느 쪽인지는 첫인상을 남긴 뒤 공개)</span></p> : null}
      </div>
      <div className="flex shrink-0 gap-2 md:flex-col">
        <Link to={`/court/${c.id}`} className={`${start ? PRIMARY : `${SECONDARY} border-2 border-stone-900`} text-center md:w-36`}>
          {c.progress.stage === 'final' ? '법정 다시 보기' : c.progress.stage === 'new' ? '재판 시작' : '재판 이어가기'}
        </Link>
        {c.progress.stage !== 'new' ? <Link to={`/records/${c.id}`} className={`${SECONDARY} text-center md:w-36`}>기록실</Link> : null}
      </div>
    </li>
  )
}

// 접수처 컴포넌트
export default function DocketPage() {
  const { data, error, loading, reload } = useAsync(() => api.cases(), [])
  const { data: policy } = useAsync(() => api.policy(), [])
  const [track, setTrack] = useState('')
  const [stage, setStage] = useState('')
  const [category, setCategory] = useState('')
  const [text, setText] = useState('')
  const categories = useMemo(() => [...new Set((data ?? []).map((c) => c.category))], [data])
  const list = (data ?? []).filter(
    (c) => (!track || c.docket.track === track) && (!stage || c.progress.stage === stage) && (!category || c.category === category) && (!text || `${c.id} ${c.title}`.includes(text)),
  )
  const summary = (data ?? []).filter((c) => c.docket.track === 'summary').length
  const startId = (data ?? []).find((c) => c.docket.track === 'trial' && c.progress.stage === 'new' && !c.variantOf)?.id
  return (
    <PageShell>
      <PageTitle title="사건 접수" sub="AI 서기가 사건을 먼저 분류합니다. 약식 처리 사건도 사람이 언제든 재판을 시작할 수 있습니다." />
      {data ? (
        <div className="mb-3 space-y-1.5 rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-700" aria-label="분류 안내">
          <p className="font-bold">전체 {data.length}건 · 약식 처리 {summary}건 · 재판 회부 {data.length - summary}건</p>
          <p><Badge tone="green">약식 처리</Badge> AI 서기가 확신({policy ? `${policy.summaryThreshold}점 이상` : '기준 점수 이상'})하고 {policy?.highRiskCategories.length ? `${policy.highRiskCategories.join('·')} 같은 ` : ''}고위험 분야가 아닌 사건. AI는 가벼운 조치(조치 없음·독자 안내)까지만 하고 무작위로 감사합니다. 원하면 <Term tip="약식 처리 사건도 사람이 언제든 재판을 시작할 수 있습니다.">재판을 시작</Term>할 수 있어요.</p>
          <p><Badge tone="amber">재판 회부</Badge> 서기가 덜 확신하거나 고위험 분야라서, 사람 판사가 변론을 듣고 판결해야 하는 사건.</p>
        </div>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="search" aria-label="사건 필터">
        <select aria-label="분류 필터" value={track} onChange={(e) => setTrack(e.target.value)} className={INPUT}>
          <option value="">분류 전체</option>
          <option value="summary">약식 처리</option>
          <option value="trial">재판 회부</option>
        </select>
        <select aria-label="단계 필터" value={stage} onChange={(e) => setStage(e.target.value)} className={INPUT}>
          <option value="">단계 전체</option>
          <option value="new">신규</option>
          <option value="in_trial">재판 중</option>
          <option value="appealed">항소 중</option>
          <option value="final">확정</option>
        </select>
        <select aria-label="분야 필터" value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
          <option value="">분야 전체</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input aria-label="사건 검색" placeholder="제목·번호 검색" value={text} onChange={(e) => setText(e.target.value)} className={INPUT} />
      </div>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {data && !list.length ? <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-600">조건에 맞는 사건이 없습니다. 필터를 바꿔 보세요.</p> : null}
      <ul className="space-y-3">{list.map((c) => <CaseCard key={c.id} c={c} start={c.id === startId} />)}</ul>
    </PageShell>
  )
}
