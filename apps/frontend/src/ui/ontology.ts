// 온톨로지 불러오기와 라벨 조회
import { create } from 'zustand'
import { api } from '../api/client'
import type { ActionLevel, EvidenceStatus, Ontology } from '../api/types'

interface OntologyStore { ont: Ontology | null; load: () => void }

// 온톨로지 저장소
export const useOntology = create<OntologyStore>((set, get) => ({
  ont: null,
  load: () => {
    if (!get().ont) api.ontology().then((ont) => set({ ont })).catch(() => undefined)
  },
}))

// 주장 유형 한국어 라벨
export const claimLabel = (ont: Ontology | null, id: string) => ont?.claim_types.find((t) => t.id === id)?.label ?? id

// 전문 분야 라벨
export const specialtyLabel = (ont: Ontology | null, s: string | null) => (s ? claimLabel(ont, s) : null)

// 근거 상태 한국어 라벨
export const statusLabel = (ont: Ontology | null, s: EvidenceStatus) => ont?.evidence_status[s]?.label ?? s

// 조치 단계 라벨
export const actionLabel = (ont: Ontology | null, a: ActionLevel) => ont?.actions[a]?.label ?? a

// 조치 단계가 사람 승인 대상인지 여부
export const needsHuman = (ont: Ontology | null, a: ActionLevel) => (ont ? ont.actions[a]?.autonomy !== 'ai' : a === 'L2' || a === 'L3')
