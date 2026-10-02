# 데이터 폴더 파일 입출력
import importlib
import json
import os
import threading
from pathlib import Path

from court import paths

PUBLIC_CASE_KEYS = ("id", "category", "subcategory", "title", "subtitle", "sentences", "variantOf", "attack")
PUBLIC_ANSWER_KEYS = ("id", "isClickbait", "part", "method", "pattern", "level", "insertedSentenceNos", "originalTitle")

LOCK = threading.RLock()


# 재판 도메인 모듈 지연 로딩
def court(name: str):
    return importlib.import_module(f"court.{name}")


# 데이터 폴더 경로 조회
def data_dir() -> Path:
    return Path(paths.DATA_DIR)


# 줄 단위 JSON 파일 읽기
def read_jsonl(rel: str) -> list[dict]:
    path = data_dir() / rel
    with LOCK:
        if not path.exists():
            return []
        lines = path.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


# 줄 단위 JSON 파일 덧붙이기
def append_jsonl(rel: str, obj: dict) -> None:
    path = data_dir() / rel
    with LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")


# JSON 파일 읽기
def read_json(rel: str, default):
    path = data_dir() / rel
    with LOCK:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))


# JSON 파일 원자적 쓰기
def write_json(rel: str, obj) -> None:
    path = data_dir() / rel
    with LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, path)


# 공개 사건 필드 선별
def public_case(case: dict) -> dict:
    out = {k: case.get(k) for k in PUBLIC_CASE_KEYS}
    out["subtitle"] = out["subtitle"] or ""
    return out


# 공개 정답 필드 선별
def public_answer(answer: dict) -> dict:
    return {k: answer.get(k) for k in PUBLIC_ANSWER_KEYS}


# 사건 전체 읽기
def load_cases() -> list[dict]:
    return read_jsonl("cases/cases.jsonl")


# 사건 하나 읽기
def get_case(case_id: str) -> dict | None:
    return next((c for c in load_cases() if c["id"] == case_id), None)


# 정답 사전 읽기
def load_answers() -> dict[str, dict]:
    return {a["id"]: a for a in read_jsonl("answers/answers.jsonl")}


# 재판 기록 읽기
def load_trial(case_id: str, n: int) -> dict | None:
    return read_json(f"trials/{case_id}/{n}.json", None)


# 사건의 재판 기록 목록 읽기
def load_trials(case_id: str) -> list[dict]:
    found = (load_trial(case_id, n) for n in (1, 2, 3))
    return [t for t in found if t]


# 재판 기록 저장
def save_trial(case_id: str, n: int, record: dict) -> None:
    write_json(f"trials/{case_id}/{n}.json", record)


# 장부 읽기
def load_ledger(case_id: str | None = None) -> list[dict]:
    entries = read_jsonl("ledger/ledger.jsonl")
    return [e for e in entries if case_id is None or e["caseId"] == case_id]


# 실험실 세션 목록 읽기
def load_sessions() -> list[dict]:
    return read_json("lab/sessions.json", [])


# 자율 범위 정책 읽기 (없으면 기본값)
def load_policy() -> dict:
    return {**court("docket").DEFAULT_POLICY, **read_json("policy.json", {})}


# 접수 결과 읽기
def load_intake(case_id: str) -> dict | None:
    return read_json(f"intake/{case_id}.json", None)


# 사건 접수 권고 읽기 (접수 결과가 우선, 옛 1심 기록은 대체)
def load_screening(case_id: str) -> dict | None:
    intake = load_intake(case_id)
    if intake:
        return intake["screening"]
    first = load_trial(case_id, 1)
    return first.get("screening") if first else None
