# docs — 문서 지도

| 폴더·파일 | 무엇 | 언제 읽나 |
|---|---|---|
| `design-docs/` | 핵심 원칙, 온톨로지 설계, 2D 법정 그림 규칙 | 설계를 바꾸기 전 |
| `product-specs/` | 사용자 흐름: 재판 절차(1·2·3심, 판사 단계), 운영 콘솔 화면 | 화면·흐름을 만들 때 |
| `contracts/` | 프론트↔백엔드 API, 백엔드 내부(도메인), 에이전트 작업 루프 | 코드를 고치기 전 (계약 먼저) |
| `exec-plans/` | `active/` 진행 중 계획, `completed/` 끝난 계획, `tech-debt-tracker.md` 남은 빚 | 작업을 시작·마칠 때 |
| `experiments/findings.md` | 시도 → 관찰 → 판단 → 변경 기록 (대회 산출물 근거) | 실험 뒤 |
| `references/` | A.X 모델 빌드, AI-Hub 데이터셋 함정, 대회 규칙 요약 | 데이터·모델을 다룰 때 |
| `QUALITY_SCORE.md` | 영역별 품질 점수와 근거 | 우선순위를 정할 때 |

실행 그래프: [설계](design-docs/execution-graph.md) · [공용 계약](contracts/execution.md). 실행 순서와 재개는 실행 그래프, 주장·인용·반박 관계는 기존 근거 그래프에서 다룬다.

기사 직접 등록: [공용 계약](contracts/registration.md). 데이터셋 없이 제목·본문을 저장하고 법정에서 검토한다.

미래도시 화면: [시각 계약](design-docs/future-city-console.md). 흰 로봇·도시형 작업실·유리 법정의 사용자 흐름과 공개 조건을 정의한다.
