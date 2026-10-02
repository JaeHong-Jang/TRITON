// 콘솔 틀과 페이지 라우팅
import { useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { ConsoleShell } from './console/ConsoleShell'
import AgentsPage from './pages/AgentsPage'
import CourtPage from './pages/CourtPage'
import DashboardPage from './pages/DashboardPage'
import DocketPage from './pages/DocketPage'
import LabPage from './pages/LabPage'
import ProgressPage from './pages/ProgressPage'
import RecordsPage from './pages/RecordsPage'
import RulesPage from './pages/RulesPage'
import StatsPage from './pages/StatsPage'
import { useOntology } from './ui/ontology'

// 앱 루트 컴포넌트
export default function App() {
  const load = useOntology((s) => s.load)
  useEffect(() => {
    load()
  }, [load])
  return (
    <ConsoleShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cases" element={<DocketPage />} />
        <Route path="/court/:caseId" element={<CourtPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/records/:caseId?" element={<RecordsPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/lab" element={<LabPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="*" element={<p className="p-6 text-sm">없는 화면입니다. 왼쪽 메뉴에서 대시보드로 이동하세요.</p>} />
      </Routes>
    </ConsoleShell>
  )
}
