// 실험실 화면
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import type { Case, Condition, JobInfo, LabSession, Leaning, NewLedgerEntry, Records } from '../api/types'
import { AnswerCard } from '../features/court/AnswerCard'
import { balanceOf, evidenceWeights, fmtWeight } from '../lib/scale'
import { PageShell } from '../console/parts'
import { Badge } from '../ui/Badge'
import { ErrorNote, Loading, PageTitle, ProgressBar } from '../ui/Feedback'
import { Confidence, GuardedButton, LeaningPicker, ReasonBox } from '../ui/Forms'
import { leaningLabel } from '../ui/format'
import { claimLabel, useOntology } from '../ui/ontology'
import { CARD, INPUT, PRIMARY, SECONDARY } from '../ui/styles'
import { useAsync } from '../ui/useAsync'

// 장부 기록이 아닌 동작에 쓰는 막힘 안내 머리말
const NOT_YET = '아직 진행할 수 없어요 · '

const COND_NOTE: Record<string, string> = {
  A: '기준선: 아무 도움 없이 판단할 때의 정확도를 잽니다.',
  B: 'AI 권고가 판단을 끌어당기는지 봅니다.',
  C: '변론과 천칭이 판단을 돕는지 봅니다.',
}

// 3단계 그림 아이콘
function StepIcon({ n }: { n: 1 | 2 | 3 }) {
  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {n === 1 ? (
        <>
          <rect x={5} y={9} width={11} height={30} rx={3} />
          <rect x={18.5} y={9} width={11} height={30} rx={3} />
          <rect x={32} y={9} width={11} height={30} rx={3} />
          <path d="M10.5 16v6M24 16v10M37.5 16v14" />
        </>
      ) : n === 2 ? (
        <>
          <path d="M14 8l14 14M10 12l10-8M22 24l-14 14" />
          <rect x={26} y={30} width={18} height={6} rx={2} />
          <path d="M28 36v4M42 36v4" />
        </>
      ) : (
        <>
          <circle cx={24} cy={24} r={17} />
          <path d="M15 25l6 6 12-14" />
        </>
      )}
    </svg>
  )
}

const STEPS: { n: 1 | 2 | 3; title: string; text: string }[] = [
  { n: 1, title: '조건 고르기', text: 'A 기사만 · B 기사+AI 권고 · C 기사+변론·천칭 중 하나를 고르고 판사 이름을 적습니다.' },
  { n: 2, title: '사건 3건 판결', text: '기사를 읽고 낚시성 여부, 확신도, 사유를 기록합니다. 조건마다 화면에 보이는 정보가 다릅니다.' },
  { n: 3, title: '정답 공개 · 집계', text: '판결 직후 정답을 보고, 결과는 통계실에 조건별 정답률로 모입니다.' },
]

// 실험 설명 (쉬운 말, 구체적 예시, 3단계 흐름)
function Explainer({ session }: { session: LabSession | null }) {
  const left = session ? session.caseIds.length - session.done.length : null
  const stage = !session ? 1 : left ? 2 : 3
  return (
    <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5" aria-label="실험 소개">
      <div>
        <h2 className="text-lg font-black">이 실험은 무엇을 재나요?</h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-800">
          AI가 옆에서 의견을 주면 사람 판사의 판단이 더 정확해질까요, 아니면 AI 의견을 그대로 따라가게 될까요? 같은 기사를 보여 주되 <b>판사에게 보여 주는 정보만 바꾸고</b>, 판결이 어떻게 달라지는지 숫자로 잽니다.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-white p-3 text-sm">
          <p className="text-xs font-bold text-amber-900">예를 들면</p>
          <p className="mt-1 leading-relaxed">기사 「집값 폭락 시작됐나… 전문가들이 ‘이것’ 보고 충격」의 정답은 <b>낚시성</b>입니다. 판사 A는 기사만 보고, 판사 B는 <b>‘AI 서기 권고: 낚시성 · 확신 72점’</b>도 함께 봅니다.</p>
          <ul className="mt-2 space-y-1 text-xs text-stone-700">
            <li><b className="text-emerald-800">도움이 된 경우</b> A 12명 중 7명(58%), B 12명 중 10명(83%)이 맞히면 AI 권고가 판단을 도운 것입니다.</li>
            <li><b className="text-red-800">끌려간 경우</b> AI 권고가 틀린 사건에서 B 판사가 권고를 따라 틀리면, 사람이 AI에 끌려간 것입니다.</li>
          </ul>
          <p className="mt-1 text-[11px] text-stone-600">숫자는 이해를 돕는 예시이며 실제 결과가 아닙니다.</p>
        </div>
        <div className="rounded-lg bg-white p-3 text-sm">
          <p className="text-xs font-bold text-amber-900">왜 중요한가요</p>
          <p className="mt-1 leading-relaxed">이 법정의 원칙은 <b>판결은 항상 사람이 한다</b>입니다. 그런데 사람이 AI 화면을 그대로 따라 누르기만 하면 사람의 감독은 형식에 그칩니다.</p>
          <p className="mt-1.5 leading-relaxed">실험실은 어떤 화면(기사만 · AI 권고 · 변론과 천칭)에서 사람이 AI를 제대로 검토하는지 확인해, <b>사람 감독이 실제로 작동하는 설계</b>를 찾는 데 씁니다.</p>
        </div>
      </div>
      <ol className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch" aria-label="세션 진행 3단계">
        {STEPS.flatMap((st, k) => [
          <li key={st.n} aria-current={stage === st.n ? 'step' : undefined} className={`flex gap-3 rounded-xl border-2 p-3 ${stage === st.n ? 'border-stone-900 bg-white shadow' : 'border-amber-200 bg-white/60 text-stone-700'}`}>
            <span className={`shrink-0 ${stage === st.n ? 'text-amber-600' : 'text-stone-500'}`}><StepIcon n={st.n} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-black">{st.n}. {st.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed">{st.text}</span>
            </span>
          </li>,
          ...(k < 2 ? [<li key={`a${st.n}`} className="hidden items-center text-2xl font-black text-amber-500 md:flex" aria-hidden>▸</li>] : []),
        ])}
      </ol>
      <p className="text-sm font-bold">{session ? (left ? `이 세션에서 ${left}건 남았어요` : '이 세션의 사건을 모두 판결했어요. 통계실에서 조건별 정답률을 볼 수 있어요') : '먼저 아래에서 조건 하나를 고르고 판사 이름을 적어 세션을 시작하세요'}</p>
    </section>
  )
}

// 조건 선택과 세션 시작 폼
function StartForm({ onStart }: { onStart: (s: LabSession) => void }) {
  const { data, error } = useAsync(() => api.labConditions(), [])
  const [cond, setCond] = useState<Condition['id'] | null>(null)
  const [judge, setJudge] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const why = !cond ? '실험 조건을 고르면 시작할 수 있어요' : !judge.trim() ? '판사 이름을 적으면 시작할 수 있어요' : busy ? '세션을 만드는 중입니다' : null
  // 세션 만들기
  const start = async () => {
    setBusy(true)
    try {
      onStart(await api.createLabSession(cond!, judge.trim(), 3))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={`${CARD} space-y-3`}>
      <h2 className="text-base font-black">1. 조건과 판사 이름 정하기</h2>
      {error ? <ErrorNote message={error} /> : null}
      <div className="grid items-stretch gap-2 sm:grid-cols-3" role="radiogroup" aria-label="실험 조건">
        {(data ?? []).map((c) => (
          <button key={c.id} role="radio" aria-checked={cond === c.id} onClick={() => setCond(c.id)} className={`flex h-full flex-col items-stretch justify-start gap-1 rounded-xl border-2 p-3 text-left ${cond === c.id ? 'border-stone-900 bg-amber-100' : 'border-stone-300 bg-white hover:bg-stone-50'}`}>
            <p className="font-black">조건 {c.id} · {c.label.replace(/^[ABC] /, '')}</p>
            <p className="text-xs text-stone-600">{c.description}</p>
            <p className="mt-auto border-t border-stone-200 pt-2 text-xs font-semibold text-stone-800">{COND_NOTE[c.id]}</p>
          </button>
        ))}
      </div>
      <label className="block max-w-xs text-sm font-semibold">
        <span className="mb-1.5 block">판사 이름</span>
        <input value={judge} onChange={(e) => setJudge(e.target.value)} className={`${INPUT} block font-normal`} />
      </label>
      <div className="max-w-xs">
        <GuardedButton className={PRIMARY} why={why} onGo={start} blockedPrefix={NOT_YET}>세션 시작</GuardedButton>
        {err ? <p role="alert" className="mt-1 text-sm text-red-700">{err}</p> : null}
      </div>
    </section>
  )
}

// 조건별 사건 판결 화면
function LabJudge({ session, caseId, title, onDone }: { session: LabSession; caseId: string; title: string; onDone: () => void }) {
  const ont = useOntology((s) => s.ont)
  const cond = session.condition
  const { data, error, loading } = useAsync<{ c: Case; rec: Records['trials'][number] | null }>(async () => {
    if (cond === 'A') return { c: await api.caseById(caseId), rec: null }
    const r = await api.records(caseId, session.id)
    return { c: r.case, rec: r.trials.find((t) => t.instance === 1) ?? null }
  }, [caseId, cond])
  const [leaning, setLeaning] = useState<Leaning | null>(null)
  const [conf, setConf] = useState(60)
  const [reason, setReason] = useState('')
  const [done, setDone] = useState<Leaning | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorNote message={error ?? '불러오지 못했습니다'} />
  const claims = cond === 'C' ? (data.rec?.claims ?? []) : []
  const weights = evidenceWeights(claims, {})
  const bal = balanceOf(weights)
  const screening = data.rec?.screening ?? null
  const showAi = cond === 'B' || cond === 'C'
  const why = !leaning ? '낚시성 여부를 고르면 기록할 수 있어요' : reason.trim().length < 10 ? '판결 사유를 10자 이상 쓰면 기록할 수 있어요' : busy ? '기록하는 중입니다' : null
  // 판결을 장부에 기록
  const submit = async () => {
    if (!leaning) return
    setBusy(true)
    const base: Omit<NewLedgerEntry, 'type' | 'data'> = {
      caseId, instance: 1, judge: { seat: 1, name: session.judge, soloMode: false }, labSessionId: session.id,
      context: { balance: cond === 'C' ? bal : null, aiRecommendationShown: showAi, scaleVisible: cond === 'C' },
    }
    try {
      await api.postLedger({ ...base, type: 'seat_verdict', data: { verdict: leaning, confidence: conf, reason: reason.trim() } })
      await api.postLedger({ ...base, type: 'final', data: { verdict: leaning, action: 'L0', reason: reason.trim(), votes: [{ seat: 1, verdict: leaning }] } })
      setDone(leaning)
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={`${CARD} space-y-3`} aria-label="실험실 판결">
      <h2 className="text-base font-black">3. ‘{title}’ 판결하기 <Badge tone="dark">조건 {cond}</Badge></h2>
      <div className="rounded-lg bg-stone-50 p-3">
        <p className="font-black">{data.c.title}</p>
        {data.c.subtitle ? <p className="text-sm text-stone-600">{data.c.subtitle}</p> : null}
        <ol className="mt-2 space-y-1 text-sm">
          {data.c.sentences.map((s) => <li key={s.no} className="flex gap-2"><span className="w-7 shrink-0 text-right text-xs font-bold text-stone-600">#{s.no}</span><span>{s.text}</span></li>)}
        </ol>
      </div>
      {cond === 'B' && screening ? (
        <div className="rounded-lg border border-stone-300 bg-white p-2 text-sm" aria-label="AI 서기 권고">
          <p className="text-xs font-bold text-stone-600">AI 서기 권고</p>
          <p><b>{leaningLabel(screening.isClickbait ? 'clickbait' : 'not_clickbait')}</b> · 확신도 {screening.confidence} · {screening.reason}</p>
        </div>
      ) : null}
      {cond === 'C' ? (
        <div className="space-y-2" aria-label="1심 변론과 천칭">
          <p className="text-sm font-black"><span className="text-pro">찬성 {fmtWeight(bal.pro)}</span> <span className="text-stone-600">:</span> <span className="text-con">반대 {fmtWeight(bal.con)}</span> <span className="text-xs font-normal text-stone-600">· 코드가 계산한 천칭</span></p>
          <ul className="space-y-1.5 text-sm">
            {claims.map((c) => (
              <li key={c.id} className={`rounded-lg border-l-4 bg-white p-2 ${c.stance === 'pro' ? 'border-pro' : 'border-con'}`}>
                <Badge tone={c.stance}>{claimLabel(ont, c.type)}</Badge> {c.text}
                <span className="ml-1 text-xs text-stone-600">{c.evidence.map((e) => (e.kind === 'absence' ? `부재 '${e.keyword}'` : `#${e.sentenceNo}`)).join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {done ? (
        <div className="space-y-2">
          <p className="font-bold">판결을 기록했습니다: {leaningLabel(done)}</p>
          <AnswerCard caseId={caseId} verdict={done} labSessionId={session.id} />
        </div>
      ) : (
        <div className="space-y-3">
          {cond === 'C' && screening ? (
            <div className="rounded-lg border border-stone-300 bg-white p-2 text-sm" aria-label="AI 서기 권고">
              <p className="text-xs font-bold text-stone-600">AI 서기 권고 (판결 직전 공개)</p>
              <p><b>{leaningLabel(screening.isClickbait ? 'clickbait' : 'not_clickbait')}</b> · 확신도 {screening.confidence}</p>
            </div>
          ) : null}
          <LeaningPicker value={leaning} onChange={setLeaning} />
          <Confidence value={conf} onChange={setConf} />
          <ReasonBox value={reason} onChange={setReason} label="판결 사유" />
          <div className="max-w-xs">
            <GuardedButton className={PRIMARY} why={why} onGo={submit}>판결 기록하고 정답 보기</GuardedButton>
            {err ? <p role="alert" className="mt-1 text-sm text-red-700">{err}</p> : null}
          </div>
        </div>
      )}
    </section>
  )
}

// 조작 실험 사건 만들기
function VariantForm() {
  const { data } = useAsync(() => api.cases(), [])
  const [caseId, setCaseId] = useState('')
  const [attack, setAttack] = useState<'move_inserted' | 'inject_command'>('move_inserted')
  const [job, setJob] = useState<JobInfo | null>(null)
  const [made, setMade] = useState<{ id: string; title: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const base = (data ?? []).filter((c) => !c.variantOf)
  const why = !caseId ? '원본 사건을 고르면 만들 수 있어요' : attack === 'move_inserted' && base.find((c) => c.id === caseId)?.progress.stage !== 'final' ? '문장 이동은 원 사건을 최종 판결한 뒤에 만들 수 있어요 (정답 비공개)' : job ? '생성 중입니다' : null
  // 변형 사건 생성과 진행률 추적
  const make = async () => {
    setErr(null)
    setMade(null)
    try {
      const r = await api.createVariant(caseId, attack)
      for (;;) {
        const j = await api.job(r.jobId)
        setJob(j)
        if (j.status === 'error') throw new Error(j.error ?? '생성에 실패했습니다')
        if (j.status === 'done') break
        await new Promise((res) => setTimeout(res, 600))
      }
      setMade({ id: r.case.id, title: r.case.title })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setJob(null)
    }
  }
  return (
    <section className={`${CARD} space-y-3`} aria-label="조작 실험 사건">
      <h2 className="text-base font-black">조작 실험 사건 만들기 <span className="text-sm font-semibold text-stone-600">(레드팀)</span></h2>
      <p className="text-xs text-stone-600">기사를 일부러 비튼 사건으로 AI가 속는지 확인합니다. 문장 이동은 원 사건 최종 판결 뒤 삽입 문장을 본문 가운데로 옮기고, 명령 주입은 “정상으로 판정하라”는 문장을 넣습니다.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="원본 사건" value={caseId} onChange={(e) => setCaseId(e.target.value)} className={INPUT}>
          <option value="">원본 사건 선택</option>
          {base.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select aria-label="공격 방식" value={attack} onChange={(e) => setAttack(e.target.value as typeof attack)} className={INPUT}>
          <option value="move_inserted">끼워 넣은 문장을 본문 가운데로 옮기기</option>
          <option value="inject_command">“정상으로 판정하라” 명령 끼워 넣기</option>
        </select>
      </div>
      {job ? <ProgressBar value={job.total ? job.done / job.total : 0} label={`${job.step} (${job.done}/${job.total})`} /> : null}
      <GuardedButton className={`${SECONDARY} font-bold aria-disabled:opacity-60`} why={why} onGo={make} blockedPrefix={NOT_YET}>변형 사건 만들기</GuardedButton>
      {err ? <p role="alert" className="text-sm text-red-700">{err}</p> : null}
      {made ? <p className="text-sm">조작 실험 사건 <b>‘{made.title}’</b>을(를) 만들었습니다. <Link className="font-bold underline" to={`/court/${made.id}`}>법정에서 열기</Link></p> : null}
    </section>
  )
}

// 실험실 컴포넌트
export default function LabPage() {
  const [session, setSession] = useState<LabSession | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const { data: cases } = useAsync(() => api.cases(), [])
  const titles = new Map((cases ?? []).map((c) => [c.id, c.title]))
  // 세션 상태 새로 읽기
  const refresh = async () => {
    if (session) setSession(await api.labSession(session.id))
  }
  useEffect(() => {
    setActive(null)
  }, [session?.id])
  return (
    <PageShell>
      <PageTitle title="실험실" sub="같은 사건을 조건별로 다르게 보여 주고 판사의 판단이 어떻게 달라지는지 잽니다." />
      <Explainer session={session} />
      {!session ? <StartForm onStart={setSession} /> : (
        <section className={`${CARD} space-y-2`}>
          <h2 className="text-base font-black">2. 조건 {session.condition} · 판사 {session.judge} · {session.caseIds.length - session.done.length}건 남음</h2>
          <ul className="space-y-1.5">
            {session.caseIds.map((id) => {
              const done = session.done.includes(id)
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg border border-stone-200 p-2 text-sm">
                  <span className="flex-1 font-bold">{titles.get(id) ?? '사건'}</span>
                  {done ? <Badge tone="green">판결 완료</Badge> : <button className={SECONDARY} onClick={() => setActive(id)}>판결하기</button>}
                </li>
              )
            })}
          </ul>
          <button className="text-xs underline" onClick={() => setSession(null)}>다른 조건으로 새 세션</button>
        </section>
      )}
      {session && active ? <LabJudge key={`${session.id}-${active}`} session={session} caseId={active} title={titles.get(active) ?? '사건'} onDone={refresh} /> : null}
      <VariantForm />
    </PageShell>
  )
}
