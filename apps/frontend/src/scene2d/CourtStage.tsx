// 석조 법정 무대
import { useEffect, useId, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Agent, Case, Claim, EvidenceStatus, Leaning, Stance } from '../api/types'
import type { AgentActivity } from '../lib/activity'
import { fmtWeight, type WeightItem } from '../lib/scale'
import './traditional-court.css'

// 무대에 그릴 법정 상태
export interface SceneView {
  c: Case
  bench: Agent[]
  weights: WeightItem[]
  hidden: boolean
  seatsLit: number
  focusId: string | null
  verdict: Leaning | null
  appealed: boolean
  onPick: (evidenceId: string) => void
}

// 무대 입력 값
export interface StageProps {
  view: SceneView
  speakingClaim: Claim | null
  activity: AgentActivity[]
  currentSeat: number | null
  mini?: boolean
}

const COURTROOM_SRC = '/art/stone-tribunal.png'
const CHARACTER_SRC = '/art/judgeman-3d.png'

const STATUS_LABEL: Record<EvidenceStatus, string> = {
  verified: '원문 검증 통과',
  misnumbered: '문장 번호 보정',
  title: '제목에서만 확인',
  present: '부재 주장 불일치',
  fabricated: '원문 검증 실패',
}

const STANCE_LABEL: Record<Stance, string> = {
  pro: '낚시성 주장 근거',
  con: '반대 주장 근거',
}

const RULING_LABEL = {
  admitted: '사람 판사 채택',
  struck: '사람 판사 기각',
  undecided: '사람 판사 미판단',
}

// 근거 짧은 이름
function evidenceTitle(item: WeightItem): string {
  if (item.evidence.kind === 'absence') return item.evidence.keyword ? `핵심어 부재 · ${item.evidence.keyword}` : '핵심어 부재'
  if (item.evidence.sentenceNo) return `${item.evidence.sentenceNo}번 문장 인용`
  return '인용 근거'
}

// 원문 위치 표시
function evidenceLocation(item: WeightItem): string {
  if (item.evidence.status === 'misnumbered' && item.evidence.foundIn && item.evidence.sentenceNo) return `실제 원문 ${item.evidence.foundIn}번 · 제출 ${item.evidence.sentenceNo}번`
  if (item.evidence.status === 'title') return '제목에서 확인'
  if (item.evidence.kind === 'absence' && item.evidence.status === 'verified') return '본문 전체 대조'
  if (item.evidence.foundIn) return `확인 위치 ${item.evidence.foundIn}번`
  if (item.evidence.sentenceNo) return `원문 ${item.evidence.sentenceNo}번`
  return '원문 위치 확인 필요'
}

// 근거 문구 축약
function evidenceExcerpt(item: WeightItem): string {
  const text = item.evidence.quote ?? item.evidence.keyword ?? '제출된 원문 단서'
  return text.length > 58 ? `${text.slice(0, 58)}…` : text
}

// 판사 판단 문구
function rulingLabel(item: WeightItem): string {
  return item.ruled ? RULING_LABEL[item.ruled] : RULING_LABEL.undecided
}

// 코드 검증 문구
function checkerLabel(item: WeightItem): string {
  return STATUS_LABEL[item.evidence.status]
}

// 근거 정렬
function groupedWeights(items: WeightItem[]): Record<Stance, WeightItem[]> {
  return {
    pro: items.filter((item) => item.stance === 'pro'),
    con: items.filter((item) => item.stance === 'con'),
  }
}

// 장면 재생 상태
function useSceneMotionPaused(ref: RefObject<HTMLDivElement | null>) {
  const [hidden, setHidden] = useState(false)
  const [outside, setOutside] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden')
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setOutside(!entry.isIntersecting), { threshold: 0.08 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduceMotion(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return { paused: hidden || outside, reduceMotion }
}

// 저지맨 분리 장면
function JudgemanFigure({ src, onMissing }: { src: string; onMissing: () => void }) {
  const id = useId()
  const bodyId = `${id}-body`
  const leftId = `${id}-left-scale`
  const rightId = `${id}-right-scale`
  const lowerId = `${id}-lower-scale`

  return (
    <svg className="trad-court__judgeman" viewBox="0 0 1254 1254" role="img" aria-label="봉합된 눈의 흰 얼굴, 검은 법복과 세 천칭을 지닌 식신 저지맨">
      <defs>
        <clipPath id={bodyId}>
          <path clipRule="evenodd" d="M0 0H1254V1254H0ZM86 230H150L150 376 286 468 328 716H-16L28 468 86 376ZM1104 230H1168L1168 376 1226 468 1270 716H926L968 468 1104 376ZM588 936H666L666 1054 742 1118 764 1228H490L512 1118 588 1054Z" />
        </clipPath>
        <clipPath id={leftId}>
          <path d="M86 230H150L150 376 286 468 328 716H-16L28 468 86 376Z" />
        </clipPath>
        <clipPath id={rightId}>
          <path d="M1104 230H1168L1168 376 1226 468 1270 716H926L968 468 1104 376Z" />
        </clipPath>
        <clipPath id={lowerId}>
          <path d="M588 936H666L666 1054 742 1118 764 1228H490L512 1118 588 1054Z" />
        </clipPath>
      </defs>
      <image className="trad-court__judgemanBody" href={src} width="1254" height="1254" clipPath={`url(#${bodyId})`} onError={onMissing} />
      <g className="trad-court__scale trad-court__scale--left">
        <image href={src} width="1254" height="1254" clipPath={`url(#${leftId})`} aria-hidden="true" />
      </g>
      <g className="trad-court__scale trad-court__scale--right">
        <image href={src} width="1254" height="1254" clipPath={`url(#${rightId})`} aria-hidden="true" />
      </g>
      <g className="trad-court__scale trad-court__scale--lower">
        <image href={src} width="1254" height="1254" clipPath={`url(#${lowerId})`} aria-hidden="true" />
      </g>
    </svg>
  )
}

// 법정 이미지 장면
function CourtPicture() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const [courtMissing, setCourtMissing] = useState(false)
  const [characterMissing, setCharacterMissing] = useState(false)
  const [motionOff, setMotionOff] = useState(false)
  const { paused, reduceMotion } = useSceneMotionPaused(sceneRef)

  return (
    <div ref={sceneRef} className="trad-court__picture" data-scene="traditional-court-picture" data-motion={motionOff || paused || reduceMotion ? 'paused' : 'running'} aria-label="석조 원형 법정 장면">
      {courtMissing ? (
        <div className="trad-court__fallback trad-court__fallback--court" aria-hidden="true">
          <span>석조 원형 법정 배경</span>
        </div>
      ) : (
        <img className="trad-court__backdrop" src={COURTROOM_SRC} alt="돔 채광창과 원형 재판 공간이 있는 석조 법정" onError={() => setCourtMissing(true)} />
      )}
      <div className="trad-court__light trad-court__light--left" aria-hidden="true" />
      <div className="trad-court__light trad-court__light--right" aria-hidden="true" />
      <div className="trad-court__shade" aria-hidden="true" />
      <div className="trad-court__floorShadow" aria-hidden="true" />
      <div className="trad-court__characterSlot">
        {characterMissing ? (
          <div className="trad-court__fallback trad-court__fallback--character" aria-label="검은 법복과 천칭을 지닌 식신 저지맨 대체 표시">
            저지맨
          </div>
        ) : (
          <JudgemanFigure src={CHARACTER_SRC} onMissing={() => setCharacterMissing(true)} />
        )}
      </div>
      <button className="trad-court__motionToggle" type="button" aria-pressed={reduceMotion || motionOff} disabled={reduceMotion} onClick={() => setMotionOff((current) => !current)}>
        {reduceMotion ? '동작 줄이기 적용' : motionOff ? '장면 움직임 켜기' : '장면 움직임 끄기'}
      </button>
    </div>
  )
}

// 근거 선택 버튼
function EvidenceButton({ item, selected, onPick }: { item: WeightItem; selected: boolean; onPick: (evidenceId: string) => void }) {
  const status = checkerLabel(item)
  const ruling = rulingLabel(item)
  const aria = `${STANCE_LABEL[item.stance]} ${evidenceTitle(item)} ${status} ${ruling}`

  return (
    <button className={`trad-court__evidenceButton trad-court__evidenceButton--${item.stance}`} type="button" aria-pressed={selected} aria-label={aria} data-selected={selected ? 'true' : 'false'} onClick={() => onPick(item.evidenceId)}>
      <span className="trad-court__buttonTop">
        <strong>{evidenceTitle(item)}</strong>
        <em>{fmtWeight(item.weight)}점</em>
      </span>
      <span className="trad-court__excerpt">{evidenceExcerpt(item)}</span>
      <span className="trad-court__meta">
        <span>{evidenceLocation(item)}</span>
        <span>코드 검증: {status}</span>
        <span>사람 판단: {ruling}</span>
        {item.voidReason === 'perjury' ? <span>주장 안에 원문 불일치가 있어 무게 제외</span> : null}
        {item.fate === 'challenged' ? <span>이의 제기됨 · 판사가 반박을 채택하면 절반</span> : null}
        {item.fate === 'halved' ? <span>반박 채택으로 무게 절반</span> : null}
      </span>
    </button>
  )
}

// 공개 근거 조작부
function EvidenceStrip({ weights, focusId, onPick }: { weights: WeightItem[]; focusId: string | null; onPick: (evidenceId: string) => void }) {
  const grouped = groupedWeights(weights)

  return (
    <details open className="trad-court__evidenceStrip" data-scene="traditional-court-evidence" aria-label="공개 근거 선택">
      <summary>공개된 근거 {weights.length}개</summary>
      {weights.length ? (
        <div className="trad-court__evidencePanel">
          {(['pro', 'con'] as const).map((stance) => (
            <section className="trad-court__evidenceGroup" key={stance} aria-label={STANCE_LABEL[stance]}>
              <header>
                <span>{STANCE_LABEL[stance]}</span>
                <small>{grouped[stance].length}개</small>
              </header>
              <div className="trad-court__buttonGrid">
                {grouped[stance].length ? grouped[stance].map((item) => <EvidenceButton key={item.evidenceId} item={item} selected={focusId === item.evidenceId} onPick={onPick} />) : <p className="trad-court__none">해당 편 근거 없음</p>}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="trad-court__empty">공개된 근거가 아직 없습니다.</p>
      )}
    </details>
  )
}

// 석조 법정 무대
export default function CourtStage({ view, mini = false }: StageProps) {
  return (
    <section className={`trad-court ${mini ? 'trad-court--mini' : ''}`} data-scene="traditional-court" data-disclosure={view.hidden ? 'hidden' : 'open'} aria-label="AI 법정 장면">
      <div className="trad-court__frame">
        <CourtPicture />
      </div>
      {!view.hidden && !mini ? <EvidenceStrip weights={view.weights} focusId={view.focusId} onPick={view.onPick} /> : null}
    </section>
  )
}
