# 근거 온톨로지 로더
from functools import lru_cache

import yaml

from court.paths import SKILLS_DIR

OPPOSITE = {"pro": "con", "con": "pro"}


# 온톨로지 파싱 결과 캐시 조회
@lru_cache(maxsize=1)
def load():
    return yaml.safe_load((SKILLS_DIR / "ontology.yaml").read_text(encoding="utf-8"))


# 주장 유형 정의 조회
def claim_type(type_id):
    return next((t for t in load()["claim_types"] if t["id"] == type_id), None)


# 유형별 입장 결정 (반박은 대상 근거의 반대)
def stance_of(type_id, rebuts_stance=None):
    found = claim_type(type_id)
    if found is None:
        raise ValueError(f"알 수 없는 주장 유형: {type_id}")
    if found["stance"] != "derived":
        return found["stance"]
    if rebuts_stance not in OPPOSITE:
        raise ValueError("반박은 대상 근거의 입장이 필요합니다")
    return OPPOSITE[rebuts_stance]


# 반박 제외 주장 유형 id 목록
def selectable_types(stance=None):
    return [t["id"] for t in load()["claim_types"] if t["stance"] != "derived" and stance in (None, t["stance"])]


# 프롬프트용 주장 유형 목록 문장화
def render_catalogue(stance=None):
    stances = load()["stances"]
    lines = []
    for t in load()["claim_types"]:
        if t["stance"] == "derived" or stance not in (None, t["stance"]):
            continue
        signals = " / ".join(t["signals"])
        lines.append(f"- {t['id']} ({t['label']}, 입장 {stances[t['stance']]['label']}): {t['definition']} [신호: {signals}]")
    return "\n".join(lines)
