#!/usr/bin/env bash
# 전체 검증 스크립트
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# 단계 제목 출력
step() { printf '\n== %s\n' "$1"; }

step "하네스 규칙 (주석 · 데이터 유출 · 진행 현황)"
python3 tools/checks/lint_harness.py

step "백엔드 테스트"
(cd apps/backend && uv run pytest -q)

step "프론트 단위 테스트"
(cd apps/frontend && npx vitest run)

step "프론트 타입 · 빌드"
(cd apps/frontend && npx tsc --noEmit -p . && npx vite build)

if [ "${1:-}" = "--ui" ]; then
  step "화면 흐름 (실제 서버 + 브라우저, 임시 데이터 폴더)"
  # 검증 기록이 실제 data/에 섞이지 않도록 사건·정답·접수 검토만 복사한 임시 폴더 사용
  UI_DATA="$(mktemp -d)"
  mkdir -p "$UI_DATA/cases" "$UI_DATA/answers" "$UI_DATA/intake"
  python3 - "$UI_DATA" <<'PY'
import json, shutil, sys
from pathlib import Path
dst = Path(sys.argv[1])
for name in ("cases/cases.jsonl", "answers/answers.jsonl"):
    rows = [json.loads(l) for l in open(f"data/{name}", encoding="utf-8")]
    keep = [r for r in rows if not r["id"].endswith(("-mv", "-inj"))]
    (dst / name).write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in keep), encoding="utf-8")
for f in Path("data/intake").glob("*.json"):
    if not f.stem.endswith(("-mv", "-inj")):
        shutil.copy(f, dst / "intake" / f.name)
PY
  echo "임시 데이터: $UI_DATA"
  (cd apps/backend && TRITON_DATA_DIR="$UI_DATA" uv run uvicorn app.main:app --host 127.0.0.1 --port 8000) &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null' EXIT
  until curl -s http://127.0.0.1:8000/api/health >/dev/null; do sleep 1; done
  # 실제 A.X 생성 대기 시간과 레드팀·모바일 확인용 사건
  (cd apps/frontend && URL=http://127.0.0.1:8000 JOB_TIMEOUT=300000 VARIANT_CASE="${VARIANT_CASE:-case-0002}" MOBILE_CASE="${MOBILE_CASE:-case-0003}" node scripts/shot.mjs)
fi

printf '\n전체 검증 통과\n'
