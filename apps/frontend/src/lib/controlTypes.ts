// 관제 그래프의 공개 데이터 계약
import type { EvidenceKind, EvidenceStatus, Instance, Ruling } from '../api/types'

// 그래프 보기 종류
export type GraphMode = 'evidence' | 'ontology' | 'connected'
// 그래프 노드 종류
export type ControlKind = 'article' | 'sentence' | 'claim' | 'evidence' | 'check' | 'concept' | 'rule' | 'judgment'
// 그래프 역할 군집
export type ControlGroup = 'source' | 'prosecution' | 'defense' | 'checker' | 'human' | 'ontology'
// 선택 항목의 상세 속성
export interface ControlField { label: string; value: string }
// 관제 그래프 노드
export interface ControlNode {
  id: string
  kind: ControlKind
  group: ControlGroup
  label: string
  detail: string
  fields: ControlField[]
  claimId?: string
  evidenceId?: string
  agentId?: string
  claimType?: string
  evidenceKind?: EvidenceKind
  status?: EvidenceStatus
  sentenceNo?: number
  ruling?: Ruling | null
  instance?: Instance
}
// 실제 관계를 나타내는 간선
export interface ControlEdge { id: string; from: string; to: string; label: string; detail: string }
// 공개 그래프와 집계
export interface ControlGraph { nodes: ControlNode[]; edges: ControlEdge[]; notice: string | null }

// 그래프 군집 이름
export const GROUP_LABELS: Record<ControlGroup, string> = { source: '기사 원문', prosecution: '검사 주장', defense: '변호 주장', checker: '코드 검증', human: '사람 판단', ontology: '온톨로지' }
// 그래프 노드 형태 이름
export const KIND_LABELS: Record<ControlKind, string> = { article: '기사', sentence: '문장', claim: '주장', evidence: '근거', check: '검증', concept: '개념', rule: '규칙', judgment: '사람 판단' }
