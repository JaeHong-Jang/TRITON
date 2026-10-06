// 온톨로지 그래프의 노드·간선 배치 계산
import type { ActionLevel, EvidenceKind, EvidenceStatus, Ontology, Stance } from '../../api/types'

// 서버가 주는 값 중 타입에 없는 보조 필드를 포함한 주장 유형
export type ClaimTypeFull = Ontology['claim_types'][number] & { signals?: string[]; evidence_kinds?: EvidenceKind[] }

// 노드 종류
export type NodeKind = 'stance' | 'claim' | 'kind' | 'status' | 'action'
// 노드 색 종류
export type Tone = 'pro' | 'con' | 'derived' | 'ink' | 'ok' | 'warn' | 'dim' | 'bad' | 'ai' | 'approval' | 'human'

// 그래프 노드
export interface GNode { id: string; kind: NodeKind; label: string; sub: string; x: number; y: number; w: number; h: number; tone: Tone; solid: boolean }
// 그래프 간선
export interface GEdge { id: string; from: string; to: string; label: string | null; dashed: boolean; tone: Tone }
// 그래프 전체
export interface GGraph { nodes: GNode[]; edges: GEdge[]; width: number; height: number; rows: { y: number; label: string }[] }

// 온톨로지에 증거 종류가 없을 때 쓰는 기본 연결
const DEFAULT_KINDS: Record<string, EvidenceKind[]> = {
  title_body_mismatch: ['absence', 'quote'],
  curiosity_gap: ['quote', 'absence'],
}

// 증거 종류별로 나올 수 있는 검증 상태
const STATUS_OF: Record<EvidenceKind, EvidenceStatus[]> = {
  quote: ['verified', 'misnumbered', 'title', 'fabricated'],
  absence: ['verified', 'present'],
}

// 검증 상태 색
const STATUS_TONE: Record<EvidenceStatus, Tone> = { verified: 'ok', misnumbered: 'warn', title: 'dim', present: 'dim', fabricated: 'bad' }
// 조치 자율 범위 색
const AUTONOMY_TONE = { ai: 'ai', human_approval: 'approval', human_only: 'human' } as const

// 주장 유형이 쓸 수 있는 증거 종류
export function kindsOf(ct: ClaimTypeFull): EvidenceKind[] {
  return ct.evidence_kinds?.length ? ct.evidence_kinds : (DEFAULT_KINDS[ct.id] ?? ['quote'])
}

// 한 줄을 두 줄로 나누기
export function wrap2(s: string, max: number): string[] {
  if (s.length <= max) return [s]
  const words = s.split(' ')
  let a = ''
  for (const w of words) {
    if ((a + ' ' + w).trim().length > max && a) break
    a = (a + ' ' + w).trim()
  }
  const b = s.slice(a.length).trim()
  return b ? [a, b] : [a]
}

// 온톨로지로 그래프 배치 만들기
export function buildGraph(ont: Ontology): GGraph {
  const cts = ont.claim_types as ClaimTypeFull[]
  const pro = cts.filter((c) => c.stance === 'pro')
  const con = cts.filter((c) => c.stance === 'con')
  const derived = cts.filter((c) => c.stance === 'derived')
  const CW = 124
  const GP = 8
  const ordered = [...pro, ...derived, ...con]
  const width = Math.max(1000, ordered.length * (CW + GP) + 60)
  const x0 = (width - (ordered.length * (CW + GP) - GP)) / 2
  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const ROW = { stance: 48, claim: 168, kind: 304, status: 432, action: 580 }
  const claimX = new Map<string, number>()
  ordered.forEach((c, i) => claimX.set(c.id, x0 + i * (CW + GP) + CW / 2))
  const mid = (list: ClaimTypeFull[]) => (list.length ? list.reduce((s, c) => s + claimX.get(c.id)!, 0) / list.length : width / 2)

  for (const st of ['pro', 'con'] as Stance[]) {
    const list = st === 'pro' ? pro : con
    nodes.push({ id: `stance:${st}`, kind: 'stance', label: ont.stances[st].label, sub: ont.stances[st].meaning.replace(/ \(.*\)/, ''), x: mid(list), y: ROW.stance, w: 220, h: 54, tone: st, solid: true })
    for (const c of list) edges.push({ id: `e:stance:${st}:${c.id}`, from: `stance:${st}`, to: `claim:${c.id}`, label: null, dashed: false, tone: st })
  }
  for (const c of ordered) {
    const tone: Tone = c.stance === 'derived' ? 'derived' : c.stance
    nodes.push({ id: `claim:${c.id}`, kind: 'claim', label: c.label, sub: c.stance === 'derived' ? '파생 입장' : '', x: claimX.get(c.id)!, y: ROW.claim, w: CW, h: 54, tone, solid: false })
    if (c.stance === 'derived') for (const st of ['pro', 'con'] as Stance[]) edges.push({ id: `e:stance:${st}:${c.id}`, from: `stance:${st}`, to: `claim:${c.id}`, label: null, dashed: true, tone: 'derived' })
  }

  const kinds = Object.keys(ont.evidence_kinds) as EvidenceKind[]
  const kx = (k: EvidenceKind) => {
    const users = ordered.filter((c) => kindsOf(c).includes(k))
    const base = users.length ? users.reduce((s, c) => s + claimX.get(c.id)!, 0) / users.length : width / 2
    return k === 'absence' ? Math.min(base, width * 0.3) : Math.max(base, width * 0.5)
  }
  for (const k of kinds) nodes.push({ id: `kind:${k}`, kind: 'kind', label: ont.evidence_kinds[k].label, sub: '증거 종류', x: kx(k), y: ROW.kind, w: 170, h: 46, tone: 'ink', solid: false })
  for (const c of ordered) for (const k of kindsOf(c)) edges.push({ id: `e:${c.id}:${k}`, from: `claim:${c.id}`, to: `kind:${k}`, label: null, dashed: c.stance === 'derived', tone: c.stance === 'derived' ? 'derived' : c.stance })

  const statuses = Object.keys(ont.evidence_status) as EvidenceStatus[]
  const SW = 168
  const sx0 = (width - statuses.length * (SW + 16) + 16) / 2
  statuses.forEach((s, i) => {
    const e = ont.evidence_status[s]
    nodes.push({ id: `status:${s}`, kind: 'status', label: e.label, sub: `무게 ×${e.factor}`, x: sx0 + i * (SW + 16) + SW / 2, y: ROW.status, w: SW, h: 50, tone: STATUS_TONE[s], solid: false })
  })
  for (const k of kinds) for (const s of STATUS_OF[k].filter((x) => statuses.includes(x))) edges.push({ id: `e:${k}:${s}`, from: `kind:${k}`, to: `status:${s}`, label: `×${ont.evidence_status[s].factor}`, dashed: false, tone: 'ink' })

  const levels = Object.keys(ont.actions) as ActionLevel[]
  const AW = 206
  const ax0 = (width - levels.length * (AW + 22) + 22) / 2
  const AUTONOMY = { ai: '기록/안내', human_approval: '사람 승인', human_only: '사람만' }
  levels.forEach((l, i) => {
    const a = ont.actions[l]
    nodes.push({ id: `action:${l}`, kind: 'action', label: a.label, sub: `${AUTONOMY[a.autonomy]} · ${l}`, x: ax0 + i * (AW + 22) + AW / 2, y: ROW.action, w: AW, h: 58, tone: AUTONOMY_TONE[a.autonomy], solid: a.autonomy === 'human_only' })
    if (i > 0) edges.push({ id: `e:${levels[i - 1]}:${l}`, from: `action:${levels[i - 1]}`, to: `action:${l}`, label: null, dashed: false, tone: 'ink' })
  })

  const rows = [
    { y: ROW.stance, label: '입장' },
    { y: ROW.claim, label: '주장 유형' },
    { y: ROW.kind, label: '근거 종류' },
    { y: ROW.status, label: '검증 상태' },
    { y: ROW.action, label: '조치 단계' },
  ]
  return { nodes, edges, width, height: ROW.action + 60, rows }
}

// 노드에 이어진 간선 id 집합
export function touching(g: GGraph, id: string): { edges: Set<string>; nodes: Set<string> } {
  const es = g.edges.filter((e) => e.from === id || e.to === id)
  return { edges: new Set(es.map((e) => e.id)), nodes: new Set([id, ...es.flatMap((e) => [e.from, e.to])]) }
}
