# 하네스 규칙 점검 (주석 규칙 · 데이터 유출 · 진행 현황)
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = [ROOT / "apps" / "backend" / "court", ROOT / "apps" / "backend" / "app", ROOT / "apps" / "backend" / "tests", ROOT / "apps" / "frontend" / "src", ROOT / "tools" / "checks"]
PY_DEF = re.compile(r"^\s*(async\s+def|def|class)\s+\w+")
TS_DEF = re.compile(r"^(export\s+(default\s+)?)?(async\s+)?(function\s+\w+|const\s+[A-Za-z_]\w*\s*(:[^=]+)?=\s*(async\s*)?(\(|function|[A-Za-z_]\w*\s*=>))|^export\s+(interface|type|class)\s+\w+")
COMMENT = {".py": "#", ".ts": "//", ".tsx": "//", ".mjs": "//"}


# 바로 위 주석 줄 탐색 (데코레이터 건너뜀)
def has_comment_above(lines, i, mark):
    j = i - 1
    while j >= 0 and lines[j].strip().startswith("@"):
        j -= 1
    return j >= 0 and lines[j].strip().startswith(mark)


# 파일 하나의 주석 규칙 위반 목록
def comment_violations(path):
    mark = COMMENT[path.suffix]
    lines = path.read_text(encoding="utf-8").splitlines()
    found = []
    if lines and not lines[0].strip().startswith(mark) and not lines[0].startswith("#!"):
        found.append(f"{path}:1 첫 줄 파일 역할 주석 없음")
    for i, line in enumerate(lines):
        if path.suffix == ".py" and line.strip().startswith(('"""', "'''")):
            found.append(f"{path}:{i + 1} docstring 사용")
        pattern = PY_DEF if path.suffix == ".py" else TS_DEF
        if pattern.match(line) and not has_comment_above(lines, i, mark):
            found.append(f"{path}:{i + 1} 한 줄 주석 없음: {line.strip()[:60]}")
    return found


# 데이터 유출 위반 목록
def data_violations():
    found = []
    tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True).stdout.splitlines()
    for name in tracked:
        if name.startswith("data/") and name != "data/README.md":
            found.append(f"git에 데이터 파일 추적됨: {name}")
    for leak in list((ROOT / "apps" / "frontend").glob("public/**/*.jsonl")) + list((ROOT / "apps" / "frontend").glob("dist/**/*.jsonl")):
        found.append(f"프론트 정적 폴더에 데이터 파일: {leak}")
    return found


# 진행 현황 파일 위반 목록
def progress_violations():
    progress = json.loads((ROOT / "tools" / "progress.json").read_text(encoding="utf-8"))
    known = set(progress["statuses"])
    return [f"progress.json 알 수 없는 상태: {f['id']} {f['status']}" for p in progress["phases"] for f in p["features"] if f["status"] not in known]


# 계층 의존 규칙 (ARCHITECTURE.md): (검사 폴더, 금지 import 패턴, 설명)
LAYER_RULES = [
    ("apps/backend/court", re.compile(r"^\s*(from|import)\s+(app|fastapi|starlette|uvicorn)\b"), "도메인(court)은 HTTP 계층(app·fastapi)을 모름"),
    ("apps/frontend/src/api", re.compile(r"from ['\"]\.\./(lib|ui|features|scene2d|console|pages)"), "api는 화면 계층을 모름"),
    ("apps/frontend/src/lib", re.compile(r"from ['\"](react|react-dom|\.\./(ui|features|scene2d|console|pages))"), "lib은 React·화면 없는 순수 로직"),
    ("apps/frontend/src/scene2d", re.compile(r"from ['\"]\.\./(pages|console)"), "scene2d는 페이지·콘솔을 모름"),
    ("apps/frontend/src/features", re.compile(r"from ['\"](\.\./)+pages"), "features는 페이지를 모름"),
]
FETCH = re.compile(r"\bfetch\(")


# 계층 의존 규칙 위반 목록
def layer_violations(files):
    found = []
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        lines = path.read_text(encoding="utf-8").splitlines()
        for folder, pattern, why in LAYER_RULES:
            if rel.startswith(folder + "/"):
                found += [f"{rel}:{i + 1} 계층 규칙 위반 ({why}): {line.strip()[:60]}" for i, line in enumerate(lines) if pattern.search(line)]
        if rel.startswith("apps/frontend/src/") and not rel.startswith("apps/frontend/src/api/"):
            found += [f"{rel}:{i + 1} 서버 호출은 src/api/에서만: {line.strip()[:60]}" for i, line in enumerate(lines) if FETCH.search(line)]
    return found


# 점검 실행
def main():
    files = [p for d in SOURCES if d.exists() for p in d.rglob("*") if p.suffix in COMMENT and "node_modules" not in p.parts]
    problems = [v for f in files for v in comment_violations(f)] + layer_violations(files) + data_violations() + progress_violations()
    for p in problems:
        print(p)
    print(f"파일 {len(files)}개 점검, 위반 {len(problems)}건")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
