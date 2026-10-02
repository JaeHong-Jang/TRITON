// 첫인상 뒤 제출된 주장을 일정 간격으로 자동 공개하는 훅
import { useEffect } from 'react'
import { canAutoReveal, nextRevealId, revealDelay } from '../../lib/reveal'
import { currentInstance } from '../../lib/trial'
import { useCourt } from './store'

// 자동 공개 훅
export function useAutoReveal() {
  const state = useCourt((s) => s.state)
  const records = useCourt((s) => s.records)
  const busy = useCourt((s) => s.busy)
  const skipping = useCourt((s) => s.skipping)
  const error = useCourt((s) => s.error)
  const viewing = useCourt((s) => s.viewing)
  const judgeName = useCourt((s) => s.judgeName)
  const revealNext = useCourt((s) => s.revealNext)
  const nextId = state ? nextRevealId(state, records) : null
  const count = state ? state.instances[currentInstance(state)].revealed.length : 0
  const allowed = canAutoReveal({ busy, error, viewing, judgeName })
  useEffect(() => {
    if (!nextId || !allowed) return
    const t = setTimeout(() => void revealNext(), revealDelay(count, skipping))
    return () => clearTimeout(t)
  }, [nextId, allowed, skipping, count, revealNext])
}
