// 실행 그래프 표시 논리 검증
import { describe, expect, it } from 'vitest'
import type { ExecutionView, JobInfo } from '../api/types'
import { canCancelJob, canRetryJob, executionModeLabel, isJobTerminal, jobAttemptLabel, sourceLabel } from './execution'
import { handle } from '../api/mock/handlers'

// 테스트용 작업 정보
const job = (status: JobInfo['status'], attempt: number | null = 1): JobInfo => ({
  id: 'job-1', caseId: 'c', instance: 1, status, step: '검증 중', done: 1, total: 3, error: null, startedAt: '2026-01-01T00:00:00.000Z',
  attempt: attempt ?? undefined, graphVersion: attempt === null ? undefined : '1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:01.000Z',
  events: [], partial: null,
})

describe('job status helpers', () => {
  it('error/interrupted/cancelled만 재시도할 수 있고 queued/running만 취소할 수 있다', () => {
    expect(['error', 'interrupted', 'cancelled'].filter((s) => canRetryJob(job(s as JobInfo['status'])))).toEqual(['error', 'interrupted', 'cancelled'])
    expect(canRetryJob(job('cancelled', 3))).toBe(false)
    expect(['queued', 'running'].filter((s) => canCancelJob(job(s as JobInfo['status'])))).toEqual(['queued', 'running'])
  })

  it('done/error/interrupted/cancelled는 terminal 상태다', () => {
    expect(['done', 'error', 'interrupted', 'cancelled'].filter((s) => isJobTerminal(s as JobInfo['status']))).toEqual(['done', 'error', 'interrupted', 'cancelled'])
  })

  it('attempt와 그래프 버전이 있으면 작업 꼬리표에 표시한다', () => {
    expect(jobAttemptLabel(job('running'))).toBe('graph v1 · attempt 1')
    expect(jobAttemptLabel(job('running', null))).toBe('옛 작업 형식')
  })
})

describe('execution labels', () => {
  const view = (mode: ExecutionView['mode'], run: JobInfo | null): ExecutionView => ({
    version: '1', caseId: 'c', instance: 1, mode, disclosure: 'hidden', phase: 'first_impression', reason: '첫인상 대기',
    steps: [], edges: [], agents: [], run, limits: { maxCalls: 4, maxRevisions: 2, maxRunAttempts: 3 },
  })

  it('실행 출처를 live/replay/not_started/mock로 구분한다', () => {
    expect(sourceLabel(view('live', job('running')), false)).toBe('실시간 생성')
    expect(sourceLabel(view('live', job('cancelled')), false)).toBe('실행 기록')
    expect(sourceLabel(view('replay', job('done')), false)).toBe('저장된 재생')
    expect(sourceLabel(view('not_started', null), false)).toBe('실행 전')
    expect(sourceLabel(view('live', job('running')), true)).toBe('VITE_MOCK 시뮬레이션')
  })

  it('first_impression 전 hidden 투영을 설명한다', () => {
    expect(executionModeLabel(view('live', job('running')), false)).toContain('첫인상 전')
  })
})

describe('mock execution controls', () => {
  it('cancelled mock jobs can be retried with a new attempt', async () => {
    const started = await handle('POST', '/cases/mock-005/trials/1', {}) as { jobId: string }
    const cancelled = await handle('POST', `/jobs/${started.jobId}/cancel`, {}) as JobInfo
    expect(cancelled.status).toBe('cancelled')
    const retried = await handle('POST', `/jobs/${started.jobId}/retry`, {}) as { jobId: string }
    const next = await handle('GET', `/jobs/${retried.jobId}`, {}) as JobInfo
    expect(next.id).toBe(started.jobId)
    expect(next.attempt).toBe(2)
    expect(['queued', 'running']).toContain(next.status)
  })
})
