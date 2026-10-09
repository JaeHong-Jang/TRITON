// 최종 판결 후 공개되는 정답 카드
import { api } from '../../api/client'
import type { Leaning } from '../../api/types'
import { leaningLabel } from '../../lib/names'
import { ErrorNote } from '../../ui/Feedback'
import { useAsync } from '../../ui/useAsync'

// 정답 공개 카드
export function AnswerCard({ caseId, verdict, labSessionId, noGroundTruth }: { caseId: string; verdict: Leaning; labSessionId?: string; noGroundTruth?: boolean }) {
  const { data, error } = useAsync(() => (noGroundTruth ? Promise.resolve(null) : labSessionId ? api.labAnswer(labSessionId, caseId) : api.answer(caseId)), [caseId, labSessionId, noGroundTruth])
  if (noGroundTruth) {
    return (
      <div className="rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm text-stone-700" aria-label="정답 없음">
        <p className="font-bold">직접 등록 기사라 정답 데이터가 없습니다.</p>
        <p className="mt-1 text-xs">이 사건의 판결은 판사가 남긴 근거와 장부 기록으로 검토합니다. 정답 정확도 통계에는 포함하지 않습니다.</p>
      </div>
    )
  }
  if (error) return <ErrorNote message={error} />
  if (!data) return null
  const right = (data.isClickbait ? 'clickbait' : 'not_clickbait') === verdict
  return (
    <div className={`rounded-lg border p-3 text-sm ${right ? 'border-emerald-400 bg-emerald-50' : 'border-amber-400 bg-amber-50'}`} aria-label="정답 공개">
      <p className="font-bold">정답 공개: {leaningLabel(data.isClickbait ? 'clickbait' : 'not_clickbait')} · {right ? '판결이 정답과 같습니다' : '판결이 정답과 다릅니다'}</p>
      <p className="mt-1 text-xs text-stone-700"> {data.method && data.method !== 'auto' ? `유형 ${data.method} · ` : ''}{data.insertedSentenceNos.length ? `끼워 넣은 문장 ${data.insertedSentenceNos.map((n) => `#${n}`).join(', ')} · ` : ''}원래 제목 “{data.originalTitle}”</p>
    </div>
  )
}
