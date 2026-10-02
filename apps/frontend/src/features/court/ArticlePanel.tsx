// 기사 원문
import { useEffect, useRef } from 'react'
import './court.css'
import { CARD } from '../../ui/styles'
import { useCourtView } from './view'

// 기사 원문 패널
export function ArticlePanel() {
  const v = useCourtView()
  const marked = useRef<HTMLLIElement>(null)
  const e = v?.focusEvidence ?? null
  const markNo = e && e.kind === 'quote' ? (e.foundIn ?? e.sentenceNo) : null
  useEffect(() => {
    marked.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [markNo])
  if (!v) return null
  const c = v.caseData
  const inTitle = !!e && (e.status === 'title' || (e.kind === 'absence' && e.status === 'verified'))
  return (
    <section className={CARD} aria-label="기사 원문">
      <h2 className="text-sm font-black text-stone-700">기사 원문 <span className="font-normal text-stone-600">· {c.category} · {c.subcategory}</span></h2>
      <div className={`mt-2 rounded-lg p-2 ${inTitle ? 'bg-amber-100 ring-2 ring-amber-400' : 'bg-stone-50'}`}>
        <p className="text-base font-black leading-snug">{c.title}</p>
        {c.subtitle ? <p className="text-sm text-stone-600">{c.subtitle}</p> : null}
      </div>
      {e?.kind === 'absence' ? <p className="mt-2 text-xs text-amber-800">핵심어 ‘{e.keyword}’ 부재 근거: 제목에는 있고 본문 어느 문장에도 없는지 살펴보세요.</p> : null}
      <ol className="court-fade mt-2 max-h-60 space-y-1 overflow-y-auto py-4 pr-2 text-sm leading-relaxed">
        {c.sentences.map((s) => (
          <li key={s.no} ref={s.no === markNo ? marked : undefined} className={`flex gap-2 rounded px-1 ${s.no === markNo ? 'bg-amber-200 ring-2 ring-amber-400' : ''}`}>
            <span className="w-7 shrink-0 text-right text-xs font-bold text-stone-600">#{s.no}</span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
