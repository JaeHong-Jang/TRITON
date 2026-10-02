// 근거 그래프(에이전트 → 주장 → 근거 → 문장) 배치 계산
import type { EvidenceStatus, Sentence, Stance, TrialRecord } from '../../api/types'

// 열 종류
export type Col = 'agent' | 'claim' | 'ev' | 'sent'
// 근거 그래프 노드
export interface LNode { id: string; col: Col; x: number; y: number; w: number; h: number; stance?: Stance | 'derived'; status?: EvidenceStatus; title: string; text: string; badge?: string; warn?: boolean }
// 근거 그래프 간선
export interface LEdge { id: string; from: string; to: string; kind: 'agent' | 'support' | 'cite' | 'rebut'; stance: Stance | 'derived' | null }
// 근거 그래프 결과
export interface LGraph { nodes: LNode[]; edges: LEdge[]; width: number; height: number }

// 열 가로 위치와 폭
export const COLS: Record<Col, { x: number; w: number; h: number }> = {
  agent: { x: 0, w: 128, h: 42 },
  claim: { x: 184, w: 268, h: 74 },
  ev: { x: 580, w: 280, h: 48 },
  sent: { x: 930, w: 232, h: 52 },
}
const GAP = 10

// 글자 수를 넘으면 말줄임
export function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

// 겹치지 않게 위에서부터 밀어 내리며 y 정하기
function settle(items: { id: string; want: number; h: number }[]): Map<string, number> {
  const out = new Map<string, number>()
  let floor = 28
  for (const it of [...items].sort((a, b) => a.want - b.want)) {
    const y = Math.max(it.want - it.h / 2, floor)
    out.set(it.id, y)
    floor = y + it.h + GAP
  }
  return out
}

// 평균 중심 높이
function meanCenter(ids: string[], ys: Map<string, number>, hs: Map<string, number>, fallback: number): number {
  const cs = ids.filter((i) => ys.has(i)).map((i) => ys.get(i)! + hs.get(i)! / 2)
  return cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : fallback
}

// 재판 기록을 그래프 배치로 변환
export function layoutEvidence(rec: TrialRecord, sentences: Sentence[], claimLabel: (type: string) => string): LGraph {
  const agentOrder = new Map(rec.bench.map((a, i) => [a.id, i]))
  const claims = [...rec.claims].sort((a, b) => (agentOrder.get(a.agentId) ?? 0) - (agentOrder.get(b.agentId) ?? 0) || a.round - b.round)
  const sentenceText = new Map(sentences.map((s) => [s.no, s.text]))
  const nodes = new Map<string, LNode>()
  const edges: LEdge[] = []
  const ys = new Map<string, number>()
  const hs = new Map<string, number>()
  const mk = (n: Omit<LNode, 'x' | 'w' | 'h' | 'y'>) => {
    const c = COLS[n.col]
    nodes.set(n.id, { ...n, x: c.x, w: c.w, h: c.h, y: 0 })
    hs.set(n.id, c.h)
  }

  const evOrder: string[] = []
  for (const c of claims) for (const e of c.evidence) {
    evOrder.push(e.id)
    mk({ id: e.id, col: 'ev', status: e.status, title: e.kind === 'absence' ? `부재 '${e.keyword ?? ''}'` : `#${e.sentenceNo ?? '?'} “${clip(e.quote ?? '', 18)}”`, text: e.status })
    edges.push({ id: `s:${c.id}:${e.id}`, from: c.id, to: e.id, kind: 'support', stance: c.stance })
  }
  evOrder.forEach((id, i) => ys.set(id, 28 + i * (COLS.ev.h + GAP)))

  const bench = new Map(rec.bench.map((a) => [a.id, a]))
  for (const c of claims) {
    const a = bench.get(c.agentId)
    mk({ id: c.id, col: 'claim', stance: c.type === 'rebuttal' ? 'derived' : c.stance, title: claimLabel(c.type), text: clip(c.text, 38), badge: c.escalated ? '판사 확인 필요' : c.revisions ? `고침 ${c.revisions}` : undefined, warn: c.escalated })
    if (a) edges.push({ id: `a:${a.id}:${c.id}`, from: `agent:${a.id}`, to: c.id, kind: 'agent', stance: c.stance })
    if (c.rebuts && evOrder.includes(c.rebuts)) edges.push({ id: `r:${c.id}:${c.rebuts}`, from: c.id, to: c.rebuts, kind: 'rebut', stance: c.stance })
  }
  const claimIds = claims.map((c) => c.id)
  const claimY = settle(claims.map((c) => ({ id: c.id, want: meanCenter(c.evidence.map((e) => e.id), ys, hs, 28 + COLS.claim.h / 2), h: COLS.claim.h })))
  claimIds.forEach((id) => ys.set(id, claimY.get(id)!))

  const usedAgents = rec.bench.filter((a) => claims.some((c) => c.agentId === a.id))
  for (const a of usedAgents) mk({ id: `agent:${a.id}`, col: 'agent', stance: a.side === 'prosecution' ? 'pro' : a.side === 'defense' ? 'con' : 'derived', title: a.name, text: 'AI' })
  const agentY = settle(usedAgents.map((a) => ({ id: `agent:${a.id}`, want: meanCenter(claims.filter((c) => c.agentId === a.id).map((c) => c.id), ys, hs, 28 + COLS.agent.h / 2), h: COLS.agent.h })))

  const cited = new Map<string, string[]>()
  const addCite = (key: string, evId: string) => cited.set(key, [...(cited.get(key) ?? []), evId])
  for (const c of claims) for (const e of c.evidence) {
    const no = e.kind === 'quote' ? e.sentenceNo : e.foundIn
    if (no !== null && no !== undefined) addCite(`sent:${no}`, e.id)
    else if (e.kind === 'absence') addCite('sent:body', e.id)
  }
  const sentKeys = [...cited.keys()].sort((a, b) => (a === 'sent:body' ? 1 : b === 'sent:body' ? -1 : Number(a.slice(5)) - Number(b.slice(5))))
  for (const key of sentKeys) {
    const no = key === 'sent:body' ? null : Number(key.slice(5))
    mk({ id: key, col: 'sent', title: no === null ? '본문 전체' : `#${no}`, text: no === null ? '이 핵심어가 본문 어느 문장에도 없음' : clip(sentenceText.get(no) ?? '', 40) })
    for (const evId of cited.get(key)!) edges.push({ id: `c:${evId}:${key}`, from: evId, to: key, kind: 'cite', stance: null })
  }
  const sentY = settle(sentKeys.map((k) => ({ id: k, want: meanCenter(cited.get(k)!, ys, hs, 28 + COLS.sent.h / 2), h: COLS.sent.h })))

  for (const [id, y] of claimY) nodes.get(id)!.y = y
  for (const [id, y] of agentY) nodes.get(id)!.y = y
  for (const [id, y] of sentY) nodes.get(id)!.y = y
  evOrder.forEach((id) => (nodes.get(id)!.y = ys.get(id)!))
  const list = [...nodes.values()]
  return { nodes: list, edges, width: COLS.sent.x + COLS.sent.w, height: Math.max(120, ...list.map((n) => n.y + n.h)) + 24 }
}

// 선택한 노드에서 위(원인)·아래(근거) 방향으로 이어진 사슬
export function chainOf(g: LGraph, id: string): { nodes: Set<string>; edges: Set<string> } {
  const walk = (dir: 'up' | 'down') => {
    const seen = new Set<string>([id])
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      for (const e of g.edges) {
        const next = dir === 'down' ? (e.from === cur ? e.to : null) : e.to === cur ? e.from : null
        if (next && !seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    return seen
  }
  const nodes = new Set([...walk('up'), ...walk('down')])
  return { nodes, edges: new Set(g.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)).map((e) => e.id)) }
}
