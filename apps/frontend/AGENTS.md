# apps/frontend — 지도

React 19 · Vite 8 · TypeScript · Tailwind 4 · react-router 7 · zustand. 계약: `docs/contracts/api.md`, 흐름: `docs/product-specs/{court-flow,console}.md`, 법정 그림: `docs/design-docs/court-2d.md`.

## 계층 (ARCHITECTURE.md, 검사기가 강제)
| 폴더 | 역할 |
|---|---|
| `src/api/` | `client.ts` 서버 호출, `types.ts` 계약 타입, `mock/` 가상 데이터 모의 서버(`VITE_MOCK=1`) |
| `src/lib/` | 순수 로직: `scale` 천칭 무게 · `trial` 재판 상태 머신 · `ledger` 장부 항목 · `reveal` 자동 공개 · `activity` 에이전트 활동 문구 (첫인상 전 중립화) · `controlGraph` 공개 범위별 그래프 · `controlSnapshot` 사건/심급 일치 검증 |
| `src/ui/` | 공용 작은 컴포넌트·서식 |
| `src/scene2d/` | 석조 법정·3D 렌더 저지맨 레이어 모션·공개 근거 선택 (이전 SVG 구성 보존) |
| `src/features/court/` | 법정 패널·상태 저장소(`store.ts`, 작업 폴링·자동 공개) |
| `src/features/execution/` | 사건 실행 단계·역할별 노드·이벤트·재시도/취소, 공개 범위는 서버 응답을 따름 |
| `src/features/ontology/` | 온톨로지 그래프 · 사건 근거 그래프 · 정책 카드 |
| `src/features/control/` | 사건 실행 제어·절차·근거/온톨로지 탐색·상세·검증·로그 관제 |
| `src/console/` | 운영 콘솔 셸(왼쪽 메뉴·위 막대) |
| `src/pages/` | 대시보드 · 사건 접수 · 법정 · 작업실 · 규칙 · 감사 장부 · 통계 · 실험실 · 구현 현황 |

## 명령
```bash
npm run dev            # :5291 (/api → :8000 프록시)
VITE_MOCK=1 npm run dev  # 백엔드 없이 모의 서버
npx vitest run && npx tsc --noEmit -p . && npx vite build
URL=http://127.0.0.1:5291 SHOTS_DIR=/tmp/shots node scripts/shot.mjs   # 화면 흐름 스크린샷
```
제품 책임자가 정한 것: 2026-10-03 요청으로 법정은 캐릭터 한 명만 표시 (종전 신문 피고 유지 요구 대체), 「구현 현황」 메뉴 유지, 법정 위에는 경로 없이 기사 제목만.
