// 법정 화면 상태 저장소
import { create } from 'zustand'
import { api } from '../../api/client'
import { ApiError } from '../../api/error'
import type { ActionLevel, AgentEvent, Case, ExecutionView, Instance, JobInfo, Leaning, LedgerEntry, NewLedgerEntry, Ruling, WorkflowDefinition } from '../../api/types'
import { lastSeq, mergeEvents } from '../../lib/activity'
import { isJobTerminal } from '../../lib/execution'
import { entryFor, eventFromEntry } from '../../lib/ledger'
import { emptyRecord, keepRevealOrder, replayLedger } from '../../lib/reveal'
import { autoAppeal, currentInstance, phaseOf, rulingLockReason, startTrial, step, type Records, type TrialEvent, type TrialState } from '../../lib/trial'

// 작업 상태 확인 간격 (밀리초)
const POLL_MS = 700

interface CourtStore {
  caseId: string | null
  caseData: Case | null
  records: Records
  ledger: LedgerEntry[]
  state: TrialState | null
  judgeName: string
  soloMode: boolean
  focus: string | null
  viewing: Instance | null
  job: JobInfo | null
  execution: ExecutionView | null
  workflow: WorkflowDefinition | null
  events: AgentEvent[]
  jobError: string | null
  started: boolean
  skipping: boolean
  loading: boolean
  busy: boolean
  controlBusy: boolean
  error: string | null
  open: (id: string) => Promise<void>
  setFocus: (evidenceId: string | null) => void
  setViewing: (i: Instance | null) => void
  setJudgeName: (name: string) => void
  clearError: () => void
  setSolo: (solo: boolean) => void
  start: () => Promise<void>
  retryJob: () => Promise<void>
  cancelJob: () => Promise<void>
  skip: () => void
  firstImpression: (leaning: Leaning, confidence: number) => Promise<void>
  revealNext: () => Promise<void>
  rule: (evidenceId: string, ruling: Ruling | null) => Promise<void>
  seatVerdict: (seat: 1 | 2 | 3, name: string, verdict: Leaning, confidence: number, reason: string) => Promise<void>
  appeal: (reason: string) => Promise<void>
  finalize: (verdict: Leaning, action: ActionLevel, reason: string) => Promise<void>
}

// 브라우저 저장소 읽기
function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

// 브라우저 저장소 쓰기
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 저장소 접근 실패 시 무시
  }
}

let requestSeq = 0

// 판사 행동별 새 장부 요청 식별자
function requestIdFor(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ledger:${Date.now().toString(36)}:${++requestSeq}:${Math.random().toString(36).slice(2)}`
}

// 장부 id 기준 병합
function appendLedger(list: LedgerEntry[], saved: LedgerEntry): LedgerEntry[] {
  return list.some((e) => e.id === saved.id) ? list : [...list, saved]
}

// 법정 상태 저장소
export const useCourt = create<CourtStore>((set, get) => {
  // 작업 루프 세대 번호 (사건을 바꾸면 이전 루프를 멈춤)
  let runId = 0
  // 법정 열기 요청 번호 (겹친 요청은 마지막 것만 반영)
  let openSeq = 0
  // 첫인상 공개 전환 번호 (숨김 상태 poll 응답 폐기)
  let disclosureEpoch = 0
  // 응답을 확인하지 못한 행동의 재전송 본문
  let pendingLedger: { key: string; entry: NewLedgerEntry } | null = null
  // 판사 정보 만들기
  const judge = (seat: 1 | 2 | 3 = 1, name = get().judgeName) => ({ seat, name, soloMode: get().soloMode && (get().state ? currentInstance(get().state!) > 1 : false) })
  // 작성 중인 심급 표시 바꾸기
  const setWriting = (n: Instance | null) => set((s) => (s.state ? { state: { ...s.state, writing: n } } : {}))

  // 장부 전체를 현재 기록(작성 중인 중간 기록 포함)에 다시 적용해 상태 복원
  const rederive = () =>
    set((s) => {
      if (!s.state || !s.caseId) return {}
      const events = s.ledger.map(eventFromEntry).filter((e): e is TrialEvent => e !== null)
      return { state: { ...replayLedger(s.caseId, events, s.records), writing: s.state.writing } }
    })

  // 실행 그래프 다시 읽기
  const refreshExecution = async (id = get().caseId, n = get().state ? currentInstance(get().state!) : 1): Promise<void> => {
    if (!id) return
    try {
      const execution = await api.execution(id, n)
      if (get().caseId === id) set({ execution })
    } catch {
      if (get().caseId === id) set({ execution: null })
    }
  }

  // 사건 기록을 새로 읽되 작성 중인 중간 기록은 유지
  const refreshRecords = async (id = get().caseId): Promise<void> => {
    if (!id) return
    const r = await api.records(id)
    if (get().caseId !== id) return
    const nextRecords: Records = Object.fromEntries(r.trials.map((t) => [t.instance, t]))
    set((s) => {
      const writing = s.state?.writing ?? null
      if (writing && s.records[writing] && (!nextRecords[writing] || s.records[writing]!.claims.length > nextRecords[writing]!.claims.length)) nextRecords[writing] = s.records[writing]
      const events = r.ledger.map(eventFromEntry).filter((e): e is TrialEvent => e !== null)
      const state = events.length ? replayLedger(id, events, nextRecords) : startTrial(id)
      return { caseData: r.case, records: nextRecords, ledger: r.ledger, state: { ...state, writing } }
    })
    await refreshExecution(id)
  }

  // 이벤트 하나를 장부에 기록하고 상태에 반영
  const dispatch = async (e: TrialEvent): Promise<void> => {
    const { state, records, busy } = get()
    if (!state || busy) return
    if (step(state, e, records) === state) {
      set({ error: (e.type === 'rule' ? rulingLockReason(state) : null) ?? '지금 단계에서는 할 수 없는 행동입니다' })
      return
    }
    const key = JSON.stringify({ caseId: state.caseId, event: e })
    const action = pendingLedger?.key === key ? pendingLedger : { key, entry: { ...entryFor(state, e, records), requestId: requestIdFor() } }
    pendingLedger = action
    set({ busy: true, error: null })
    try {
      const saved = await api.postLedger(action.entry)
      if (pendingLedger === action) pendingLedger = null
      // 기록하는 동안 작업이 진행됐을 수 있어 최신 상태에 다시 적용
      const fresh = get()
      const next = step(fresh.state!, e, fresh.records)
      set({ state: next, ledger: appendLedger(fresh.ledger, saved), busy: e.type === 'first_impression', ...(e.type === 'appeal' ? { focus: null, skipping: false } : {}) })
      if (e.type === 'first_impression') {
        disclosureEpoch++
        set({ events: [] })
        await refreshRecords(fresh.caseId)
        set({ busy: false })
      } else await refreshExecution(fresh.caseId, currentInstance(next))
      const auto = autoAppeal(next, fresh.records)
      if (auto) await dispatch(auto)
      else if (e.type === 'appeal') await maybeStart(get().state!)
    } catch (err) {
      if (pendingLedger === action && err instanceof ApiError && err.status < 500) pendingLedger = null
      set({ busy: false, error: (err as Error).message })
    }
  }

  // 항소 직후 다음 심급 기록이 없으면 작업을 바로 시작
  const maybeStart = async (s: TrialState): Promise<void> => {
    if (phaseOf(s, get().records) === 'need_record') await runJob(currentInstance(s))
  }

  // 심급 작업을 시작하고 끝날 때까지 이벤트와 중간 기록을 받아 오기
  const runJob = async (n: Instance, existingJobId?: string): Promise<void> => {
    const { caseId, job, state } = get()
    if (import.meta.env.VITE_MOCK === '1' && get().caseData?.origin === 'manual') return
    if (!caseId || !state || (!existingJobId && job && !isJobTerminal(job.status))) return
    const mine = ++runId
    // 같은 사건·같은 작업 루프인지 확인
    const alive = () => mine === runId && get().caseId === caseId
    const now = new Date().toISOString()
    set({
      started: true, skipping: false, jobError: null, events: [],
      records: existingJobId ? get().records : { ...get().records, [n]: emptyRecord(caseId, n) },
      job: { id: existingJobId ?? '', caseId, instance: n, status: 'queued', step: '작업을 요청하는 중', done: 0, total: 0, error: null, startedAt: null, attempt: job?.attempt ?? 1, graphVersion: '1', createdAt: now, updatedAt: now, events: [], partial: null },
    })
    setWriting(n)
    rederive()
    try {
      const jobId = existingJobId ?? (await api.createTrial(caseId, n)).jobId
      if (!alive()) return
      set((s) => (s.job ? { job: { ...s.job, id: jobId } } : {}))
      for (;;) {
        const pollEpoch = disclosureEpoch
        const info = await api.job(jobId, pollEpoch === disclosureEpoch ? lastSeq(get().events) : 0)
        if (!alive()) return
        if (pollEpoch !== disclosureEpoch) {
          set({ events: [] })
          continue
        }
        const events = mergeEvents(get().events, info.events)
        const part = info.partial
        set((s) => {
          const prev = s.records[n]
          const merged = part ? keepRevealOrder({ ...part, bench: part.bench.length || !prev ? part.bench : prev.bench }, s.state?.instances[n].revealed ?? []) : prev
          return { job: info, events, records: merged ? { ...s.records, [n]: merged } : s.records }
        })
        if (info.partial) rederive()
        await refreshExecution(caseId, n)
        if (info.status === 'error' || info.status === 'interrupted' || info.status === 'cancelled') {
          set({ job: info, jobError: info.error ?? (info.status === 'cancelled' ? '작업이 취소되었습니다' : info.status === 'interrupted' ? '작업이 중단되었습니다' : '재판 생성에 실패했습니다') })
          setWriting(null)
          return
        }
        if (info.status === 'done') break
        await new Promise((r) => setTimeout(r, POLL_MS))
      }
      const rec = await api.trial(caseId, n)
      if (!alive()) return
      set((s) => ({ records: { ...s.records, [n]: keepRevealOrder(rec, s.state?.instances[n].revealed ?? []) }, job: null }))
      setWriting(null)
      rederive()
      await refreshExecution(caseId, n)
    } catch (err) {
      if (!alive()) return
      const message = (err as Error).message
      set((s) => {
        const records = { ...s.records }
        if (!s.job?.id) delete records[n]
        return { records, jobError: message, job: s.job ? { ...s.job, status: 'error', step: '작업 요청 실패', error: message } : null }
      })
      setWriting(null)
    }
  }

  return {
    caseId: null,
    caseData: null,
    records: {},
    ledger: [],
    state: null,
    judgeName: readPref('ai-court-judge', '판사1'),
    soloMode: readPref('ai-court-solo', '1') === '1',
    focus: null,
    viewing: null,
    job: null,
    execution: null,
    workflow: null,
    events: [],
    jobError: null,
    started: false,
    skipping: false,
    loading: false,
    busy: false,
    controlBusy: false,
    error: null,

    open: async (id) => {
      runId++
      disclosureEpoch = 0
      pendingLedger = null
      const mine = ++openSeq
      set({ caseId: id, loading: true, error: null, caseData: null, state: null, records: {}, ledger: [], focus: null, viewing: null, job: null, execution: null, events: [], jobError: null, started: false, skipping: false, busy: false, controlBusy: false })
      try {
        const [r, workflow] = await Promise.all([api.records(id), api.workflow().catch(() => null)])
        if (mine !== openSeq) return
        const records: Records = Object.fromEntries(r.trials.map((t) => [t.instance, t]))
        const events = r.ledger.map(eventFromEntry).filter((e): e is TrialEvent => e !== null)
        const state = events.length ? replayLedger(id, events, records) : startTrial(id)
        set({ caseData: r.case, records, ledger: r.ledger, state, workflow, started: events.length > 0, loading: false })
        await refreshExecution(id, currentInstance(state))
        const cur = currentInstance(state)
        const run = get().execution?.run
        if (run && (run.status === 'queued' || run.status === 'running')) void runJob(cur, run.id)
        else if (!run && !records[cur] && events.some((e) => e.instance === cur)) void runJob(cur)
        else {
          const auto = autoAppeal(state, records)
          if (auto && get().caseId === id) await dispatch(auto)
        }
      } catch (err) {
        if (mine === openSeq) set({ loading: false, error: (err as Error).message })
      }
    },
    setFocus: (focus) => set({ focus }),
    setViewing: (viewing) => set({ viewing, focus: null }),
    clearError: () => set({ error: null }),
    setJudgeName: (name) => {
      writePref('ai-court-judge', name)
      set({ judgeName: name, error: null })
    },
    setSolo: (solo) => {
      writePref('ai-court-solo', solo ? '1' : '0')
      set({ soloMode: solo })
    },

    start: async () => {
      const { state, records } = get()
      if (!state) return
      const n = currentInstance(state)
      if (!get().judgeName.trim()) {
        set({ error: '판사 이름을 적어야 재판을 시작할 수 있어요' })
        return
      }
      set({ started: true, viewing: null, error: null })
      if (!records[n]) await runJob(n)
    },
    retryJob: async () => {
      const j = get().job ?? get().execution?.run
      if (!j) return
      set({ controlBusy: true, jobError: null, error: null })
      try {
        const { jobId } = await api.retryJob(j.id)
        runId++
        set({ job: { ...j, id: jobId, status: 'queued', step: '작업을 다시 요청하는 중', events: [], partial: j.partial }, events: [] })
        set({ controlBusy: false })
        void runJob(j.instance, jobId)
      } catch (err) {
        set({ jobError: (err as Error).message })
        set({ controlBusy: false })
      }
    },
    cancelJob: async () => {
      const j = get().job ?? get().execution?.run
      if (!j) return
      set({ controlBusy: true, error: null })
      try {
        const info = await api.cancelJob(j.id)
        runId++
        set({ job: info, jobError: info.error ?? '작업이 취소되었습니다' })
        setWriting(null)
        await refreshExecution(info.caseId, info.instance)
      } catch (err) {
        set({ jobError: (err as Error).message })
      } finally {
        set({ controlBusy: false })
      }
    },
    skip: () => set({ skipping: true }),

    firstImpression: (leaning, confidence) => dispatch({ type: 'first_impression', instance: 1, judge: judge(), leaning, confidence }),
    revealNext: async () => {
      const { state, records } = get()
      if (!state) return
      const i = currentInstance(state)
      const next = records[i]?.claims[state.instances[i].revealed.length]
      if (next) await dispatch({ type: 'reveal', instance: i, judge: judge(), claimId: next.id })
    },
    rule: (evidenceId, ruling) => {
      const { state } = get()
      return state ? dispatch({ type: 'rule', instance: currentInstance(state), judge: judge(), evidenceId, ruling }) : Promise.resolve()
    },
    seatVerdict: (seat, name, verdict, confidence, reason) => {
      const { state } = get()
      return state ? dispatch({ type: 'seat_verdict', instance: currentInstance(state), judge: judge(seat, name), verdict, confidence, reason }) : Promise.resolve()
    },
    appeal: (reason) => {
      const { state } = get()
      return state ? dispatch({ type: 'appeal', instance: currentInstance(state), judge: judge(), reason }) : Promise.resolve()
    },
    finalize: (verdict, action, reason) => {
      const { state } = get()
      return state ? dispatch({ type: 'final', instance: currentInstance(state), judge: judge(), verdict, action, reason }) : Promise.resolve()
    },
  }
})
