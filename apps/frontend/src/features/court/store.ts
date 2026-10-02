// 법정 화면 상태 저장소
import { create } from 'zustand'
import { api } from '../../api/client'
import type { ActionLevel, AgentEvent, Case, Instance, JobInfo, Leaning, LedgerEntry, Ruling } from '../../api/types'
import { lastSeq, mergeEvents } from '../../lib/activity'
import { entryFor, eventFromEntry } from '../../lib/ledger'
import { emptyRecord, keepRevealOrder, replayLedger } from '../../lib/reveal'
import { autoAppeal, currentInstance, phaseOf, startTrial, step, type Records, type TrialEvent, type TrialState } from '../../lib/trial'

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
  events: AgentEvent[]
  jobError: string | null
  started: boolean
  skipping: boolean
  loading: boolean
  busy: boolean
  error: string | null
  open: (id: string) => Promise<void>
  setFocus: (evidenceId: string | null) => void
  setViewing: (i: Instance | null) => void
  setJudgeName: (name: string) => void
  clearError: () => void
  setSolo: (solo: boolean) => void
  start: () => Promise<void>
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

// 법정 상태 저장소
export const useCourt = create<CourtStore>((set, get) => {
  // 작업 루프 세대 번호 (사건을 바꾸면 이전 루프를 멈춤)
  let runId = 0
  // 법정 열기 요청 번호 (겹친 요청은 마지막 것만 반영)
  let openSeq = 0
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

  // 이벤트 하나를 장부에 기록하고 상태에 반영
  const dispatch = async (e: TrialEvent): Promise<void> => {
    const { state, records, busy } = get()
    if (!state || busy) return
    if (step(state, e, records) === state) {
      set({ error: '지금 단계에서는 할 수 없는 행동입니다' })
      return
    }
    set({ busy: true, error: null })
    try {
      const saved = await api.postLedger(entryFor(state, e, records))
      // 기록하는 동안 작업이 진행됐을 수 있어 최신 상태에 다시 적용
      const fresh = get()
      const next = step(fresh.state!, e, fresh.records)
      set({ state: next, ledger: [...fresh.ledger, saved], busy: false, ...(e.type === 'appeal' ? { focus: null, skipping: false } : {}) })
      const auto = autoAppeal(next, fresh.records)
      if (auto) await dispatch(auto)
      else if (e.type === 'appeal') await maybeStart(get().state!)
    } catch (err) {
      set({ busy: false, error: (err as Error).message })
    }
  }

  // 항소 직후 다음 심급 기록이 없으면 작업을 바로 시작
  const maybeStart = async (s: TrialState): Promise<void> => {
    if (phaseOf(s, get().records) === 'need_record') await runJob(currentInstance(s))
  }

  // 심급 작업을 시작하고 끝날 때까지 이벤트와 중간 기록을 받아 오기
  const runJob = async (n: Instance): Promise<void> => {
    const { caseId, job, state } = get()
    if (!caseId || !state || (job && job.status !== 'error')) return
    const mine = ++runId
    // 같은 사건·같은 작업 루프인지 확인
    const alive = () => mine === runId && get().caseId === caseId
    set({
      started: true, skipping: false, jobError: null, events: [],
      records: { ...get().records, [n]: emptyRecord(caseId, n) },
      job: { id: '', caseId, instance: n, status: 'queued', step: '작업을 요청하는 중', done: 0, total: 0, error: null, startedAt: null, events: [], partial: null },
    })
    setWriting(n)
    rederive()
    try {
      const { jobId } = await api.createTrial(caseId, n)
      for (;;) {
        const info = await api.job(jobId, lastSeq(get().events))
        if (!alive()) return
        const events = mergeEvents(get().events, info.events)
        const part = info.partial
        set((s) => {
          const prev = s.records[n]
          const merged = part ? keepRevealOrder({ ...part, bench: part.bench.length || !prev ? part.bench : prev.bench }, s.state?.instances[n].revealed ?? []) : prev
          return { job: info, events, records: merged ? { ...s.records, [n]: merged } : s.records }
        })
        if (info.partial) rederive()
        if (info.status === 'error') throw new Error(info.error ?? '재판 생성에 실패했습니다')
        if (info.status === 'done') break
        await new Promise((r) => setTimeout(r, POLL_MS))
      }
      const rec = await api.trial(caseId, n)
      if (!alive()) return
      set((s) => ({ records: { ...s.records, [n]: keepRevealOrder(rec, s.state?.instances[n].revealed ?? []) }, job: null }))
      setWriting(null)
      rederive()
    } catch (err) {
      if (!alive()) return
      const rest = { ...get().records }
      delete rest[n]
      set({ jobError: (err as Error).message, job: null, records: rest })
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
    events: [],
    jobError: null,
    started: false,
    skipping: false,
    loading: false,
    busy: false,
    error: null,

    open: async (id) => {
      runId++
      const mine = ++openSeq
      set({ caseId: id, loading: true, error: null, caseData: null, state: null, records: {}, ledger: [], focus: null, viewing: null, job: null, events: [], jobError: null, started: false, skipping: false, busy: false })
      try {
        const r = await api.records(id)
        if (mine !== openSeq) return
        const records: Records = Object.fromEntries(r.trials.map((t) => [t.instance, t]))
        const events = r.ledger.map(eventFromEntry).filter((e): e is TrialEvent => e !== null)
        const state = events.length ? replayLedger(id, events, records) : startTrial(id)
        set({ caseData: r.case, records, ledger: r.ledger, state, started: events.length > 0, loading: false })
        const cur = currentInstance(state)
        if (!records[cur] && events.some((e) => e.instance === cur)) void runJob(cur)
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
