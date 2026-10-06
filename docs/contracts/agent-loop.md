# 에이전트 작업 루프 계약

에이전트(검사·변호인·반대신문·재판연구관)는 한 번 호출로 끝나지 않고, 아래 순서로 **실제로 일한다**.
모든 단계는 이벤트로 남아 화면에 실시간으로 보이고, 재판 기록(`trace`)에 저장되어 감사할 수 있다.

실제 전이 정의·실행 체크포인트와 공개 정책은 [execution.md](execution.md)를 따른다. 이벤트에는 노드·이전 노드·전이 사유와 검증 대상 에이전트를 연결한다. 첫인상 전에는 서버가 `publicText`만 제공한다. 숨은 사고 과정은 수집 대상이 아니며, 구조화된 계획·도구 입력/결과·제출 근거만 기록한다.

## 단계

| 단계 | 하는 일 | 누가 |
|---|---|---|
| `read` | 기사 읽기: 문장 수, 코드가 계산한 「본문에 없는 제목 핵심어」 목록 확보 | 코드 |
| `plan` | 살펴볼 문장 번호(최대 4개)와 노릴 주장 유형(온톨로지 id)을 고름 | A.X |
| `tool` | 도구 실행: `read_sentence(n)` 문장 원문 가져오기, `find_keyword(word)` 본문에서 단어 찾기, `absent_keywords()` 부재 핵심어 목록 | 코드 |
| `draft` | 도구 결과를 보고 주장·근거 초안 작성 (기존 주장 스키마) | A.X |
| `check` | 증거 검증관이 모든 근거를 원문과 대조 | 코드 |
| `revise` | `fabricated`·`present`·`misnumbered`·`title` 근거가 있으면, 무엇이 틀렸는지 원문과 함께 돌려주고 고쳐 쓰게 함 (최대 2번) | A.X |
| `submit` | 주장 제출 → 첫인상 기록 후 순서대로 법정에 공개되고 천칭에 추가됨 | 코드 |
| `escalate` | 2번 고쳐도 문제가 남으면 그대로 제출하되 「자기 수정 실패 · 판사 확인 필요」 표시 | 코드 |

- 서기(접수 단계)는 `read → plan(사실 확인) → draft(권고)` 3단계만 한다.
- 재판연구관은 `read → tool(하급심 기록 집계) → draft(보고서)`.
- 반대신문은 상대 근거 목록을 받아 `plan(겨냥할 근거) → tool(해당 문장 원문) → draft → check → revise`.
- 한 에이전트의 모델 호출은 최대 4번 (plan 1 + draft 1 + revise 2).
- 초안이 정리 후 빈 목록이면 `escalate` 이벤트(「유효한 주장을 만들지 못함 · 판사 확인 필요」)를 남기고 agentStats의 `escalated`에 센다.
- 호출 실패·잘못된 응답도 호출 예산에 포함한다. 실행 재개는 최대 3회 시도, HTTP 호출 120초, 출력 2048토큰, 실행당 30분으로 제한한다.
- 양측 opening의 논리적 독립성과 모델 호출의 동시성은 별개다. 로컬 모델 큐는 순차 실행하고, 반대신문은 완료된 상대 opening의 제출 근거만 읽는다.
- 기사 안의 명령문은 자료로 처리하며 원문 읽기·검색·부재 대조 외의 도구 실행 권한이 없다. 이것이 모든 모델의 지시 오염 가능성을 제거했다는 뜻은 아니다.

## 이벤트

```ts
interface AgentEvent {
  seq: number                 // 작업 안에서 1부터 증가
  at: string                  // ISO 시각
  agentId: string             // bench의 에이전트 id, 코드 단계는 'checker'
  kind: 'read' | 'plan' | 'tool' | 'draft' | 'check' | 'revise' | 'submit' | 'escalate' | 'done' | 'error'
  text: string                // 화면에 그대로 띄울 한국어 한 줄 (예: "15번 문장 원문 확인", "위증 의심 1건 → 다시 작성")
  publicText: string          // 첫인상 전에 보여도 되는 중성 문구 (유형·입장·실패 건수·핵심어 수 없이 단계와 문장 번호만, 예: "6·7번 문장 살펴보기", "초안 작성", "근거 대조", "다시 작성")
  claimId: string | null      // submit·escalate일 때 공개된 주장 id
}
```

## 기록에 추가되는 값

- `TrialRecord.trace: AgentEvent[]` — 작업 전체 이벤트
- `TrialRecord.agentStats: Record<agentId, { calls: number; revisions: number; escalated: number; seconds: number }>`
- `Claim.revisions: number` (실제로 다시 쓴 횟수, 채택 여부와 무관), `Claim.escalated: boolean`

## 신뢰성 측정과의 연결

- **자기 수정률**: 처음 초안에서 걸린 근거 중 고쳐서 통과한 비율
- **에스컬레이션 수**: 끝내 못 고쳐 판사에게 넘긴 주장 수
- 둘 다 통계실과 대시보드에 보이며, "에이전트가 스스로 어디까지 고치고 언제 사람이 개입해야 하는가"의 근거가 된다.
