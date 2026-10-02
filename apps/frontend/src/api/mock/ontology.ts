// 모의 온톨로지
import type { EvidenceKind, Ontology } from '../types'

// 단서와 쓸 수 있는 근거 종류가 붙은 주장 유형 (agents/ontology.yaml과 같은 내용)
const CLAIM_TYPES: (Ontology['claim_types'][number] & { signals: string[]; evidence_kinds: EvidenceKind[] })[] = [
  { id: 'title_body_mismatch', label: '제목-본문 불일치', stance: 'pro', definition: '제목의 핵심 대상·사건·주장이 본문에 나오지 않거나 본문 내용과 다름', signals: ['제목의 핵심어가 본문 어디에도 없음', '제목의 인물·기관·수치가 본문과 다름'], evidence_kinds: ['absence', 'quote'] },
  { id: 'inserted_irrelevant', label: '무관한 내용 삽입', stance: 'pro', definition: '본문 일부 문장이 기사 주제와 관계없는 다른 사안을 다룸', signals: ['앞 문단과 다른 인물·기관·사건이 갑자기 등장', '주제 전환 접속어(한편, 이와 함께) 뒤 무관한 홍보성 내용'], evidence_kinds: ['quote'] },
  { id: 'exaggeration', label: '과장·선정적 제목', stance: 'pro', definition: '제목이 본문이 뒷받침하는 정도보다 크게 부풀리거나 자극적으로 표현함', signals: ['제목의 단정·최상급 표현을 본문 근거가 받치지 못함'], evidence_kinds: ['quote'] },
  { id: 'curiosity_gap', label: '핵심 정보 은닉·호기심 유발', stance: 'pro', definition: '제목이 질문·생략으로 클릭을 유도하지만 본문이 그 답을 주지 않음', signals: ['제목의 질문(이유는?, 정체는?)에 대한 답이 본문에 없음'], evidence_kinds: ['quote', 'absence'] },
  { id: 'title_reflects_core', label: '제목이 본문 핵심을 반영', stance: 'con', definition: '제목의 핵심 대상과 사건이 본문 첫 부분이나 중심 문장에 그대로 나옴', signals: ['제목 핵심어가 본문 앞부분 문장에 등장'], evidence_kinds: ['quote'] },
  { id: 'body_consistent', label: '본문 주제 일관', stance: 'con', definition: '본문 문장들이 하나의 사안을 일관되게 다룸', signals: ['마지막 문장까지 같은 인물·기관·사건을 다룸'], evidence_kinds: ['quote'] },
  { id: 'strong_but_factual', label: '표현은 강하나 사실과 일치', stance: 'con', definition: '제목 표현이 강하지만 본문 사실이 그 표현을 뒷받침함', signals: ['제목의 수치·단정이 본문 문장에 그대로 있음'], evidence_kinds: ['quote'] },
  { id: 'rebuttal', label: '반박', stance: 'derived', definition: '상대 근거 하나를 지목해 그것이 주장을 뒷받침하지 못함을 보임 (입장은 대상 근거의 반대)', signals: ['상대가 인용한 문장이 실제로는 다른 의미임', '상대가 없다고 한 핵심어가 본문에 있음'], evidence_kinds: ['quote'] },
]

// 모의 온톨로지 데이터
export const ONTOLOGY: Ontology = {
  version: 1,
  stances: {
    pro: { label: '찬성', meaning: '낚시성이다 (혐의를 뒷받침)', pan: 'left' },
    con: { label: '반대', meaning: '낚시성이 아니다 (혐의를 부정)', pan: 'right' },
  },
  claim_types: CLAIM_TYPES,
  evidence_kinds: { quote: { label: '본문 인용' }, absence: { label: '핵심어 부재' } },
  evidence_status: {
    verified: { label: '원문 확인', factor: 1 },
    misnumbered: { label: '문장 번호 오류', factor: 1 },
    title: { label: '제목 인용·증거 아님', factor: 0 },
    present: { label: '핵심어가 본문에 있음', factor: 0 },
    fabricated: { label: '위증 의심·원문에 없음', factor: 0 },
  },
  actions: {
    L0: { label: '조치 없음', autonomy: 'ai' },
    L1: { label: '독자에게 불일치 가능성 안내', autonomy: 'ai' },
    L2: { label: '노출 순위 하향', autonomy: 'human_approval' },
    L3: { label: '언론사 통보·제재', autonomy: 'human_only' },
  },
}
