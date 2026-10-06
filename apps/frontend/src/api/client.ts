// 서버 API 호출 래퍼
import type {
  AgentProfile, Answer, Case, CaseSummary, Condition, Dashboard, ExecutionView, Instance, JobInfo, LabSession, LedgerEntry, NewLedgerEntry, Ontology, Policy, ProgressDoc, Records, Stats, TrialRecord, WorkflowDefinition,
  NewCase, Health,
} from './types'
import { ApiError } from './error'

export { ApiError }

// 요청 한 번 보내기
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (import.meta.env.VITE_MOCK === '1') {
    const mock = await import('./mock/handlers')
    return (await mock.handle(method, path, body)) as T
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.json().then((j: { detail?: string }) => j.detail).catch(() => undefined)
    throw new ApiError(res.status, detail ?? `요청에 실패했습니다 (${res.status})`)
  }
  return (await res.json()) as T
}

// 쿼리 문자열 조립
function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

// 서버 데이터 접근 함수 모음
export const api = {
  health: () => request<Health>('GET', '/health'),
  progress: () => request<ProgressDoc>('GET', '/progress'),
  ontology: () => request<Ontology>('GET', '/ontology'),
  workflow: () => request<WorkflowDefinition>('GET', '/workflow'),
  cases: (p: { track?: string; stage?: string } = {}) => request<CaseSummary[]>('GET', `/cases${query(p)}`),
  createCase: (body: NewCase) => request<Case>('POST', '/cases', body),
  caseById: (id: string) => request<Case>('GET', `/cases/${id}`),
  trial: (id: string, n: Instance, labSessionId?: string) => request<TrialRecord>('GET', `/cases/${id}/trials/${n}${query({ labSessionId })}`),
  execution: (id: string, n: Instance) => request<ExecutionView>('GET', `/cases/${id}/execution${query({ instance: String(n) })}`),
  createTrial: (id: string, n: Instance, judgeNotes?: string) => request<{ jobId: string }>('POST', `/cases/${id}/trials/${n}`, { judgeNotes }),
  job: (jobId: string, since?: number) => request<JobInfo>('GET', `/jobs/${jobId}${query({ since: since === undefined ? undefined : String(since) })}`),
  retryJob: (jobId: string) => request<{ jobId: string }>('POST', `/jobs/${jobId}/retry`),
  cancelJob: (jobId: string) => request<JobInfo>('POST', `/jobs/${jobId}/cancel`),
  ledger: (caseId?: string) => request<LedgerEntry[]>('GET', `/ledger${query({ caseId })}`),
  postLedger: (entry: NewLedgerEntry) => request<LedgerEntry>('POST', '/ledger', entry),
  records: (id: string, labSessionId?: string) => request<Records>('GET', `/records/${id}${query({ labSessionId })}`),
  answer: (id: string) => request<Answer>('GET', `/cases/${id}/answer`),
  labAnswer: (sessionId: string, caseId: string) => request<Answer>('GET', `/lab/sessions/${sessionId}/answers/${caseId}`),
  stats: () => request<Stats>('GET', '/stats'),
  labConditions: () => request<Condition[]>('GET', '/lab/conditions'),
  createLabSession: (condition: string, judge: string, size?: number) => request<LabSession>('POST', '/lab/sessions', { condition, judge, size }),
  labSession: (id: string) => request<LabSession>('GET', `/lab/sessions/${id}`),
  dashboard: () => request<Dashboard>('GET', '/dashboard'),
  agents: () => request<AgentProfile[]>('GET', '/agents'),
  policy: () => request<Policy>('GET', '/policy'),
  savePolicy: (p: Policy) => request<Policy>('PUT', '/policy', p),
  intake: (caseIds?: string[]) => request<{ jobId: string }>('POST', '/intake', { caseIds }),
  createVariant: (caseId: string, attack: string) => request<{ case: CaseSummary; jobId: string }>('POST', '/lab/variants', { caseId, attack }),
}
