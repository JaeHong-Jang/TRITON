---
name: verify
description: AI 법정 전체 검증 실행과 결과 해석. 기능을 끝냈다고 말하기 전, 커밋 전, 리뷰 전에 사용.
---
# 전체 검증

```bash
./tools/checks/verify.sh          # 규칙(주석·계층·데이터 유출·진행 현황) · 백엔드 · 프론트 · 타입 · 빌드
./tools/checks/verify.sh --ui     # 위 + 실제 서버와 실제 A.X로 1심→3심 화면 흐름 (수 분, GPU 필요)
```

- `--ui`는 `data/`를 건드리지 않는다. 사건·정답·접수 검토만 복사한 임시 폴더를 `TRITON_DATA_DIR`로 지정해 돌린다.
- 스크린샷은 `apps/frontend/test-results/shots/`. **반드시 직접 열어 본다** — 콘솔 오류 0이어도 겹침·잘림은 그림으로만 보인다.
- Ollama(`ax4-light:q4_K_M`)가 꺼져 있으면 `--ui`의 2·3심 생성이 실패한다. `curl $GATEWAY:11434/api/tags`로 먼저 확인.

## 실패할 때
| 단계 | 흔한 원인 |
|---|---|
| 하네스 규칙 | 주석 누락(한 줄, 명사로 끝), 계층 위반(ARCHITECTURE.md), `data/` 파일이 git에 추적됨 |
| 백엔드 테스트 | 계약 변경 후 테스트 미갱신 |
| 프론트 타입 | `src/api/types.ts`와 계약 불일치 |
| 화면 흐름 | 버튼 문구 변경으로 `apps/frontend/scripts/shot.mjs` 선택자 불일치 |

통과하면 `tools/progress.json`의 해당 기능 상태를 `verified`로 바꾼다.
