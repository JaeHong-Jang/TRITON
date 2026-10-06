// 모의 실행 그래프 계약 검증
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Dashboard, ExecutionView, JobInfo, LabSession, Records, WorkflowDefinition } from '../types'
import { handle, mockState } from './handlers'

// 테스트용 UUID 문자열
const req = (n: number) => `1000000${n}-2222-4222-8222-${String(n).padStart(12, '0')}`

// 합성 작업 직접 등록
function seedJob(id: string, patch: Partial<Parameters<ReturnType<typeof mockState>['jobs']['set']>[1]> = {}) {
  const now = new Date().toISOString()
  mockState().jobs.set(id, {
    id,
    caseId: 'mock-001',
    instance: 1,
    startedAt: Date.parse(now),
    steps: ['검사가 숨겨진 작업 중'],
    attempt: 1,
    createdAt: now,
    updatedAt: '2026-10-03T00:00:30.000Z',
    ...patch,
  } as Parameters<ReturnType<typeof mockState>['jobs']['set']>[1])
}

describe('mock execution graph', () => {
  it('uses deterministic timestamps for static fixture records', async () => {
    const trial = mockState().trials.get('mock-002')?.get(1)?.rec
    expect(trial?.createdAt).toBe('2026-10-02T09:00:00.000Z')
    expect(trial?.trace[0].at).toBe('2026-10-02T09:00:00.000Z')
  })

  it('execution view uses the public court graph while /workflow stays internal', async () => {
    const view = await handle('GET', '/cases/mock-001/execution?instance=1', {}) as ExecutionView
    expect(view.steps.map((s) => s.id)).toEqual(['prepare', 'generate', 'first_impression', 'reveal', 'review', 'seat_verdict', 'appeal', 'final'])
    expect(view.edges.map((e) => `${e.from}->${e.to}`)).toContain('appeal->generate')
    expect(view.steps.map((s) => s.id)).not.toContain('read')
    expect(view.controls?.start.allowed).toBe(true)
    expect(view.availableInstances).toEqual([1])

    const workflow = await handle('GET', '/workflow', {}) as WorkflowDefinition
    expect(workflow.nodes.map((n) => n.id)).toEqual(['read', 'plan', 'tool', 'draft', 'check', 'revise', 'submit', 'escalate'])
  })

  it('hides job details before first impression and exposes controls', async () => {
    const started = await handle('POST', '/cases/mock-001/trials/1', {}) as { jobId: string }
    const view = await handle('GET', '/cases/mock-001/execution?instance=1', {}) as ExecutionView
    expect(view.disclosure).toBe('hidden')
    expect(view.phase).toBe('first_impression')
    expect(view.agents).toEqual([])
    expect(view.run?.events).toEqual([])
    expect(view.run?.done).toBe(0)
    expect(view.run?.total).toBe(0)
    expect(view.run?.updatedAt).toBe(view.run?.startedAt)
    expect(view.run?.partial?.claims).toEqual([])
    expect(view.run?.partial?.trace).toEqual([])
    expect(view.run?.partial?.calls).toEqual([])
    expect(view.run?.partial?.agentStats).toEqual({})
    expect(view.controls?.start.allowed).toBe(false)
    expect(view.controls?.cancel.allowed).toBe(true)
    expect(view.availableInstances).toEqual([1])
    expect(started.jobId).toBe(view.run?.id)
  })

  it('returns the same running job id for duplicate trial starts', async () => {
    const first = await handle('POST', '/cases/mock-005/trials/1', {}) as { jobId: string }
    const second = await handle('POST', '/cases/mock-005/trials/1', {}) as { jobId: string }
    expect(second.jobId).toBe(first.jobId)
  })

  it('blocks manual fixture AI generation in mock mode', async () => {
    const saved = await handle('POST', '/cases', { requestId: req(1), title: '직접 등록', body: '본문' }) as { id: string }
    await expect(handle('POST', `/cases/${saved.id}/trials/1`, {})).rejects.toMatchObject({ status: 409 })
  })
})

describe('mock job controls', () => {
  it('only queued and running jobs are cancellable, with cancelled idempotent', async () => {
    seedJob('mock-control-running')
    const cancelled = await handle('POST', '/jobs/mock-control-running/cancel', {}) as JobInfo
    expect(cancelled.status).toBe('cancelled')
    await expect(handle('POST', '/jobs/mock-control-running/cancel', {})).resolves.toMatchObject({ status: 'cancelled' })

    seedJob('mock-control-error', { status: 'error' })
    seedJob('mock-control-interrupted', { status: 'interrupted' })
    seedJob('mock-control-done', { startedAt: Date.now() - 2000, updatedAt: '2026-10-03T00:00:02.000Z' })
    await expect(handle('POST', '/jobs/mock-control-error/cancel', {})).rejects.toMatchObject({ status: 409 })
    await expect(handle('POST', '/jobs/mock-control-interrupted/cancel', {})).rejects.toMatchObject({ status: 409 })
    await expect(handle('POST', '/jobs/mock-control-done/cancel', {})).rejects.toMatchObject({ status: 409 })
  })

  it('retries only failed statuses under the attempt cap', async () => {
    seedJob('mock-retry-active')
    seedJob('mock-retry-capped', { status: 'cancelled', attempt: 3 })
    seedJob('mock-retry-cancelled', { status: 'cancelled' })
    await expect(handle('POST', '/jobs/mock-retry-active/retry', {})).rejects.toMatchObject({ status: 409 })
    await expect(handle('POST', '/jobs/mock-retry-capped/retry', {})).rejects.toMatchObject({ status: 409 })
    await expect(handle('POST', '/jobs/mock-retry-cancelled/retry', {})).resolves.toMatchObject({ jobId: 'mock-retry-cancelled' })
    const retried = await handle('GET', '/jobs/mock-retry-cancelled', {}) as JobInfo
    expect(retried.attempt).toBe(2)
  })
})

describe('mock hidden console projection', () => {
  it('keeps hidden active jobs neutral and stable in dashboard and agents', async () => {
    vi.setSystemTime('2026-10-03T23:00:11.000Z')
    onTestFinished(() => { vi.useRealTimers() })
    const steps = Array(20).fill('검사가 숨겨진 작업 중')
    seedJob('mock-hidden-console', { caseId: 'mock-004', steps, startedAt: Date.parse('2026-10-03T23:00:00.000Z'), createdAt: '2026-10-03T22:59:00.000Z', updatedAt: '2026-10-03T23:00:30.000Z' })
    const before = await handle('GET', '/dashboard', {}) as Dashboard
    seedJob('mock-hidden-console-later', { caseId: 'mock-004', steps, startedAt: Date.parse('2026-10-03T23:00:10.000Z'), createdAt: '2026-10-03T23:00:10.000Z', updatedAt: '2026-10-03T23:01:00.000Z' })
    const after = await handle('GET', '/dashboard', {}) as Dashboard
    const beforeRecent = before.recent.filter((r) => r.caseId === 'mock-004' && r.kind === 'agent' && r.at === '2026-10-03T23:00:00.000Z')
    const afterRecent = after.recent.filter((r) => r.caseId === 'mock-004' && r.kind === 'agent' && r.at === '2026-10-03T23:00:00.000Z')
    expect(beforeRecent).toEqual([{ at: '2026-10-03T23:00:00.000Z', caseId: 'mock-004', kind: 'agent', text: '재판 준비 중' }])
    expect(afterRecent).toEqual(beforeRecent)
    expect(after.activeJobs.find((j) => j.id === 'mock-hidden-console')?.updatedAt).toBe('2026-10-03T23:00:00.000Z')

    const agents = await handle('GET', '/agents', {}) as { working: unknown; queued: number }[]
    expect(agents.every((a) => a.working === null && a.queued === 0)).toBe(true)
  })
})

describe('mock lab projection', () => {
  it('preserves A/B/C disclosure isolation', async () => {
    const a = await handle('POST', '/lab/sessions', { condition: 'A', judge: 'A', size: 1 }) as LabSession
    const b = await handle('POST', '/lab/sessions', { condition: 'B', judge: 'B', size: 1 }) as LabSession
    const c = await handle('POST', '/lab/sessions', { condition: 'C', judge: 'C', size: 1 }) as LabSession
    const recA = await handle('GET', `/records/${a.caseIds[0]}?labSessionId=${a.id}`, {}) as Records
    const recB = await handle('GET', `/records/${b.caseIds[0]}?labSessionId=${b.id}`, {}) as Records
    const recC = await handle('GET', `/records/${c.caseIds[0]}?labSessionId=${c.id}`, {}) as Records
    expect(recA.trials[0].claims).toEqual([])
    expect(recA.trials[0].screening).toBeNull()
    expect(recB.trials[0].claims).toEqual([])
    expect(recB.trials[0].screening).not.toBeNull()
    expect(recC.trials[0].claims.length).toBeGreaterThan(0)
    expect(recC.trials[0].trace.length).toBeGreaterThan(0)
  })
})

describe('mock reload recovery', () => {
  it('restores old made entries before their visibleAt instead of regenerating with now', async () => {
    const storage = (() => {
      const values = new Map<string, string>()
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) },
        clear: () => { values.clear() },
      }
    })()
    vi.stubGlobal('sessionStorage', storage)
    storage.setItem('ai-court-mock-v1', JSON.stringify({
      ledger: [{
        id: 'H-reload',
        at: '2026-10-02T10:05:00.000Z',
        caseId: 'mock-005',
        instance: 1,
        judge: { seat: 1, name: '판사A', soloMode: false },
        labSessionId: null,
        type: 'first_impression',
        data: { leaning: 'not_clickbait', confidence: 80 },
        context: { balance: null, aiRecommendationShown: false, scaleVisible: false },
      }],
      sessions: [],
      seq: 900,
      made: [{ caseId: 'mock-005', instance: 1, visibleAt: Date.parse('2026-10-02T10:00:00.000Z') }],
      variants: [],
    }))
    vi.resetModules()
    const reloaded = await import('./handlers')
    const records = await reloaded.handle('GET', '/records/mock-005', {}) as Records
    const trial = records.trials[0]
    expect(trial.createdAt).toBe('2026-10-02T09:59:52.300Z')
    expect(Date.parse(trial.trace.at(-1)!.at)).toBeLessThan(Date.parse(records.ledger[0].at))
    vi.unstubAllGlobals()
  })

  it('restores new made entries with their saved createdAt', async () => {
    const storage = (() => {
      const values = new Map<string, string>()
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) },
        clear: () => { values.clear() },
      }
    })()
    vi.stubGlobal('sessionStorage', storage)
    storage.setItem('ai-court-mock-v1', JSON.stringify({
      ledger: [],
      sessions: [],
      seq: 901,
      made: [{ caseId: 'mock-005', instance: 1, visibleAt: Date.parse('2026-10-02T10:00:00.000Z'), createdAt: '2026-10-02T09:58:00.000Z' }],
      variants: [],
    }))
    vi.resetModules()
    const reloaded = await import('./handlers')
    const records = await reloaded.handle('GET', '/records/mock-005', {}) as Records
    expect(records.trials[0].createdAt).toBe('2026-10-02T09:58:00.000Z')
    vi.unstubAllGlobals()
  })
})
