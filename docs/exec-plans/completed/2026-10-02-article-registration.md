# 기사 직접 등록

## 목표와 완료 기준

제목·본문 등록 → 저장 → 새로고침 → 법정 진입. 중복 요청·빈 입력·길이 제한·정답 주입 검증. 모델 미연결과 정답 없음 명시.

## 순서와 소유

1. 리더: 계약·제품 흐름·공용 타입·진행 현황.
2. 백엔드: API·스키마·저장·요약·실험실 표본·회귀 테스트.
3. 프론트: 폼·클라이언트·모의 저장·정답 없음 표시·테스트.
4. 리더: 통합 검증·브라우저·스크린샷·독립 리뷰.

기존 실행 그래프 변경 보존. 의존성 추가·배포 없음.

## 검증 기록

- `apps/backend/.venv/bin/python -m pytest apps/backend/tests/test_api_core.py::test_manual_case_registration apps/backend/tests/test_api_core.py::test_manual_case_registration_rejects_injected_fields apps/backend/tests/test_api_core.py::test_manual_case_has_no_answer_after_final apps/backend/tests/test_api_stats_lab.py::test_lab_pool_excludes_variants` 통과.
- `apps/backend/.venv/bin/python -m pytest apps/backend/tests` 통과: 173 passed, 1 skipped, 1 warning.
- `npm run test -- registration.test.ts` 통과: 4 passed.
- `npm run test` 통과: 104 passed.
- `npm run build` 통과.
- `PATH="$PWD/.venv/bin:$PATH" bash tools/checks/verify.sh`는 등록 변경 이후 백엔드까지 통과했으나, 별도 소유 파일 `apps/frontend/src/lib/trial.test.ts`의 첫인상 단계 기대값 실패로 중단됐다.
- 브라우저 모의 검증: `/cases`에서 새 기사 등록, 성공 안내, 법정 이동, 직접 등록 모의 안내 배너 확인. 스크린샷 `/tmp/triton-registration-court.jpg`.
