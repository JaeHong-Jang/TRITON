// 규칙과 온톨로지 화면
import { PageFrame, Panel } from '../console/parts'
import { OntologyGraph } from '../features/ontology/OntologyGraph'
import { PolicyCard } from '../features/ontology/PolicyCard'
import { SkillsTable } from '../features/ontology/SkillsTable'
import { Loading } from '../ui/Feedback'
import { useOntology } from '../ui/ontology'

// 규칙 컴포넌트
export default function RulesPage() {
  const ont = useOntology((s) => s.ont)
  return (
    <PageFrame title="규칙 · 온톨로지" sub="AI가 어떤 주장을 어떤 근거로 펼 수 있는지, 그 근거가 얼마나 무겁게 쳐지는지, 어디까지 AI가 혼자 결정하는지 정해 둔 규칙입니다.">
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
