// 일정 간격 반복 조회 훅
import { useEffect, useRef, useState } from 'react'

// 화면이 보일 때만 주기적으로 조회하는 훅
export function usePoll<T>(load: () => Promise<T>, ms: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef(load)
  ref.current = load

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    const tick = async () => {
      if (!document.hidden) {
        try {
          const d = await ref.current()
          if (alive) {
            setData(d)
            setError(null)
          }
        } catch (e) {
          if (alive) setError((e as Error).message)
        }
      }
      if (alive) timer = window.setTimeout(tick, ms)
    }
    tick()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [ms])

  return { data, error }
}
