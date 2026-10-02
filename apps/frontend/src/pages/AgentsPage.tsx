// 에이전트 작업실 화면
import { Link } from 'react-router'
import { api } from '../api/client'
import type { AgentProfile } from '../api/types'
import { Meter, PageFrame, PANEL } from '../console/parts'
import { OfficeMap, ROOMS } from '../console/office/OfficeMap'
import { usePoll } from '../console/usePoll'
import { ErrorNote, Loading } from '../ui/Feedback'
import { pct } from '../ui/format'

// 지표가 없을 때 대시 표시
const dash = (v: number | null, f: (n: number) => string) => (v === null ? '-' : f(v))

// 방 카드 하나
function RoomCard({ a }: { a: AgentProfile }) {
  const spec = ROOMS.find((r) => r.role === a.role)!
  const people = a.role === 'checker' ? '코드 1대' : `${spec.seats}명`
  return (
    <li className={`${PANEL} flex flex-col p-3.5`}>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: spec.accent }} aria-hidden />
        <h3 className="text-[14px] font-black">{a.room}</h3>
        {a.working ? <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />작업 중</span> : <span className="ml-auto text-[10.5px] font-semibold text-stone-400">대기</span>}
      </div>
      <p className="mt-2 text-[12.5px] font-semibold tabular-nums text-stone-700">
        {people} <span className="text-stone-300">·</span> 업무 {a.queued} <span className="text-stone-300">·</span> 진행 {a.working ? 1 : 0} <span className="text-stone-300">·</span> 확인 {a.totals.tasks}
      </p>
      <div className="mt-2 min-h-[38px] text-[12px] leading-snug">
        {a.working ? (
          <>
            <p className="font-semibold text-stone-800">{a.label.replace('(코드)', '')} · {a.working.text}</p>
            <Link to={`/court/${a.working.caseId}`} className="mt-0.5 inline-block font-bold text-amber-700 underline underline-offset-2">{a.working.caseId} 법정 보기 →</Link>
          </>
        ) : (
          <p className="text-stone-400">맡은 일이 없어 쉬는 중입니다.</p>
        )}
      </div>
    </li>
  )
}

// 에이전트 신뢰도 카드 하나
function AgentCard({ a }: { a: AgentProfile }) {
  const t = a.totals
  const spec = ROOMS.find((r) => r.role === a.role)!
  const verified = t.evidence ? t.verified / t.evidence : null
  const perjury = t.evidence ? t.perjury / t.evidence : null
  const avg = t.tasks ? t.seconds / t.tasks : null
  return (
    <li className={`${PANEL} overflow-hidden`}>
      <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3" style={{ background: `${spec.accent}0d` }}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-black text-white" style={{ background: spec.accent }} aria-hidden>{a.role === 'checker' ? '코드' : 'AI'}</span>
        <div className="min-w-0">
          <h3 className="truncate text-[14.5px] font-black">{a.label}</h3>
          <p className="text-[11.5px] text-stone-500">{a.room}</p>
        </div>
        <span className="ml-auto whitespace-nowrap rounded-md bg-white px-2 py-1 font-mono text-[11px] font-semibold text-stone-600 ring-1 ring-stone-200" title="역할 정의(agents/)와 버전">
          {a.skill ? `${a.skill} v${a.skillVersion}` : '코드 (스킬 없음)'}
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <div className="flex items-baseline justify-between text-xs"><span className="font-bold text-stone-600">근거 확인율</span><span className="text-base font-black tabular-nums">{dash(verified, pct)}</span></div>
          <div className="mt-1.5"><Meter value={verified ?? 0} tone="bg-emerald-500" label={`${a.label} 근거 확인율`} /></div>
        </div>
        <dl className="grid grid-cols-4 gap-2 text-center">
          {[
            ['위증률 (지어낸 인용)', dash(perjury, pct), perjury !== null && perjury > 0.1 ? 'text-red-700' : 'text-stone-900'],
            ['고쳐 쓴 횟수', String(t.revisions), 'text-stone-900'],
            ['사람에게 넘긴 주장', String(t.escalations), t.escalations ? 'text-amber-700' : 'text-stone-900'],
            ['평균 소요', dash(avg, (n) => `${n.toFixed(1)}초`), 'text-stone-900'],
          ].map(([k, v, c]) => (
            <div key={k} className="rounded-lg bg-stone-50 px-1 py-2">
              <dt className="text-[10.5px] font-semibold leading-tight text-stone-500">{k}</dt>
              <dd className={`mt-1 text-[15px] font-black tabular-nums ${c}`}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11.5px] leading-snug text-stone-500">위증률은 낸 근거 중 기사에 없는 문장을 지어낸 비율입니다.</p>
        <p className="text-[11.5px] text-stone-500">처리한 일 {t.tasks}건 · 낸 근거 {t.evidence}개</p>
      </div>
    </li>
  )
}

// 작업실 컴포넌트
export default function AgentsPage() {
  const { data, error } = usePoll(() => api.agents(), 1500)
  if (!data) return error ? <ErrorNote message={error} /> : <Loading />
  const busy = data.filter((a) => a.working).length
  return (
    <PageFrame title="AI 작업실" sub="재판 준비에 투입된 AI 에이전트가 방마다 일하는 모습입니다. 일하는 에이전트를 누르면 그 사건의 법정으로 이동합니다.">
      <section className={`${PANEL} overflow-hidden`} aria-label="사무실 지도">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3 text-xs">
          <span className="font-bold text-stone-700">{busy ? `지금 ${busy}개 방에서 작업 중` : '모든 방이 대기 중'}</span>
          <span className="hidden text-stone-500 min-[900px]:inline">AI 배지가 달린 인물이 에이전트입니다 · 판결은 사람 판사만 합니다</span>
          <span className="text-stone-400 min-[900px]:hidden">좌우로 밀어서 보기</span>
        </div>
        <div className="overflow-x-auto bg-gradient-to-b from-white to-stone-50"><OfficeMap agents={data} /></div>
      </section>
      <ul className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 min-[900px]:grid-cols-3" aria-label="방별 현황">
        {data.map((a) => <RoomCard key={a.role} a={a} />)}
      </ul>
      <div>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-stone-500">에이전트별 신뢰도</h3>
        <ul className="grid grid-cols-1 gap-3 min-[760px]:grid-cols-2 min-[1300px]:grid-cols-3">
          {data.map((a) => <AgentCard key={a.role} a={a} />)}
        </ul>
      </div>
    </PageFrame>
  )
}
