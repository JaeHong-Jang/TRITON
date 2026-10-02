// 법정 화면
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { FirstImpressionSection, StartPanel, VerdictSection } from '../features/court/ActionPanel'
import { ArticlePanel } from '../features/court/ArticlePanel'
import { ClaimsPanel } from '../features/court/ClaimsPanel'
import { InstanceStepper, StepIndicator } from '../features/court/InstanceStepper'
import { NowBanner } from '../features/court/NowBanner'
import { OfficerCard } from '../features/court/OfficerCard'
import { useCourt } from '../features/court/store'
import { useAutoReveal } from '../features/court/useAutoReveal'
import { evidenceText, useCourtView } from '../features/court/view'
import CourtStage from '../scene2d/CourtStage'
import { fmtWeight } from '../lib/scale'
import { ErrorNote, Loading } from '../ui/Feedback'

// 화면 폭이 모바일(768px 미만)인지 알려 주는 훅
function useIsMobile(): boolean {
  const query = '(max-width: 767px)'
  const [mobile, setMobile] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const read = () => setMobile(mq.matches)
    mq.addEventListener('change', read)
    return () => mq.removeEventListener('change', read)
  }, [])
  return mobile
}

// 2D 장면과 천칭 합계·작업 표시를 겹쳐 보여 주는 무대 (mini는 모바일 고정 작은 무대)
function SceneHost({ mini = false }: { mini?: boolean }) {
  const v = useCourtView()
  const setFocus = useCourt((s) => s.setFocus)
  const focus = useCourt((s) => s.focus)
  if (!v) return null
  const sceneView = {
    c: v.caseData,
    bench: (v.rec ?? v.records[(v.viewInstance - 1) as 1 | 2])?.bench ?? [],
    weights: v.weights,
    hidden: v.hidden,
    seatsLit: v.seatsLit,
    focusId: focus,
    verdict: v.state.final?.verdict ?? null,
    appealed: v.current > 1 && !v.state.final,
    onPick: (id: string) => setFocus(focus === id ? null : id),
  }
  if (mini) {
    return (
      <div className="relative h-full w-full">
        <CourtStage view={sceneView} speakingClaim={v.speakingClaim} activity={v.activity} currentSeat={v.currentSeat} mini />
        {v.writing ? (
          <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-lg bg-stone-900/90 px-2 py-1 text-xs font-bold text-amber-200 shadow" role="status">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden />
            AI 작업 중{v.job && v.job.total ? ` · ${v.job.done}/${v.job.total}` : ''}
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div className="relative h-full w-full">
      <CourtStage view={sceneView} speakingClaim={v.speakingClaim} activity={v.activity} currentSeat={v.currentSeat} />
      <div className="pointer-events-none absolute left-3 top-3 rounded-xl bg-white/90 px-3 py-2 text-sm font-black shadow" aria-label="천칭 합계">
        {v.hidden ? (
          <span className="text-stone-600">천칭 가림 · 첫인상을 기록하면 열립니다</span>
        ) : (
          <>
            <span className="text-pro">찬성 {fmtWeight(v.balance.pro)}</span>
            <span className="mx-1.5 text-stone-600">:</span>
            <span className="text-con">반대 {fmtWeight(v.balance.con)}</span>
          </>
        )}
      </div>
      {v.writing ? (
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-xl bg-stone-900/90 px-3 py-2 text-sm font-bold text-amber-200 shadow" role="status">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" aria-hidden />
          AI 에이전트 작업 중{v.job && v.job.total ? ` · ${v.job.done}/${v.job.total}` : ''}
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-bold text-stone-800" aria-label="그림 보는 법" style={v.focusEvidence ? { display: 'none' } : undefined}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 shadow"><b className="rounded bg-pro px-1.5 text-white">AI</b> 배지가 있으면 변론·검증을 돕는 AI 에이전트</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 shadow"><b className="rounded bg-stone-900 px-1.5 text-amber-200">사람</b> 배지가 없는 판사가 판결합니다</span>
      </div>
      {v.focusEvidence ? (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg bg-stone-900/90 px-3 py-2 text-sm text-amber-100 shadow" aria-label="선택한 근거">
          선택한 근거 · {evidenceText(v.focusEvidence)}
        </div>
      ) : null}
    </div>
  )
}

// 법정 화면 컴포넌트
export default function CourtPage() {
  const { caseId = '' } = useParams()
  const open = useCourt((s) => s.open)
  const loading = useCourt((s) => s.loading)
  const error = useCourt((s) => s.error)
  const v = useCourtView()
  const mobile = useIsMobile()
  const aside = useRef<HTMLElement>(null)
  useAutoReveal()
  useEffect(() => {
    open(caseId)
  }, [open, caseId])
  // 심급이 바뀌면 오른쪽 패널을 맨 위로
  useEffect(() => {
    aside.current?.scrollTo({ top: 0 })
  }, [v?.current, v?.viewInstance])

  if (loading && !v) return <Loading text="법정을 여는 중입니다…" />
  if (!v) return <ErrorNote message={error ?? '사건을 불러오지 못했습니다'} onRetry={() => open(caseId)} />
  const judging = v.live && (v.phase === 'seats' || v.phase === 'decision')
  return (
    <div className="flex min-h-full min-w-0 flex-col lg:h-full">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-stone-300 bg-white px-3 py-2">
        <h2 className="min-w-0 flex-1 basis-60 truncate text-base font-black" title={v.caseData.title}>{v.caseData.title}</h2>
        <InstanceStepper />
        <StepIndicator phase={v.live ? v.phase : 'final'} />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        {mobile ? <div className="sticky top-0 z-20 h-[140px] border-b border-stone-300" aria-label="작은 법정 화면"><SceneHost mini /></div> : null}
        <div className="min-h-0">
          {mobile ? null : <div className="h-[40vh] min-h-[220px] lg:h-full"><SceneHost /></div>}
          <p className="bg-stone-900 px-3 py-1.5 text-center text-xs font-bold text-amber-200 min-[600px]:hidden">판사는 사람입니다 · AI는 판결하지 않습니다</p>
        </div>
        <aside ref={aside} className="flex min-h-0 min-w-0 flex-col gap-3 border-l border-stone-300 bg-stone-50 p-3 lg:overflow-y-auto">
          <NowBanner />
          {v.needStart ? <StartPanel /> : v.viewInstance === 1 ? <FirstImpressionSection /> : null}
          <ArticlePanel />
          {v.viewInstance === 3 ? <OfficerCard /> : null}
          <ClaimsPanel />
          <div className={judging ? 'lg:sticky lg:bottom-0 lg:z-10 lg:-mx-3 lg:shrink-0 lg:max-h-[58vh] lg:overflow-y-auto lg:border-t lg:border-stone-200 lg:bg-stone-50 lg:px-3 lg:pb-3 lg:pt-2 lg:shadow-[0_-8px_10px_-10px_rgba(0,0,0,0.2)]' : undefined}><VerdictSection /></div>
        </aside>
      </div>
    </div>
  )
}
