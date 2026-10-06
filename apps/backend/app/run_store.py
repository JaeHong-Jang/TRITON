# 실행 스냅샷 저장소
import copy
from datetime import datetime, timezone

from app import store


# 현재 시각 문자열
def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# 실행 파일 경로
def _rel(run_id: str) -> str:
    return f"runs/{run_id}.json"


# 실행 복사본
def public(run: dict) -> dict:
    return copy.deepcopy(run)


# 실행 저장
def save(run: dict) -> None:
    run.setdefault("createdAt", now())
    run["updatedAt"] = now()
    store.write_json(_rel(run["id"]), run)


# 실행 읽기
def load(run_id: str) -> dict | None:
    return store.read_json(_rel(run_id), None)


# 실행 목록
def all_runs() -> list[dict]:
    root = store.data_dir() / "runs"
    with store.LOCK:
        if not root.exists():
            return []
        return [store.read_json(f"runs/{p.name}", None) for p in sorted(root.glob("*.json")) if p.is_file()]


# 최신 실행 조회
def latest(case_id: str, instance: int) -> dict | None:
    runs = [r for r in all_runs() if r and r.get("caseId") == case_id and r.get("instance") == instance]
    return max(runs, key=lambda r: r.get("updatedAt") or r.get("createdAt") or "") if runs else None


# 미완료 실행 중단 표시
def recover_interrupted() -> list[dict]:
    changed = []
    for run in all_runs():
        if run and run.get("status") in ("queued", "running"):
            run["status"] = "interrupted"
            run["step"] = "중단됨"
            run.setdefault("events", [])
            run.setdefault("partial", None)
            save(run)
            changed.append(run)
    return changed
