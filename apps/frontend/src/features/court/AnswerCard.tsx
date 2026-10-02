// 최종 판결 후 공개되는 정답 카드
import { api } from '../../api/client'
import type { Leaning } from '../../api/types'
import { leaningLabel } from '../../ui/format'
import { ErrorNote } from '../../ui/Feedback'
import { useAsync } from '../../ui/useAsync'

// 정답 공개 카드
export function AnswerCard({ caseId, verdict, labSessionId }: { caseId: string; verdict: Leaning; labSessionId?: string }) {
  const { data, error } = useAsync(() => (labSessionId ? api.labAnswer(labSessionId, caseId) : api.answer(caseId)), [caseId, labSessionId])
  if (error) return <ErrorNote message={error} />
  if (!data) return null
  const right = (data.isClickbait ? 'clickbait' : 'not_clickbait') === verdict
  return (
    <div className={`rounded-lg border p-3 text-sm ${right ? 'border-emerald-400 bg-emerald-50' : 'border-red-300 bg-red-50'}`} aria-label="정답 공개">
      <p className="font-bold">정답 공개: {leaningLabel(data.isClickbait ? 'clickbait' : 'not_clickbait')} · {right ? '판결이 정답과 같습니다' : '판결이 정답과 다릅니다'}</p>
      <p className="mt-1 text-xs text-stone-700">유형 {data.method}{data.insertedSentenceNos.length ? ` · 끼워 넣은 문장 ${data.insertedSentenceNos.map((n) => `#${n}`).join(', ')}` : ''} · 원래 제목 “{data.originalTitle}”</p>
    </div>
  )
}
