// 법정 저장소 비동기 수명주기 검증
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Case, ExecutionView, Instance, JobInfo, LedgerEntry, Records as ApiRecords, TrialRecord, WorkflowDefinition } from '../../api/types'

const apiMock = vi.hoisted(() => ({
  records: vi.fn(),
  workflow: vi.fn(),
  execution: vi.fn(),
  postLedger: vi.fn(),
  createTrial: vi.fn(),
  job: vi.fn(),
  trial: vi.fn(),
  retryJob: vi.fn(),
  cancelJob: vi.fn(),
}))

vi.mock('../../api/client', () => ({ api: apiMock }))

const { useCourt } = await import('./store')
const { courtPhase } = await import('./view')

// 지연 가능한 프라미스
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// 테스트용 판사
const judge = { seat: 1 as const, name: '판사', soloMode: false }
// 테스트용 사건
const caseData = (id: string): Case => ({ id, category: '생활', subcategory: '테스트', title: `사건 ${id}`, subtitle: '부제', sentences: [{ no: 1, text: '본문' }], variantOf: null, attack: null })
// 테스트용 재판 기록
const record = (caseId: string, instance: Instance = 1): TrialRecord => ({
  caseId, instance, ontologyVersion: 1, model: { name: 'mock', options: {} }, createdAt: '2026-01-01T00:00:00.000Z',
  bench: [{ id: 'p', side: 'prosecution', name: '검사', specialty: null, skill: 's', skillVersion: '1' }], rounds: [],
  claims: [{ id: `${caseId}-C1`, agentId: 'p', round: 0, type: 'exaggeration', stance: 'pro', text: '주장', strength: 2, rebuts: null, revisions: 0, escalated: false, evidence: [{ id: `${caseId}-E1`, kind: 'quote', stance: 'pro', sentenceNo: 1, quote: '본문', keyword: null, status: 'verified', foundIn: 1 }] }],
  screening: null, officer: null, calls: [], trace: [], agentStats: {}, execution: { version: '1', runId: `${caseId}-job`, attempt: 1 },
})
// 테스트용 records 응답
const records = (id: string, trials: TrialRecord[] = [record(id)], ledger: LedgerEntry[] = []): ApiRecords => ({ case: caseData(id), trials, ledger, answer: null })
// 테스트용 실행 그래프
const execution = (id: string, run: JobInfo | null = null): ExecutionView => ({ version: '1', caseId: id, instance: 1, mode: run ? 'live' : 'replay', disclosure: 'open', phase: 'seat_verdict', reason: '테스트', steps: [], edges: [], agents: [], run, limits: { maxCalls: 4, maxRevisions: 2, maxRunAttempts: 3 } })
// 테스트용 작업
const job = (id: string, caseId = 'c', status: JobInfo['status'] = 'running'): JobInfo => ({ id, caseId, instance: 1, status, step: status, done: 0, total: 1, error: null, startedAt: '2026-01-01T00:00:00.000Z', attempt: 1, graphVersion: '1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', events: [], partial: null })
// 마이크로태스크 배수
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  apiMock.workflow.mockResolvedValue({ version: '1', nodes: [], edges: [], limits: { maxCalls: 4, maxRevisions: 2, maxRunAttempts: 3 } } satisfies WorkflowDefinition)
  apiMock.execution.mockImplementation((id: string) => Promise.resolve(execution(id)))
  useCourt.setState({ caseId: null, caseData: null, records: {}, ledger: [], state: null, focus: null, viewing: null, job: null, execution: null, workflow: null, events: [], jobError: null, started: false, skipping: false, loading: false, busy: false, controlBusy: false, error: null })
})

describe('court store execution lifecycle', () => {
  it('records a manual mock first impression without creating an AI job', async () => {
    vi.stubEnv('VITE_MOCK', '1')
    const before = { ...records('manual', []), case: { ...caseData('manual'), origin: 'manual' as const } }
    apiMock.records.mockResolvedValue(before)
    await useCourt.getState().open('manual')
    await useCourt.getState().start()
    expect(apiMock.createTrial).not.toHaveBeenCalled()
    expect(useCourt.getState().job).toBeNull()
    const first: LedgerEntry = { id: 'H1', at: '2026-01-01', caseId: 'manual', instance: 1, judge, labSessionId: null, type: 'first_impression', data: { leaning: 'clickbait', confidence: 70 }, context: { balance: null, aiRecommendationShown: false, scaleVisible: false } }
    apiMock.postLedger.mockResolvedValue(first)
    apiMock.records.mockResolvedValue({ ...before, ledger: [first] })
    await useCourt.getState().firstImpression('clickbait', 70)
    await useCourt.getState().open('manual')
    expect(useCourt.getState().state?.first).toEqual({ leaning: 'clickbait', confidence: 70 })
    expect(apiMock.createTrial).not.toHaveBeenCalled()
    expect(useCourt.getState().records).toEqual({})
  })

  it('marks a rejected trial request as an error instead of leaving it queued', async () => {
    apiMock.records.mockResolvedValue(records('offline', []))
    apiMock.createTrial.mockRejectedValueOnce(new Error('연결 실패'))
    await useCourt.getState().open('offline')
    await useCourt.getState().start()
    expect(useCourt.getState().job?.status).toBe('error')
    expect(useCourt.getState().jobError).toBe('연결 실패')
    expect(useCourt.getState().state?.writing).toBeNull()
  })

  it('keeps first-impression busy until records refresh completes', async () => {
    apiMock.records.mockResolvedValueOnce(records('c'))
    await useCourt.getState().open('c')
    const refreshed = deferred<ApiRecords>()
    apiMock.records.mockReturnValueOnce(refreshed.promise)
    apiMock.postLedger.mockResolvedValue({ id: 'L1', at: '2026-01-01T00:00:01.000Z', caseId: 'c', instance: 1, judge, labSessionId: null, type: 'first_impression', data: { leaning: 'clickbait', confidence: 70 }, context: { balance: null, aiRecommendationShown: false, scaleVisible: false } } satisfies LedgerEntry)

    const promise = useCourt.getState().firstImpression('clickbait', 70)
    await flush()

    expect(useCourt.getState().busy).toBe(true)
    expect(apiMock.records).toHaveBeenCalledTimes(2)
    expect(useCourt.getState().events).toEqual([])

    refreshed.resolve(records('c', [record('c')], [{ id: 'L1', at: '2026-01-01T00:00:01.000Z', caseId: 'c', instance: 1, judge, labSessionId: null, type: 'first_impression', data: { leaning: 'clickbait', confidence: 70 }, context: { balance: null, aiRecommendationShown: false, scaleVisible: false } }]))
    await promise

    expect(useCourt.getState().busy).toBe(false)
    expect(useCourt.getState().state?.first).toEqual({ leaning: 'clickbait', confidence: 70 })
  })

  it('opens failed execution without auto-creating a new trial', async () => {
    apiMock.records.mockResolvedValue(records('failed'))
    apiMock.execution.mockResolvedValue(execution('failed', job('failed-job', 'failed', 'interrupted')))

    await useCourt.getState().open('failed')

    expect(apiMock.createTrial).not.toHaveBeenCalled()
    expect(apiMock.job).not.toHaveBeenCalled()
    expect(useCourt.getState().execution?.run?.status).toBe('interrupted')
  })

  it('releases retry control while the retried run is still active', async () => {
    apiMock.retryJob.mockResolvedValue({ jobId: 'same-run' })
    apiMock.job.mockReturnValue(new Promise(() => {}))
    useCourt.setState({ caseId: 'c', state: useCourt.getState().state ?? { caseId: 'c', first: null, rulings: {}, instances: { 1: { revealed: [], seats: [], appeal: null }, 2: { revealed: [], seats: [], appeal: null }, 3: { revealed: [], seats: [], appeal: null } }, final: null, writing: null }, records: { 1: record('c') }, job: job('same-run', 'c', 'cancelled') })

    await useCourt.getState().retryJob()
    await flush()

    expect(apiMock.retryJob).toHaveBeenCalledWith('same-run')
    expect(useCourt.getState().controlBusy).toBe(false)
    expect(useCourt.getState().state?.writing).toBe(1)
    expect(useCourt.getState().job?.id).toBe('same-run')
  })

  it('ignores stale polling results after opening a different case', async () => {
    const oldPoll = deferred<JobInfo>()
    apiMock.records.mockResolvedValueOnce(records('old', [])).mockResolvedValueOnce(records('new'))
    apiMock.createTrial.mockResolvedValue({ jobId: 'old-job' })
    apiMock.job.mockReturnValueOnce(oldPoll.promise)
    apiMock.trial.mockResolvedValue(record('old'))

    await useCourt.getState().open('old')
    void useCourt.getState().start()
    await flush()
    const oldRun = useCourt.getState().job?.id

    await useCourt.getState().open('new')
    oldPoll.resolve(job('old-job', 'old', 'done'))
    await flush()

    expect(oldRun).toBe('old-job')
    expect(useCourt.getState().caseId).toBe('new')
    expect(useCourt.getState().records[1]?.caseId).toBe('new')
  })
})

describe('court store disclosure and ledger idempotency', () => {
  it('drops hidden poll responses after first impression and resumes from cursor zero', async () => {
    const firstPoll = deferred<JobInfo>()
    const secondPoll = deferred<JobInfo>()
    const rec = record('epoch')
    apiMock.records.mockResolvedValueOnce(records('epoch', [rec]))
    apiMock.records.mockResolvedValueOnce(records('epoch', [rec], [{ id: 'H1', at: '2026-01-01T00:00:01.000Z', caseId: 'epoch', instance: 1, judge, labSessionId: null, type: 'first_impression', data: { leaning: 'clickbait', confidence: 70 }, context: { balance: null, aiRecommendationShown: false, scaleVisible: false } }]))
    apiMock.execution.mockResolvedValue(execution('epoch', job('epoch-run', 'epoch', 'running')))
    apiMock.job.mockReturnValueOnce(firstPoll.promise).mockReturnValueOnce(secondPoll.promise)
    apiMock.postLedger.mockResolvedValue({ id: 'H1', at: '2026-01-01T00:00:01.000Z', caseId: 'epoch', instance: 1, judge, labSessionId: null, type: 'first_impression', data: { leaning: 'clickbait', confidence: 70 }, context: { balance: null, aiRecommendationShown: false, scaleVisible: false } } satisfies LedgerEntry)

    await useCourt.getState().open('epoch')
    expect(apiMock.job).toHaveBeenCalledWith('epoch-run', 0)

    const h1 = useCourt.getState().firstImpression('clickbait', 70)
    await flush()
    firstPoll.resolve({ ...job('epoch-run', 'epoch', 'running'), events: [{ seq: 4, at: '2026-01-01T00:00:02.000Z', agentId: 'p', kind: 'submit', text: '주장 제출 완료', claimId: null }] })
    await flush()

    expect(apiMock.job).toHaveBeenLastCalledWith('epoch-run', 0)
    expect(useCourt.getState().events).toEqual([])

    secondPoll.resolve(job('epoch-run', 'epoch', 'cancelled'))
    await h1
  })

  it('uses the same semantic request id when an unknown ledger response is retried', async () => {
    apiMock.records.mockResolvedValue(records('idem'))
    await useCourt.getState().open('idem')
    apiMock.postLedger.mockRejectedValueOnce(new Error('network lost after write'))

    await useCourt.getState().firstImpression('clickbait', 70)
    const firstId = apiMock.postLedger.mock.calls.at(-1)?.[0].requestId

    apiMock.postLedger.mockResolvedValueOnce({ id: 'H1', at: '2026-01-01T00:00:01.000Z', caseId: 'idem', instance: 1, judge, labSessionId: null, type: 'first_impression', data: { leaning: 'clickbait', confidence: 70 }, context: { balance: null, aiRecommendationShown: false, scaleVisible: false } } satisfies LedgerEntry)
    apiMock.records.mockResolvedValueOnce(records('idem', [record('idem')], [{ id: 'H1', at: '2026-01-01T00:00:01.000Z', caseId: 'idem', instance: 1, judge, labSessionId: null, type: 'first_impression', data: { leaning: 'clickbait', confidence: 70 }, context: { balance: null, aiRecommendationShown: false, scaleVisible: false } }]))

    await useCourt.getState().firstImpression('clickbait', 70)
    const secondId = apiMock.postLedger.mock.calls.at(-1)?.[0].requestId

    expect(firstId).toBeTruthy()
    expect(secondId).toBe(firstId)
  })

  it('does not append duplicate ledger rows returned by semantic idempotency', async () => {
    const rec = record('dupe')
    const first: LedgerEntry = { id: 'H1', at: '2026-01-01T00:00:01.000Z', caseId: 'dupe', instance: 1, judge, labSessionId: null, type: 'first_impression', data: { leaning: 'clickbait', confidence: 70 }, context: { balance: null, aiRecommendationShown: false, scaleVisible: false } }
    apiMock.records.mockResolvedValue(records('dupe', [rec], [first]))
    await useCourt.getState().open('dupe')
    apiMock.postLedger.mockResolvedValue(first)

    await useCourt.getState().revealNext()

    expect(useCourt.getState().ledger.map((e) => e.id)).toEqual(['H1'])
  })
})


describe('court view guards', () => {
  it('blocks verdict phase while a partial failed run is not done', () => {
    const rec = record('partial')
    const state = {
      caseId: 'partial', first: { leaning: 'clickbait' as const, confidence: 70 }, rulings: {},
      instances: { 1: { revealed: [rec.claims[0].id], seats: [], appeal: null }, 2: { revealed: [], seats: [], appeal: null }, 3: { revealed: [], seats: [], appeal: null } },
      final: null, writing: null,
    }

    expect(courtPhase(state, { 1: rec }, null)).toBe('seats')
    expect(courtPhase(state, { 1: rec }, job('partial-run', 'partial', 'cancelled'))).toBe('hearing')
  })
})
