// 공개된 주장·근거 카드
import './court.css'
import { useEffect, useRef } from 'react'
import type { Agent, Claim, Ruling, Stance } from '../../api/types'
import { evidenceName } from '../../lib/names'
import { fmtWeight, type WeightItem } from '../../lib/scale'
import { Badge, StatusBadge } from '../../ui/Badge'
import { claimLabel, specialtyLabel, useOntology } from '../../ui/ontology'
import { HearingBar } from './ActionPanel'
import { useCourt } from './store'
import { useCourtView } from './view'

const GROUPS: { stance: Stance; title: string; head: string }[] = [
  { stance: 'pro', title: '찬성 · 낚시성이다', head: 'text-pro' },
  { stance: 'con', title: '반대 · 낚시성 아니다', head: 'text-con' },
]

// 근거 무게 칩
function WeightChip({ w }: { w: WeightItem }) {
  if (w.fate === 'void') {
    const why = w.voidReason === 'struck' ? '기각됨' : w.voidReason === 'perjury' ? '위증으로 무효' : '증거 아님'
    return <Badge tone="gray" title={w.voidReason === 'perjury' ? '위증 의심 근거가 있어 이 주장의 모든 근거가 무효입니다' : why}>무효 ✕ {why}</Badge>
  }
  if (w.fate === 'challenged') return <Badge tone="gray" title="판사가 반박을 채택하기 전에는 무게가 그대로입니다">무게 {fmtWeight(w.weight)} · 이의 제기됨 · 판사가 반박을 채택하면 절반</Badge>
  if (w.fate === 'halved') return <Badge tone="amber" title="판사가 반박을 채택했습니다">무게 {fmtWeight(w.weight)} · 반박 채택으로 절반</Badge>
  return <Badge tone={w.stance} title="천칭에 올라간 무게">무게 {fmtWeight(w.weight)}</Badge>
}

interface RowProps { w: WeightItem; canRule: boolean; lockReason: string | null; focused: boolean; pending: boolean }

// 근거 한 줄
function EvidenceRow({ w, canRule, lockReason, focused, pending }: RowProps) {
  const ref = useRef<HTMLLIElement>(null)
  const setFocus = useCourt((s) => s.setFocus)
  const rule = useCourt((s) => s.rule)
  const busy = useCourt((s) => s.busy)
  const e = w.evidence
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focused])
  // 같은 결정을 다시 누르면 취소
  const toggle = (r: Ruling) => rule(e.id, w.ruled === r ? null : r)
  return (
    <li ref={ref} className={`rounded-lg border bg-white p-2 text-sm ${focused ? 'border-amber-500 ring-2 ring-amber-300' : 'border-stone-200'} ${pending ? 'border-l-4 border-l-amber-500 bg-amber-50/60' : ''}`}>
      <button onClick={() => setFocus(focused ? null : e.id)} className="block w-full text-left" title={e.id} aria-label="이 근거를 원문에서 보기">
        <span className="mr-2 inline-block rounded bg-stone-800 px-1.5 py-0.5 text-xs font-bold text-white">{e.kind === 'absence' ? '부재' : e.status === 'title' || !e.sentenceNo ? '제목 인용' : `#${e.sentenceNo}`}</span>
        <span className={w.fate === 'void' ? 'text-stone-600' : ''}>{e.kind === 'absence' ? `핵심어 '${e.keyword}'가 본문에 없음` : `“${e.quote}”`}</span>
        {e.status === 'misnumbered' && e.foundIn ? <span className="ml-1 text-xs text-amber-800">(실제 위치 #{e.foundIn})</span> : null}
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {pending ? <Badge tone="amber" title="검증에 실패한 근거라 판사가 채택 또는 기각을 정해야 합니다">판정 필요</Badge> : null}
        <StatusBadge status={e.status} kind={e.kind} />
        <WeightChip w={w} />
        {canRule ? (
          <span className="ml-auto flex gap-2" role="group" aria-label="판사 결정">
            {(['admitted', 'struck'] as Ruling[]).map((r) => (
              <button
                key={r}
                disabled={busy}
                aria-pressed={w.ruled === r}
                onClick={() => toggle(r)}
                className={`min-h-11 rounded-md border px-3 text-xs md:min-h-0 md:px-2 md:py-0.5 ${w.ruled === r ? (r === 'admitted' ? 'border-emerald-700 bg-emerald-600 font-bold text-white' : 'border-2 border-stone-800 bg-stone-100 font-bold text-stone-900') : pending ? 'border-amber-600 bg-white font-bold text-stone-800 hover:bg-amber-100' : 'border-stone-200 bg-white font-medium text-stone-600 hover:bg-stone-100'}`}
              >
                {r === 'admitted' ? '채택' : '기각'}
              </button>
            ))}
          </span>
        ) : lockReason ? <span className="ml-auto text-xs text-stone-600">{lockReason}</span> : null}
      </div>
    </li>
  )
}

interface CardProps { claim: Claim; agent: Agent | undefined; all: Claim[]; bench: Agent[]; pendingIds: Set<string>; weights: WeightItem[]; canRule: boolean; lockReason: string | null; fresh: boolean; focus: string | null }

// 주장 카드
function ClaimCard({ claim, agent, all, bench, pendingIds, weights, canRule, lockReason, fresh, focus }: CardProps) {
  const ont = useOntology((s) => s.ont)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (fresh && window.matchMedia('(min-width: 1024px)').matches) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [fresh])
  const spec = specialtyLabel(ont, agent?.specialty ?? null)
  const setFocus = useCourt((s) => s.setFocus)
  return (
    <article ref={ref} className={`court-claim-in rounded-xl border bg-white p-3 shadow-sm ${claim.escalated ? 'border-red-300' : 'border-stone-200'} ${fresh ? 'ring-2 ring-amber-400' : ''}`}>
      <header className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`font-bold ${agent?.side === 'prosecution' ? 'text-pro' : agent?.side === 'defense' ? 'text-con' : 'text-emerald-700'}`}>{agent?.name ?? claim.agentId}</span>
        {spec ? <span className="text-stone-600">전문 {spec}</span> : null}
        <Badge tone={claim.stance}>{claimLabel(ont, claim.type)}</Badge>
        <span className="ml-auto text-stone-600" title="주장 강도">강도 {'●'.repeat(claim.strength)}{'○'.repeat(3 - claim.strength)}</span>
        {fresh ? <Badge tone="amber">방금 공개</Badge> : null}
      </header>
      {claim.escalated || claim.revisions > 0 ? (
        <p className="mt-1.5 flex flex-wrap gap-1.5">
          {claim.revisions > 0 ? <Badge tone="gray" title="에이전트가 검증관 지적을 받아 스스로 고쳐 쓴 횟수">{claim.revisions}번 고쳐 씀</Badge> : null}
          {claim.escalated ? <Badge tone="red" title="두 번 고쳐도 근거 문제가 남아 그대로 제출했습니다. 판사가 근거를 직접 확인하세요.">자기 수정 실패 · 판사 확인 필요</Badge> : null}
        </p>
      ) : null}
      <p className="mt-1.5 text-sm font-medium">{claim.text}</p>
      {claim.rebuts ? <p className="mt-1 text-xs text-stone-600">↳ 반박 대상: <button type="button" title={claim.rebuts} onClick={() => setFocus(claim.rebuts)} className="font-bold underline decoration-dotted hover:text-stone-900">{evidenceName(all, bench, claim.rebuts)}</button></p> : null}
      <ul className="mt-2 space-y-1.5">
        {weights.map((w) => (
          <EvidenceRow key={w.evidenceId} w={w} canRule={canRule} lockReason={lockReason} focused={focus === w.evidenceId} pending={pendingIds.has(w.evidenceId)} />
        ))}
      </ul>
    </article>
  )
}

// 주장 패널 컴포넌트
export function ClaimsPanel() {
  const v = useCourtView()
  const focus = useCourt((s) => s.focus)
  if (!v) return null
  const { canRule, rulingLockReason: lockReason } = v
  const lastId = v.live && v.phase === 'hearing' ? v.shown.at(-1)?.id : undefined
  const agents = v.rec?.bench ?? []
  const pendingIds = new Set(canRule ? v.pendingRulings : [])
  return (
    <section id="sec-claims" aria-label="공개된 주장" className="rounded-xl">
      <h2 className="mb-2 text-sm font-black text-stone-700">변론 {v.shown.length}개 공개{v.writing ? ' · AI 작성 중' : ` / ${v.total}`}</h2>
      <HearingBar />
      {v.hidden ? <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-600">첫인상을 기록하기 전에는 변론이 가려져 있습니다. AI 작업 상태는 실행 기록에서 확인할 수 있습니다.</p> : null}
      <div className="space-y-3">
        {GROUPS.map((g) => {
          const list = v.shown.filter((c) => c.stance === g.stance)
          return (
            <div key={g.stance}>
              <h3 className={`mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-black ${g.head}`}>
                {g.title}
                <span className="text-xs font-normal text-stone-600">주장 {list.length} · 무게 {fmtWeight(v.balance[g.stance])}</span>
              </h3>
              <div className="space-y-2">
                {list.length ? (
                  list.map((c) => (
                    <ClaimCard key={c.id} claim={c} agent={agents.find((a) => a.id === c.agentId)} all={v.shown} bench={agents} pendingIds={pendingIds} weights={v.weights.filter((w) => w.claimId === c.id)} canRule={canRule} lockReason={lockReason} fresh={c.id === lastId} focus={focus} />
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed border-stone-300 p-3 text-xs text-stone-600">아직 이 쪽 주장이 공개되지 않았습니다.</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
