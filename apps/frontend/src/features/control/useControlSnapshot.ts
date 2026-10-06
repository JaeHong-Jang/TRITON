// 사건별 관제 스냅샷의 갱신과 이전 요청 폐기
import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { ExecutionView, Health, Instance, Records } from '../../api/types'
import { controlRecord } from '../../lib/controlSnapshot'

// 동일 조회에서 확보한 사건 상태
export interface ControlSnapshot { view: ExecutionView; records: Records; health: Health | null; at: string }

// 화면이 보일 때만 갱신하는 사건 조회
export function useControlSnapshot(caseId: string, instance: Instance) {
  const [data, setData] = useState<ControlSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(true)
  useEffect(() => {
    let alive = true
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // 순서가 바뀐 응답을 차단하는 단일 조회
    async function poll() {
      if (running || !alive) return
      running = true
      clearTimeout(timer)
      try {
        const [view, records, health] = await Promise.all([api.execution(caseId, instance), api.records(caseId), api.health().catch(() => null)])
        controlRecord(caseId, instance, view, records)
        if (alive) { setData({ view, records, health, at: new Date().toISOString() }); setError(null) }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '서버에 연결할 수 없습니다.')
      } finally {
        running = false
        if (alive) {
          setRefreshing(false)
          if (!document.hidden) timer = setTimeout(poll, 2500)
        }
      }
    }
    // 탭 복귀 시 최신 상태 조회
    const visible = () => { if (!document.hidden) void poll(); else clearTimeout(timer) }
    void poll()
    document.addEventListener('visibilitychange', visible)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visible) }
  }, [caseId, instance, version])
  // 명령 이후 이전 응답을 폐기하는 수동 갱신
  const refresh = () => { setRefreshing(true); setVersion((n) => n + 1) }
  return { data, error, refreshing, refresh }
}
