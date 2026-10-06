// 지금 일어나는 일을 쉬운 한국어로 설명
import type { Ontology } from '../../api/types'
import { currentInstance, phaseOf, seatCount, type Records, type TrialState } from '../../lib/trial'
import { actionLabel, claimLabel } from '../../ui/ontology'
import { leaningLabel, withGa } from '../../ui/format'

// 진행 안내 문구
export interface Narration { title: string; detail: string }

// 현재 단계 설명 문장 만들기
export function narrate(s: TrialState, records: Records, ont: Ontology | null, started = true): Narration {
  const i = currentInstance(s)
  const rec = records[i]
  const phase = phaseOf(s, records)
  const inst = s.instances[i]
  const writing = s.writing === i
  switch (phase) {
    case 'first_impression':
      if (!started) return { title: '「재판 시작」을 눌러 사건을 여세요', detail: rec?.claims.length ? '저장된 변론을 법정에서 다시 재생합니다. 버튼은 한 번만 누르면 됩니다.' : 'AI 검사·변호인이 이 기사를 읽고 그 자리에서 변론을 준비합니다. 버튼은 한 번만 누르면 됩니다.' }
      return {
        title: '기사만 읽고 첫인상을 남겨 주세요',
        detail: writing ? 'AI 검사·변호인이 지금 변론을 준비하고 있습니다. 변론 내용과 천칭은 첫인상을 기록한 뒤에 열립니다. 일하는 모습은 법정 그림에서 볼 수 있어요.' : '천칭과 변론은 아직 가려져 있습니다. 기사를 읽고 낚시성인지 고른 뒤 확신도를 정하세요.',
      }
    case 'need_record':
      return {
        title: `${i}심 변론이 아직 없습니다`,
        detail: i === 1 ? '「재판 시작」을 누르면 AI 검사·변호인이 이 기사를 읽고 그 자리에서 변론을 준비합니다.' : `${i}심 변론 작업이 시작되지 않았습니다. 「${i}심 시작」을 누르면 AI 에이전트가 일을 시작합니다.`,
      }
    case 'hearing': {
      if (!rec) return { title: '', detail: '' }
      const last = inst.revealed.length ? rec.claims.find((c) => c.id === inst.revealed.at(-1)) : undefined
      const caught = inst.revealed.length >= rec.claims.length
      if (caught) return { title: 'AI가 다음 주장을 쓰고 있습니다', detail: `지금까지 ${inst.revealed.length}개 주장을 들었습니다. 제출되는 즉시 자동으로 공개됩니다.` }
      if (!last) return { title: '변론이 곧 공개됩니다', detail: `제출된 주장이 차례로 자동 공개됩니다${writing ? '. AI는 남은 주장을 계속 쓰는 중이에요' : ` (총 ${rec.claims.length}개)`}.` }
      const agent = rec.bench.find((a) => a.id === last.agentId)
      const nth = rec.claims.filter((c) => c.agentId === last.agentId && rec.claims.indexOf(c) <= rec.claims.indexOf(last)).length
      const rebut = last.rebuts ? ` 상대 근거 ${last.rebuts}를 겨냥한 반박입니다.` : ''
      return {
        title: `${withGa(agent?.name ?? '변론자')} ${nth}번째 주장을 하고 있습니다`,
        detail: `${claimLabel(ont, last.type)} · ${last.stance === 'pro' ? '찬성(낚시성이다)' : '반대(낚시성 아니다)'}.${rebut} 근거마다 채택·기각을 정할 수 있고, 급하면 「건너뛰기」로 모두 공개합니다.`,
      }
    }
    case 'review':
      return {
        title: '검증 실패 근거를 먼저 판정해 주세요',
        detail: '코드 검증을 통과하지 못한 근거는 판사가 채택 또는 기각해야 판결 단계로 넘어갑니다. 실패 근거를 채택해도 원래 검증 결과는 바뀌지 않습니다.',
      }
    case 'seats': {
      const seat = inst.seats.length + 1
      return {
        title: `판사석 ${seat} 판결 차례입니다 (${seat}/${seatCount(i)})`,
        detail: i === 1 ? '아래 AI 서기 권고는 참고용입니다. 판결은 항상 사람이 합니다.' : i === 2 ? '판사석은 서로의 판결을 보지 않고 각자 판결합니다.' : '재판연구관(AI가 쟁점을 정리하는 보조역) 보고서를 확인한 뒤 세 판사석이 차례로 판결합니다. 다수결로 최종 판결이 정해집니다.',
      }
    }
    case 'decision':
      return i === 3
        ? { title: '다수결이 끝났습니다', detail: '최종 판결에 따른 조치 단계(가벼운 안내부터 제재까지)와 사유를 적어 확정하세요.' }
        : { title: '판사석 판결이 끝났습니다', detail: `판결을 확정하거나 ${i + 1}심으로 항소할 수 있습니다. 확정하려면 조치 단계와 사유가 필요합니다.` }
    case 'final':
      return { title: '재판이 끝났습니다', detail: `최종 판결: ${leaningLabel(s.final!.verdict)} · 조치 ${actionLabel(ont, s.final!.action)} (${s.final!.action}). 기록실에서 판결문을 볼 수 있습니다.` }
  }
}
