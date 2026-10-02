---
name: feature-workflow
description: AI 법정에 기능을 추가·변경할 때의 순서 (계획 → 계약 → 진행 현황 → 구현 → 검증 → 기록). 여러 사람·에이전트가 병렬로 일할 때 사용.
---
# 기능 작업 순서

1. **계획**: `docs/exec-plans/active/`에 계획 파일을 만든다 (목표, 완료 기준, 나눌 일, 파일 소유).
2. **계약 먼저**: 프론트·백엔드가 같이 쓰는 것은 `docs/contracts/`(API·도메인·에이전트 루프), 사용자 흐름은 `docs/product-specs/`를 먼저 고친다. 공용 타입(`apps/frontend/src/api/types.ts`)도 이때 같이.
3. **진행 현황**: `tools/progress.json`에 기능 id를 `doing`으로 추가한다 (앱의 「구현 현황」 화면에 바로 보임).
4. **구현**: 파일 소유가 겹치지 않게 나눈다. 병렬이면 `.claude/agents/backend-implementer`·`frontend-implementer`에 계약 경로와 소유 범위를 적어 맡긴다. 편집할 때마다 훅이 주석·계층 규칙을 검사한다.
5. **리뷰**: 구현과 다른 맥락에서 `code-reviewer`(기능)·`ui-reviewer`(화면)를 돌린다. 스스로 승인하지 않는다.
6. **검증**: `verify` 스킬 (`./tools/checks/verify.sh --ui`), 스크린샷을 직접 본다.
7. **기록**: `tools/progress.json`을 `verified`로, 관찰한 것은 `docs/experiments/findings.md`(시도 → 관찰 → 판단 → 변경), 남은 빚은 `docs/exec-plans/tech-debt-tracker.md`, 품질 변화는 `docs/QUALITY_SCORE.md`. 끝난 계획은 `docs/exec-plans/completed/`로 옮긴다.
