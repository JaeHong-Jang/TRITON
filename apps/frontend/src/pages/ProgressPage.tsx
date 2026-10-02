// 구현 현황 화면
import { api } from '../api/client'
import { PageShell } from '../console/parts'
import { Badge, type Tone } from '../ui/Badge'
import { ErrorNote, Loading, PageTitle, ProgressBar } from '../ui/Feedback'
import { useAsync } from '../ui/useAsync'

const TONES: Record<string, Tone> = { todo: 'gray', doing: 'amber', done: 'green', verified: 'dark' }

// 구현 현황 컴포넌트
export default function ProgressPage() {
  const { data, error, loading, reload } = useAsync(() => api.progress(), [])
  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorNote message={error ?? '불러오지 못했습니다'} onRetry={reload} />
  const all = data.phases.flatMap((p) => p.features)
  const done = all.filter((f) => f.status === 'done' || f.status === 'verified').length
  return (
    <PageShell>
      <PageTitle title="구현 현황" sub={`기준일 ${data.updatedAt} · 구현됨·검증됨 기능을 완료로 셉니다`} />
      <div className="mb-5 rounded-xl border border-stone-300 bg-white p-4">
        <ProgressBar value={all.length ? done / all.length : 0} tone="bg-emerald-600" label={`전체 ${all.length}개 중 ${done}개 완료 (${all.length ? Math.round((done / all.length) * 100) : 0}%)`} />
      </div>
      <div className="space-y-4">
        {data.phases.map((p) => {
          const d = p.features.filter((f) => f.status === 'done' || f.status === 'verified').length
          return (
            <section key={p.id} className="rounded-xl border border-stone-300 bg-white p-4">
              <h2 className="text-base font-black">{p.id} · {p.title} <span className="text-sm font-normal text-stone-600">{d}/{p.features.length}</span></h2>
              <ProgressBar value={p.features.length ? d / p.features.length : 0} tone="bg-emerald-600" />
              <ul className="mt-3 divide-y divide-stone-200">
                {p.features.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="w-12 shrink-0 font-mono text-xs text-stone-600">{f.id}</span>
                    <span className="min-w-0 flex-1 basis-48">{f.title}</span>
                    <Badge tone="gray">{f.owner}</Badge>
                    <Badge tone={TONES[f.status] ?? 'gray'}>{data.statuses[f.status] ?? f.status}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </PageShell>
  )
}
