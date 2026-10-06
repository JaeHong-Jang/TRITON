// 선택 항목 상세 패널
import { Link } from 'react-router'
import type { Case, Instance, TrialRecord } from '../../api/types'
import type { ControlEdge, ControlGraph, ControlNode } from '../../lib/controlTypes'
import { GROUP_LABELS, KIND_LABELS } from '../../lib/controlTypes'

const STATUS_LABELS: Record<string, string> = {
  verified: '원문 일치',
  misnumbered: '문장 번호 오류',
  title: '제목 인용',
  present: '부재 주장 실패',
  fabricated: '원문 불일치',
  admitted: '채택',
  struck: '기각',
}

// 빈 값 대체
function valueOf(value: unknown): string {
  if (value === null || value === undefined || value === '') return '없음'
  return String(value)
}

// 시각 표시
function dateLabel(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}

// 선택 노드 이웃 목록
function adjacentNodes(graph: ControlGraph, selectedId: string): ControlNode[] {
  const ids = new Set<string>()
  graph.edges.forEach((edge) => {
    if (edge.from === selectedId) ids.add(edge.to)
    if (edge.to === selectedId) ids.add(edge.from)
  })
  return graph.nodes.filter((node) => ids.has(node.id))
}

// 노드 상태 표시
function nodeStatus(node: ControlNode): string {
  const raw = node.status ?? node.ruling ?? null
  return raw ? STATUS_LABELS[raw] ?? raw : '상태 없음'
}

// 기록 메타데이터 목록
function recordFields(record: TrialRecord | null): { label: string; value: string }[] {
  if (!record) return []
  const seconds = record.calls.reduce((sum, call) => sum + call.seconds, 0)
  const evidenceCount = record.claims.reduce((sum, claim) => sum + claim.evidence.length, 0)
  return [
    { label: '모델', value: record.model.name },
    { label: '온톨로지', value: `v${record.ontologyVersion}` },
    { label: '생성 시각', value: dateLabel(record.createdAt) },
    { label: '주장/근거', value: `${record.claims.length}개 / ${evidenceCount}개` },
    { label: '모델 호출', value: `${record.calls.length}회 · ${seconds.toFixed(1)}초` },
    { label: '실행', value: record.execution ? `${record.execution.runId} · ${record.execution.attempt}차` : '저장 기록' },
  ]
}

// 선택한 간선 상세
function EdgeDetail({ edge, graph, onSelect }: { edge: ControlEdge; graph: ControlGraph; onSelect: (id: string | null) => void }) {
  const from = graph.nodes.find((node) => node.id === edge.from) ?? null
  const to = graph.nodes.find((node) => node.id === edge.to) ?? null
  return (
    <article className="cr-detail-body">
      <div className="cr-detail-title">
        <span>{edge.label}</span>
        <strong>기록에 연결된 관계</strong>
      </div>
      <p className="cr-detail-text">{edge.detail}</p>
      <div className="cr-detail-neighbors">
        {[from, to].filter((node): node is ControlNode => Boolean(node)).map((node) => (
          <button key={node.id} type="button" onClick={() => onSelect(node.id)}>
            {KIND_LABELS[node.kind]} · {node.label}
          </button>
        ))}
      </div>
    </article>
  )
}

// 선택한 노드 상세
function NodeDetail({ node, graph, article, record, caseId, instance, onSelect, onShowLog }: { node: ControlNode; graph: ControlGraph; article: Case; record: TrialRecord | null; caseId: string; instance: Instance; onSelect: (id: string | null) => void; onShowLog: (claimId: string) => void }) {
  const sentence = node.sentenceNo ? article.sentences.find((item) => item.no === node.sentenceNo) ?? null : null
  const neighbors = adjacentNodes(graph, node.id)
  return (
    <article className="cr-detail-body">
      <div className="cr-detail-title">
        <span>{GROUP_LABELS[node.group]} · {KIND_LABELS[node.kind]}</span>
        <strong>{node.label}</strong>
      </div>
      <dl className="cr-detail-grid">
        <div><dt>담당</dt><dd>{GROUP_LABELS[node.group]}</dd></div>
        <div><dt>상태</dt><dd>{nodeStatus(node)}</dd></div>
        <div><dt>식별자</dt><dd>{node.id}</dd></div>
        {node.claimId ? <div><dt>주장</dt><dd>{node.claimId}</dd></div> : null}
        {node.evidenceId ? <div><dt>근거</dt><dd>{node.evidenceId}</dd></div> : null}
        {node.agentId ? <div><dt>에이전트</dt><dd>{node.agentId}</dd></div> : null}
        {node.fields.map((field) => <div key={`${node.id}-${field.label}`}><dt>{field.label}</dt><dd>{valueOf(field.value)}</dd></div>)}
      </dl>
      <p className="cr-detail-text">{node.detail}</p>
      {sentence ? <blockquote className="cr-source-quote">#{sentence.no} {sentence.text}</blockquote> : null}
      {node.claimId ? <div className="cr-detail-actions"><button type="button" onClick={() => onShowLog(node.claimId!)}>관련 로그 보기</button><Link to={`/court/${caseId}`}>법정에서 검토 ↗</Link></div> : null}
      {node.kind === 'judgment' ? <Link className="cr-detail-link" to={`/records/${caseId}#inst-${instance}`}>{instance}심 판결 기록 보기</Link> : null}
      {neighbors.length ? (
        <div className="cr-detail-neighbors" aria-label="연결된 노드">
          {neighbors.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)}>{KIND_LABELS[item.kind]} · {item.label}</button>)}
        </div>
      ) : <p className="cr-muted">연결된 노드가 없습니다.</p>}
      {record ? (
        <details className="cr-record-meta">
          <summary>{record.instance}심 공개 기록 메타</summary>
          <dl className="cr-detail-grid">
            {recordFields(record).map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
          </dl>
        </details>
      ) : null}
    </article>
  )
}

// 선택 대기 안내
function EmptyDetail({ graph, article }: { graph: ControlGraph; article: Case }) {
  const publicGroups = Object.entries(GROUP_LABELS)
    .map(([id, label]) => ({ id, label, count: graph.nodes.filter((node) => node.group === id).length }))
    .filter((item) => item.count > 0)
  return (
    <article className="cr-detail-body">
      <div className="cr-detail-title">
        <span>선택 대기</span>
        <strong>그래프에서 노드나 선을 선택하세요.</strong>
      </div>
      <p className="cr-detail-text">선택하면 담당 주체, 검증 상태, 연결된 원문과 사람 판단 기록을 이 패널에서 확인할 수 있습니다.</p>
      <div className="cr-legend-list">
        {Object.entries(KIND_LABELS).map(([id, label]) => <span key={id}>{label}</span>)}
      </div>
      {publicGroups.length ? (
        <dl className="cr-detail-grid" aria-label="공개된 그래프 항목">
          {publicGroups.map((item) => <div key={item.id}><dt>{item.label}</dt><dd>공개된 항목 {item.count}개</dd></div>)}
        </dl>
      ) : <p className="cr-muted">아직 공개된 그래프 항목이 없습니다.</p>}
      <details className="cr-article-text">
        <summary>전체 원문 보기</summary>
        <h4>{article.title}</h4>
        {article.subtitle ? <p>{article.subtitle}</p> : null}
        <ol>
          {article.sentences.map((sentence) => <li key={sentence.no}><b>{sentence.no}</b>{sentence.text}</li>)}
        </ol>
      </details>
    </article>
  )
}

// 그래프 상세 컴포넌트
export function ControlDetails({ graph, selectedId, selectedEdgeId, article, record, caseId, instance, onSelect, onShowLog }: { graph: ControlGraph; selectedId: string | null; selectedEdgeId: string | null; article: Case; record: TrialRecord | null; caseId: string; instance: Instance; onSelect: (id: string | null) => void; onShowLog: (claimId: string) => void }) {
  const node = selectedId ? graph.nodes.find((item) => item.id === selectedId) ?? null : null
  const edge = selectedEdgeId ? graph.edges.find((item) => item.id === selectedEdgeId) ?? null : null
  return (
    <section className="cr-panel cr-details" aria-label="선택 상세">
      <header className="cr-section-head">
        <div><span className="cr-kicker">03 / DETAIL</span><h3>선택 상세</h3></div>
        {(node || edge) ? <button type="button" className="cr-clear" onClick={() => onSelect(null)}>선택 해제</button> : null}
      </header>
      {node ? <NodeDetail node={node} graph={graph} article={article} record={record} caseId={caseId} instance={instance} onSelect={onSelect} onShowLog={onShowLog} /> : edge ? <EdgeDetail edge={edge} graph={graph} onSelect={onSelect} /> : <EmptyDetail graph={graph} article={article} />}
    </section>
  )
}
