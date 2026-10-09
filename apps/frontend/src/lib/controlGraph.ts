// 관제 화면용 사건·온톨로지 그래프 생성
import type { ActionLevel, Case, Claim, Evidence, EvidenceKind, EvidenceStatus, Instance, LedgerEntry, Ontology, Ruling, Side, TrialRecord } from '../api/types'
import type { ControlEdge, ControlField, ControlGraph, ControlGroup, ControlNode, GraphMode } from './controlTypes'

type Disclosure = 'hidden' | 'open'
type ClaimTypeFull = Ontology['claim_types'][number] & { evidence_kinds?: EvidenceKind[]; signals?: string[] }
type EvidenceKindFull = Ontology['evidence_kinds'][EvidenceKind] & { check?: string; fields?: string[] }
type StatusFull = Ontology['evidence_status'][EvidenceStatus] & { voids_claim?: boolean }
type RichNode = ControlNode & { claimIds?: string[]; evidenceIds?: string[] }

interface BuildControlGraphInput {
  article: Case | null
  record: TrialRecord | null
  ledger: LedgerEntry[]
  ontology: Ontology | null
  disclosure: Disclosure
  mode: GraphMode
  instance: Instance
}

const STATUS_LABELS: Record<EvidenceStatus, string> = {
  verified: '원문 일치(인용·부재)',
  misnumbered: '문장 번호 오류',
  title: '제목 인용',
  present: '본문에 존재',
  fabricated: '원문에 없음',
}

const RULING_LABELS: Record<Ruling, string> = { admitted: '채택', struck: '기각' }

const LEDGER_LABELS: Record<string, string> = {
  evidence_ruling: '근거 판정',
  seat_verdict: '판사석 판결',
  appeal: '항소',
  final: '최종 판결',
}

// 관제 그래프 생성
export function buildControlGraph(input: BuildControlGraphInput): ControlGraph {
  const nodes = new Map<string, RichNode>()
  const edges = new Map<string, ControlEdge>()
  const notice: string[] = []
  const caseId = input.article?.id ?? input.record?.caseId ?? null
  const usableRecord = input.record && input.record.instance === input.instance && (!input.article || input.record.caseId === input.article.id) ? input.record : null
  const visibleRecord = input.disclosure === 'open' ? usableRecord : null
  const versionMatches = !!(visibleRecord && input.ontology && visibleRecord.ontologyVersion === input.ontology.version)

  if (input.record && !usableRecord) notice.push('선택한 사건·심급과 다른 재판 기록은 그래프에서 제외했습니다.')
  if (input.mode === 'connected' && visibleRecord && input.ontology && !versionMatches) notice.push(`기록 온톨로지 v${visibleRecord.ontologyVersion}와 현재 v${input.ontology.version}가 달라 사건-온톨로지 연결을 표시하지 않습니다.`)

  const addNode = (node: RichNode) => nodes.set(node.id, node)
  const addEdge = (edge: ControlEdge) => {
    if (nodes.has(edge.from) && nodes.has(edge.to)) edges.set(edge.id, edge)
  }

  if (input.mode !== 'ontology') addArticle(input.article, addNode, addEdge)
  if (input.mode === 'ontology') addOntology(input.ontology, addNode, addEdge)
  else if (input.mode === 'connected') addOntology(input.ontology, addNode, addEdge)
  if (input.mode !== 'ontology' && visibleRecord) {
    addRecord(visibleRecord, input.article, input.ontology, input.mode, versionMatches, addNode, addEdge)
    addLedger(visibleRecord, input.ledger, caseId, input.instance, addNode, addEdge)
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()], notice: notice.length ? notice.join(' ') : null }
}

// 기사와 문장 노드 생성
function addArticle(article: Case | null, addNode: (node: RichNode) => void, addEdge: (edge: ControlEdge) => void) {
  if (!article) return
  const articleId = `article:${article.id}`
  addNode({
    id: articleId,
    kind: 'article',
    group: 'source',
    label: article.title,
    detail: article.subtitle || '공개 기사 원문입니다.',
    fields: fields([['사건', article.id], ['분야', `${article.category}/${article.subcategory}`], ['문장 수', String(article.sentences.length)]]),
  })
  for (const s of article.sentences) {
    const id = `sentence:${s.no}`
    addNode({ id, kind: 'sentence', group: 'source', label: `${s.no}번 문장`, detail: s.text, sentenceNo: s.no, fields: fields([['문장 번호', String(s.no)]]) })
    addEdge({ id: `edge:${articleId}->${id}`, from: articleId, to: id, label: '본문 문장', detail: '공개 기사 본문을 문장 단위로 나눈 원문입니다.' })
  }
}

// 재판 기록 노드 생성
function addRecord(record: TrialRecord, article: Case | null, ontology: Ontology | null, mode: GraphMode, versionMatches: boolean, addNode: (node: RichNode) => void, addEdge: (edge: ControlEdge) => void) {
  const agents = new Map(record.bench.map((a) => [a.id, a.side]))
  const evidenceById = new Map<string, { claim: Claim; evidence: Evidence }>()
  const articleId = article ? `article:${article.id}` : null

  for (const claim of record.claims) {
    const claimNode = claimId(claim.id)
    const evidenceIds = claim.evidence.map((e) => e.id)
    addNode({
      id: claimNode,
      kind: 'claim',
      group: groupForSide(agents.get(claim.agentId)),
      label: claim.text || claim.type,
      detail: 'AI가 제출한 주장입니다. 원문 검증 통과 여부와 주장의 타당성은 별도입니다.',
      claimId: claim.id,
      agentId: claim.agentId,
      claimType: claim.type,
      claimIds: [claim.id],
      evidenceIds,
      fields: fields([['유형', claimTypeLabel(ontology, claim.type)], ['강도', String(claim.strength)], ['수정', `${claim.revisions}회`], ['검토 필요', claim.escalated ? '예' : '아니오']]),
    })
    if (articleId) addEdge({ id: `edge:${claimNode}->${articleId}:about`, from: claimNode, to: articleId, label: '기사 판단 주장', detail: '주장이 공개 기사 전체에 대해 낚시성 여부를 다툽니다.' })

    for (const evidence of claim.evidence) {
      evidenceById.set(evidence.id, { claim, evidence })
      addEvidence(claim, evidence, agents.get(claim.agentId), addNode)
    }
  }

  for (const { claim, evidence } of evidenceById.values()) {
    addEvidenceRelations(claim, evidence, addEdge)
    addVerificationEdges(evidence, articleId, addEdge)
  }
  for (const claim of record.claims) {
    if (claim.rebuts && evidenceById.has(claim.rebuts)) addEdge({ id: `edge:${claimId(claim.id)}->${evidenceId(claim.rebuts)}:rebuts`, from: claimId(claim.id), to: evidenceId(claim.rebuts), label: '반박 대상', detail: '반박 주장이 실제 존재하는 상대 근거를 겨냥합니다.' })
  }

  if (mode === 'connected' && ontology) addRecordOntologyLinks(record, ontology, versionMatches, addNode, addEdge)
}

// 근거와 검증 노드 생성
function addEvidence(claim: Claim, evidence: Evidence, side: Side | undefined, addNode: (node: RichNode) => void) {
  const evNode = evidenceId(evidence.id)
  const checkNode = checkId(evidence.id)
  const statusLabel = evidence.status === 'verified' ? (evidence.kind === 'quote' ? '인용 원문 일치' : '핵심어 부재 확인') : STATUS_LABELS[evidence.status]
  addNode({
    id: evNode,
    kind: 'evidence',
    group: groupForSide(side),
    label: evidence.kind === 'quote' ? (evidence.quote || '본문 인용') : (evidence.keyword || '핵심어 부재'),
    detail: evidence.kind === 'absence' ? '본문 전체에서 핵심어 부재를 대조한 근거입니다.' : '기사 원문 위치를 따라갈 수 있는 제출 근거입니다.',
    claimId: claim.id,
    evidenceId: evidence.id,
    evidenceKind: evidence.kind,
    status: evidence.status,
    sentenceNo: evidence.sentenceNo ?? undefined,
    claimIds: [claim.id],
    evidenceIds: [evidence.id],
    fields: fields([['근거 종류', evidence.kind], ['입장', evidence.stance], ['제출 문장', textOf(evidence.sentenceNo)], ['검증 상태', statusLabel], ['실제 발견', textOf(evidence.foundIn)]]),
  })
  addNode({
    id: checkNode,
    kind: 'check',
    group: 'checker',
    label: statusLabel,
    detail: '코드가 원문 위치와 형식을 검증한 결과입니다. 이 결과는 주장 타당성이나 최종 판결이 아닙니다.',
    claimId: claim.id,
    evidenceId: evidence.id,
    evidenceKind: evidence.kind,
    status: evidence.status,
    claimIds: [claim.id],
    evidenceIds: [evidence.id],
    fields: fields([['판단 범위', evidence.kind === 'absence' ? '본문 전체' : '제출 위치/실제 위치'], ['상태', evidence.status]]),
  })
}

// 근거 제출 관계 생성
function addEvidenceRelations(claim: Claim, evidence: Evidence, addEdge: (edge: ControlEdge) => void) {
  addEdge({ id: `edge:${claimId(claim.id)}->${evidenceId(evidence.id)}:supports`, from: claimId(claim.id), to: evidenceId(evidence.id), label: '지지 근거로 제출', detail: 'AI가 주장 근거로 제출한 관계입니다. 원문 검증 및 사람의 채택과 별도입니다.' })
  addEdge({ id: `edge:${evidenceId(evidence.id)}->${checkId(evidence.id)}:checked`, from: evidenceId(evidence.id), to: checkId(evidence.id), label: '코드 검증', detail: '제출 근거를 원문 대조 규칙으로 검사합니다.' })
  if (evidence.sentenceNo) addEdge({ id: `edge:${evidenceId(evidence.id)}->${sentenceId(evidence.sentenceNo)}:submitted`, from: evidenceId(evidence.id), to: sentenceId(evidence.sentenceNo), label: '제출 위치', detail: 'AI가 제출한 문장 번호입니다.' })
}

// 원문 검증 관계 생성
function addVerificationEdges(evidence: Evidence, articleId: string | null, addEdge: (edge: ControlEdge) => void) {
  const from = checkId(evidence.id)
  if (evidence.status === 'fabricated') return
  if (evidence.kind === 'absence') {
    if (articleId) addEdge({ id: `edge:${from}->${articleId}:absence`, from, to: articleId, label: evidence.status === 'present' ? '본문에서 발견' : '본문 전체 대조', detail: evidence.status === 'present' ? '없어야 할 핵심어가 본문에 있어 이 근거는 약해집니다.' : '본문 전체에서 핵심어 부재를 대조했습니다.' })
    return
  }
  if (evidence.status === 'title') {
    if (articleId) addEdge({ id: `edge:${from}->${articleId}:title`, from, to: articleId, label: '제목 대상', detail: '제목 인용은 본문 근거로 인정되는 원문 일치가 아닙니다.' })
    return
  }
  if (evidence.foundIn) {
    const label = evidence.status === 'misnumbered' ? '실제 발견 위치' : '원문 일치'
    addEdge({ id: `edge:${from}->${sentenceId(evidence.foundIn)}:found`, from, to: sentenceId(evidence.foundIn), label, detail: evidence.status === 'misnumbered' ? '제출 문장 번호와 실제 발견 위치를 분리해 표시합니다.' : '인용이 원문 문장에서 확인되었습니다.' })
  }
}

// 온톨로지 노드와 정적 관계 생성
function addOntology(ontology: Ontology | null, addNode: (node: RichNode) => void, addEdge: (edge: ControlEdge) => void) {
  if (!ontology) return
  for (const ct of ontology.claim_types as ClaimTypeFull[]) {
    addNode({ id: conceptId(ct.id), kind: 'concept', group: 'ontology', label: ct.label, detail: ct.definition, claimType: ct.id, fields: fields([['입장', ct.stance], ['온톨로지', `v${ontology.version}`]]) })
  }
  for (const kind of Object.keys(ontology.evidence_kinds) as EvidenceKind[]) {
    const spec = ontology.evidence_kinds[kind] as EvidenceKindFull
    addNode({ id: ruleId(kind), kind: 'rule', group: 'ontology', label: spec.label, detail: spec.check || '근거 종류 규칙입니다.', evidenceKind: kind, fields: fields([['필드', spec.fields?.join(', ') ?? '계약 타입'], ['온톨로지', `v${ontology.version}`]]) })
  }
  for (const status of Object.keys(ontology.evidence_status) as EvidenceStatus[]) {
    const spec = ontology.evidence_status[status] as StatusFull
    addNode({ id: statusRuleId(status), kind: 'rule', group: 'ontology', label: status === 'verified' ? STATUS_LABELS[status] : spec.label, detail: spec.voids_claim ? '이 상태는 같은 주장 근거 전체를 무효화할 수 있습니다.' : '근거 검증 상태 규칙입니다.', status, fields: fields([['가중치 배수', String(spec.factor)], ['상태', status]]) })
  }
  for (const level of Object.keys(ontology.actions) as ActionLevel[]) {
    const spec = ontology.actions[level]
    addNode({ id: actionRuleId(level), kind: 'rule', group: 'ontology', label: spec.label, detail: '최종 판결 이후 허용되는 조치 단계입니다.', fields: fields([['자율 범위', spec.autonomy], ['단계', level]]) })
  }
  for (const ct of ontology.claim_types as ClaimTypeFull[]) {
    for (const kind of ct.evidence_kinds ?? []) addEdge({ id: `edge:${conceptId(ct.id)}->${ruleId(kind)}:allows`, from: conceptId(ct.id), to: ruleId(kind), label: '허용 근거', detail: '온톨로지에 명시된 주장 유형과 근거 종류 관계입니다.' })
  }
  const statusOf: Record<EvidenceKind, EvidenceStatus[]> = { quote: ['verified', 'misnumbered', 'title', 'fabricated'], absence: ['verified', 'present'] }
  for (const kind of Object.keys(ontology.evidence_kinds) as EvidenceKind[]) for (const status of statusOf[kind] ?? []) addEdge({ id: `edge:${ruleId(kind)}->${statusRuleId(status)}:status`, from: ruleId(kind), to: statusRuleId(status), label: '검증 상태', detail: '이 근거 종류에서 코드 검증이 낼 수 있는 상태입니다.' })
  const actions = Object.keys(ontology.actions) as ActionLevel[]
  for (let i = 1; i < actions.length; i += 1) addEdge({ id: `edge:${actionRuleId(actions[i - 1])}->${actionRuleId(actions[i])}:level`, from: actionRuleId(actions[i - 1]), to: actionRuleId(actions[i]), label: '조치 단계', detail: '조치 강도 순서입니다.' })
}

// 사건과 온톨로지 연결 생성
function addRecordOntologyLinks(record: TrialRecord, ontology: Ontology, versionMatches: boolean, addNode: (node: RichNode) => void, addEdge: (edge: ControlEdge) => void) {
  if (!versionMatches) return
  const knownTypes = new Set(ontology.claim_types.map((c) => c.id))
  for (const claim of record.claims) {
    const target = knownTypes.has(claim.type) ? conceptId(claim.type) : unknownConceptId(claim.type)
    if (!knownTypes.has(claim.type)) addNode({ id: target, kind: 'concept', group: 'ontology', label: `미정의: ${claim.type}`, detail: '현재 온톨로지에 없는 주장 유형입니다.', claimType: claim.type, fields: fields([['상태', '미정의']]) })
    addEdge({ id: `edge:${claimId(claim.id)}->${target}:type`, from: claimId(claim.id), to: target, label: '주장 유형', detail: knownTypes.has(claim.type) ? '기록의 주장 유형을 현재 온톨로지 개념에 연결합니다.' : '기록에는 있으나 현재 온톨로지에는 없는 유형입니다.' })
    for (const evidence of claim.evidence) {
      addEdge({ id: `edge:${evidenceId(evidence.id)}->${ruleId(evidence.kind)}:kind`, from: evidenceId(evidence.id), to: ruleId(evidence.kind), label: '근거 종류', detail: '제출 근거의 코드 검증 형식입니다.' })
      addEdge({ id: `edge:${checkId(evidence.id)}->${statusRuleId(evidence.status)}:status`, from: checkId(evidence.id), to: statusRuleId(evidence.status), label: '검증 상태', detail: '코드 검증 결과와 온톨로지 상태 규칙을 연결합니다.' })
    }
  }
}

// 장부의 사람 판단 노드 생성
function addLedger(record: TrialRecord, ledger: LedgerEntry[], caseId: string | null, instance: Instance, addNode: (node: RichNode) => void, addEdge: (edge: ControlEdge) => void) {
  if (!caseId) return
  const evidenceIds = new Set(record.claims.flatMap((c) => c.evidence.map((e) => e.id)))
  const claimIds = new Set(record.claims.map((c) => c.id))
  const scoped = ledger.filter((e) => e.caseId === caseId && e.instance === instance && e.labSessionId === null)
  const latestRulings = new Map<string, LedgerEntry>()
  for (const entry of scoped) if (entry.type === 'evidence_ruling' && typeof entry.data.evidenceId === 'string') latestRulings.set(entry.data.evidenceId, entry)

  for (const entry of latestRulings.values()) {
    const evidence = String(entry.data.evidenceId)
    const ruling = entry.data.ruling as Ruling | null | undefined
    if (!ruling || !evidenceIds.has(evidence)) continue
    addJudgment(entry, [evidence], [], `${RULING_LABELS[ruling]} · ${evidence}`, addNode)
    addEdge({ id: `edge:${judgmentId(entry.id)}->${evidenceId(evidence)}:rules`, from: judgmentId(entry.id), to: evidenceId(evidence), label: RULING_LABELS[ruling], detail: '사람 판사가 이 근거를 채택하거나 기각했습니다.' })
  }

  for (const entry of scoped.filter((e) => e.type === 'seat_verdict' || e.type === 'appeal' || e.type === 'final')) {
    const linkedEvidence = arrayOfStrings(entry.data.evidenceIds).filter((id) => evidenceIds.has(id))
    const linkedClaims = arrayOfStrings(entry.data.claimIds).filter((id) => claimIds.has(id))
    addJudgment(entry, linkedEvidence, linkedClaims, verdictLabel(entry), addNode)
    for (const id of linkedEvidence) addEdge({ id: `edge:${judgmentId(entry.id)}->${evidenceId(id)}:mentions`, from: judgmentId(entry.id), to: evidenceId(id), label: '명시 근거', detail: '판결 기록에 명시된 근거 참조입니다.' })
    for (const id of linkedClaims) addEdge({ id: `edge:${judgmentId(entry.id)}->${claimId(id)}:mentions`, from: judgmentId(entry.id), to: claimId(id), label: '명시 주장', detail: '판결 기록에 명시된 주장 참조입니다.' })
  }
}

// 사람 판단 노드 추가
function addJudgment(entry: LedgerEntry, evidenceIds: string[], claimIds: string[], label: string, addNode: (node: RichNode) => void) {
  addNode({
    id: judgmentId(entry.id),
    kind: 'judgment',
    group: 'human',
    label,
    detail: LEDGER_LABELS[entry.type] ?? entry.type,
    instance: entry.instance,
    ruling: entry.type === 'evidence_ruling' ? (entry.data.ruling as Ruling | null) : null,
    evidenceIds,
    claimIds,
    fields: fields([['기록', entry.id], ['종류', LEDGER_LABELS[entry.type] ?? entry.type], ['판사석', `${entry.judge.seat}석`]]),
  })
}

// 필드 배열 생성
function fields(entries: [string, string | number | null | undefined][]): ControlField[] {
  return entries.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => ({ label, value: String(value) }))
}

// 에이전트 편을 군집으로 변환
function groupForSide(side: Side | undefined): ControlGroup {
  if (side === 'prosecution') return 'prosecution'
  if (side === 'defense') return 'defense'
  return 'checker'
}

// 주장 유형 라벨
function claimTypeLabel(ontology: Ontology | null, type: string): string {
  const found = ontology?.claim_types.find((c) => c.id === type)
  return found ? found.label : `미정의: ${type}`
}

// 숫자 텍스트 변환
function textOf(n: number | null): string {
  return n ? `${n}번` : '없음'
}

// 문자열 배열 정규화
function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

// 판결 라벨 생성
function verdictLabel(entry: LedgerEntry): string {
  if (entry.type === 'appeal') return '항소 기록'
  const verdict = entry.data.verdict === 'clickbait' ? '낚시성이다' : entry.data.verdict === 'not_clickbait' ? '낚시성 아니다' : '판결'
  return entry.type === 'final' ? `최종 ${verdict}` : `${entry.judge.seat}석 ${verdict}`
}

// 주장 노드 ID
const claimId = (id: string) => `claim:${id}`
// 근거 노드 ID
const evidenceId = (id: string) => `evidence:${id}`
// 검증 노드 ID
const checkId = (id: string) => `check:${id}`
// 문장 노드 ID
const sentenceId = (no: number) => `sentence:${no}`
// 온톨로지 개념 ID
const conceptId = (id: string) => `concept:${id}`
// 미정의 개념 ID
const unknownConceptId = (id: string) => `concept:unknown:${id}`
// 온톨로지 규칙 ID
const ruleId = (id: string) => `rule:${id}`
// 검증 상태 규칙 ID
const statusRuleId = (id: string) => `rule:status:${id}`
// 조치 단계 규칙 ID
const actionRuleId = (id: string) => `rule:action:${id}`
// 사람 판단 노드 ID
const judgmentId = (id: string) => `judgment:${id}`
