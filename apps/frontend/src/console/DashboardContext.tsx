// 콘솔 전체가 함께 쓰는 대시보드 조회 결과
import { createContext, useContext } from 'react'
import type { Dashboard } from '../api/types'

// 대시보드 조회 상태
export interface DashboardState { data: Dashboard | null; error: string | null }

// 대시보드 컨텍스트
export const DashboardContext = createContext<DashboardState>({ data: null, error: null })

// 대시보드 조회 결과 읽기
export function useDashboard(): DashboardState {
  return useContext(DashboardContext)
}
