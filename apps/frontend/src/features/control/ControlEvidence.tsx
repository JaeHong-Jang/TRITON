// 관제 근거 매트릭스
import { useMemo, useState } from 'react'
import type { Agent, Claim, Evidence, EvidenceStatus, Instance, LedgerEntry, Ruling, TrialRecord } from '../../api/types'

type EvidenceFilter = EvidenceStatus | 'all'
type EvidenceRow = { claim: Claim; evidence: Evidence; agent: Agent | null; ruling: Ruling | null; ruledAt: string | null }

const STATUS_LABELS: Record<EvidenceStatus, string> = {
  verified: '원문 대조 통과',
  misnumbered: '문장 번호 오류',
  title: '제목 인용',
  present: '부재 주장 실패',
  fabricated: '원문 불일치',
}

const STATUS_HELP: Record<EvidenceStatus, string> = {
  verified: '코드가 제출 위치와 원문을 확인했습니다. 주장의 타당성은 사람이 따로 봅니다.',
  misnumbered: '제출한 문장 번호가 원문 위치와 다릅니다.',
  title: '본문 근거가 아니라 제목에서만 확인된 인용입니다.',
  present: '없다고 주장한 핵심어가 본문에 있습니다.',
  fabricated: '제출 인용이 제목과 본문에서 확인되지 않았습니다.',
}

// 최신 사람 판단 맵
function latestRulings(ledger: LedgerEntry[], instance: Instance): Map<string, { ruling: Ruling | null; at: string }> {
  const entries = ledger
    .filter((entry) => !entry.labSessionId && entry.instance === instance && entry.type === 'evidence_ruling')
  const map = new Map<string, { ruling: Ruling | null; at: string }>()
  entries.forEach((entry) => {
    const evidenceId = typeof entry.data.evidenceId === 'string' ? entry.data.evidenceId : ''
    if (!evidenceId) return
    const raw = entry.data.ruling
    const ruling = raw === 'admitted' || raw === 'struck' ? raw : null
    map.set(evidenceId, { ruling, at: entry.at })
  })
  return map
}

// 근거 행 생성
function evidenceRows(record: TrialRecord | null, ledger: LedgerEntry[], instance: Instance): EvidenceRow[] {
  if (!record) return []
  const rulings = latestRulings(ledger, instance)
  const agents = new Map(record.bench.map((agent) => [agent.id, agent]))
  return record.claims.flatMap((claim) => claim.evidence.map((evidence) => {
    const ruling = rulings.get(evidence.id)
    return { claim, evidence, agent: agents.get(claim.agentId) ?? null, ruling: ruling?.ruling ?? null, ruledAt: ruling?.at ?? null }
  }))
}

// 안전한 비율 표시
function ratioText(count: number, total: number): string {
  if (!total) return '0 / 0'
  return `${count} / ${total} (${Math.round((count / total) * 100)}%)`
}

// 근거 요약 문장
function evidenceText(evidence: Evidence): string {
  if (evidence.kind === 'absence') return `본문에 '${evidence.keyword ?? '핵심어'}' 없음`
  return `#${evidence.sentenceNo ?? '?'} "${evidence.quote ?? '인용 없음'}"`
}

// 에이전트 표시
function agentLabel(agent: Agent | null, claim: Claim): string {
  const role = agent?.side === 'prosecution' ? '검사' : agent?.side === 'defense' ? '변호인' : agent?.side === 'officer' ? '재판연구관' : '에이전트'
  return `${role} · ${agent?.name ?? claim.agentId}`
}

// 사람 판단 표시
function rulingLabel(ruling: Ruling | null): string {
  if (ruling === 'admitted') return '사람 채택'
  if (ruling === 'struck') return '사람 기각'
  return '사람 미검토'
}

// 근거 매트릭스 컴포넌트
export function ControlEvidence({ record, ledger, hidden, instance, onSelect, selectedId }: { record: TrialRecord | null; ledger: LedgerEntry[]; hidden: boolean; instance: Instance; onSelect: (id: string) => void; selectedId: string | null }) {
  const [filter, setFilter] = useState<EvidenceFilter>('all')
  const rows = useMemo(() => evidenceRows(hidden ? null : record, ledger, instance), [hidden, instance, ledger, record])
  const visible = rows.filter((row) => filter === 'all' || row.evidence.status === filter)
  const total = rows.length
  const verified = rows.filter((row) => row.evidence.status === 'verified').length
  const reviewed = rows.filter((row) => row.ruling === 'admitted' || row.ruling === 'struck').length
  if (hidden) {
    return (
      <section className="cr-panel cr-evidence" aria-label="근거 검증 매트릭스">
        <header className="cr-section-head"><div><span className="cr-kicker">04 / EVIDENCE</span><h3>근거 검증</h3></div></header>
        <p className="cr-hidden-note">첫인상을 기록하기 전에는 AI 주장, 근거 수, 수정·실패 경로를 공개하지 않습니다.</p>
      </section>
    )
  }
  return (
    <section className="cr-panel cr-evidence" aria-label="근거 검증 매트릭스">
      <header className="cr-section-head">
        <div><span className="cr-kicker">04 / EVIDENCE</span><h3>근거 검증</h3></div>
        <select value={filter} onChange={(event) => setFilter(event.target.value as EvidenceFilter)} aria-label="검증 상태 필터">
          <option value="all">전체 상태</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </header>
      <dl className="cr-metrics">
        <div><dt>제출 근거</dt><dd>{total}개</dd></div>
        <div><dt>원문 대조 통과</dt><dd>{ratioText(verified, total)}</dd></div>
        <div><dt>사람 검토</dt><dd>{ratioText(reviewed, total)}</dd></div>
      </dl>
      {visible.length ? (
        <div className="cr-evidence-grid">
          {visible.map(({ claim, evidence, agent, ruling, ruledAt }) => (
            <button key={evidence.id} type="button" className={`cr-evidence-cell cr-evidence-${evidence.status}`} title={`${evidenceText(evidence)} · ${STATUS_HELP[evidence.status]}`} aria-label={`${evidence.id} · ${STATUS_LABELS[evidence.status]} · ${agentLabel(agent, claim)} · ${evidenceText(evidence)} · ${rulingLabel(ruling)}`} aria-pressed={selectedId === evidence.id || selectedId === `evidence:${evidence.id}`} onClick={() => onSelect(`evidence:${evidence.id}`)}>
              <strong>{evidence.status === 'verified' ? '✓' : '!'} {evidence.id}</strong>
              <span className="cr-cell-top"><b>{STATUS_LABELS[evidence.status]}</b><small>{agent?.name ?? claim.agentId}</small></span>
              <small>{rulingLabel(ruling)}{ruledAt ? ` · ${new Date(ruledAt).toLocaleTimeString('ko-KR', { hour12: false })}` : ''}</small>
            </button>
          ))}
        </div>
      ) : <p className="cr-muted">표시할 근거가 없습니다.</p>}
      <p className="cr-muted">셀 하나는 제출 근거 하나입니다. 선택하면 원문과 검증 사유를 볼 수 있습니다. 검증 통과율은 기사 판별 정확도가 아닙니다.</p>
    </section>
  )
}
