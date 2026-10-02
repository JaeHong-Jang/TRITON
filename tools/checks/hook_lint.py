# 편집 직후 규칙 검사 훅 (Claude Code PostToolUse)
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lint_harness as lint  # noqa: E402


# 훅 입력에서 편집된 파일 경로 추출
def edited_path(payload):
    tool_input = payload.get("tool_input") or {}
    tool_response = payload.get("tool_response") or {}
    raw = tool_input.get("file_path") or tool_response.get("filePath")
    return Path(raw).resolve() if raw else None


# 검사 대상 여부 판단
def in_scope(path):
    return path.suffix in lint.COMMENT and "node_modules" not in path.parts and any(path.is_relative_to(d.resolve()) for d in lint.SOURCES)


# 훅 실행
def main():
    path = edited_path(json.load(sys.stdin))
    if path is None or not path.exists() or not in_scope(path):
        return 0
    problems = lint.comment_violations(path) + lint.layer_violations([path])
    if problems:
        print("하네스 규칙 위반 (AGENTS.md · ARCHITECTURE.md):", file=sys.stderr)
        for p in problems:
            print(f"- {p}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
