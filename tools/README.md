# tools

| 파일 | 역할 |
|---|---|
| `run.sh` | 단일 서버 실행 (`serve`: 프론트 빌드 + :8000, `dev`: 백엔드 :8000 + Vite :5291) |
| `checks/verify.sh` | 전체 검증 (`--ui`면 임시 데이터 폴더로 실제 서버·A.X 화면 흐름까지) |
| `checks/lint_harness.py` | 하네스 규칙 검사: 한 줄 명사형 주석, 계층 의존, 데이터 유출, 진행 현황 |
| `checks/hook_lint.py` | Claude Code 편집 훅: 방금 고친 파일만 검사, 위반이면 exit 2로 알림 |
| `progress.json` | 기능별 진행 현황 (앱 「구현 현황」 화면과 `/api/progress`가 읽음) |
