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
import { ExecutionGraph } from '../features/execution/ExecutionGraph'
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

// 법정 장면과 공개 범위를 따르는 근거 요약
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
  return (
    <div className={`court-domain-host ${mini ? 'court-domain-host-mini' : ''}`}>
      <div className="court-scene-heading">
        <span className="court-scene-name">법정</span>
        <span>최종 판결은 사람이 내립니다</span>
      </div>
      <div className="court-scene-body">
        <CourtStage view={sceneView} speakingClaim={v.speakingClaim} activity={v.activity} currentSeat={v.currentSeat} mini={mini} />
        {v.writing ? (
          <div className="court-working-note" role="status">
            <span className="court-dot" aria-hidden />
            AI 작업 중{v.job && v.job.total ? ` · ${v.job.done}/${v.job.total}` : ''}
          </div>
        ) : null}
      </div>
      {mini ? null : (
        <div className="court-scene-footer">
          <p className="court-evidence-summary" aria-label="근거 가중치 합계">
            {v.hidden ? '첫인상을 기록하면 AI 변론과 근거가 공개됩니다.' : (
              <><span>근거 가중치</span><b>찬성 {fmtWeight(v.balance.pro)}</b><b>반대 {fmtWeight(v.balance.con)}</b><span>기사의 판결을 뜻하지 않습니다.</span></>
            )}
          </p>
          {!v.hidden && v.focusEvidence ? <p className="court-selected-evidence" aria-label="선택한 근거">{evidenceText(v.focusEvidence)}{v.focusEvidence.status === 'misnumbered' && v.focusEvidence.foundIn ? ` · 실제 원문 #${v.focusEvidence.foundIn}` : ''}</p> : null}
        </div>
      )}
    </div>
  )
}

// 법정 화면 컴포넌트
export default function CourtPage() {
  const { caseId = '' } = useParams()
  const open = useCourt((s) => s.open)
  const loading = useCourt((s) => s.loading)
  const error = useCourt((s) => s.error)
  const retryJob = useCourt((s) => s.retryJob)
  const cancelJob = useCourt((s) => s.cancelJob)
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
    <div className="court-domain-page flex min-h-full min-w-0 flex-col lg:h-full">
      <div className="court-domain-heading">
        <h2 title={v.caseData.title}>{v.caseData.title}</h2>
        <div className="court-procedure-nav">
          <InstanceStepper />
          <StepIndicator phase={v.live ? v.phase : 'final'} />
        </div>
      </div>
      <div className="court-domain-layout">
        {mobile ? <div className="court-mobile-stage" aria-label="작은 법정 화면"><SceneHost mini /></div> : null}
        {mobile ? null : <div className="court-desktop-stage"><SceneHost /></div>}
        <aside ref={aside} className="court-case-file" aria-label="재판 기록과 판사 입력">
          <div className="court-file-heading"><h2>사건 기록</h2><span>읽고, 검토하고, 판단하세요</span></div>
          {v.mockManual ? <section role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><h3 className="font-bold">모의 화면 · 직접 등록 기사</h3><p className="mt-1">원문 읽기와 첫인상 기록을 실험할 수 있습니다. 이 화면에서는 AI 변론을 생성하지 않습니다. 실제 분석은 로컬 서버에 기사를 등록한 뒤 시작하세요.</p>{v.state.first ? <p className="mt-1 font-bold">첫인상이 저장되었습니다. 새로고침해도 이 탭에서 다시 확인할 수 있습니다.</p> : null}</section> : <NowBanner />}
          {v.needStart ? <StartPanel /> : null}
          {v.viewInstance === 1 && (!v.needStart || v.state.first) ? <FirstImpressionSection /> : null}
          <ArticlePanel />
          <ExecutionGraph view={v.execution} workflow={v.workflow} mock={import.meta.env.VITE_MOCK === '1'} compact busy={v.controlBusy} onRetry={() => void retryJob()} onCancel={() => void cancelJob()} />
          {v.viewInstance === 3 ? <OfficerCard /> : null}
          {v.mockManual ? null : <ClaimsPanel />}
          {v.mockManual ? null : <div className={judging ? 'lg:sticky lg:bottom-0 lg:z-10 lg:-mx-3 lg:shrink-0 lg:max-h-[58vh] lg:overflow-y-auto lg:border-t lg:border-stone-200 lg:bg-stone-50 lg:px-3 lg:pb-3 lg:pt-2 lg:shadow-[0_-8px_10px_-10px_rgba(0,0,0,0.2)]' : undefined}><VerdictSection /></div>}
        </aside>
      </div>
    </div>
  )
}
