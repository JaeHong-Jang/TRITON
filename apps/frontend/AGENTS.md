# apps/frontend — 지도

React 19 · Vite 8 · TypeScript · Tailwind 4 · react-router 7 · zustand. 계약: `docs/contracts/api.md`, 흐름: `docs/product-specs/{court-flow,console}.md`, 법정 그림: `docs/design-docs/court-2d.md`.

## 계층 (ARCHITECTURE.md, 검사기가 강제)
| 폴더 | 역할 |
|---|---|
| `src/api/` | `client.ts` 서버 호출, `types.ts` 계약 타입, `mock/` 가상 데이터 모의 서버(`VITE_MOCK=1`) |
| `src/lib/` | 순수 로직: `scale` 천칭 무게 · `trial` 재판 상태 머신 · `ledger` 장부 항목 · `reveal` 자동 공개 · `activity` 에이전트 활동 문구 (첫인상 전 중립화) |
| `src/ui/` | 공용 작은 컴포넌트·서식 |
| `src/scene2d/` | SVG 2D 법정: 무대·판사·사람 캐릭터(AI 배지)·신문 피고·천칭 |
| `src/features/court/` | 법정 패널·상태 저장소(`store.ts`, 작업 폴링·자동 공개) |
| `src/features/ontology/` | 온톨로지 그래프 · 사건 근거 그래프 · 정책 카드 |
| `src/console/` | 운영 콘솔 셸(왼쪽 메뉴·위 막대), 작업실 사무실 그림(`office/`) |
| `src/pages/` | 대시보드 · 사건 접수 · 법정 · 작업실 · 규칙 · 감사 장부 · 통계 · 실험실 · 구현 현황 |

## 명령
```bash
npm run dev            # :5291 (/api → :8000 프록시)
VITE_MOCK=1 npm run dev  # 백엔드 없이 모의 서버
npx vitest run && npx tsc --noEmit -p . && npx vite build
URL=http://127.0.0.1:5291 SHOTS_DIR=/tmp/shots node scripts/shot.mjs   # 화면 흐름 스크린샷
```
제품 책임자가 정한 것: 신문 피고(눈·팔·다리) 유지, 「구현 현황」 메뉴 유지, 법정 위에는 경로 없이 기사 제목만.
