// 작은 라벨 배지 모음
import type { ReactNode } from 'react'
import type { EvidenceStatus } from '../api/types'
import { statusLabel, useOntology } from './ontology'

const TONES = {
  gray: 'bg-stone-200 text-stone-700',
  pro: 'bg-pro-soft text-pro border border-pro/30',
  con: 'bg-con-soft text-con border border-con/30',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-800',
  dark: 'bg-stone-800 text-amber-200',
}
// 배지 색 종류
export type Tone = keyof typeof TONES

// 배지 컴포넌트
export function Badge({ tone = 'gray', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  )
}

const STATUS_TONE: Record<EvidenceStatus, Tone> = { verified: 'green', misnumbered: 'amber', title: 'gray', present: 'gray', fabricated: 'red' }

// 근거 검증 상태 배지
export function StatusBadge({ status }: { status: EvidenceStatus }) {
  const ont = useOntology((s) => s.ont)
  return <Badge tone={STATUS_TONE[status]}>{statusLabel(ont, status)}</Badge>
}

// 찬성·반대 입장 배지
export function StanceBadge({ stance }: { stance: 'pro' | 'con' }) {
  return <Badge tone={stance}>{stance === 'pro' ? '찬성' : '반대'}</Badge>
}

// 원 안의 단계 번호
export function Num({ n }: { n: number }) {
  return <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-current/20 text-[10px] font-black leading-none" aria-hidden>{n}</span>
}
