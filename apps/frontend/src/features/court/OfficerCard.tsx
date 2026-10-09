// 재판연구관 보고서 카드
import type { Claim } from '../../api/types'
import { actionLabel, evidenceName } from '../../lib/names'
import { Term } from '../../ui/Forms'
import { CARD } from '../../ui/styles'
import { useCourt } from './store'
import { useCourtView } from './view'

// 재판연구관 보고서 컴포넌트
export function OfficerCard() {
  const v = useCourtView()
  const setFocus = useCourt((s) => s.setFocus)
  const r = v?.rec?.officer
  if (!v || !r) return null
  const lower = [v.records[1], v.records[2], v.rec].filter((x) => !!x)
  const visible = new Set(v.weights.map((w) => w.evidenceId))
  // 근거 이름 (보이는 근거면 눌러서 이동)
  const ref = (id: string) => {
    const rec = lower.find((x) => x.claims.some((c: Claim) => c.evidence.some((e) => e.id === id)))
    const name = rec ? `${rec.instance !== v.rec?.instance ? `${rec.instance}심 ` : ''}${evidenceName(rec.claims, rec.bench, id)}` : '상대 근거'
    return visible.has(id) ? <button type="button" onClick={() => setFocus(id)} className="font-bold underline decoration-dotted hover:text-stone-900">{name}</button> : <b>{name}</b>
  }
  return (
    <section className={`${CARD} border-emerald-300 bg-emerald-50`} aria-label="재판연구관 보고서">
      <h2 className="text-sm font-black text-emerald-900"><Term tip="1·2심 기록을 읽고 쟁점을 정리하는 AI 보조역입니다. 판결은 하지 않습니다.">재판연구관</Term> 보고서 · 참고용</h2>
      <p className="mt-1 text-sm">{r.summary}</p>
      <h3 className="mt-2 text-xs font-bold text-emerald-900">쟁점</h3>
      <ul className="list-disc pl-5 text-sm">
        {r.issues.map((i) => <li key={i}>{i}</li>)}
      </ul>
      <p className="mt-2 text-xs"><b>위증 의심 근거</b> {r.perjury.length ? r.perjury.map((id, k) => <span key={id}>{k ? ', ' : ''}{ref(id)}</span>) : '없음'}</p>
      {r.reclassified.length ? (
        <ul className="mt-1 text-xs">
          {r.reclassified.map((x) => <li key={x.evidenceId}>{ref(x.evidenceId)} {x.from === 'pro' ? '찬성' : '반대'} → {x.to === 'pro' ? '찬성' : '반대'} 재분류 제안: {x.why}</li>)}
        </ul>
      ) : null}
      <p className="mt-2 text-xs"><b>권고 조치</b> <span title={r.recommendedAction}>{actionLabel(r.recommendedAction)}</span> · 참고용, 결정은 판사</p>
    </section>
  )
}
