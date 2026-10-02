// 재판연구관 보고서 카드
import { actionLabel, useOntology } from '../../ui/ontology'
import { Term } from '../../ui/Forms'
import { CARD } from '../../ui/styles'
import { useCourtView } from './view'

// 재판연구관 보고서 컴포넌트
export function OfficerCard() {
  const v = useCourtView()
  const ont = useOntology((s) => s.ont)
  const r = v?.rec?.officer
  if (!v || !r) return null
  return (
    <section className={`${CARD} border-emerald-300 bg-emerald-50`} aria-label="재판연구관 보고서">
      <h2 className="text-sm font-black text-emerald-900"><Term tip="1·2심 기록을 읽고 쟁점을 정리하는 AI 보조역입니다. 판결은 하지 않습니다.">재판연구관</Term> 보고서 · 참고용</h2>
      <p className="mt-1 text-sm">{r.summary}</p>
      <h3 className="mt-2 text-xs font-bold text-emerald-900">쟁점</h3>
      <ul className="list-disc pl-5 text-sm">
        {r.issues.map((i) => <li key={i}>{i}</li>)}
      </ul>
      <p className="mt-2 text-xs"><b>위증 의심 근거</b> {r.perjury.length ? r.perjury.join(', ') : '없음'}</p>
      {r.reclassified.length ? (
        <ul className="mt-1 text-xs">
          {r.reclassified.map((x) => <li key={x.evidenceId}><b>{x.evidenceId}</b> {x.from === 'pro' ? '찬성' : '반대'} → {x.to === 'pro' ? '찬성' : '반대'} 재분류 제안: {x.why}</li>)}
        </ul>
      ) : null}
      <p className="mt-2 text-xs"><b>권고 조치</b> {actionLabel(ont, r.recommendedAction)} ({r.recommendedAction}) · 참고용, 결정은 판사</p>
    </section>
  )
}
