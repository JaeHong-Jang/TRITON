// 법정 장면의 공개 범위 회귀 검사
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Claim } from '../api/types'
import type { WeightItem } from '../lib/scale'
import CourtStage, { type SceneView } from './CourtStage'

const evidence = { id: 'private-evidence', kind: 'quote' as const, stance: 'pro' as const, sentenceNo: 9, quote: '아직 공개하면 안 되는 인용', keyword: null, status: 'misnumbered' as const, foundIn: 3 }
const weight: WeightItem = { evidenceId: evidence.id, claimId: 'private-claim', agentId: 'prosecutor', stance: 'pro', evidence, weight: 2, fate: 'counted', voidReason: null, ruled: 'struck' }
const claim: Claim = { id: 'private-claim', agentId: 'prosecutor', round: 0, type: 'exaggeration', stance: 'pro', text: '아직 공개하면 안 되는 AI 의견', strength: 2, evidence: [evidence], rebuts: null, revisions: 0, escalated: false }

// 첫인상 대기 사건 입력
function scene(hidden: boolean): SceneView {
  return { c: { id: 'privacy-case', title: '검사 대상 기사', subtitle: '', category: '직접 등록', subcategory: '', sentences: [{ no: 3, text: '공개 기사 본문' }], variantOf: null, attack: null }, bench: [], weights: [weight], hidden, seatsLit: 1, focusId: evidence.id, verdict: null, appealed: false, onPick: vi.fn() }
}

describe('석조 법정의 공개 경계', () => {
  it('첫인상 전에는 입력에 근거와 발언이 있어도 HTML에 노출하지 않는다', () => {
    const html = renderToStaticMarkup(<CourtStage view={scene(true)} speakingClaim={claim} activity={[]} currentSeat={null} />)
    expect(html).not.toContain(evidence.quote)
    expect(html).not.toContain(claim.text)
    expect(html).not.toContain('코드 검증:')
    expect(html).not.toContain('사람 판사 기각')
    expect(html).not.toContain('공개 근거 선택')
    expect(html).toContain('data-disclosure="hidden"')
  })

  it('공개 후 원문 위치와 코드 검증, 사람의 기각을 구별한다', () => {
    const html = renderToStaticMarkup(<CourtStage view={scene(false)} speakingClaim={null} activity={[]} currentSeat={null} />)
    expect(html).toContain(evidence.quote)
    expect(html).toContain('실제 원문 3번')
    expect(html).toContain('문장 번호 보정')
    expect(html).toContain('사람 판사 기각')
    expect(html).toContain('aria-pressed="true"')
  })

  it('묶음 가중치가 제외되어도 일치한 인용의 원문 검증 결과는 유지한다', () => {
    const view = scene(false)
    view.weights = [{ ...weight, evidence: { ...evidence, status: 'verified' }, weight: 0, fate: 'void', voidReason: 'perjury', ruled: null }]
    const html = renderToStaticMarkup(<CourtStage view={view} speakingClaim={null} activity={[]} currentSeat={null} />)
    expect(html).toContain('코드 검증: 인용 원문 일치')
    expect(html).toContain('주장 안에 원문 불일치가 있어 무게 제외')
    expect(html).not.toContain('코드 검증: 주장 묶음 원문 검증 실패')
  })

  it('모바일 장면에는 단일 저지맨 장면과 배경만 두고 근거는 아래 패널에 맡긴다', () => {
    const html = renderToStaticMarkup(<CourtStage view={scene(false)} speakingClaim={claim} activity={[]} currentSeat={null} mini />)
    expect(html).toContain('src="/art/stone-tribunal.png"')
    expect(html).toContain('href="/art/judgeman-3d.png"')
    expect(html.match(/role="img" aria-label="봉합된 눈의 흰 얼굴, 검은 법복과 세 천칭을 지닌 식신 저지맨"/g)).toHaveLength(1)
    expect(html).toContain('장면 움직임 끄기')
    expect(html).not.toContain('공개 근거 선택')
    expect(html).not.toContain(claim.text)
  })

  it('공개 후 장면 아래 찬반 무게 막대를 보이고 첫인상 전에는 숨긴다', () => {
    const open = renderToStaticMarkup(<CourtStage view={scene(false)} speakingClaim={null} activity={[]} currentSeat={null} mini />)
    expect(open).toContain('찬성 2')
    expect(open).toContain('반대 0')
    expect(open).toContain('기사의 판결을 뜻하지 않습니다')
    expect(renderToStaticMarkup(<CourtStage view={scene(true)} speakingClaim={null} activity={[]} currentSeat={null} />)).not.toContain('기사의 판결을 뜻하지 않습니다')
  })

  it('부재 근거는 제목 핵심어가 본문에 없다는 문장으로 읽힌다', () => {
    const view = scene(false)
    const absence = { ...evidence, id: 'a', kind: 'absence' as const, sentenceNo: null, quote: null, keyword: '2021', status: 'verified' as const, foundIn: null }
    view.weights = [{ ...weight, evidenceId: 'a', evidence: absence, ruled: null }]
    const html = renderToStaticMarkup(<CourtStage view={view} speakingClaim={null} activity={[]} currentSeat={null} />)
    expect(html).toContain("제목의 &#x27;2021&#x27;이 본문에 없음 · 코드가 본문 전체에서 확인")
    expect(html).toContain('판사 판단 전')
    expect(html).toContain('무게 ')
    view.settled = true
    expect(renderToStaticMarkup(<CourtStage view={view} speakingClaim={null} activity={[]} currentSeat={null} />)).toContain('개별 판정 없음')
  })
})
