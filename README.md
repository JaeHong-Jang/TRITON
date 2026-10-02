# TRITON · AI 법정

제2회 TRAITHON 출품작. 낚시성 기사(제목-본문 불일치)를 **재판**으로 판별한다.
검사·변호 AI 에이전트(A.X 4.0 Light)가 계획 → 도구 → 초안 → 자기 검증 → 고쳐 쓰기를 거쳐 **근거 온톨로지**로 분류한 근거를 내고, 근거는 찬성(낚시성이다)·반대(낚시성 아니다) 접시에 쌓인다.
판결은 1·2·3심 모두 **사람 판사**가 내리고, 판사의 모든 개입은 **신뢰도 장부**에 남아 AI를 어디까지 믿고 맡길 수 있는지 측정하는 근거가 된다.

## 빠른 시작

```bash
./tools/run.sh          # 프론트 빌드 + 단일 서버 → http://localhost:8000
```

| 운영 콘솔 화면 | 내용 |
|---|---|
| 대시보드 | 진행 현황, AI 신뢰도 지표(서기 정확도 · 자기 수정률 · 위증률 · 사람에게 넘긴 주장), 작동 중인 작업, 최근 활동 |
| 사건 접수 | AI 서기 접수 검토로 나눈 약식 처리 / 재판 회부와 사유 |
| 법정 | 2D 법정. 「재판 시작」 한 번이면 에이전트가 실시간으로 일하고 주장이 자동 공개되어 천칭에 쌓인다 |
| 작업실 | 사무실 그림 위에서 에이전트가 방마다 일하는 모습과 에이전트별 신뢰도 |
| 규칙 · 온톨로지 | 온톨로지 그래프, 자율 범위 정책(약식 처리 기준), 스킬 버전 |
| 감사 장부 | 판결문, 사건별 근거 그래프, 에이전트 작업 기록 |
| 통계 · 비용 | 신뢰도 통계와 모델 호출 수 · 토큰 · 시간 |
| 실험실 | AI 권고·변론이 사람 판사 판단에 주는 영향(조건 A/B/C), 조작 실험 사건 |
| 구현 현황 | `tools/progress.json` |

## 저장소 구조 (하네스)

```
AGENTS.md · ARCHITECTURE.md   저장소 지도 · 계층과 의존 방향 (검사기가 강제)
apps/backend/                 court/ 재판 도메인 · app/ FastAPI
apps/frontend/                운영 콘솔 · SVG 2D 법정
agents/                       A.X 에이전트 역할(SKILL.md) · 근거 온톨로지(ontology.yaml)
data/                         AI-Hub 파생 데이터 (README 외 gitignore, 재배포 금지)
docs/                         design-docs · product-specs · contracts · exec-plans · experiments · references · QUALITY_SCORE
tools/                        run.sh · checks/(verify · 규칙 검사 · 편집 훅) · progress.json
.claude/                      개발 하네스: 서브에이전트 · 절차 스킬 · 편집 훅
```

작업 규칙(계약 먼저, 한 줄 명사형 주석, 계층, 데이터)은 [AGENTS.md](AGENTS.md), 작업 순서는 `.claude/skills/feature-workflow/SKILL.md`.

## 데이터 · 모델 준비

1. AI-Hub 「낚시성 기사 탐지 데이터」를 받아 `TRITON_DATA`에 `.../01-1.정식개방데이터` 경로를 지정한다. **저장소에 올리지 않는다.** 함정은 `docs/references/dataset.md`.
2. Ollama에 A.X 4.0 Light(`ax4-light:q4_K_M`)를 올린다. 공식 원본에서 직접 양자화한 절차와 검증은 `docs/references/a-x-model.md`.
3. 사건과 서기 접수 검토를 만든다 (`data/README.md`). 1심은 법정에서 실시간으로 생성된다.

## 검증

```bash
./tools/checks/verify.sh          # 규칙(주석 · 계층 · 데이터 유출) · 백엔드 · 프론트 · 타입 · 빌드
./tools/checks/verify.sh --ui     # + 실제 서버 · A.X로 1→3심 화면 흐름 (임시 데이터 폴더, data/ 불변)
```

실험 기록(시도 → 관찰 → 판단 → 변경)은 `docs/experiments/findings.md`.
