// 규칙과 온톨로지 화면
import { Link } from 'react-router'
import { api } from '../api/client'
import { BTN, PageFrame, Panel } from '../console/parts'
import { ExecutionGraph } from '../features/execution/ExecutionGraph'
import { OntologyGraph } from '../features/ontology/OntologyGraph'
import { PolicyCard } from '../features/ontology/PolicyCard'
import { SkillsTable } from '../features/ontology/SkillsTable'
import { Loading } from '../ui/Feedback'
import { useOntology } from '../ui/ontology'
import { useAsync } from '../ui/useAsync'

// 규칙 컴포넌트
export default function RulesPage() {
  const ont = useOntology((s) => s.ont)
  const { data: workflow } = useAsync(() => api.workflow(), [])
  const { data: policy } = useAsync(() => api.policy(), [])
  return (
    <PageFrame actions={<Link className={BTN} to="/agents?view=ontology">온톨로지 관제 보기 ↗</Link>} title="규칙 · 온톨로지" sub="AI가 어떤 주장을 어떤 근거로 펼 수 있는지, 그 근거가 얼마나 무겁게 쳐지는지, 어디까지 AI가 혼자 결정하는지 정해 둔 규칙입니다.">
      {policy && !policy.summaryEnabled ? (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">약식 처리 꺼짐 · 모든 사건을 재판으로 보냅니다 <span className="font-normal">(아래 자율 범위 정책에서 바꿀 수 있습니다)</span></p>
      ) : policy ? (
        <p role="status" className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold text-stone-800">약식 처리 켜짐 · 서기 확신도 {policy.summaryThreshold}점 이상은 약식으로 분류합니다</p>
      ) : null}
      <ExecutionGraph view={null} workflow={workflow} title="정적 실행 그래프" mock={import.meta.env.VITE_MOCK === '1'} />
      <Panel title="근거 온톨로지" aside={ont ? `버전 ${ont.version}` : undefined}>
        {ont ? <OntologyGraph ont={ont} /> : <Loading />}
      </Panel>
      <div className="grid items-start gap-5 min-[1000px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <PolicyCard />
        <SkillsTable />
      </div>
    </PageFrame>
  )
}
