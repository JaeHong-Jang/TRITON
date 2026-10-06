# data

AI-Hub 「낚시성 기사 탐지 데이터」에서 만든 파일. 이 README 외에는 전부 gitignore이며 재배포 금지.

| 경로 | 내용 | 공개 |
|---|---|---|
| `cases/cases.jsonl` | 공개 사건 (제목·부제·본문 문장) | API로 공개 |
| `cases/manual.jsonl` | 사용자가 직접 등록한 기사 · 요청 중복 방지 정보 | 공개 기사만 API로 공개, 정답 없음 |
| `answers/answers.jsonl` | 정답·데이터셋 메타데이터 | 최종 판결 후에만 |
| `intake/<caseId>.json` | 서기 접수 검토 (권고 + 작업 기록) | API로 공개 |
| `trials/<caseId>/<심급>.json` | 재판 기록 (변론, 근거 검증 결과, 에이전트 작업 기록 trace) | API로 공개 |
| `ledger/ledger.jsonl` | 신뢰도 장부 (판사 행동) | API로 공개 |
| `lab/sessions.json` | 실험실 세션 | API로 공개 |
| `policy.json` | 자율 범위 정책 (없으면 기본값) | API로 공개 |
| `legacy/` | 이전 방식의 1심 기록 (참고용) | 사용 안 함 |

다시 만들기:

```bash
cd apps/backend
uv run python -m court.cases --data-root "$TRITON_DATA" --per-folder 1    # 42건
# 서기 접수 검토: 서버에서 POST /api/intake (대시보드 「서기 접수 검토 시작」)
# 1심은 법정에서 「재판 시작」을 누르면 실시간 생성 (미리 만들려면: uv run python -m court.instances --instance 1 --case <id>)
```
