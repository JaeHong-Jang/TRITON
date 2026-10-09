// 최종 판결 요약과 다음 이동 링크
import { Link } from 'react-router'
import type { FinalState } from '../../lib/trial'
import { Badge } from '../../ui/Badge'
import { actionLabel, leaningLabel } from '../../lib/names'
import { needsHuman, useOntology } from '../../ui/ontology'
import { SECONDARY } from '../../ui/styles'
import { AnswerCard } from './AnswerCard'

// 최종 판결 요약 카드
export function VerdictSummary({ caseId, final, noGroundTruth }: { caseId: string; final: FinalState; noGroundTruth?: boolean }) {
  const ont = useOntology((s) => s.ont)
  const human = needsHuman(ont, final.action)
  return (
    <section className="space-y-3 rounded-xl border-2 border-stone-900 bg-white p-4" aria-label="최종 판결">
      <p className="text-xs font-bold text-stone-600">최종 판결</p>
      <p className={`text-2xl font-black ${final.verdict === 'clickbait' ? 'text-pro' : 'text-con'}`}>{final.verdict === 'clickbait' ? '판결: 낚시성 기사' : '판결: 낚시성 아닌 기사'}</p>
      <p className="text-sm">판사석 표결: {final.votes.map((v) => `${v.seat}석 ${leaningLabel(v.verdict)}`).join(' · ')}</p>
      <p className="text-sm">
        조치 단계 <b title={final.action}>{actionLabel(final.action)}</b> {human ? <Badge tone="amber">사람 승인 기록</Badge> : <Badge tone="gray">판사 기록/안내</Badge>}
      </p>
      <p className="rounded-md bg-stone-50 p-2 text-sm text-stone-700">사유: {final.reason}</p>
      <AnswerCard caseId={caseId} verdict={final.verdict} noGroundTruth={noGroundTruth} />
      <div className="flex flex-wrap gap-2">
        <Link to="/cases" className={SECONDARY}>사건 접수로 돌아가기</Link>
      </div>
    </section>
  )
}
