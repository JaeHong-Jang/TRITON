// 에이전트 작업 이벤트 병합과 최신 활동 계산
import type { AgentEvent } from '../api/types'

// 에이전트 하나의 지금 활동
export interface AgentActivity { agentId: string; kind: AgentEvent['kind']; text: string; typing: boolean; seq: number }

// 이벤트 종류별 한국어 이름
export const EVENT_LABEL: Record<AgentEvent['kind'], string> = {
  read: '읽기', plan: '계획', tool: '도구', draft: '초안', check: '검증', revise: '고쳐 쓰기', submit: '제출', escalate: '판사 확인 필요', done: '완료', error: '오류',
}

const FINISHED = new Set<AgentEvent['kind']>(['submit', 'escalate', 'done', 'error'])

// 새 이벤트를 seq 기준으로 합치기
export function mergeEvents(prev: AgentEvent[], incoming: AgentEvent[]): AgentEvent[] {
  const bySeq = new Map(prev.map((e) => [e.seq, e]))
  for (const e of incoming) bySeq.set(e.seq, e)
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}

// 마지막으로 받은 이벤트 번호
export function lastSeq(events: AgentEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.seq), 0)
}

// 문구 속 문장 번호 목록
function sentenceNos(text: string): number[] {
  if (!text.includes('문장')) return [...new Set([...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1])))]
  return [...new Set([...text.matchAll(/(\d+)번/g), ...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1])))]
}

// 변론이 가려진 동안 보여 줄 종류 (실패·검토 요청도 제출로 보임)
export function visibleKind(e: AgentEvent, hideContent: boolean): AgentEvent['kind'] {
  return hideContent && e.kind === 'escalate' ? 'submit' : e.kind
}

// 변론이 가려진 동안은 중립 문구(publicText 또는 종류 라벨과 문장 번호)만 보이는 이벤트 문구
export function visibleText(e: AgentEvent, hideContent: boolean): string {
  if (!hideContent) return e.text
  if (e.kind === 'escalate') return '주장 제출 완료'
  const pub = e.publicText?.trim()
  if (pub) return pub
  const kind = visibleKind(e, hideContent)
  if (kind === 'submit') return '주장 제출 완료'
  if (kind === 'error') return e.text
  const nos = sentenceNos(e.text)
  return nos.length ? `${EVENT_LABEL[kind]} · 문장 ${nos.sort((a, b) => a - b).join(', ')}` : EVENT_LABEL[kind]
}

// 에이전트별 최신 활동 (변론 내용이 가려진 동안은 중립 문구로 바꿈)
export function latestActivity(events: AgentEvent[], running: boolean, hideContent: boolean): AgentActivity[] {
  const latest = new Map<string, AgentEvent>()
  for (const e of events) if (e.kind !== 'done') latest.set(e.agentId, e)
  return [...latest.values()]
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({
      agentId: e.agentId,
      kind: visibleKind(e, hideContent),
      text: visibleText(e, hideContent),
      typing: running && !FINISHED.has(e.kind),
      seq: e.seq,
    }))
}
