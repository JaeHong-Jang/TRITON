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
- 모델: A.X 4.0 Light 필수. 로컬은 Ollama 양자화본, 공식 수치는 원본 가중치로 다시 잰다 (`docs/references/a-x-model.md`).
