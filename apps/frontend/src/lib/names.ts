// 판사 화면용 사람이 읽는 이름 모음
import type { ActionLevel, Agent, Claim, Evidence, Leaning } from '../api/types'

// 에이전트 id에서 뽑은 역할과 순번 (예: i2-P1 → 검사 1)
function seatName(agent: Agent | undefined, agentId: string): string {
  const m = /-([PD])(\d+)$/.exec(agentId)
  if (m) return `${m[1] === 'P' ? '검사' : '변호인'} ${m[2]}`
  return agent?.name ?? '상대'
}

// 근거 내용 한 줄 설명
export function evidenceBrief(e: Evidence): string {
  if (e.kind === 'absence') return `핵심어 '${e.keyword ?? ''}' 부재`
  return e.status === 'title' || !e.sentenceNo ? '제목 인용' : `${e.sentenceNo}번 문장 인용`
}

// 근거 id를 사람이 읽는 이름으로
export function evidenceName(claims: Claim[], bench: Agent[], evidenceId: string): string {
  for (const c of claims) {
    const e = c.evidence.find((x) => x.id === evidenceId)
    if (!e) continue
    const who = seatName(bench.find((a) => a.id === c.agentId), c.agentId)
    return `${c.rebuts && c.round > 0 ? `반대신문(${who})` : who}의 근거 · ${evidenceBrief(e)}`
  }
  return '상대 근거'
}

// 조치 단계 이름
export function actionLabel(a: ActionLevel): string {
  return { L0: '조치 없음', L1: '독자에게 안내', L2: '노출 순위 하향', L3: '언론사 통보' }[a]
}

// 판결 방향 이름
export function leaningLabel(l: Leaning): string {
  return l === 'clickbait' ? '낚시성이다' : '낚시성 아니다'
}
