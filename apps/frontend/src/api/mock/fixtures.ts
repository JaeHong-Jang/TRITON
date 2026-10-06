// 모의 사건·재판 기록
import type { AgentEvent, AgentStat, Agent, Answer, Case, Claim, Docket, Evidence, Instance, Stance, TrialRecord } from '../types'
import { balanceOf, evidenceWeights } from '../../lib/scale'
import { ONTOLOGY } from './ontology'

type Raw = { q: string; no?: number } | { kw: string }
interface Spec { t: string; text: string; st: 1 | 2 | 3; ev: Raw[] }
// 모의 사건 정의
export interface CaseDef {
  case: Case
  answer?: Answer
  docket: Docket
  team: 2 | 3
  pro: Spec[]
  con: Spec[]
  rebut: { pro: Raw; con: Raw }
}

// 문장 목록 만들기
const sentences = (lines: string[]) => lines.map((text, i) => ({ no: i + 1, text }))
// 합성 사건 만들기
const mkCase = (id: string, category: string, subcategory: string, title: string, subtitle: string, lines: string[]): Case => ({
  id, category, subcategory, title, subtitle, sentences: sentences(lines), variantOf: null, attack: null,
})
// 합성 정답 만들기
const mkAnswer = (id: string, isClickbait: boolean, part: number, method: string, inserted: number[], title: string): Answer => ({
  id, isClickbait, part, method, pattern: isClickbait ? '제목-본문 불일치' : null, level: isClickbait ? '중' : null, insertedSentenceNos: inserted, originalTitle: title,
})

// 모의 사건 정의 목록
export const DEFS: CaseDef[] = [
  {
    case: mkCase('mock-001', '경제', '부동산', "집값 폭락 시작됐나… 전문가들이 '이것' 보고 충격", '금리 동결 이후 거래 동향 분석', [
      '한국은행이 이번 달 기준금리를 연 3.0%로 동결했다고 밝혔다.',
      '금리 동결 이후 서울 아파트 거래량은 전월보다 4% 늘었다.',
      '부동산 업계는 대출 금리가 안정되면서 관망하던 수요가 일부 움직인 것으로 해석한다.',
      '다만 강남권 일부 단지에서는 호가를 낮춘 급매물이 늘고 있다.',
      '한 시중은행 관계자는 주택담보대출 신청 건수가 소폭 증가했다고 말했다.',
      "한편 신작 모바일 게임 '별빛 전사'는 사전 예약자가 100만 명을 넘어서며 화제를 모으고 있다.",
      '게임사 측은 출시 첫 주에 한정 캐릭터를 무료로 나눠줄 계획이라고 밝혔다.',
      '전문가들은 향후 시장 방향이 물가와 소득 흐름에 달려 있다고 내다봤다.',
      '정부는 다음 달 부동산 시장 점검 회의를 열 예정이다.',
      '금리 인하 시점에 대해서는 의견이 엇갈린다.',
    ]),
    answer: mkAnswer('mock-001', true, 2, '무관 문장 삽입', [6, 7], '금리 동결 후 서울 아파트 거래량 4% 증가'),
    docket: { track: 'trial', reasons: ['서기 확신도 72 < 85'], screening: { isClickbait: true, confidence: 72, reason: '6~7번 문장이 부동산과 무관한 게임 홍보입니다.', claimType: 'inserted_irrelevant' } },
    team: 2,
    pro: [
      { t: 'inserted_irrelevant', text: '6~7번 문장은 부동산이 아닌 모바일 게임 홍보로, 기사 주제와 무관합니다.', st: 3, ev: [{ q: '신작 모바일 게임' }, { q: '출시 첫 주에 한정 캐릭터를 무료로' }] },
      { t: 'exaggeration', text: '제목은 폭락을 단정하지만 본문은 거래량이 늘었다고 전합니다.', st: 2, ev: [{ q: '서울 아파트 거래량은 전월보다 4% 늘었다' }, { q: '전문가들은 폭락을 경고했다' }] },
      { t: 'title_body_mismatch', text: "제목의 '충격'에 해당하는 반응이 본문에 없습니다.", st: 2, ev: [{ kw: '충격' }] },
    ],
    con: [
      { t: 'title_reflects_core', text: '제목의 핵심인 집값 하락 조짐이 4번 문장에 나옵니다.', st: 2, ev: [{ q: '강남권 일부 단지에서는 호가를 낮춘 급매물이 늘고 있다' }] },
      { t: 'body_consistent', text: '나머지 문장은 금리와 부동산 시장이라는 한 사안을 다룹니다.', st: 2, ev: [{ q: '정부는 다음 달 부동산 시장 점검 회의를 열 예정이다' }, { q: '금리 인하 시점에 대해서는', no: 8 }] },
      { t: 'strong_but_factual', text: '제목 표현이 강하지만 호가 하락은 사실입니다.', st: 1, ev: [{ q: '집값 폭락 시작됐나' }] },
    ],
    rebut: { pro: { q: '일부 단지' }, con: { q: '서울 아파트 거래량은 전월보다 4% 늘었다' } },
  },
  {
    case: mkCase('mock-002', '생활', '에너지', '올겨울 한파, 난방비 줄이는 방법 5가지', '에너지공단이 권하는 가정 절약 수칙', [
      '한국에너지공단은 올겨울 한파에 대비해 가정에서 난방비를 줄이는 방법 다섯 가지를 소개했다.',
      '첫째는 실내 적정 온도를 20도로 유지하는 것이다.',
      '둘째는 창문에 단열 필름이나 뽁뽁이를 붙여 열 손실을 줄이는 방법이다.',
      '셋째로 보일러 외출 모드를 활용하면 불필요한 가동을 막을 수 있다.',
      '넷째는 문틈 바람막이를 설치해 찬 공기가 들어오는 것을 막는 것이다.',
      '마지막으로 보일러 배관과 필터를 해마다 점검하라고 공단은 당부했다.',
      '공단은 이 다섯 가지를 모두 실천하면 가구당 난방비를 최대 15% 아낄 수 있다고 설명했다.',
      '자세한 내용은 공단 누리집에서 확인할 수 있다.',
    ]),
    answer: mkAnswer('mock-002', false, 0, '원문', [], '올겨울 한파, 난방비 줄이는 방법 5가지'),
    docket: { track: 'summary', reasons: ['서기 확신도 91 ≥ 85 · 일반 분야'], screening: { isClickbait: false, confidence: 91, reason: '제목의 다섯 가지 방법이 본문에 순서대로 나옵니다.', claimType: 'title_reflects_core' } },
    team: 2,
    pro: [
      { t: 'exaggeration', text: "제목은 단순한 방법 소개지만 본문은 '최대 15%' 효과를 내세웁니다.", st: 1, ev: [{ q: '최대 15% 아낄 수 있다' }] },
      { t: 'title_body_mismatch', text: "'한파'가 본문에 없다고 주장합니다.", st: 2, ev: [{ kw: '한파' }] },
      { t: 'curiosity_gap', text: '다섯 가지가 무엇인지 제목만으로는 알 수 없습니다.', st: 1, ev: [{ q: '다섯 가지를 소개했다' }] },
    ],
    con: [
      { t: 'title_reflects_core', text: '제목의 난방비 절약 방법 다섯 가지가 1번 문장에 그대로 나옵니다.', st: 3, ev: [{ q: '난방비를 줄이는 방법 다섯 가지를 소개했다' }] },
      { t: 'body_consistent', text: '2~6번 문장이 방법을 하나씩 차례로 설명합니다.', st: 2, ev: [{ q: '문틈 바람막이를 설치해' }, { q: '해마다 점검하라고' }] },
      { t: 'strong_but_factual', text: '제목의 수치는 없고 본문 수치는 공단의 설명입니다.', st: 1, ev: [{ q: '난방비를 최대 15%' }] },
    ],
    rebut: { pro: { q: '다섯 가지를 모두 실천하면' }, con: { q: '다섯 가지를 소개했다' } },
  },
  {
    case: mkCase('mock-003', '정치', '국회', '여당 대표, 결국 사퇴 결심했나', '당내 파장 확산', [
      '국회는 이번 주 본회의에서 민생 법안 열두 건을 처리했다.',
      '여야는 법안 처리 순서를 놓고 막판까지 협상을 이어갔다.',
      '여당 원내대표는 "이번 회기 안에 마무리하자는 데 뜻을 모았다"고 말했다.',
      '야당은 일부 법안에 대해 추가 논의가 필요하다는 입장을 밝혔다.',
      '처리된 법안에는 소상공인 지원과 주택 임대차 보호 내용이 담겼다.',
      '정치권에서는 연말 예산안 협상이 다음 분수령이 될 것으로 보고 있다.',
      '국회 사무처는 다음 주 임시회 일정을 공지할 계획이다.',
      '여야 지도부는 주말 동안 비공식 회동을 이어갈 전망이다.',
    ]),
    answer: mkAnswer('mock-003', true, 1, '제목-본문 불일치', [], '국회, 본회의서 민생 법안 12건 처리'),
    docket: { track: 'trial', reasons: ['고위험 분야: 정치'], screening: { isClickbait: true, confidence: 90, reason: '제목의 사퇴 언급이 본문에 전혀 없습니다.', claimType: 'title_body_mismatch' } },
    team: 2,
    pro: [
      { t: 'title_body_mismatch', text: "제목의 '사퇴'가 본문 어디에도 나오지 않습니다.", st: 3, ev: [{ kw: '사퇴' }, { kw: '대표' }] },
      { t: 'curiosity_gap', text: '제목의 질문에 본문이 답하지 않고 회동 전망만 전합니다.', st: 2, ev: [{ q: '여야 지도부는 주말 동안 비공식 회동을 이어갈 전망이다' }] },
      { t: 'exaggeration', text: '제목은 당 대표 사퇴를 암시하지만 본문은 원내대표 발언뿐입니다.', st: 2, ev: [{ q: '여당 원내대표는' }] },
    ],
    con: [
      { t: 'body_consistent', text: '본문은 본회의 법안 처리라는 한 사안을 일관되게 다룹니다.', st: 2, ev: [{ q: '소상공인 지원과 주택 임대차 보호' }] },
      { t: 'title_reflects_core', text: '제목의 여당 인물은 3번 문장에 등장합니다.', st: 1, ev: [{ q: '여당 원내대표는' }] },
      { t: 'strong_but_factual', text: '본회의 처리는 사실이며 과장된 표현은 없습니다.', st: 1, ev: [{ q: '국회는 이번 주 본회의에서' }] },
    ],
    rebut: { pro: { q: '여당 원내대표는' }, con: { q: '국회는 이번 주 본회의에서 민생 법안' } },
  },
  {
    case: mkCase('mock-004', 'IT과학', '모바일', "스마트폰 배터리, '이 습관' 하나만 고쳐도 수명 2배?", '', [
      '스마트폰 배터리 수명을 좌우하는 요인에 대한 연구 결과가 공개됐다.',
      '연구팀은 리튬이온 배터리가 완전 방전과 완전 충전을 반복할 때 더 빨리 노화된다고 설명했다.',
      '이 때문에 배터리 잔량을 20~80% 사이로 유지하는 것이 권장된다.',
      '연구팀은 실험에서 충전 한도를 80%로 제한한 기기의 수명이 평균 1.4배 길었다고 밝혔다.',
      '고온 환경에서 충전하면 노화가 더 빨라진다는 결과도 함께 제시됐다.',
      '업계에서는 최근 충전 한도 설정 기능을 기본 탑재하는 추세다.',
      '연구 결과는 학술지에 실렸다.',
      '연구팀은 후속 연구로 급속 충전의 영향을 분석할 계획이다.',
    ]),
    answer: mkAnswer('mock-004', true, 1, '과장 제목', [], '배터리 잔량 20~80% 유지하면 수명 1.4배'),
    docket: { track: 'summary', reasons: ['서기 확신도 88 ≥ 85 · 일반 분야'], screening: { isClickbait: true, confidence: 88, reason: "'수명 2배'는 본문의 1.4배와 다릅니다.", claimType: 'exaggeration' } },
    team: 2,
    pro: [
      { t: 'exaggeration', text: "제목의 '수명 2배'는 본문의 평균 1.4배보다 과장됐습니다.", st: 3, ev: [{ q: '평균 1.4배 길었다고' }] },
      { t: 'curiosity_gap', text: "제목의 '이 습관'이 무엇인지 제목에서 숨깁니다.", st: 2, ev: [{ kw: '습관' }] },
      { t: 'title_body_mismatch', text: '실험 조건이 제목과 다릅니다.', st: 1, ev: [{ q: '충전 한도를 80%로 제한한' }] },
    ],
    con: [
      { t: 'title_reflects_core', text: '제목의 습관은 3번 문장의 잔량 유지입니다.', st: 2, ev: [{ q: '배터리 잔량을 20~80% 사이로 유지하는 것이' }] },
      { t: 'body_consistent', text: '본문은 배터리 노화라는 한 주제를 다룹니다.', st: 2, ev: [{ q: '리튬이온 배터리가 완전 방전과' }] },
      { t: 'strong_but_factual', text: '수명이 길어졌다는 실험 결과는 사실입니다.', st: 1, ev: [{ q: '수명이 평균 1.4배' }] },
    ],
    rebut: { pro: { q: '평균 1.4배 길었다' }, con: { q: '권장된다' } },
  },
  {
    case: mkCase('mock-005', '스포츠', '축구', '에이스 김도윤, 시즌 10호 골 폭발…팀은 3-1 승리', '서울FC 홈 경기', [
      '프로축구 서울FC가 홈에서 부산FC를 3대 1로 꺾었다.',
      '이날 에이스 김도윤은 전반 12분 선제골을 넣으며 시즌 10호 골을 기록했다.',
      '부산은 후반 5분 동점골을 넣으며 추격했다.',
      '서울은 후반 20분 박지훈이 역전골을 터뜨렸다.',
      '경기 종료 직전 교체 투입된 이현우가 쐐기골을 넣었다.',
      '이 승리로 서울은 리그 3위로 올라섰다.',
      '김도윤은 경기 후 "팀 승리가 가장 기쁘다"고 소감을 밝혔다.',
      '서울은 다음 주말 대전을 상대로 연승에 도전한다.',
    ]),
    answer: mkAnswer('mock-005', false, 0, '원문', [], '에이스 김도윤, 시즌 10호 골 폭발…팀은 3-1 승리'),
    docket: { track: 'trial', reasons: ['서기 확신도 64 < 85'], screening: { isClickbait: false, confidence: 64, reason: '제목의 골과 스코어가 모두 본문에 있습니다.', claimType: 'title_reflects_core' } },
    team: 3,
    pro: [
      { t: 'exaggeration', text: "'폭발'은 한 골을 넣은 경기에 비해 과합니다.", st: 1, ev: [{ q: '전반 12분 선제골을 넣으며' }] },
      { t: 'title_body_mismatch', text: "'폭발'이라는 표현이 본문에 없습니다.", st: 2, ev: [{ kw: '폭발' }] },
      { t: 'curiosity_gap', text: '소감 내용이 제목에 없습니다.', st: 1, ev: [{ q: '소감을 밝혔다' }] },
    ],
    con: [
      { t: 'title_reflects_core', text: '제목의 승리와 스코어가 1번 문장에 그대로 나옵니다.', st: 3, ev: [{ q: '서울FC가 홈에서 부산FC를 3대 1로 꺾었다' }] },
      { t: 'strong_but_factual', text: '시즌 10호 골은 2번 문장에 있습니다.', st: 2, ev: [{ q: '시즌 10호 골을 기록했다' }] },
      { t: 'body_consistent', text: '본문은 경기 결과와 순위를 일관되게 다룹니다.', st: 2, ev: [{ q: '리그 3위로 올라섰다' }] },
    ],
    rebut: { pro: { q: '전반 12분 선제골' }, con: { q: '3대 1로 꺾었다' } },
  },
]

// 증거 검증관 흉내: 인용·핵심어를 원문과 대조
function check(c: Case, raw: Raw, stance: Stance, id: string): Evidence {
  if ('kw' in raw) {
    const inBody = c.sentences.find((s) => s.text.includes(raw.kw))
    const inTitle = `${c.title} ${c.subtitle}`.includes(raw.kw)
    const status = inBody ? 'present' : inTitle ? 'verified' : 'fabricated'
    return { id, kind: 'absence', stance, sentenceNo: null, quote: null, keyword: raw.kw, status, foundIn: inBody?.no ?? null }
  }
  const found = c.sentences.find((s) => s.text.includes(raw.q))
  const claimed = raw.no ?? found?.no ?? 1
  const at = c.sentences.find((s) => s.no === claimed)
  const inTitle = `${c.title} ${c.subtitle}`.includes(raw.q)
  const status = at?.text.includes(raw.q) ? 'verified' : found ? 'misnumbered' : inTitle ? 'title' : 'fabricated'
  return { id, kind: 'quote', stance, sentenceNo: claimed, quote: raw.q, keyword: null, status, foundIn: found?.no ?? null }
}

// 에이전트 알파벳 이름
const letter = (k: number) => String.fromCharCode(65 + k)

// 심급별 모의 재판 기록 생성
export function buildTrial(def: CaseDef, instance: Instance, prior: TrialRecord[], at = new Date().toISOString()): TrialRecord {
  const c = def.case
  let cn = 0
  let en = 0
  const claims: Claim[] = []
  // 주장 하나 추가
  const add = (agentId: string, round: number, stance: Stance, spec: Spec, type = spec.t, rebuts: string | null = null) => {
    const id = `i${instance}-C${++cn}`
    const evidence = spec.ev.map((r) => check(c, r, stance, `i${instance}-E${++en}`))
    const unresolved = evidence.some((e) => e.status !== 'verified')
    claims.push({ id, agentId, round, type, stance, text: spec.text, strength: spec.st, rebuts, evidence, revisions: unresolved ? 2 : cn % 3 === 2 ? 1 : 0, escalated: unresolved })
  }
  // 검사 에이전트 id
  const P = (k: number) => `i${instance}-P${k + 1}`
  // 변호인 에이전트 id
  const D = (k: number) => `i${instance}-D${k + 1}`
  // 에이전트 생성
  const agent = (id: string, side: Agent['side'], name: string, specialty: string | null): Agent => ({ id, side, name, specialty, skill: side, skillVersion: '1' })
  let bench: Agent[]
  let rounds: TrialRecord['rounds']

  if (instance === 1) {
    bench = [agent(P(0), 'prosecution', '검사 A', null), agent(D(0), 'defense', '변호인 A', null)]
    rounds = [{ index: 0, kind: 'opening', title: '모두 변론' }]
    for (let k = 0; k < 2; k++) {
      add(P(0), 0, 'pro', def.pro[k])
      add(D(0), 0, 'con', def.con[k])
    }
  } else if (instance === 2) {
    const n = def.team
    bench = [
      ...Array.from({ length: n }, (_, k) => agent(P(k), 'prosecution', `검사 ${letter(k)}`, def.pro[k].t)),
      ...Array.from({ length: n }, (_, k) => agent(D(k), 'defense', `변호인 ${letter(k)}`, def.con[k].t)),
    ]
    rounds = [{ index: 0, kind: 'opening', title: '모두 변론' }, { index: 1, kind: 'cross', title: '반대신문 · 반박' }]
    for (let k = 0; k < n; k++) {
      add(P(k), 0, 'pro', def.pro[k])
      add(D(k), 0, 'con', def.con[k])
    }
    const opening = [...claims]
    for (let k = 0; k < n; k++) {
      // 반박 대상 근거 선택
      const target = (side: Stance) => {
        const own = opening.filter((x) => x.stance === side)[k]
        return own.evidence.find((e) => e.status === 'verified') ?? own.evidence[0]
      }
      const p = target('con')
      const d = target('pro')
      add(P(k), 1, 'pro', { t: 'rebuttal', text: `상대 근거 ${p.id}는 주장을 뒷받침하지 못합니다.`, st: 2, ev: [def.rebut.pro] }, 'rebuttal', p.id)
      add(D(k), 1, 'con', { t: 'rebuttal', text: `상대 근거 ${d.id}는 주장을 뒷받침하지 못합니다.`, st: 2, ev: [def.rebut.con] }, 'rebuttal', d.id)
    }
  } else {
    bench = [agent('i3-O1', 'officer', '재판연구관', null), agent(P(0), 'prosecution', '검사 A', null), agent(D(0), 'defense', '변호인 A', null)]
    rounds = [{ index: 0, kind: 'review', title: '재판연구관 보고 · 쟁점별 변론' }]
    for (const k of [2, 0]) {
      add(P(0), 0, 'pro', def.pro[k])
      add(D(0), 0, 'con', def.con[k])
    }
  }

  const earlier = prior.flatMap((r) => r.claims)
  const items = evidenceWeights(earlier, {})
  const perjury = earlier.flatMap((x) => x.evidence).filter((e) => e.status === 'fabricated').map((e) => e.id)
  const title = earlier.flatMap((x) => x.evidence).find((e) => e.status === 'title')
  const tilt = balanceOf(items).tilt
  const officer =
    instance === 3
      ? {
          summary: `1·2심 변론을 ${earlier.length}개 주장으로 정리했습니다. 찬성 ${balanceOf(items).pro} 대 반대 ${balanceOf(items).con}로 코드가 매긴 무게가 갈립니다.`,
          issues: ['제목의 핵심 주장이 본문에서 뒷받침되는가', '본문 일부가 기사 주제와 무관한가'],
          reclassified: title ? [{ evidenceId: title.id, from: title.stance, to: title.stance === 'pro' ? 'con' as const : 'pro' as const, why: '제목 인용은 본문 증거가 아니어서 입장 재분류를 제안합니다.' }] : [],
          perjury,
          recommendedAction: tilt > 0.25 ? 'L1' as const : 'L0' as const,
        }
      : null

  const rec: TrialRecord = {
    caseId: c.id,
    instance,
    ontologyVersion: 1,
    model: { name: 'ax4-light:q4_K_M (모의)', options: { temperature: 0.2 } },
    createdAt: at,
    bench,
    rounds,
    claims,
    screening: instance === 1 ? def.docket.screening : null,
    officer,
    calls: bench.map((a) => ({ role: a.side, agentId: a.id, promptTokens: 1800, outputTokens: 420, seconds: 6.5 })),
    trace: [],
    agentStats: {},
  }
  const timeline = buildTimeline(rec, c.sentences.length)
  return { ...rec, trace: traceOf(timeline, at), agentStats: statsOf(rec, timeline) }
}

// 시간표에 올린 에이전트 이벤트 한 건
export interface Timed { offset: number; agentId: string; kind: AgentEvent['kind']; text: string; claimId: string | null; publicText?: string }

// 모의 에이전트 루프 시간표 (읽기 → 계획 → 도구 → 초안 → 검증 → 고쳐 쓰기 → 제출·에스컬레이션)
export function buildTimeline(rec: TrialRecord, sentenceCount: number): Timed[] {
  const out: Timed[] = []
  const push = (offset: number, agentId: string, kind: AgentEvent['kind'], text: string, claimId: string | null = null, publicText = '') => out.push({ offset, agentId, kind, text, claimId, publicText })
  const writers = rec.bench.filter((a) => a.side !== 'officer')
  writers.forEach((a, j) => {
    const mine = rec.claims.filter((c) => c.agentId === a.id)
    const nos = [...new Set(mine.flatMap((c) => c.evidence.map((e) => e.foundIn ?? e.sentenceNo)).filter((n): n is number => n !== null))].slice(0, 4)
    const label = ONTOLOGY.claim_types.find((t) => t.id === (a.specialty ?? mine[0]?.type))?.label ?? '주장 유형'
    push(j * 250, a.id, 'read', `기사 읽는 중 · 본문 ${sentenceCount}개 문장`, null, '기사 읽기')
    push(j * 250 + 700, a.id, 'plan', `${nos.length ? `${nos.map((n) => `${n}번`).join('·')} 문장` : '핵심어'} 살펴보기 · 노릴 유형 ${label}`, null, nos.length ? `${nos.map((n) => `${n}번`).join('·')} 문장 확인 계획` : '계획 세우기')
  })
  const officer = rec.bench.find((a) => a.side === 'officer')
  if (officer) {
    push(0, officer.id, 'read', '1·2심 기록 읽는 중', null, '기록 읽기')
    push(700, officer.id, 'tool', '하급심 기록 집계 · 위증 의심 근거 수 세기', null, '기록 집계')
    push(1400, officer.id, 'draft', '재판연구관 보고서 초안 작성', null, '보고서 작성')
  }
  let start = 1500
  let lastSubmit = 0
  rec.claims.forEach((c) => {
    const first = c.evidence[0]
    push(start, c.agentId, 'tool', first?.kind === 'absence' ? `'${first.keyword}' 본문에서 찾는 중` : `${first?.foundIn ?? first?.sentenceNo ?? 1}번 문장 원문 확인`, null, first?.kind === 'absence' ? '본문 검색' : `${first?.foundIn ?? first?.sentenceNo ?? 1}번 문장 원문 확인`)
    push(start + 650, c.agentId, 'draft', `${c.evidence.length}개 근거로 주장 초안 작성`, null, '초안 작성')
    let t = start + 1250
    push(t, 'checker', 'check', `근거 ${c.evidence.length}건을 원문과 대조`, null, '근거 대조')
    const bad = c.evidence.find((e) => e.status !== 'verified')
    const hint = bad ? (bad.status === 'fabricated' ? '위증 의심 1건' : bad.status === 'present' ? '본문에 있는 핵심어 1건' : bad.status === 'title' ? '제목 인용 1건' : '문장 번호 오류 1건') : '위증 의심 1건'
    for (let r = 1; r <= c.revisions; r++) {
      t += 650
      push(t, c.agentId, 'revise', `${hint} → 다시 작성 (${r}/2)`, null, '다시 작성')
      t += 650
      push(t, 'checker', 'check', r === c.revisions && !c.escalated ? '모든 근거가 원문과 일치' : `근거 다시 대조 · ${hint} 남음`, null, '근거 대조')
    }
    t += 600
    lastSubmit = Math.max(t, lastSubmit + 450)
    push(lastSubmit, c.agentId, c.escalated ? 'escalate' : 'submit', c.escalated ? '자기 수정 실패 · 판사 확인 필요' : '주장 제출', c.id, '주장 제출')
    start += 650
  })
  if (officer) push(lastSubmit + 450, officer.id, 'submit', '보고서 제출', null, '보고서 제출')
  out.push({ offset: lastSubmit + 1100, agentId: 'checker', kind: 'done', text: '모든 주장 검증 완료', claimId: null })
  return out.sort((a, b) => a.offset - b.offset)
}

// 시간표를 번호와 시각이 붙은 이벤트 목록으로 변환
export function traceOf(timeline: Timed[], at: string): AgentEvent[] {
  const base = new Date(at).getTime()
  return timeline.map((t, k) => ({ seq: k + 1, at: new Date(base + t.offset).toISOString(), agentId: t.agentId, kind: t.kind, text: t.text, claimId: t.claimId, publicText: t.publicText }))
}

// 에이전트별 작업 집계
function statsOf(rec: TrialRecord, timeline: Timed[]): Record<string, AgentStat> {
  const total = timeline.at(-1)?.offset ?? 0
  return Object.fromEntries(
    rec.bench.map((a) => {
      const mine = rec.claims.filter((c) => c.agentId === a.id)
      const revisions = mine.reduce((n, c) => n + c.revisions, 0)
      return [a.id, { calls: a.side === 'officer' ? 2 : 2 + revisions, revisions, escalated: mine.filter((c) => c.escalated).length, seconds: Math.round((total / 1000 / Math.max(1, rec.bench.length)) * 10) / 10 }]
    }),
  )
}
