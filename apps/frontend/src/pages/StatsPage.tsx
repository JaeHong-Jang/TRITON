// 통계실 화면
import type { ReactNode } from 'react'
import { api } from '../api/client'
import type { EvidenceStatus } from '../api/types'
import { PageShell } from '../console/parts'
import { ErrorNote, Loading, PageTitle } from '../ui/Feedback'
import { pct } from '../ui/format'
import { statusLabel, useOntology } from '../ui/ontology'
import { useAsync } from '../ui/useAsync'

// 숫자 타일
function Tile({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-stone-300 bg-white p-3">
      <p className="text-xs font-semibold text-stone-600">{label}</p>
      <p className={`mt-1 break-keep font-black tabular-nums ${typeof value === 'string' && value.startsWith('아직 표본') ? 'text-base text-stone-600' : 'text-2xl'}`}>{value}</p>
      {note ? <p className="mt-0.5 text-xs leading-snug text-stone-600">{note}</p> : null}
    </div>
  )
}

// 제목이 붙은 타일 묶음 (한 줄에 4개, 좁으면 2개씩)
function TileGroup({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="text-sm font-black">{title}</h2>
      {sub ? <p className="mb-2 text-xs text-stone-600">{sub}</p> : <div className="mb-2" />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  )
}

interface BarRow { label: string; value: number; text: string; color: string; max?: number }

// 가로 막대 목록 (줄마다 이름과 값을 위에, 막대를 아래에 두어 겹치지 않게 함)
function BarList({ title, rows, legend }: { title: string; rows: BarRow[]; legend?: ReactNode }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.max ?? r.value))
  return (
    <section className="min-w-0 rounded-xl border border-stone-300 bg-white p-4">
      <h2 className="mb-1 text-sm font-black">{title}</h2>
      {legend ? <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">{legend}</div> : <div className="mb-2" />}
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate" title={r.label}>{r.label}</span>
              <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-stone-600">{r.text}</span>
            </div>
            <span className="mt-1 block h-2.5 overflow-hidden rounded bg-stone-100"><span className={`block h-full rounded ${r.color}`} style={{ width: `${(r.value / max) * 100}%` }} /></span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// 실험 조건 이름
const COND: Record<string, string> = { A: 'A 기사만', B: 'B 기사+AI 권고', C: 'C 기사+변론·천칭' }

// 비율을 보여 줄 최소 표본 수
const MIN_N = 5

const ROLE_LABEL: Record<string, string> = { clerk: '서기', prosecution: '검사', defense: '변호인', cross: '반대신문', officer: '재판연구관', checker: '증거 검증관' }

// 초를 분·초 문장으로
function fmtSeconds(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}초`
  return `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초`
}

const STANCE_BAR: Record<string, string> = { pro: 'bg-pro', con: 'bg-con', derived: 'bg-stone-500' }

// 통계실 컴포넌트
export default function StatsPage() {
  const ont = useOntology((s) => s.ont)
  const { data: s, error, loading, reload } = useAsync(() => api.stats(), [])
  if (loading && !s) return <Loading />
  if (error || !s) return <ErrorNote message={error ?? '불러오지 못했습니다'} onRetry={reload} />
  // 비율 문자열 계산 (표본이 적으면 숨김)
  const ratio = (a: number, b: number) => (b < MIN_N ? `아직 표본이 적어요 (${b}건)` : pct(a / b))
  return (
    <PageShell>
      <PageTitle title="통계실" sub="재판 기록과 장부로 AI와 판사의 신뢰도를 집계합니다. 정답은 최종 판결이 난 사건만 반영됩니다." />
      <TileGroup title="사건과 판결">
        <Tile label="사건" value={s.cases} note={`약식 ${s.docket.summary} · 회부 ${s.docket.trial}`} />
        <Tile label="최종 판결" value={s.finals} />
        <Tile label="항소" value={s.appeals.i1 + s.appeals.i2} note={`1→2심 ${s.appeals.i1} · 2→3심 ${s.appeals.i2}`} />
        <Tile label="상급심 뒤집힘" value={s.overturned.i2 + s.overturned.i3} note={`2심 ${s.overturned.i2} · 3심 ${s.overturned.i3}`} />
      </TileGroup>
      <TileGroup title="신뢰도">
        <Tile label="AI 서기 정확도" value={ratio(s.screening.correct, s.screening.total)} note={`${s.screening.correct}/${s.screening.total} · 판결과 일치 ${s.screening.agreeWithFinal}건`} />
        <Tile label="판결 정확도" value={ratio(s.judges.correct, s.judges.total)} note={`${s.judges.correct}/${s.judges.total}`} />
        <Tile label="판사석 일치율" value={ratio(s.seatAgreement.agree, s.seatAgreement.total)} note={`${s.seatAgreement.agree}/${s.seatAgreement.total}`} />
        <Tile label="첫인상 → 판결 확신 변화" value={s.confidenceShift.mean === null || s.confidenceShift.n < MIN_N ? `아직 표본이 적어요 (${s.confidenceShift.n}건)` : `${s.confidenceShift.mean > 0 ? '+' : ''}${s.confidenceShift.mean}점`} note={`낚시성 방향 평균 · ${s.confidenceShift.n}건`} />
      </TileGroup>
      <TileGroup title="에이전트의 자기 점검과 사람의 개입" sub="에이전트가 스스로 어디까지 고치고, 언제 사람이 개입해야 하는지 보여 줍니다.">
        <Tile label="에이전트 자기 수정률" value={s.agents.selfCorrectionRate === null ? '아직 표본이 적어요' : pct(s.agents.selfCorrectionRate)} note="처음 초안에서 걸린 근거를 고쳐서 통과시킨 비율" />
        <Tile label="사람에게 넘긴 주장" value={s.agents.escalations} note="에이전트가 두 번 고쳐도 해결 못 해 판사에게 넘긴 주장 수" />
        <Tile label="판사가 검증관을 거스른 횟수" value={s.checkerOverrides.admittedVoided + s.checkerOverrides.struckCounted} note={`무효 근거를 채택 ${s.checkerOverrides.admittedVoided} · 유효 근거를 기각 ${s.checkerOverrides.struckCounted}`} />
        <Tile label="조작 실험 사건 (레드팀)" value={s.redteam.variants} note={`일부러 비튼 기사 중 서기 권고가 뒤집힌 ${s.redteam.screeningFlipped}건 (AI가 속은 정도)`} />
      </TileGroup>
      <TileGroup title="비용 · 성능" sub="모델 호출 기록을 모은 값입니다. 역할별로 어디에 시간과 호출이 쓰였는지 아래에서 볼 수 있어요.">
        <Tile label="모델 호출" value={`${s.cost.calls.toLocaleString('ko-KR')}회`} />
        <Tile label="토큰" value={(s.cost.promptTokens + s.cost.outputTokens).toLocaleString('ko-KR')} note={`입력 ${s.cost.promptTokens.toLocaleString('ko-KR')} · 출력 ${s.cost.outputTokens.toLocaleString('ko-KR')}`} />
        <Tile label="모델 시간 합계" value={fmtSeconds(s.cost.seconds)} />
        <Tile label="호출당 평균" value={s.cost.calls ? fmtSeconds(s.cost.seconds / s.cost.calls) : '-'} note="한 번 호출에 걸린 시간" />
      </TileGroup>
      <BarList
        title="역할별 모델 호출"
        rows={s.cost.byRole.map((r) => ({ label: ROLE_LABEL[r.role] ?? r.role, value: r.calls, text: `${r.calls}회 · ${fmtSeconds(r.seconds)} · 평균 ${r.calls ? fmtSeconds(r.seconds / r.calls) : '-'}`, color: 'bg-stone-700' }))}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="근거 검증 상태"
          rows={(Object.keys(s.evidenceStatus) as EvidenceStatus[]).map((k) => ({ label: statusLabel(ont, k), value: s.evidenceStatus[k], text: String(s.evidenceStatus[k]), color: 'bg-stone-700' }))}
        />
        <BarList
          title="주장 유형별 건수"
          legend={[['bg-pro', '찬성 (낚시성이다)'], ['bg-con', '반대 (낚시성 아니다)'], ['bg-stone-500', '반박']].map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><span className={`h-3 w-3 rounded-sm ${c}`} />{l}</span>)}
          rows={s.byClaimType.map((t) => ({ label: t.label, value: t.count, text: `${t.count}건 · 검증 ${pct(t.verifiedRate)}`, color: STANCE_BAR[t.stance] ?? 'bg-stone-500' }))}
        />
        <BarList title="분야별 사건 수 · 서기 재현율(낚시성 기사를 잡아낸 비율)" rows={s.byCategory.map((c) => ({ label: c.category, value: c.cases, text: `${c.cases}건 · 서기 재현율 ${c.cases < MIN_N || c.screeningRecall === null ? '아직 표본이 적어요' : pct(c.screeningRecall)}`, color: 'bg-stone-700' }))} />
        <BarList title="실험실 조건별 정답률" rows={s.lab.map((l) => ({ label: `${COND[l.condition] ?? `조건 ${l.condition}`} (${l.sessions}세션)`, value: l.verdicts ? l.correct / l.verdicts : 0, max: 1, text: `${l.correct}/${l.verdicts} · ${ratio(l.correct, l.verdicts)}`, color: 'bg-stone-700' }))} />
      </div>
    </PageShell>
  )
}
