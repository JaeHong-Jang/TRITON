// 운영 콘솔 모의 응답 (대시보드 · 작업실 · 정책 · 접수 검토)
import { ApiError } from '../error'
import type { ActivityItem, AgentProfile, AgentRole, Dashboard, JobInfo, LedgerEntry, Policy } from '../types'
import { mockState } from './handlers'

let policy: Policy = { summaryEnabled: true, summaryThreshold: 85, highRiskCategories: ['정치', '사회'] }
let intakeSeq = 0

// 작업실 역할 목록
const ROLES: { role: AgentRole; label: string; room: string; skill: string | null; version: string | null; lines: string[] }[] = [
  { role: 'clerk', label: '서기', room: '서기실', skill: 'clerk', version: '2.2', lines: ['기사 제목과 본문 읽는 중', '제목 핵심어가 본문에 있는지 확인 중', '낚시성 권고 작성 중'] },
  { role: 'prosecution', label: '검사', room: '검사실', skill: 'prosecutor', version: '2.1', lines: ['15번 문장 확인 중', '제목 핵심어 본문에서 찾는 중', '무관한 문장 후보 비교 중', '위증 의심 1건 → 다시 작성'] },
  { role: 'defense', label: '변호인', room: '변호인실', skill: 'defense', version: '2.1', lines: ['4번 문장 원문 확인 중', '제목 표현과 본문 사실 대조 중', '주장 초안 작성 중'] },
  { role: 'cross', label: '반대신문', room: '반대신문실', skill: 'cross-examination', version: '1.1', lines: ['상대 근거 고르는 중', '겨냥한 문장 원문 확인 중', '반박 초안 작성 중'] },
  { role: 'officer', label: '재판연구관', room: '재판연구관실', skill: 'research-officer', version: '1.0', lines: ['하급심 기록 집계 중', '위증 의심 근거 모으는 중', '보고서 작성 중'] },
  { role: 'checker', label: '증거 검증관(코드)', room: '증거 검증실', skill: null, version: null, lines: ['인용을 원문과 대조 중', '문장 번호 맞는지 확인 중'] },
]

// 작업 단계 문구가 맡는 역할
function roleOfStep(jobId: string, step: string): AgentRole | null {
  if (jobId.startsWith('intake-')) return 'clerk'
  if (step.includes('검증관')) return 'checker'
  if (step.includes('반대신문')) return 'cross'
  if (step.includes('재판연구관')) return 'officer'
  if (step.includes('검사')) return 'prosecution'
  if (step.includes('변호인')) return 'defense'
  return null
}

// 진행 중인 작업과 지금 단계
function activeJobs() {
  const { jobs, jobInfo } = mockState()
  return [...jobs.values()]
    .map((j) => ({ j, info: jobInfo(j) }))
    .filter(({ info }) => info.status === 'queued' || info.status === 'running')
}

// 지금 일하는 역할과 남은 업무 수
function workload(): { doing: Map<AgentRole, NonNullable<AgentProfile['working']>>; pending: Map<AgentRole, number> } {
  const doing = new Map<AgentRole, NonNullable<AgentProfile['working']>>()
  const pending = new Map<AgentRole, number>()
  for (const { j, info } of activeJobs()) {
    const rec = j.rec
    if (!rec || !j.offsets) {
      const idx = Math.min(info.done, j.steps.length - 1)
      const here = roleOfStep(j.id, j.steps[idx] ?? '')
      const lines = ROLES.find((r) => r.role === here)?.lines ?? []
      if (here && !doing.has(here)) doing.set(here, { caseId: j.caseId, instance: j.id.startsWith('intake-') ? 0 : j.instance, text: lines[(info.done + j.caseId.length) % lines.length] })
      for (const st of j.steps.slice(idx + 1)) {
        const r = roleOfStep(j.id, st)
        if (r) pending.set(r, (pending.get(r) ?? 0) + 1)
      }
      continue
    }
    const elapsed = Date.now() - j.startedAt
    const shown = rec.trace.filter((_, k) => j.offsets![k] <= elapsed)
    const claimRole = (c: { agentId: string; type: string }): AgentRole => {
      const side = rec.bench.find((a) => a.id === c.agentId)?.side
      return c.type === 'rebuttal' ? 'cross' : side === 'officer' ? 'officer' : side === 'defense' ? 'defense' : 'prosecution'
    }
    const done = new Set(shown.filter((e) => (e.kind === 'submit' || e.kind === 'escalate') && e.claimId).map((e) => e.claimId))
    for (const c of rec.claims) if (!done.has(c.id)) pending.set(claimRole(c), (pending.get(claimRole(c)) ?? 0) + 1)
    const latest = new Map<string, (typeof shown)[number]>()
    for (const e of shown) latest.set(e.agentId, e)
    for (const [agentId, e] of latest) {
      if (e.kind === 'submit' || e.kind === 'escalate' || e.kind === 'done') continue
      const next = rec.trace.find((x) => x.seq >= e.seq && x.agentId === agentId && x.claimId)
      const claim = rec.claims.find((c) => c.id === next?.claimId)
      const role: AgentRole = agentId === 'checker' ? 'checker' : claim ? claimRole(claim) : rec.bench.find((a) => a.id === agentId)?.side === 'officer' ? 'officer' : 'prosecution'
      if (!doing.has(role)) doing.set(role, { caseId: j.caseId, instance: j.instance, text: e.text })
    }
  }
  return { doing, pending }
}

// 작업 정보에서 이벤트와 중간 기록 떼기
function brief(i: JobInfo): Dashboard['activeJobs'][number] {
  return { id: i.id, caseId: i.caseId, instance: i.instance, status: i.status, step: i.step, done: i.done, total: i.total, error: i.error, startedAt: i.startedAt ?? null }
}

// 장부 기록 한 줄 설명
function describe(e: LedgerEntry): string {
  const who = e.judge.name
  const labels: Record<LedgerEntry['type'], string> = {
    first_impression: '첫인상을 기록했습니다',
    reveal: '변론을 열람했습니다',
    evidence_ruling: e.data.ruling === 'struck' ? '근거를 기각했습니다' : '근거를 채택했습니다',
    seat_verdict: '판사석 판결을 냈습니다',
    appeal: '항소했습니다',
    final: '최종 판결을 확정했습니다',
  }
  return `${who} 판사가 ${labels[e.type]}`
}

// 공개된 재판 기록 목록
function released() {
  const now = Date.now()
  return [...mockState().trials.entries()].flatMap(([caseId, m]) => [...m.values()].filter((t) => t.visibleAt <= now).map(({ rec }) => ({ caseId, rec })))
}

// 모의 역할별 집계
function totalsOf(role: AgentRole): AgentProfile['totals'] {
  const { defs } = mockState()
  const t = { tasks: 0, claims: 0, evidence: 0, verified: 0, perjury: 0, revisions: 0, escalations: 0, seconds: 0 }
  if (role === 'clerk') {
    t.tasks = defs.size
    t.claims = defs.size
    t.seconds = defs.size * 3.4
    return t
  }
  for (const { rec } of released()) {
    const side = new Map(rec.bench.map((a) => [a.id, a.side]))
    for (const c of rec.claims) {
      const s = side.get(c.agentId)
      const mine =
        role === 'checker' ||
        (role === 'cross' && c.type === 'rebuttal') ||
        (role === 'prosecution' && s === 'prosecution' && c.type !== 'rebuttal') ||
        (role === 'defense' && s === 'defense' && c.type !== 'rebuttal') ||
        (role === 'officer' && s === 'officer')
      if (!mine) continue
      t.claims += 1
      t.evidence += c.evidence.length
      t.verified += c.evidence.filter((e) => e.status === 'verified').length
      t.perjury += c.evidence.filter((e) => e.status === 'fabricated').length
      t.revisions += c.revisions ?? 0
      t.escalations += c.escalated ? 1 : 0
      t.seconds += 4.2 + c.evidence.length * 0.9
    }
    if (role === 'officer' && rec.officer) t.tasks += 1
  }
  if (role !== 'officer') t.tasks = t.claims
  t.seconds = Math.round(t.seconds * 10) / 10
  return t
}

// 에이전트 목록 응답
function agents(): AgentProfile[] {
  const { doing, pending } = workload()
  return ROLES.map((r) => {
    const working = doing.get(r.role) ?? null
    return { role: r.role, label: r.label, room: r.room, skill: r.skill, skillVersion: r.version, totals: totalsOf(r.role), working, queued: Math.max(0, (pending.get(r.role) ?? 0) - (working && r.role !== 'clerk' ? 1 : 0)) }
  })
}

// 대시보드 응답
function dashboard(): Dashboard {
  const { defs, ledger, summarize } = mockState()
  const sums = [...defs.keys()].map(summarize)
  const running = activeJobs()
  const claims = released().flatMap(({ rec }) => rec.claims)
  const evidence = claims.flatMap((c) => c.evidence)
  const recent: ActivityItem[] = [
    ...running.flatMap(({ j, info }) => (info.events.length ? info.events.slice(-4).map((e) => ({ at: e.at, caseId: j.caseId, kind: 'agent' as const, text: `${j.rec?.bench.find((a) => a.id === e.agentId)?.name ?? '증거 검증관'} · ${e.text}` })) : [{ at: new Date().toISOString(), caseId: j.caseId, kind: 'agent' as const, text: info.step }])),
    ...ledger.filter((e) => !e.labSessionId).map((e) => ({ at: e.at, caseId: e.caseId, kind: 'ledger' as const, text: describe(e) })),
    ...released().map(({ caseId, rec }) => ({ at: rec.createdAt, caseId, kind: 'agent' as const, text: `${rec.instance}심 변론 ${rec.claims.length}건 제출` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30)
  return {
    cases: sums.length,
    inTrial: sums.filter((s) => s.progress.stage === 'in_trial' || s.progress.stage === 'appealed').length,
    finals: sums.filter((s) => s.progress.stage === 'final').length,
    activeJobs: running.map(({ info }) => brief(info)),
    agentsWorking: agents().filter((a) => a.working).length,
    kpis: {
      screeningAccuracy: 34 / 42,
      selfCorrectionRate: 0.67,
      escalations: claims.filter((c) => c.escalated).length,
      perjuryRate: evidence.length ? evidence.filter((e) => e.status === 'fabricated').length / evidence.length : null,
      humanOverrides: ledger.filter((e) => e.type === 'evidence_ruling' && !e.labSessionId).length,
    },
    recent,
  }
}

// 접수 검토 작업 시작
function intake(body: Record<string, unknown>): { jobId: string } {
  const { defs, jobs } = mockState()
  const ids = (Array.isArray(body.caseIds) && body.caseIds.length ? (body.caseIds as string[]) : [...defs.keys()]).filter((id) => defs.has(id))
  if (!ids.length) throw new ApiError(404, '검토할 사건이 없습니다')
  const id = `intake-${++intakeSeq}`
  const steps = ids.flatMap((c) => [`서기가 ${c} 기사 읽기`, `서기가 ${c} 사실 확인`, `서기가 ${c} 권고 작성`])
  jobs.set(id, { id, caseId: ids[0], instance: 0 as 1, startedAt: Date.now(), steps })
  return { jobId: id }
}

// 콘솔 요청 처리
export async function handleConsole(method: string, path: string, body: Record<string, unknown>): Promise<unknown> {
  if (path === '/dashboard') return dashboard()
  if (path === '/agents') return agents()
  if (path === '/policy' && method === 'GET') return policy
  if (path === '/policy' && method === 'PUT') {
    policy = {
      summaryEnabled: Boolean(body.summaryEnabled),
      summaryThreshold: Math.max(0, Math.min(100, Number(body.summaryThreshold))),
      highRiskCategories: Array.isArray(body.highRiskCategories) ? (body.highRiskCategories as string[]) : [],
    }
    return policy
  }
  if (path === '/intake' && method === 'POST') return intake(body)
  throw new ApiError(404, `알 수 없는 경로입니다: ${method} ${path}`)
}
