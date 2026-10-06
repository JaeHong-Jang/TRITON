// 실행 그래프 표시와 제어 판단
import type { ExecutionView, JobInfo, RunStatus, StepStatus } from '../api/types'

const TERMINAL = new Set<RunStatus>(['done', 'error', 'interrupted', 'cancelled'])
const RETRYABLE = new Set<RunStatus>(['error', 'interrupted', 'cancelled'])
const MAX_ATTEMPTS = 3
const CANCELLABLE = new Set<RunStatus>(['queued', 'running'])

// 작업이 끝난 상태인지 판정
export function isJobTerminal(status: RunStatus): boolean {
  return TERMINAL.has(status)
}

// 작업 재시도 가능 여부
export function canRetryJob(job: JobInfo | null): boolean {
  return !!job && RETRYABLE.has(job.status) && (!job.attempt || job.attempt < MAX_ATTEMPTS)
}

// 작업 취소 가능 여부
export function canCancelJob(job: JobInfo | null): boolean {
  return !!job && CANCELLABLE.has(job.status)
}

// 작업 시도와 그래프 버전 표시
export function jobAttemptLabel(job: Pick<JobInfo, 'attempt' | 'graphVersion'> | null): string {
  if (!job?.attempt || !job.graphVersion) return '옛 작업 형식'
  return `graph v${job.graphVersion} · attempt ${job.attempt}`
}

// 실행 출처 표시
export function sourceLabel(view: ExecutionView | null, mock: boolean): string {
  if (mock) return 'VITE_MOCK 시뮬레이션'
  if (!view) return '실행 그래프 없음'
  if (view.mode === 'live' && view.run && isJobTerminal(view.run.status)) return '실행 기록'
  if (view.mode === 'live') return '실시간 생성'
  if (view.mode === 'replay') return '저장된 재생'
  return '실행 전'
}

// 실행 공개 상태 설명
export function executionModeLabel(view: ExecutionView | null, mock: boolean): string {
  if (!view) return '옛 기록에는 실행 그래프 기록이 없습니다.'
  const base = sourceLabel(view, mock)
  const disclosure = view.disclosure === 'hidden' ? '첫인상 전 공개 제한' : '공개됨'
  return `${base} · ${disclosure} · ${view.reason}`
}

// 실행 상태 한국어 표시
export function runStatusLabel(status: RunStatus): string {
  const labels: Record<RunStatus, string> = {
    queued: '대기',
    running: '실행 중',
    done: '완료',
    error: '오류',
    interrupted: '중단됨',
    cancelled: '취소됨',
  }
  return labels[status]
}

// 실행 노드 상태 한국어 표시
export function stepStatusLabel(status: StepStatus): string {
  const labels: Record<StepStatus, string> = {
    pending: '대기',
    active: '현재',
    complete: '완료',
    blocked: '대기 조건',
    error: '오류',
  }
  return labels[status]
}
