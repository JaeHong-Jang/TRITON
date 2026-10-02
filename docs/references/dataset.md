# AI-Hub 「낚시성 기사 탐지 데이터」 함정

원천은 저장소 밖 (`TRITON_DATA`). 변환 코드: `apps/backend/court/cases.py`.

| 함정 | 내용 | 대응 |
|---|---|---|
| 라벨 값 | `clickbaitClass` **0 = 낚시성**, 1 = 비낚시성 | 정답 파일의 `isClickbait`로 변환 |
| Part1 (제목 바꿔치기) | 보여줄 제목은 `labeledDataInfo.newTitle`, 본문은 원본 | 원래 제목은 정답 파일에만 |
| Part2 (무관한 문장 삽입) | 보여줄 본문은 `labeledDataInfo.processSentenceInfo`, 삽입 문장은 `subjectConsistencyYn = N` | 삽입 문장 번호는 정답 파일에만 |
| 위치 지름길 | 표본 210건에서 삽입 문장이 **전부 본문 끝** (Direct는 원문 뒤에 덧붙임, Auto는 끝부분 교체) | 레드팀 `move_inserted`로 가운데로 옮겨 시험 |
| 정답 누설 메타데이터 | `processPattern` 00 = 정상, 99 = 자동 생성 낚시 / `processType`, `processLevel`, `partNum`, `newsID` | 전부 정답 파일로, 공개 사건에는 id·분야·제목·부제·문장만 |
| 난이도 편중 | 낚시 기사의 약 73%가 Auto(난이도 '하'), 제목이 본문과 완전히 무관한 경우가 많음 | 유형·난이도·분야별로 나눠 보고 |
| 정의 차이 | "~이유는?" 같은 호기심형 제목도 비낚시로 라벨 (Webis는 클릭베이트로 봄) | 우리 서비스의 낚시성 정의 = 온톨로지 (`docs/design-docs/ontology.md`) |
| 부제 "null" | 일부 부제가 문자열 `"null"` | 빈 부제로 정리 |
| 이스케이프 | 본문 따옴표가 `\"`로 저장 | `"`로 정리 |

Validation 규모: Part1 낚시 Auto 13,253 · Direct 5,012 · 정상 18,169, Part2도 비슷. 현재 표본: 42건 = 6그룹(파트 × 낚시/정상 × Auto/Direct) × 7건, 7개 분야 균등.
