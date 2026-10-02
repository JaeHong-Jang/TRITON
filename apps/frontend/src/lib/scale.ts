// 천칭 무게 규칙
import type { Balance, Claim, Evidence, Ruling, Stance } from '../api/types'

// 보 기울기 최댓값
export const MAX_TILT = 0.35

// 근거 무게 처리 결과
export type WeightFate = 'counted' | 'halved' | 'void'
// 무게 무효 사유
export type VoidReason = 'struck' | 'perjury' | 'status'

// 천칭 근거 무게 항목
export interface WeightItem {
  evidenceId: string
  claimId: string
  agentId: string
  stance: Stance
  evidence: Evidence
  weight: number
  fate: WeightFate
  voidReason: VoidReason | null
  ruled: Ruling | null
}

// 판사 결정과 반박을 빼고 코드가 매기는 근거 하나의 기본 무게
function baseWeight(claim: Claim, ev: Evidence): { weight: number; reason: VoidReason | null } {
  if (claim.evidence.some((e) => e.status === 'fabricated')) return { weight: 0, reason: 'perjury' }
  const factor = ev.status === 'verified' || ev.status === 'misnumbered' ? 1 : 0
  return { weight: claim.strength * factor, reason: factor ? null : 'status' }
}

// 공개된 주장들의 근거별 무게 계산
export function evidenceWeights(claims: Claim[], rulings: Record<string, Ruling>): WeightItem[] {
  // 판사 결정까지 반영한 반박 전 무게
  const preWeight = (c: Claim, e: Evidence): number => {
    const r = rulings[e.id]
    return r === 'admitted' ? c.strength : r === 'struck' ? 0 : baseWeight(c, e).weight
  }
  const halved = new Set<string>()
  for (const c of claims) {
    if (c.type === 'rebuttal' && c.rebuts && c.evidence.some((e) => preWeight(c, e) > 0)) halved.add(c.rebuts)
  }
  return claims.flatMap((c) =>
    c.evidence.map((ev): WeightItem => {
      const ruled = rulings[ev.id] ?? null
      const item = { evidenceId: ev.id, claimId: c.id, agentId: c.agentId, stance: ev.stance, evidence: ev, ruled }
      if (ruled === 'admitted') return { ...item, weight: c.strength, fate: 'counted', voidReason: null }
      if (ruled === 'struck') return { ...item, weight: 0, fate: 'void', voidReason: 'struck' }
      const base = baseWeight(c, ev)
      if (base.weight === 0) return { ...item, weight: 0, fate: 'void', voidReason: base.reason }
      if (halved.has(ev.id)) return { ...item, weight: base.weight / 2, fate: 'halved', voidReason: null }
      return { ...item, weight: base.weight, fate: 'counted', voidReason: null }
    }),
  )
}

// 판사 결정 없이 코드만 매긴 근거 무게
export function checkerWeight(claims: Claim[], rulings: Record<string, Ruling>, evidenceId: string): number {
  const { [evidenceId]: _drop, ...rest } = rulings
  return evidenceWeights(claims, rest).find((w) => w.evidenceId === evidenceId)?.weight ?? 0
}

// 접시 합과 기울기 계산
export function balanceOf(items: WeightItem[]): Balance {
  let pro = 0
  let con = 0
  for (const w of items) {
    if (w.stance === 'pro') pro += w.weight
    else con += w.weight
  }
  const total = pro + con
  return { pro, con, tilt: total ? ((pro - con) / total) * MAX_TILT : 0 }
}

// 무게 표시 문자열
export function fmtWeight(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
