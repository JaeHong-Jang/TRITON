# AI-Hub 낚시성 기사 라벨을 재판 사건으로 변환
import argparse
import json
import random
import re
from pathlib import Path

from court.paths import DATA_DIR

FOLDER_RE = re.compile(r"^(TL|VL)_Part([12])_(Clickbait|NonClickbait)_(Auto|Direct)_([A-Z]{2})$")
SPLIT_DIRS = {"training": "Training", "validation": "Validation"}


# 원문 이스케이프 따옴표 정리
def clean(text):
    return text.replace('\\"', '"').strip()


# 부제 정리 (원천의 문자열 "null"은 빈 부제)
def subtitle_of(src):
    text = clean(src.get("newsSubTitle") or "")
    return "" if text.lower() == "null" else text


# 라벨 파일 한 건을 공개 사건과 정답으로 분리
def convert(raw, case_id):
    src, lab = raw["sourceDataInfo"], raw["labeledDataInfo"]
    part = int(src["partNum"][1])
    if part == 1:
        title = lab["newTitle"]
        rows = src["sentenceInfo"]
        inserted = []
    else:
        title = src["newsTitle"]
        rows = lab["processSentenceInfo"]
        inserted = [s["sentenceNo"] for s in rows if s["subjectConsistencyYn"] == "N"]
    case = {
        "id": case_id,
        "category": src["newsCategory"],
        "subcategory": src["newsSubcategory"],
        "title": clean(title),
        "subtitle": subtitle_of(src),
        "sentences": [{"no": s["sentenceNo"], "text": clean(s["sentenceContent"])} for s in rows],
        "variantOf": None,
        "attack": None,
    }
    answer = {
        "id": case_id,
        "sourceId": f"{src['newsID']}-P{part}",
        "isClickbait": int(lab["clickbaitClass"]) == 0,
        "part": part,
        "method": "direct" if src["processType"] == "D" else "auto",
        "pattern": src.get("processPattern"),
        "level": src.get("processLevel"),
        "insertedSentenceNos": inserted,
        "originalTitle": clean(src["newsTitle"]),
    }
    return case, answer


# 그룹 폴더별 시드 고정 표본 추출
def sample_files(label_dir, per_folder, rng):
    picked = []
    for folder in sorted(p for p in label_dir.iterdir() if p.is_dir() and FOLDER_RE.match(p.name)):
        files = sorted(f.name for f in folder.iterdir() if f.suffix == ".json")
        picked += [folder / name for name in rng.sample(files, min(per_folder, len(files)))]
    rng.shuffle(picked)
    return picked


# 표본 전체를 사건·정답 목록으로 변환
def build(data_root, split, per_folder, seed):
    label_dir = Path(data_root) / SPLIT_DIRS[split] / "02.라벨링데이터"
    rng = random.Random(seed)
    cases, answers = [], []
    for i, path in enumerate(sample_files(label_dir, per_folder, rng), start=1):
        case, answer = convert(json.loads(path.read_text(encoding="utf-8")), f"case-{i:04d}")
        cases.append(case)
        answers.append(answer)
    return cases, answers


# JSONL 파일 저장
def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


# 사건 생성 CLI 진입점
def main():
    ap = argparse.ArgumentParser(description="AI-Hub 낚시성 기사 → cases.jsonl + answers.jsonl")
    ap.add_argument("--data-root", required=True, help="folder that contains Training/ and Validation/")
    ap.add_argument("--split", choices=SPLIT_DIRS, default="validation")
    ap.add_argument("--per-folder", type=int, default=2, help="articles sampled from each of the 42 group folders")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out-dir", default=str(DATA_DIR / "cases"), help="공개 사건 폴더")
    ap.add_argument("--answers-out", default=str(DATA_DIR / "answers" / "answers.jsonl"), help="정답 파일 (공개 금지)")
    args = ap.parse_args()

    cases, answers = build(args.data_root, args.split, args.per_folder, args.seed)
    cases_path, answers_path = Path(args.out_dir) / "cases.jsonl", Path(args.answers_out)
    write_jsonl(cases_path, cases)
    write_jsonl(answers_path, answers)
    print(f"{len(cases)} cases -> {cases_path} (answers kept apart in {answers_path})")


if __name__ == "__main__":
    main()
