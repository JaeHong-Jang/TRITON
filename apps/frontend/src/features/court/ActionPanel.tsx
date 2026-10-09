// 판사 행동 패널
import { useState } from 'react'
import type { ActionLevel, Instance, Leaning } from '../../api/types'
import { MIN_REASON, agentsNeedingManualReview, claimsNeedingManualReview, majorityOf, seatCount } from '../../lib/trial'
import { Confidence, GuardedButton, LeaningPicker, ReasonBox, Term } from '../../ui/Forms'
import { Badge } from '../../ui/Badge'
import { actionLabel, leaningLabel } from '../../lib/names'
import { needsHuman, useOntology } from '../../ui/ontology'
import { CARD, INPUT, PRIMARY, SECONDARY } from '../../ui/styles'
import { useCourt } from './store'
import { VerdictSummary } from './VerdictSummary'
import { useCourtView } from './view'

// 첫인상 기록 폼
function FirstImpressionForm({ mockManual }: { mockManual: boolean }) {
  const judgeName = useCourt((s) => s.judgeName)
  const busy = useCourt((s) => s.busy)
  const submit = useCourt((s) => s.firstImpression)
  const [leaning, setLeaning] = useState<Leaning | null>(null)
  const [conf, setConf] = useState(50)
  const why = !judgeName.trim() ? '판사 이름을 적으면 기록할 수 있어요' : !leaning ? '낚시성 여부를 고르면 기록할 수 있어요' : busy ? '기록하는 중입니다' : null
  return (
    <div className="space-y-3">
      <LeaningPicker value={leaning} onChange={setLeaning} />
      <Confidence value={conf} onChange={setConf} />
      <GuardedButton className={PRIMARY} why={why} onGo={() => leaning && submit(leaning, conf)}>{mockManual ? '첫인상 기록' : '첫인상 기록하고 개정'}</GuardedButton>
    </div>
  )
}

// 판사석 진행 표시
function SeatProgress({ instance }: { instance: Instance }) {
  const state = useCourt((s) => s.state)!
  const done = state.instances[instance].seats
  const n = seatCount(instance)
  return (
    <div aria-label="판사석 진행">
      <p className="text-sm font-black">판사석 {Math.min(done.length + 1, n)}/{n}{done.length ? <span className="ml-2 text-xs font-semibold text-emerald-800">완료: {done.map((d) => d.judge).join(', ')}</span> : null}</p>
      <div className="mt-1 flex gap-1" aria-hidden>
        {Array.from({ length: n }, (_, k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${k < done.length ? 'bg-emerald-600' : k === done.length ? 'bg-stone-900' : 'bg-stone-300'}`} />)}
      </div>
    </div>
  )
}

// 판사석 판결 폼
function SeatForm({ instance, seat }: { instance: Instance; seat: 1 | 2 | 3 }) {
  const v = useCourtView()!
  const judgeName = useCourt((s) => s.judgeName)
  const soloMode = useCourt((s) => s.soloMode)
  const busy = useCourt((s) => s.busy)
  const setSolo = useCourt((s) => s.setSolo)
  const seatVerdict = useCourt((s) => s.seatVerdict)
  const state = useCourt((s) => s.state)!
  const seats = state.instances[instance].seats
  const multi = seatCount(instance) > 1
  const solo = multi && soloMode
  const [name, setName] = useState(seat === 1 || solo ? judgeName : '')
  const [leaning, setLeaning] = useState<Leaning | null>(null)
  const [conf, setConf] = useState(60)
  const [reason, setReason] = useState('')
  const [readReport, setReadReport] = useState(false)
  const effectiveName = solo ? judgeName : name
  const needReport = instance === 3 && seat === 1
  const why =
    !effectiveName.trim() ? '판사 이름을 적으면 기록할 수 있어요'
      : needReport && !readReport ? '재판연구관 보고서를 확인했다고 체크하면 기록할 수 있어요'
        : multi && !solo && seats.some((x) => x.judge === effectiveName.trim()) ? '다른 판사석과 같은 이름이에요. 합의부는 서로 다른 판사가 판결해야 해요'
          : !leaning ? '낚시성 여부를 고르면 기록할 수 있어요'
            : reason.trim().length < MIN_REASON ? `판결 사유를 ${MIN_REASON}자 이상 쓰면 기록할 수 있어요`
              : busy ? '기록하는 중입니다' : null
  const screening = instance === 1 && v.live && v.phase === 'seats' ? v.rec?.screening : null
  return (
    <div className="space-y-3">
      <SeatProgress instance={instance} />
      {multi && !solo ? (
        <label className="block text-sm">판사석 {seat} 판사 이름<input value={name} onChange={(e) => setName(e.target.value)} className={`${INPUT} mt-1`} /></label>
      ) : null}
      {screening ? (
        <div className="rounded-lg border border-stone-300 bg-stone-50 p-2 text-sm" aria-label="AI 서기 권고">
          <p className="text-xs font-bold text-stone-600">AI 서기 권고 · 참고용</p>
          <p><b>{leaningLabel(screening.isClickbait ? 'clickbait' : 'not_clickbait')}</b> · 확신도 {screening.confidence} · {screening.reason}</p>
        </div>
      ) : null}
      {needReport ? (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={readReport} onChange={(e) => setReadReport(e.target.checked)} />
          재판연구관 보고서를 확인했습니다
        </label>
      ) : null}
      <LeaningPicker value={leaning} onChange={setLeaning} />
      <Confidence value={conf} onChange={setConf} />
      <ReasonBox value={reason} onChange={setReason} label="판결 사유" />
      <GuardedButton className={PRIMARY} why={why} onGo={() => leaning && seatVerdict(seat, effectiveName.trim(), leaning, conf, reason.trim())}>
        {seatCount(instance) > 1 ? `판사석 ${seat} 판결 기록 (${seat}/${seatCount(instance)})` : '판결 기록'}
      </GuardedButton>
      {multi && seat === 1 ? (
        <label className="flex items-center gap-2 text-xs text-stone-600">
          <input type="checkbox" checked={soloMode} onChange={(e) => setSolo(e.target.checked)} />
          <span><Term tip="한 사람이 모든 판사석을 차례로 맡는 시연용 방식입니다. 끄면 판사석마다 다른 판사 이름이 필요합니다.">1인 시연 모드</Term> · 판사석 독립성은 장부에 ‘미보장’으로 남아요</span>
        </label>
      ) : null}
    </div>
  )
}

const LEVELS: ActionLevel[] = ['L0', 'L1', 'L2', 'L3']

// 확정·항소 폼
function DecisionForm({ instance }: { instance: Instance }) {
  const v = useCourtView()!
  const ont = useOntology((s) => s.ont)
  const busy = useCourt((s) => s.busy)
  const finalize = useCourt((s) => s.finalize)
  const appeal = useCourt((s) => s.appeal)
  const seats = v.state.instances[instance].seats
  const majority = majorityOf(seats)
  const [action, setAction] = useState<ActionLevel | null>(null)
  const [reason, setReason] = useState('')
  const short = reason.trim().length < MIN_REASON
  const confirmWhy = busy ? '기록하는 중입니다' : majority === null ? '판사석 의견이 갈려 확정할 수 없어요' : !action ? '조치 단계를 고르면 확정할 수 있어요' : short ? `사유를 ${MIN_REASON}자 이상 쓰면 확정할 수 있어요` : null
  const appealWhy = busy ? '기록하는 중입니다' : short ? `사유를 ${MIN_REASON}자 이상 쓰면 보낼 수 있어요` : null
  const pro = seats.filter((s) => s.verdict === 'clickbait').length
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-stone-100 p-2 text-sm">
        <p className="font-bold">판사석 결과 {seats.length > 1 ? `· ${pro}:${seats.length - pro}` : ''}</p>
        <ul>{seats.map((s) => <li key={s.seat}>판사석 {s.seat} ({s.judge}{s.soloMode ? ' · 시연 모드' : ''}): {leaningLabel(s.verdict)} · 확신 {s.confidence}</li>)}</ul>
        {majority ? <p className="mt-1 font-bold">{seats.length > 1 ? '다수결' : '판결'}: {leaningLabel(majority)}</p> : <p className="mt-1 font-bold text-red-700">의견이 갈렸습니다 · 3심으로 회부해야 합니다</p>}
      </div>
      {majority ? (
        <fieldset>
          <legend className="mb-1 text-sm font-bold">조치 단계 <span className="text-xs font-normal text-stone-600">판사가 조치 단계를 선택합니다. 외부 조치는 실행하지 않고 승인 기록만 남깁니다.</span></legend>
          {instance === 3 && v.rec?.officer ? <p className="mb-1 text-xs text-emerald-800">재판연구관 권고: <span title={v.rec.officer.recommendedAction}>{actionLabel(v.rec.officer.recommendedAction)}</span> (참고용)</p> : null}
          <div className="grid gap-1.5" role="radiogroup" aria-label="조치 단계">
            {LEVELS.map((l) => (
              <button key={l} role="radio" aria-checked={action === l} onClick={() => setAction(l)} className={`flex items-center gap-2 rounded-lg border-2 px-2 py-1.5 text-left text-sm ${action === l ? 'border-stone-900 bg-amber-100' : 'border-stone-300 bg-white hover:bg-stone-50'}`}>
                <span className="flex-1 font-semibold"><span title={l}>{actionLabel(l)}</span></span>
                {needsHuman(ont, l) ? <Badge tone="amber">사람 승인 기록</Badge> : <Badge tone="gray">판사 기록/안내</Badge>}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {seats.at(-1)?.reason ? <button type="button" className="text-xs font-semibold text-stone-700 underline decoration-dotted hover:text-stone-900" onClick={() => setReason(seats.at(-1)?.reason ?? '')}>판사석 사유 가져오기</button> : null}
      <ReasonBox value={reason} onChange={setReason} label={majority ? '최종 사유 (순위 하향·제재처럼 무거운 조치는 승인 근거로 필수)' : '회부 사유'} />
      {majority ? (
        <GuardedButton className={PRIMARY} why={confirmWhy} onGo={() => action && majority && finalize(majority, action, reason.trim())}>{instance === 3 ? '최종 판결 확정' : '판결 확정'}</GuardedButton>
      ) : null}
      {instance < 3 ? (
        <GuardedButton className={majority ? `${SECONDARY} w-full aria-disabled:opacity-60` : PRIMARY} why={appealWhy} onGo={() => appeal(reason.trim())}>{instance + 1}심으로 {majority ? '항소 (확정하지 않고 다시 다툼)' : '회부'}</GuardedButton>
      ) : null}
      {instance < 3 ? <p className="text-xs text-stone-600">{majority ? '항소' : '회부'}하면 {instance + 1}심 AI 에이전트가 바로 일을 시작하고, 변론은 자동으로 공개됩니다.</p> : null}
    </div>
  )
}

// 판사 이름 입력칸
function JudgeNameField() {
  const name = useCourt((s) => s.judgeName)
  const set = useCourt((s) => s.setJudgeName)
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
      판사 이름
      <input value={name} onChange={(e) => set(e.target.value)} className="w-32 rounded border border-stone-300 bg-white px-2 py-1 text-sm font-normal" />
    </label>
  )
}

// 재판 시작 버튼 (한 번만 누르면 에이전트가 일하거나 저장된 변론이 재생됨, 판사 이름 필수)
export function StartPanel() {
  const v = useCourtView()
  const start = useCourt((s) => s.start)
  const jobError = useCourt((s) => s.jobError)
  const error = useCourt((s) => s.error)
  const judgeName = useCourt((s) => s.judgeName)
  if (!v) return null
  const i = v.current
  const replay = !!v.rec?.claims.length
  const why = judgeName.trim() ? null : '판사 이름을 적으면 시작할 수 있어요'
  return (
    <section id="sec-first" className={`${CARD} space-y-3 border-2 border-stone-900`} aria-label="재판 시작">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-stone-700">{i === 1 ? '재판 시작' : `${i}심 시작`}</h2>
        <JudgeNameField />
      </div>
      <p className="text-sm text-stone-700">
        {replay ? '저장된 변론을 법정에서 다시 재생합니다.' : 'AI 검사·변호인이 기사를 읽고 그 자리에서 변론을 준비합니다.'} 버튼은 한 번만 누르면 되고, 이후 주장은 자동으로 공개됩니다.
      </p>
      {jobError ? <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">작업에 실패했습니다: {jobError}</p> : null}
      {error && !why ? <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}
      <GuardedButton className={PRIMARY} why={why} onGo={() => void start()}>{jobError ? `${i}심 다시 시작` : i === 1 ? '재판 시작' : `${i}심 시작`}</GuardedButton>
    </section>
  )
}

// 첫인상 구역 (기록 전에는 입력 폼, 기록 뒤에는 내 첫인상 요약)
export function FirstImpressionSection() {
  const v = useCourtView()
  const error = useCourt((s) => s.error)
  if (!v) return null
  const first = v.state.first
  if (v.live && v.phase === 'first_impression') {
    return (
      <section id="sec-first" className={`${CARD} space-y-3`} aria-label="첫인상">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black text-stone-700">첫인상 · 기사만 읽고</h2>
          <JudgeNameField />
        </div>
        <FirstImpressionForm mockManual={v.mockManual} />
        {error ? <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}
      </section>
    )
  }
  return (
    <section id="sec-first" className={CARD} aria-label="첫인상">
      <h2 className="text-sm font-black text-stone-700">첫인상 · 기사만 읽고</h2>
      <p className="mt-1 text-sm">{first ? <>내 첫인상: <b className={first.leaning === 'clickbait' ? 'text-pro' : 'text-con'}>{leaningLabel(first.leaning)}</b> · 확신도 {first.confidence}점 <Badge tone="green">장부에 기록됨</Badge></> : '아직 기록하지 않았습니다.'}</p>
    </section>
  )
}

// 변론 자동 공개 진행 막대와 건너뛰기 (오류가 나면 멈추고 알림)
export function HearingBar() {
  const v = useCourtView()
  const skip = useCourt((s) => s.skip)
  const skipping = useCourt((s) => s.skipping)
  const error = useCourt((s) => s.error)
  const clearError = useCourt((s) => s.clearError)
  const judgeName = useCourt((s) => s.judgeName)
  if (!v || !v.live || v.phase !== 'hearing') return null
  const shown = v.shown.length
  const behind = shown < v.total
  const noName = !judgeName.trim()
  if (error || noName) {
    return (
      <div className="mb-2 space-y-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2" role="alert" aria-label="자동 공개 멈춤">
        <p className="text-sm font-bold text-red-900">자동 공개를 멈췄어요 · {noName ? '판사 이름이 비어 있습니다' : error}</p>
        <div className="flex flex-wrap items-center gap-2">
          <JudgeNameField />
          <button className={SECONDARY} disabled={noName} onClick={() => clearError()}>다시 시도</button>
        </div>
      </div>
    )
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2" aria-label="자동 공개">
      <p className="min-w-0 flex-1 text-sm font-bold text-amber-950" aria-live="polite">
        {behind ? `변론 자동 공개 중 · ${shown}/${v.total}${v.writing ? '+' : ''}` : 'AI가 다음 주장을 쓰는 중 · 제출되면 바로 공개'}
      </p>
      <button className={SECONDARY} disabled={skipping} onClick={() => skip()}>{skipping ? '건너뛰는 중…' : '건너뛰기 (모두 공개)'}</button>
    </div>
  )
}

// 판결 구역 (판사석 판결·확정·항소, 아직이면 잠금 안내)
export function VerdictSection() {
  const v = useCourtView()
  const error = useCourt((s) => s.error)
  const setViewing = useCourt((s) => s.setViewing)
  if (!v) return null
  if (!v.live) {
    return (
      <section id="sec-verdict" className={CARD}>
        <p className="text-sm">{v.viewInstance}심 기록을 읽기 전용으로 보는 중입니다.</p>
        <button className={`${PRIMARY} mt-2`} onClick={() => setViewing(null)}>{v.current}심 진행으로 돌아가기</button>
      </section>
    )
  }
  const i = v.current
  const manualReview = v.rec ? claimsNeedingManualReview(v.rec) : []
  const agentReview = v.rec ? agentsNeedingManualReview(v.rec) : []
  if (v.unfinishedJob) {
    return (
      <section id="sec-verdict" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" aria-label="작업 미완료">
        <b>판결 대기</b> · AI 실행이 완료되지 않아 판결을 기록할 수 없습니다. 실행 그래프에서 상태를 확인하고 실패·취소된 실행은 재시도하세요.
      </section>
    )
  }
  if (v.phase === 'final') return <div id="sec-verdict"><VerdictSummary caseId={v.caseData.id} final={v.state.final!} noGroundTruth={v.caseData.origin === 'manual'} /></div>
  if (v.phase === 'review') {
    return (
      <section id="sec-verdict" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" aria-label="실패 근거 검토">
        <b>실패 근거 검토</b> · 검증에 실패한 근거를 모두 채택 또는 기각해야 판결할 수 있습니다. 공개된 변론의 근거 줄에서 판사 결정을 기록하세요.
      </section>
    )
  }
  if (v.phase !== 'seats' && v.phase !== 'decision') {
    return (
      <section id="sec-verdict" className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-3 text-sm text-stone-600" aria-label="판결 단계">
        <b className="text-stone-700">판결</b> · 변론을 모두 듣고 나면 이 자리에서 {i === 1 ? '판결을 기록' : i === 2 ? '판사석별로 판결' : '판사석 3개가 판결'}합니다.
      </section>
    )
  }
  return (
    <section id="sec-verdict" className={`${CARD} space-y-3`} aria-label="판사 행동">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-stone-700">판결</h2>
        <JudgeNameField />
      </div>
      {manualReview.length || agentReview.length ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
          근거 검증 실패 또는 주장 미제출 · 판사 검토 필요: {[...manualReview.map((c) => c.id), ...agentReview.map((a) => a.label)].join(', ')}. 이 역할은 성공 제출로 보지 말고 판결 사유에서 직접 판단하세요.
        </p>
      ) : null}
      {v.phase === 'seats' ? <SeatForm key={`${i}-${v.state.instances[i].seats.length}`} instance={i} seat={(v.state.instances[i].seats.length + 1) as 1 | 2 | 3} /> : <DecisionForm instance={i} />}
      {error ? <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}
    </section>
  )
}
