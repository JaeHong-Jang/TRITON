---
name: data-pipeline
description: AI-Hub 원천에서 사건·정답·서기 접수 검토·재판 기록을 다시 만들 때 사용. 데이터 재배포 금지 규칙 포함.
---
# 데이터 파이프라인

원천 위치: 환경변수 `TRITON_DATA` = `.../146.낚시성 기사 탐지 데이터/01-1.정식개방데이터` (저장소 밖).

```bash
cd apps/backend
uv run python -m court.cases --data-root "$TRITON_DATA" --per-folder 1 --seed 7   # 42건 (6그룹 × 7)
# 서기 접수 검토: 서버를 띄운 뒤 POST /api/intake  (또는 대시보드 「서기 접수 검토 시작」)
uv run python -m court.instances --instance 1 --case case-0001                      # 1심 하나 미리 생성 (보통은 법정에서 실시간)
```

## 지켜야 할 것
- `data/` 아래는 `README.md`만 git에 들어간다. 정답(`data/answers`)은 에이전트 프롬프트·공개 API에 넣지 않는다.
- 데이터셋 함정 (`docs/references/dataset.md`): `clickbaitClass` 0 = 낚시성, Part1 낚시 제목은 `labeledDataInfo.newTitle`, Part2 본문은 `processSentenceInfo`, `processPattern`은 정답을 드러내므로 정답 파일로만.
- 실험·검증용 실행은 `TRITON_DATA_DIR=<임시 폴더>`로 실제 `data/`와 분리한다.
- 사건 CLI 재실행은 대상 `cases.jsonl`·`answers.jsonl`의 기존 ID가 바뀌거나 사라지면 거부한다 (변형 행 포함). 두 파일을 먼저 검사하며 거부 시 아무 파일도 쓰지 않고, 영향받는 ID를 최대 5개와 새 데이터 폴더 안내를 표시한다. 동일한 재생성은 허용한다. 다른 표본은 `TRITON_DATA_DIR=<새 폴더>`를 사용하거나 `--out-dir <새 사건 폴더>`와 `--answers-out <새 정답 파일>`을 함께 지정한다.
- 모델: A.X 4.0 Light 필수. 로컬은 Ollama 양자화본, 공식 수치는 원본 가중치로 다시 잰다 (`docs/references/a-x-model.md`).
