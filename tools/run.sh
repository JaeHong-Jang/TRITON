#!/usr/bin/env bash
# AI 법정 서버 실행 스크립트
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-serve}"
PORT="${PORT:-8000}"

# 프론트 의존성 설치
ensure_frontend() {
  [ -d "$ROOT/apps/frontend/node_modules" ] || (cd "$ROOT/apps/frontend" && npm install)
}

case "$MODE" in
  serve)
    ensure_frontend
    (cd "$ROOT/apps/frontend" && npm run build)
    echo "AI 법정: http://localhost:$PORT"
    cd "$ROOT/apps/backend" && exec uv run uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
    ;;
  dev)
    ensure_frontend
    (cd "$ROOT/apps/backend" && uv run uvicorn app.main:app --host 127.0.0.1 --port "$PORT" --reload) &
    BACKEND_PID=$!
    trap 'kill $BACKEND_PID 2>/dev/null' EXIT
    echo "개발 서버: http://localhost:5291 (API :$PORT 프록시)"
    cd "$ROOT/apps/frontend" && npx vite --host 127.0.0.1
    ;;
  *)
    echo "사용법: ./tools/run.sh [serve|dev]"
    exit 1
    ;;
esac
