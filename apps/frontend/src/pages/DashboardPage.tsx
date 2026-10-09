// 운영 콘솔 대시보드 화면
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'
import type { ActivityItem, Dashboard, Policy } from '../api/types'
import { useDashboard } from '../console/DashboardContext'
import { ago, BTN, Meter, PageFrame, Panel, PANEL } from '../console/parts'
import { jobAttemptLabel, runStatusLabel } from '../lib/execution'
import { starterCaseId } from '../lib/starter'
import { ErrorNote, Loading } from '../ui/Feedback'
import { pct } from '../ui/format'
import { useAsync } from '../ui/useAsync'

type Good = 'good' | 'warn' | 'bad' | 'none'

// 표본이 이보다 적으면 비율 대신 건수로 보임
const MIN_N = 5

// 상태 글자
const STATUS: Record<Good, string> = { good: '양호', warn: '주의', bad: '기준 미달', none: '' }

const TONE: Record<Good, { dot: string; bar: string; text: string }> = {
  good: { dot: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-700' },
  warn: { dot: 'bg-amber-500', bar: 'bg-amber-500', text: 'text-amber-700' },
  bad: { dot: 'bg-amber-600', bar: 'bg-amber-600', text: 'text-amber-800' },
  none: { dot: 'bg-stone-300', bar: 'bg-stone-300', text: 'text-stone-500' },
}

// 비율 값의 좋고 나쁨 판정
function judge(v: number | null, goodAt: number, badAt: number, higherBetter: boolean): Good {
  if (v === null) return 'none'
  const score = higherBetter ? v : 1 - v
  const g = higherBetter ? goodAt : 1 - goodAt
  const b = higherBetter ? badAt : 1 - badAt
  return score >= g ? 'good' : score <= b ? 'bad' : 'warn'
}

// 지표 타일 하나
function Kpi({ label, value, note, rate, good = 'none', unit, sample, scope, hit }: { label: string; value: string; note: string; rate?: number | null; good?: Good; unit?: string; sample?: number; scope?: string; hit?: string }) {
  const small = rate !== undefined && sample !== undefined && sample < MIN_N
  const t = TONE[small ? 'none' : good]
  const status = small ? '' : STATUS[good]
  const lack = sample === 0 || rate === null ? `표본 없음 · ${sample ?? 0}건` : `표본 부족 · ${sample}건 중 ${Math.round((rate ?? 0) * (sample ?? 0))}건 ${hit ?? '일치'}`
  return (
    <div className={`${PANEL} tribunal-kpi flex flex-col`}>
      <div className="flex items-center gap-2 text-xs font-bold text-stone-600">
        <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
        {label}
        {status ? <span className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-black ${good === 'good' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{status}</span> : null}
      </div>
      <p className={small || value === '-' ? 'mt-2 text-[15px] font-bold leading-[28px] text-stone-600' : 'mt-2 text-[28px] font-black leading-none tabular-nums text-stone-900'}>
        {small || value === '-' ? lack : value}
        {unit && !small && value !== '-' ? <span className="ml-1 text-sm font-bold text-stone-500">{unit}</span> : null}
      </p>
      {rate !== undefined && !small ? <div className="mt-3"><Meter value={rate ?? 0} tone={t.bar} label={label} /></div> : <div className="mt-3 h-1.5" />}
      {sample !== undefined && scope ? <p className="mt-2 text-[11.5px] font-semibold tabular-nums text-stone-600">{small ? scope : `표본 ${sample}건 · ${scope}`}</p> : null}
      <p className="mt-2 text-[12.5px] leading-relaxed text-stone-600">{note}</p>
    </div>
  )
}

// 지표에서 이어진 운영 판단 한 줄
function Decision({ k, policy }: { k: Dashboard['kpis']; policy: Policy | null }) {
  if (!policy) return null
  const acc = k.screeningAccuracy
  const low = acc !== null && acc < 0.8
  const n = k.samples.screening
  const text = acc !== null && n < MIN_N
    ? `그래서: 서기 정확도는 표본 부족(정답 공개 ${n}건 중 ${Math.round(acc * n)}건 일치)이라 믿을 수 없어 약식 처리(AI 단독 처리)를 ${policy.summaryEnabled ? '켜 둔 상태입니다. 표본이 쌓일 때까지 끄는 것을 검토하세요' : '꺼 두었습니다'}. 모든 사건은 사람 판사가 재판합니다.`
    : low
    ? `그래서: 서기 정확도 ${pct(acc)}가 기준(80%)에 못 미쳐 약식 처리(AI 단독 처리)를 ${policy.summaryEnabled ? '켜 둔 상태입니다. 끄거나 기준을 높이는 것을 검토하세요' : '꺼 두었습니다'}. 모든 사건은 사람 판사가 재판합니다.`
    : acc === null
      ? `그래서: 서기 정확도를 아직 잴 수 없어 약식 처리(AI 단독 처리)를 ${policy.summaryEnabled ? '켜 둔 상태입니다' : '꺼 두었습니다'}.`
      : `그래서: 서기 정확도 ${pct(acc)}로 기준(80%)을 넘어 약식 처리(AI 단독 처리)를 ${policy.summaryEnabled ? `확신도 ${policy.summaryThreshold}점 이상 사건에 허용합니다` : '켤 수 있지만 지금은 꺼 두었습니다'}.`
  return <p className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-[13px] font-semibold leading-relaxed text-stone-800" role="note">{text}</p>
}

// 진행 중인 작업 목록
function Jobs({ jobs }: { jobs: Dashboard['activeJobs'] }) {
  if (!jobs.length) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-500">
        지금 일하는 AI가 없습니다.
        <br />
        <Link to="/cases" className="mt-1 inline-block font-bold text-amber-700 underline underline-offset-2">사건 접수</Link>에서 재판을 열면 여기에 나타납니다.
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {jobs.map((j) => (
        <li key={j.id} className="rounded-xl border border-stone-200 p-3.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-bold">{(j.instance as number) === 0 ? '서기 접수 검토' : `${j.instance}심 재판 준비`}</span>
            <Link to={`/court/${j.caseId}`} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs font-semibold text-stone-600 hover:bg-stone-200">{j.caseId}</Link>
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs font-bold text-stone-600">{runStatusLabel(j.status)}</span>
            <span className="ml-auto text-xs tabular-nums text-stone-500">{j.done}/{j.total} 단계</span>
          </div>
          <p className="mt-1.5 text-[13px] text-stone-700">{j.step} <span className="text-[11px] text-stone-500">· {jobAttemptLabel(j)}</span></p>
          <div className="mt-2"><Meter value={j.total ? j.done / j.total : 0} tone="bg-emerald-500" label={`${j.caseId} 진행률`} /></div>
        </li>
      ))}
    </ul>
  )
}

// 최근 활동 한 줄 묶음 항목
interface Line { a: ActivityItem; n: number }

// 같은 사건끼리 묶고 연속된 같은 문장을 접은 활동 목록
function groupActivity(list: ActivityItem[]): { caseId: string; lines: Line[] }[] {
  const groups: { caseId: string; lines: Line[] }[] = []
  for (const a of list) {
    let g = groups.find((x) => x.caseId === a.caseId)
    if (!g) groups.push((g = { caseId: a.caseId, lines: [] }))
    const last = g.lines[g.lines.length - 1]
    if (last && last.a.text === a.text && last.a.kind === a.kind) last.n += 1
    else g.lines.push({ a, n: 1 })
  }
  return groups
}

// 최근 활동 한 줄
function Activity({ line }: { line: Line }) {
  const { a, n } = line
  const agent = a.kind === 'agent'
  return (
    <li className="flex gap-2.5 py-1.5 text-[13px]">
      <span className={`mt-1 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full ${agent ? 'bg-emerald-100' : 'bg-amber-100'}`} aria-hidden>
        <span className={`h-1.5 w-1.5 rounded-full ${agent ? 'bg-emerald-600' : 'bg-amber-600'}`} />
      </span>
      <p className="min-w-0 flex-1 leading-snug text-stone-800">
        <span className={`mr-1.5 rounded px-1 py-0.5 text-[10px] font-black ${agent ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{agent ? 'AI' : '판사'}</span>
        {a.text}
        {n > 1 ? <b className="ml-1.5 rounded bg-stone-100 px-1 py-0.5 text-[11px] tabular-nums text-stone-600">×{n}</b> : null}
        <span className="ml-1.5 text-[11px] text-stone-500">{ago(a.at)}</span>
      </p>
    </li>
  )
}

// 사건별 활동 묶음
function ActivityGroup({ caseId, lines }: { caseId: string; lines: Line[] }) {
  return (
    <li className="border-b border-stone-100 py-2 last:border-0">
      <Link to={`/records/${caseId}`} className="text-xs font-black text-stone-700 hover:underline">{caseId}</Link>
      <ul>{lines.map((l, i) => <Activity key={`${l.a.at}-${i}`} line={l} />)}</ul>
    </li>
  )
}

// 접수 검토 시작 버튼
function IntakeButton() {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const go = async () => {
    setBusy(true)
    setErr(null)
    try {
      await api.intake()
      nav('/agents')
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <button type="button" className={BTN} onClick={go} disabled={busy}>서기 접수 검토 시작</button>
        <span className="text-xs text-stone-600">새 기사에 서기 권고를 미리 만들어 둡니다</span>
        {err ? <span role="alert" className="text-xs font-semibold text-red-700">{err}</span> : null}
      </div>
    </>
  )
}

// 대시보드 컴포넌트
export default function DashboardPage() {
  const { data: d, error } = useDashboard()
  const { data: policy } = useAsync(() => api.policy(), [])
  const { data: cases } = useAsync(() => api.cases(), [])
  if (!d) return error ? <ErrorNote message={error} /> : <Loading />
  const k = d.kpis
  const startId = cases ? starterCaseId(cases) : undefined
  const variants = cases ? cases.filter((c) => c.variantOf).length : 0
  return (
    <PageFrame
      title="법정 운영 현황"
      sub="사건의 흐름과 AI의 작업을 한곳에서 확인하세요."
      actions={
        <>
          <Link to="/records" className={BTN}>감사 장부 보기</Link>
          <IntakeButton />
        </>
      }
    >
      <section className="tribunal-hero" aria-label="TRITON AI 법정 안내">
        <img src="/art/stone-tribunal.png" alt="" className="tribunal-hero-art" />
        <div className="tribunal-hero-copy">
          <h2>기사를 살피고,<br />근거에 따라 판단합니다.</h2>
          <p className="tribunal-hero-description max-w-none!"><b>문제</b> 낚시성 기사(제목이 본문과 다른 기사)를 가려냅니다.<br /><b>방법</b> AI 검사·변호가 근거로 다투고 코드가 인용을 원문과 대조합니다.<br /><b>판결</b> 최종 판결은 사람이 내립니다.<br /><b>근거</b> 모든 판단을 장부에 남겨 AI를 어디까지 믿을 수 있는지 잽니다.</p>
          <div className="tribunal-hero-actions">
            <Link to={startId ? `/court/${startId}` : '/cases'} className="tribunal-hero-primary">예시 사건으로 재판해 보기 <span aria-hidden>↗</span></Link>
            <Link to="/agents" className="tribunal-hero-secondary">AI 작업실 둘러보기 <span aria-hidden>→</span></Link>
          </div>
        </div>
      </section>
      <div className="grid gap-5 min-[1180px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-stone-500">진행 현황</h3>
            <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
              <Kpi label="접수된 사건" value={String(d.cases)} unit="건" note={`지금까지 법정에 올라온 기사 수입니다.${variants ? ` 실험 변형 ${variants}건 제외 (접수처 목록은 ${d.cases + variants}건).` : ''}`} />
              <Kpi label="재판 중" value={String(d.inTrial)} unit="건" note="판사가 아직 최종 판결을 내리지 않은 사건입니다." />
              <Kpi label="확정된 판결" value={String(d.finals)} unit="건" note="사람 판사가 마무리한 사건입니다. 서기 정확도는 이 확정 사건을 기준으로 잽니다." />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-stone-500">AI를 얼마나 믿어도 되는가</h3>
            <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-6 [&>*]:min-[520px]:col-span-3 min-[760px]:[&>*]:col-span-2 min-[760px]:[&>*:nth-child(n+4)]:col-span-3">
              <Kpi sample={k.samples.screening} scope="확정 사건 기준" hit="일치" label="서기 판별 정확도" value={k.screeningAccuracy === null ? '-' : pct(k.screeningAccuracy)} rate={k.screeningAccuracy} good={judge(k.screeningAccuracy, 0.8, 0.6, true)} note="AI 서기의 권고가 정답과 맞은 비율. 낮으면 약식 권고 범위를 좁혀야 합니다." />
              <Kpi sample={k.samples.selfCorrection} scope="공개된 재판 기록 기준" hit="수정" label="자기 수정률" value={k.selfCorrectionRate === null ? '-' : pct(k.selfCorrectionRate)} rate={k.selfCorrectionRate} good={judge(k.selfCorrectionRate, 0.7, 0.4, true)} note="AI가 틀린 근거를 스스로 고쳐 통과시킨 비율. 높을수록 사람 손이 덜 갑니다." />
              <Kpi sample={k.samples.perjury} scope="공개된 재판 기록 기준" hit="위증" label="위증률" value={k.perjuryRate === null ? '-' : pct(k.perjuryRate)} rate={k.perjuryRate} good={judge(k.perjuryRate, 0.05, 0.15, false)} note="위증 = 기사 원문에 없는 문장을 지어내 인용한 것. 그런 근거의 비율이며 낮을수록 믿을 수 있습니다." />
              <Kpi label="사람에게 넘긴 주장" value={String(k.escalations)} unit="건" good={k.escalations === 0 ? 'good' : 'warn'} note="두 번 고쳐도 틀려서 AI가 포기하고 판사에게 넘긴 주장 수. 사람이 꼭 봐야 하는 지점입니다." />
              <Kpi label="사람이 바로잡은 횟수" value={String(k.humanOverrides)} unit="회" note="검증관이 무효로 본 근거를 채택하거나 유효로 본 근거를 기각한 횟수. 사람이 AI 판정을 실제로 통제한다는 증거입니다." />
            </div>
          </div>
          <Decision k={k} policy={policy} />
          <Panel title="지금 작동 중인 작업" aside={d.activeJobs.length ? `${d.activeJobs.length}건 진행` : '대기'}>
            <Jobs jobs={d.activeJobs} />
          </Panel>
        </div>
        <Panel title="최근 활동" aside="AI 작업과 판사 행동" className="self-start">
          {d.recent.length ? (
            <ul className="max-h-[560px] overflow-auto pr-1">{groupActivity(d.recent).map((g) => <ActivityGroup key={g.caseId} caseId={g.caseId} lines={g.lines} />)}</ul>
          ) : (
            <p className="py-6 text-center text-sm text-stone-500">아직 활동이 없습니다.</p>
          )}
        </Panel>
      </div>
    </PageFrame>
  )
}
