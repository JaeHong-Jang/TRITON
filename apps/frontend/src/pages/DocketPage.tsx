// 접수처 화면
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import type { Case, CaseSummary } from '../api/types'
import { Badge, type Tone } from '../ui/Badge'
import { ErrorNote, Loading, PageTitle } from '../ui/Feedback'
import { actionLabel } from '../lib/names'
import { starterCaseId } from '../lib/starter'
import { leaningLabel } from '../ui/format'
import { PageShell } from '../console/parts'
import { Term } from '../ui/Forms'
import { INPUT, PRIMARY, SECONDARY } from '../ui/styles'
import { useAsync } from '../ui/useAsync'

const STAGES: Record<CaseSummary['progress']['stage'], { label: string; tone: Tone }> = {
  new: { label: '신규', tone: 'gray' },
  in_trial: { label: '재판 중', tone: 'amber' },
  appealed: { label: '항소 중', tone: 'amber' },
  final: { label: '판결 완료', tone: 'green' },
}

// 등록 요청 번호 생성
function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const hex = `${Date.now().toString(16).padStart(12, '0')}${Math.random().toString(16).slice(2).padEnd(20, '0')}`.slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

// 등록 본문 식별값
function contentSig(title: string, body: string, category: string) {
  return JSON.stringify({ title: title.trim(), body: body.replace(/\r\n?/g, '\n'), category: category.trim() })
}

// 직접 등록 폼
function RegistrationPanel({ onCreated }: { onCreated: (c: Case) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('')
  const [requestId, setRequestId] = useState(newRequestId)
  const [requestSig, setRequestSig] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Case | null>(null)
  const lines = body.replace(/\r\n?/g, '\n').split('\n').map((x) => x.trim()).filter(Boolean)
  const why =
    !title.trim() ? '제목을 입력하세요'
      : !lines.length ? '본문을 한 줄 이상 입력하세요'
        : title.trim().length > 300 ? '제목은 300자까지 입력할 수 있습니다'
          : body.length > 20000 ? '본문은 20,000자까지 입력할 수 있습니다'
            : lines.length > 300 ? '본문은 빈 줄을 제외하고 300줄까지 등록할 수 있습니다'
              : category.trim().length > 40 ? '분야는 40자까지 입력할 수 있습니다'
                : null
  const submit = async () => {
    if (busyRef.current || why) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    const sig = contentSig(title, body, category)
    const id = sig === requestSig ? requestId : newRequestId()
    try {
      const payload = category.trim() ? { requestId: id, title, body, category: category.trim() } : { requestId: id, title, body }
      const saved = await api.createCase(payload)
      setRequestId(newRequestId())
      setRequestSig('')
      setTitle('')
      setBody('')
      setCategory('')
      setCreated(saved)
      onCreated(saved)
      setOpen(false)
    } catch (e) {
      setRequestId(id)
      setRequestSig(sig)
      setError(e instanceof Error ? e.message : '기사 등록에 실패했습니다')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return (
    <section className="tribunal-registration" aria-label="새 기사 등록">
      <div className="tribunal-registration-head flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="tribunal-eyebrow mb-2">사건 접수처</p>
          <h2 className="tribunal-registration-title">검토할 기사를 법정에 올려보세요.</h2>
          <p className="mt-1 text-sm text-stone-600">기사 제목과 본문을 등록하면 나만의 재판을 시작할 수 있습니다.</p>
        </div>
        <button type="button" className={`${open || created ? SECONDARY : PRIMARY} sm:w-auto sm:min-w-36`} disabled={busy} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? '등록 닫기' : created ? '다른 기사 등록' : '새 기사 등록'}
        </button>
      </div>
      {created ? (
        <div className="m-5 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          <span className="font-bold">등록 완료: {created.title}</span>
          <Link to={`/court/${created.id}`} className={`${PRIMARY} sm:w-auto`}>법정으로 이동</Link>
        </div>
      ) : null}
      {open ? (
        <div className="grid gap-4 p-5 sm:p-7">
          <label className="block text-sm font-bold">
            기사 제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} maxLength={300} className={`${INPUT} mt-1`} placeholder="예: AI가 쓴 기사 제목" />
          </label>
          <label className="block text-sm font-bold">
            본문
            <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} maxLength={20000} className={`${INPUT} mt-1 min-h-44 resize-y leading-relaxed`} placeholder={`원문을 붙여넣으세요.\n줄마다 근거 번호가 붙습니다.`} />
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-sm font-bold">
              분야 <span className="text-xs font-normal text-stone-500">선택</span>
              <input value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy} maxLength={40} className={`${INPUT} mt-1`} placeholder="직접 등록" />
            </label>
            <button type="button" className={PRIMARY} disabled={!!why || busy} onClick={submit}>{busy ? '등록 중…' : '기사 등록'}</button>
          </div>
          <p className="text-xs text-stone-600">현재 근거 줄 {lines.length}/300 · AI 변론을 시작하려면 법정에서 재판 시작을 누르고 Ollama 모델 연결이 필요합니다.</p>
          {why ? <p className="text-sm font-bold text-amber-800">{why}</p> : null}
          {error ? <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

// 사건 카드 하나
function CaseCard({ c, start, showTrack }: { c: CaseSummary; start: boolean; showTrack: boolean }) {
  const stage = STAGES[c.progress.stage]
  const s = c.docket.screening
  return (
    <li className={`tribunal-case-card flex flex-col gap-4 rounded-lg border bg-white p-5 md:flex-row md:items-center ${start ? 'border-brass-500 ring-1 ring-brass-200' : 'border-stone-200'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {start ? <Badge tone="dark">★ 처음이라면 여기부터</Badge> : null}
          {c.origin === 'manual' ? <Badge tone="green">직접 등록</Badge> : null}
          <Badge>{c.category} · {c.subcategory}</Badge>
          {c.docket.screening && c.docket.track === 'summary' ? <Badge tone="green" title="약식 권고: AI 서기가 간단 처리를 권한 사건 (최종 판단은 사람)">서기: 간단 처리 권고</Badge> : null}
          {c.docket.screening && c.docket.track === 'trial' && showTrack ? <Badge tone="amber" title="재판 회부: 사람 판사가 변론을 듣고 판결해야 하는 사건">재판 진행</Badge> : null}
          <Badge tone={stage.tone}>{stage.label}{c.progress.instance ? ` · ${c.progress.instance}심` : ''}</Badge>
          {c.progress.stage === 'final' ? <Badge title={`판결과 함께 정해진 조치 단계${c.progress.action ? ` (코드 ${c.progress.action})` : ''}`} tone={c.progress.finalVerdict === 'clickbait' ? 'pro' : 'con'}>{leaningLabel(c.progress.finalVerdict)}{c.progress.action ? ` · ${actionLabel(c.progress.action)}` : ''}</Badge> : null}
          {c.attack ? <Badge tone="red" title={`레드팀 실험용으로 일부러 비튼 기사입니다 · 원 사건 ${c.variantOf}`}>조작 실험 사건 · {c.attack === 'inject_command' ? '명령 주입' : '문장 이동'}</Badge> : null}
        </div>
        <h2 className="mt-1.5 text-base font-black leading-snug">{c.title}</h2>
        <p className="mt-1 text-sm text-stone-600">
          {c.docket.screening ? (c.docket.track === 'summary' ? '간단 처리 권고 이유' : '재판에 올린 이유') : '상태'}: {c.docket.screening ? (c.docket.reasons.length ? c.docket.reasons.join(' · ') : '없음') : '기사부터 읽고 첫인상을 남기면 AI 의견을 확인할 수 있습니다.'}
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
  const [createdId, setCreatedId] = useState<string | null>(null)
  const categories = useMemo(() => [...new Set((data ?? []).map((c) => c.category))], [data])
  const list = (data ?? []).filter(
    (c) => (!track || c.docket.track === track) && (!stage || c.progress.stage === stage) && (!category || c.category === category) && (!text || `${c.id} ${c.title}`.includes(text)),
  )
  const hidden = (data ?? []).filter((c) => !c.docket.screening).length
  const summary = (data ?? []).filter((c) => c.docket.screening && c.docket.track === 'summary').length
  const trial = (data ?? []).filter((c) => c.docket.screening && c.docket.track === 'trial').length
  const variants = (data ?? []).filter((c) => c.variantOf).length
  const showTrack = summary > 0
  const startId = createdId ?? starterCaseId(data ?? [])
  const ordered = [...list.filter((c) => c.id === startId), ...list.filter((c) => c.id !== startId)]
  const handleCreated = async (c: Case) => {
    setTrack('')
    setStage('')
    setCategory('')
    setText('')
    setCreatedId(c.id)
    await reload()
  }
  return (
    <PageShell>
      <PageTitle title="사건 접수" sub="기사 등록부터 사람의 판결까지, 모든 검토는 이곳에서 시작됩니다." />
      <RegistrationPanel onCreated={handleCreated} />
      {data ? (
        <details className="space-y-3 rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-700" aria-label="분류 안내">
          <summary className="cursor-pointer font-semibold">전체 {data.length}건 <span className="ml-2 text-xs font-normal text-stone-500">{showTrack ? `간단 처리 권고 ${summary} · 재판 ${trial} · ` : ''}첫인상 전이라 AI 의견을 가린 사건 {hidden}건{variants ? ` · 실험 변형 ${variants}건 포함` : ''}</span></summary>
          {showTrack ? <p><Badge tone="green">간단 처리 권고</Badge> AI 서기가 확신({policy ? `${policy.summaryThreshold}점 이상` : '기준 점수 이상'})하고 {policy?.highRiskCategories.length ? `${policy.highRiskCategories.join('·')} 같은 ` : ''}고위험 분야가 아닌 사건. 약식 처리 권고만 자동으로 표시되고, 최종 판결과 조치 승인은 사람이 합니다. 원하면 <Term tip="약식 권고 사건도 사람이 언제든 재판을 시작할 수 있습니다.">재판을 시작</Term>할 수 있어요.</p> : <p>지금은 모든 사건이 재판으로 진행됩니다. AI 서기의 의견은 참고용이고, 판결은 사람 판사가 내립니다.</p>}
          {showTrack ? <p><Badge tone="amber">재판 진행</Badge> 서기가 덜 확신하거나 고위험 분야라서, 사람 판사가 변론을 듣고 판결해야 하는 사건.</p> : null}
        </details>
      ) : null}
      <div className={`mb-4 grid grid-cols-2 gap-2 ${showTrack ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`} role="search" aria-label="사건 필터">
        {showTrack ? (
          <select aria-label="분류 필터" value={track} onChange={(e) => setTrack(e.target.value)} className={INPUT}>
            <option value="">분류 전체</option>
            <option value="summary">간단 처리 권고</option>
            <option value="trial">재판 진행</option>
          </select>
        ) : null}
        <select aria-label="단계 필터" value={stage} onChange={(e) => setStage(e.target.value)} className={INPUT}>
          <option value="">단계 전체</option>
          <option value="new">신규</option>
          <option value="in_trial">재판 중</option>
          <option value="appealed">항소 중</option>
          <option value="final">판결 완료</option>
        </select>
        <select aria-label="분야 필터" value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
          <option value="">분야 전체</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input aria-label="사건 검색" placeholder="제목·번호 검색" value={text} onChange={(e) => setText(e.target.value)} className={`${INPUT} col-span-2 sm:col-span-1`} />
      </div>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {data && !list.length ? <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-600">{data.length ? '조건에 맞는 사건이 없습니다. 필터를 바꿔 보세요.' : '아직 등록된 사건이 없습니다. 새 기사 등록으로 첫 사건을 넣어 보세요.'}</p> : null}
      <ul className="space-y-3">{ordered.map((c) => <CaseCard key={c.id} c={c} start={c.id === startId} showTrack={showTrack} />)}</ul>
    </PageShell>
  )
}
