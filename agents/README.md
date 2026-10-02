# agents

A.X 4.0 Light 에이전트 역할 정의와 근거 온톨로지. 코드에는 프롬프트를 쓰지 않고 이 폴더를 읽는다 (`apps/backend/court/skills.py`, `ontology.py`).
(개발용 Claude Code 서브에이전트는 `.claude/agents/`로 별개다.)

| 파일 | 역할 |
|---|---|
| `ontology.yaml` | 근거 온톨로지: 주장 유형과 입장(찬성/반대), 근거 종류, 검증 상태, 조치 단계 |
| `clerk/SKILL.md` | 서기: 접수 단계 낚시성 1차 권고 |
| `prosecutor/SKILL.md` | 검사: 낚시성 근거 제시 (상대 근거 인정 가능) |
| `defense/SKILL.md` | 변호인: 정상 기사 근거 제시 (상대 근거 인정 가능) |
| `cross-examination/SKILL.md` | 반대신문: 상대 근거 하나를 겨냥한 반박 |
| `research-officer/SKILL.md` | 재판연구관: 3심 쟁점 정리, 입장 재분류 제안, 조치 단계 권고 |
| `agent-revise/SKILL.md` | 고쳐 쓰기: 증거 검증관이 걸러 낸 근거를 원문과 함께 돌려받아 다시 작성 |

`SKILL.md` 형식: YAML 머리말(`name`, `version`, `role`, `description`) + 본문(시스템 프롬프트). 본문의 `{{claim_types}}` 같은 자리표시자는 온톨로지에서 채운다.
프롬프트를 고치면 `version`을 올린다. 재판 기록에 스킬 버전이 남아 어떤 프롬프트로 만든 변론인지 추적할 수 있다.

각 역할 파일의 `<!-- section:plan -->` 부분은 작업 루프의 계획 단계 프롬프트다 (`docs/contracts/agent-loop.md`).
