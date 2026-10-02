// 비동기 데이터 불러오기 훅
import { useCallback, useEffect, useState } from 'react'

// 서버 응답을 읽어 상태로 돌려주는 훅
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    load()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [...deps, tick])

  // 다시 불러오기
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}
