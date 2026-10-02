# AGENTS.md — 저장소 지도

AI 법정: 검사·변호 AI 에이전트(A.X 4.0 Light)가 근거 온톨로지로 다투고, 사람 판사가 1·2·3심에서 판결하며, 모든 개입이 신뢰도 장부에 남는다.
이 파일은 지도다. 자세한 내용은 아래 링크를 따라간다.

## 어디에 무엇이 있나

| 경로 | 내용 | 먼저 볼 것 |
|---|---|---|
| `apps/backend/` | Python. `court/` 재판 도메인, `app/` FastAPI | `apps/backend/AGENTS.md` |
| `apps/frontend/` | React 운영 콘솔 · SVG 2D 법정 | `apps/frontend/AGENTS.md` |
| `agents/` | A.X 에이전트 역할 정의(`*/SKILL.md`) · 근거 온톨로지(`ontology.yaml`) | `agents/README.md` |
| `data/` | AI-Hub 파생 데이터 (README 외 gitignore, 재배포 금지) | `data/README.md` |
| `docs/` | 설계 · 제품 명세 · 계약 · 실행 계획 · 실험 기록 · 참고 자료 | `docs/README.md` |
| `tools/` | 실행(`run.sh`) · 검증(`checks/`) · 진행 현황(`progress.json`) | `tools/README.md` |
| `.claude/` | 개발 하네스: 서브에이전트, 절차 스킬, 편집 훅 | `.claude/skills/feature-workflow` |
| `ARCHITECTURE.md` | 계층과 의존 방향 (검사기가 강제) | |

## 반드시 지킬 것
1. **계약이 코드보다 먼저**: 공용 동작은 `docs/contracts/`, 사용자 흐름은 `docs/product-specs/`를 먼저 고친다.
2. **판사는 사람만**, AI 근거는 코드로 검증, 정답은 최종 판결 전 비공개 → `docs/design-docs/core-beliefs.md`.
3. **주석**: 모듈·클래스·함수·컴포넌트 위에 한 줄, 끝은 명사 (`# 증거 인용 검증`, `// 천칭 기울기 계산`). docstring·여러 줄 주석 금지.
4. **계층**: `ARCHITECTURE.md`의 의존 방향을 거스르지 않는다.
5. **데이터**: `data/`의 AI-Hub 내용은 git·프론트 번들·에이전트 프롬프트(정답)에 넣지 않는다.

3~5는 `tools/checks/lint_harness.py`가 검사하고, Claude Code에서는 편집할 때마다 훅(`.claude/settings.json`)이 바로 알려 준다.

## 실행 · 검증

```bash
./tools/run.sh                    # 단일 서버 http://localhost:8000 (프론트 빌드 포함)
./tools/run.sh dev                # 개발: 백엔드 :8000 + Vite :5291
./tools/checks/verify.sh          # 규칙 · 테스트 · 타입 · 빌드
./tools/checks/verify.sh --ui     # + 실제 서버·A.X로 1→3심 화면 흐름 (임시 데이터 폴더)
```

기능을 끝냈다고 말하기 전에 검증을 통과시키고 `tools/progress.json`을 갱신한다. 작업 순서는 `.claude/skills/feature-workflow/SKILL.md`.
