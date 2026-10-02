// 에이전트 스킬과 버전 표
import { api } from '../../api/client'
import { Panel } from '../../console/parts'
import { usePoll } from '../../console/usePoll'

// 스킬 표 컴포넌트
export function SkillsTable() {
  const { data, error } = usePoll(() => api.agents(), 15000)
  return (
    <Panel title="스킬 버전" aside="agents/ 폴더의 역할 정의">
      {data ? (
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-stone-500">
              <th className="py-2 font-bold">에이전트</th>
              <th className="py-2 font-bold">스킬</th>
              <th className="py-2 text-right font-bold">버전</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.role} className="border-b border-stone-100 last:border-0">
                <td className="py-2.5 font-semibold">{a.label}<span className="ml-1.5 text-xs font-normal text-stone-400">{a.room}</span></td>
                <td className="py-2.5 font-mono text-xs text-stone-700">{a.skill ?? '코드 (스킬 없음)'}</td>
                <td className="py-2.5 text-right"><span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs font-bold">{a.skillVersion ? `v${a.skillVersion}` : '-'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-stone-500">{error ?? '불러오는 중입니다…'}</p>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-stone-500">스킬 문서가 바뀌면 버전이 올라가고, 그 버전은 재판 기록에 함께 남아 어느 판단이 어느 규칙에서 나왔는지 따라갈 수 있습니다.</p>
    </Panel>
  )
}
