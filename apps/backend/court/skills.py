# 에이전트 스킬 파일 로더
import re

import yaml

from court.paths import SKILLS_DIR

_PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")
_SECTION = re.compile(r"^<!-- section:(\w+) -->\s*$", flags=re.MULTILINE)


# 스킬 파일 파싱
def load_skill(name):
    text = (SKILLS_DIR / name / "SKILL.md").read_text(encoding="utf-8")
    _, header, body = re.split(r"^---\s*$", text, maxsplit=2, flags=re.MULTILINE)
    meta = yaml.safe_load(header)
    parts = _SECTION.split(body)
    sections = {name: text.strip() for name, text in zip(parts[1::2], parts[2::2])}
    return {"name": meta["name"], "version": str(meta["version"]), "role": meta["role"], "description": meta.get("description", ""), "prompt": parts[0].strip(), "sections": sections}


# 자리표시자 치환
def render(prompt, values):
    return _PLACEHOLDER.sub(lambda m: str(values.get(m.group(1), m.group(0))), prompt)
