// 실행과 사람 개입 로그
import { useMemo, useState } from 'react'
import type { AgentEvent, Instance, JobInfo, LedgerEntry, TrialRecord } from '../../api/types'
import { describeEntry } from '../../lib/ledger'

type LogFilter = 'all' | 'ai' | 'code' | 'human' | 'error'
type LogItem = {
  id: string
  at: string
  order: number
  source: 'ai' | 'code' | 'human'
  kind: string
  actor: string
  text: string
  detail: string
  selectId: string | null
  attempt: number | null
  error: boolean
}

const EVENT_LABELS: Record<AgentEvent['kind'], string> = {
  read: '읽기',
  plan: '계획',
  tool: '도구',
  draft: '초안',
  check: '코드 검증',
  revise: '수정',
  submit: '제출',
  escalate: '사람 검토',
  done: '완료',
  error: '오류',
}
const LEDGER_LABELS: Record<string, string> = { first_impression: '첫인상', reveal: '주장 공개', evidence_ruling: '근거 판정', seat_verdict: '판사석 판결', appeal: '항소', final: '최종 판결' }

// 시각 표시
function timeLabel(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}

// 이벤트 선택 대상
function selectIdOf(event: AgentEvent): string | null {
  if (event.claimId) return `claim:${event.claimId}`
  return null
}

// 이벤트 로그 항목
function eventItem(event: AgentEvent, index: number): LogItem {
  const code = event.agentId === 'checker' || event.kind === 'check' || event.kind === 'tool'
  const text = event.text
  return {
    id: `event:${event.at}:${event.seq}:${index}`,
    at: event.at,
    order: event.seq,
    source: code ? 'code' : 'ai',
    kind: EVENT_LABELS[event.kind],
    actor: code ? '코드 검증관' : event.agentId,
    text,
    detail: [event.reason, event.nodeId ? `노드 ${event.nodeId}` : '', event.fromNode ? `이전 ${event.fromNode}` : '', event.subjectAgentId ? `대상 ${event.subjectAgentId}` : ''].filter(Boolean).join(' · '),
    selectId: selectIdOf(event),
    attempt: event.attempt ?? null,
    error: event.kind === 'error',
  }
}

// 장부 선택 대상
function ledgerSelectId(entry: LedgerEntry): string | null {
  if (entry.type === 'reveal' && typeof entry.data.claimId === 'string') return `claim:${entry.data.claimId}`
  if (entry.type === 'evidence_ruling' && typeof entry.data.evidenceId === 'string') return `evidence:${entry.data.evidenceId}`
  if (entry.type === 'seat_verdict' || entry.type === 'final' || entry.type === 'appeal') return `judgment:${entry.id}`
  return null
}

// 장부 로그 항목
function ledgerItem(entry: LedgerEntry, index: number): LogItem {
  return {
    id: `ledger:${entry.id}`,
    at: entry.at,
    order: 100000 + index,
    source: 'human',
    kind: LEDGER_LABELS[entry.type] ?? entry.type,
    actor: `판사 ${entry.judge.seat}`,
    text: describeEntry(entry),
    detail: `장부 ${entry.id}`,
    selectId: ledgerSelectId(entry),
    attempt: null,
    error: false,
  }
}

// 관제 로그 생성
function buildLog(record: TrialRecord | null, run: JobInfo | null, ledger: LedgerEntry[], hidden: boolean, instance: Instance): LogItem[] {
  const human = ledger.filter((entry) => entry.instance === instance).map(ledgerItem)
  if (hidden) return human
  const events = run?.events.length ? run.events : record?.trace ?? []
  const machine = events.map(eventItem).map((item) => ({ ...item, selectId: item.attempt && run?.attempt && item.attempt !== run.attempt ? null : item.selectId && record?.claims.some((claim) => item.selectId === `claim:${claim.id}`) ? item.selectId : null }))
  if (run?.error) {
    machine.push({
      id: `run-error:${run.id}`,
      at: run.updatedAt ?? run.startedAt ?? new Date(0).toISOString(),
      order: 99999,
      source: 'code',
      kind: '작업 오류',
      actor: '작업 큐',
      text: run.error,
      detail: `${run.status} · ${run.step}`,
      selectId: null,
      attempt: run.attempt ?? null,
      error: true,
    })
  }
  return [...machine, ...human].sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order || a.id.localeCompare(b.id))
}

// 로그 필터 일치
function matches(item: LogItem, filter: LogFilter, query: string): boolean {
  if (filter !== 'all') {
    if (filter === 'error' && !item.error) return false
    if (filter !== 'error' && item.source !== filter) return false
  }
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${item.kind} ${item.actor} ${item.text} ${item.detail}`.toLowerCase().includes(q)
}

// 실행 로그 컴포넌트
export function ControlLog({ record, run, ledger, hidden, instance, onSelect, claimId = null, onClearClaim }: { record: TrialRecord | null; run: JobInfo | null; ledger: LedgerEntry[]; hidden: boolean; instance: Instance; onSelect: (id: string) => void; claimId?: string | null; onClearClaim?: () => void }) {
  const [filter, setFilter] = useState<LogFilter>('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(100)
  const all = useMemo(() => buildLog(record, run, ledger, hidden, instance), [hidden, instance, ledger, record, run])
  const rows = all.filter((item) => matches(item, filter, query) && (!claimId || item.selectId === `claim:${claimId}`))
  const visible = rows.slice(0, limit)
  return (
    <section className="cr-panel cr-log" aria-label="감사 로그">
      <header className="cr-section-head">
        <div><span className="cr-kicker">05 / LOG</span><h3>실행과 장부</h3></div>
        <span className="cr-muted">{hidden ? 'AI 이벤트 비공개' : `${rows.length}개`}</span>
      </header>
      <div className="cr-log-tools">
        <select value={filter} onChange={(event) => setFilter(event.target.value as LogFilter)} aria-label="로그 필터">
          <option value="all">전체</option>
          {!hidden ? <option value="ai">AI</option> : null}
          {!hidden ? <option value="code">코드</option> : null}
          <option value="human">사람</option>
          {!hidden ? <option value="error">오류</option> : null}
        </select>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="로그 검색" aria-label="로그 검색" />
      </div>
      {claimId ? <p className="cr-log-scope">주장 {claimId}에 식별자로 연결된 로그 <button type="button" onClick={onClearClaim}>전체 로그</button></p> : null}
      {hidden ? <p className="cr-hidden-note">첫인상 전에는 AI 내부 이벤트 수와 수정·실패 경로를 공개하지 않습니다. 사람의 장부 기록만 표시합니다.</p> : null}
      {visible.length ? (
        <ol className="cr-log-list">
          {visible.map((item) => (
            <li key={item.id} className={`cr-log-item cr-log-${item.source} ${item.error ? 'cr-log-error' : ''}`}>
              <time dateTime={item.at}>{timeLabel(item.at)}</time>
              <button type="button" disabled={!item.selectId} onClick={() => item.selectId ? onSelect(item.selectId) : undefined}>
                <span>{item.kind}{item.source !== 'human' ? ` · #${item.order}` : ''}{item.attempt ? ` · ${item.attempt}차` : ''}</span>
                <strong>{item.actor}</strong>
                <p>{item.text}</p>
              </button>
              {item.detail ? <details><summary>사유</summary><p>{item.detail}</p></details> : null}
            </li>
          ))}
        </ol>
      ) : <p className="cr-muted">표시할 로그가 없습니다.</p>}
      {rows.length > visible.length ? <button type="button" className="cr-more" onClick={() => setLimit((value) => value + 100)}>100개 더 보기</button> : null}
    </section>
  )
}
