// 처음 쓰는 사람을 위한 시작 사건 고르기
import type { CaseSummary } from '../api/types'

// 재판 회부된 새 사건 가운데 실험 변형이 아닌 첫 사건 번호
export function starterCaseId(cases: CaseSummary[]): string | undefined {
  return cases.find((c) => c.docket.track === 'trial' && c.progress.stage === 'new' && !c.variantOf)?.id
}
