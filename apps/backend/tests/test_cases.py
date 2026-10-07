# 사건 변환 테스트
import json
import os
import random
import sys
from pathlib import Path

import pytest

from court import cases as cases_cli
from court.cases import build, clean, convert, sample_files


# 가짜 AI-Hub 라벨 파일 생성
def label_file(part, clickbait_class, *, new_title="바뀐 제목", process_rows=None, process_type="A", pattern="99"):
    source = {
        "newsID": "EC_M02_000001",
        "newsCategory": "경제",
        "newsSubcategory": "은행",
        "newsTitle": "원래 제목",
        "newsSubTitle": "",
        "partNum": f"P{part}",
        "processType": process_type,
        "processPattern": pattern,
        "processLevel": "하",
        "sentenceInfo": [
            {"sentenceNo": 1, "sentenceContent": '그는 \\"좋다\\"고 말했다.'},
            {"sentenceNo": 2, "sentenceContent": "두 번째 문장."},
        ],
    }
    if part == 1:
        labeled = {"newTitle": new_title, "clickbaitClass": clickbait_class, "referSentenceInfo": []}
    else:
        labeled = {"clickbaitClass": clickbait_class, "processSentenceInfo": process_rows}
    return {"sourceDataInfo": source, "labeledDataInfo": labeled}


# Part1 낚시 기사 제목 교체 확인
def test_part1_clickbait_shows_swapped_title_over_original_body():
    case, answer = convert(label_file(1, 0), "case-0001")
    assert case["title"] == "바뀐 제목"
    assert [s["no"] for s in case["sentences"]] == [1, 2]
    assert answer["isClickbait"] is True
    assert answer["originalTitle"] == "원래 제목"
    assert answer["insertedSentenceNos"] == []


# 라벨 1의 정상 기사 해석 확인
def test_class_1_means_not_clickbait():
    _, answer = convert(label_file(1, 1, new_title="원래 제목", pattern="00"), "case-0001")
    assert answer["isClickbait"] is False


# Part2 삽입 문장 본문·정답 반영 확인
def test_part2_body_comes_from_processed_sentences_and_marks_inserted_ones():
    rows = [
        {"sentenceNo": 1, "sentenceContent": "본문 문장.", "subjectConsistencyYn": "Y"},
        {"sentenceNo": 2, "sentenceContent": "끼워 넣은 문장.", "subjectConsistencyYn": "N"},
        {"sentenceNo": 3, "sentenceContent": "또 끼워 넣은 문장.", "subjectConsistencyYn": "N"},
    ]
    case, answer = convert(label_file(2, 0, process_rows=rows, process_type="D", pattern="23"), "case-0001")
    assert case["title"] == "원래 제목"
    assert [s["text"] for s in case["sentences"]] == ["본문 문장.", "끼워 넣은 문장.", "또 끼워 넣은 문장."]
    assert answer["insertedSentenceNos"] == [2, 3]
    assert answer["method"] == "direct"


# 이스케이프된 따옴표 정리 확인
def test_escaped_quotes_are_cleaned():
    assert clean('그는 \\"좋다\\"고 말했다. ') == '그는 "좋다"고 말했다.'
    case, _ = convert(label_file(1, 0), "case-0001")
    assert case["sentences"][0]["text"] == '그는 "좋다"고 말했다.'


# 공개 사건의 정답 비노출 확인
def test_public_case_carries_nothing_that_reveals_the_label():
    case, _ = convert(label_file(1, 0), "case-0001")
    assert set(case) == {"id", "category", "subcategory", "title", "subtitle", "sentences", "variantOf", "attack"}
    assert "EC_M02" not in json.dumps(case)


# 가짜 데이터셋 폴더 생성
def fake_dataset(root):
    label_dir = root / "Validation" / "02.라벨링데이터"
    for name in ["VL_Part1_Clickbait_Auto_EC", "VL_Part1_NonClickbait_Auto_EC"]:
        folder = label_dir / name
        folder.mkdir(parents=True)
        cls = 0 if "_Clickbait_" in name else 1
        for i in range(5):
            (folder / f"EC_{i}_L.json").write_text(json.dumps(label_file(1, cls)), encoding="utf-8")
    (label_dir / "not_a_group").mkdir()
    return label_dir


# 폴더별 표집과 시드 고정 확인
def test_sampling_takes_per_folder_and_is_seed_stable(tmp_path):
    label_dir = fake_dataset(tmp_path)
    first = sample_files(label_dir, 2, random.Random(3))
    assert len(first) == 4
    assert first == sample_files(label_dir, 2, random.Random(3))


# 사건 번호와 정답 정렬 확인
def test_build_numbers_cases_and_keeps_answers_aligned(tmp_path):
    fake_dataset(tmp_path)
    cases, answers = build(tmp_path, "validation", 2, seed=1)
    assert [c["id"] for c in cases] == ["case-0001", "case-0002", "case-0003", "case-0004"]
    assert [a["id"] for a in answers] == [c["id"] for c in cases]
    assert sorted(a["isClickbait"] for a in answers) == [False, False, True, True]


# 합성 사건·정답과 재생성 CLI 설정
@pytest.fixture
def regeneration(tmp_path, monkeypatch):
    case, answer = convert(label_file(1, 0), "case-0001")
    cases, answers = [case], [answer]
    cases_path = tmp_path / "cases" / "cases.jsonl"
    answers_path = tmp_path / "answers" / "answers.jsonl"
    cases_cli.write_jsonl(cases_path, cases)
    cases_cli.write_jsonl(answers_path, answers)
    monkeypatch.setattr(cases_cli, "build", lambda *args: (cases, answers))
    monkeypatch.setattr(sys, "argv", ["court.cases", "--data-root", "unused", "--out-dir", str(cases_path.parent),
                                     "--answers-out", str(answers_path)])
    return (cases_path, answers_path), cases, answers


# 기존 사건·정답 변경 거부와 두 파일 보존 확인
@pytest.mark.parametrize("target", ["cases", "answers"])
def test_regeneration_refuses_changed_rows_without_writing(regeneration, target):
    paths, cases, answers = regeneration
    before = [path.read_bytes() for path in paths]
    if target == "cases":
        cases[0]["title"] = "다른 합성 기사"
    else:
        answers[0]["sourceId"] = "다른 합성 원문 ID"
    cases.append({**cases[0], "id": "case-0002"})
    answers.append({**answers[0], "id": "case-0002"})
    with pytest.raises(SystemExit) as exc:
        cases_cli.main()
    assert exc.value.code != 0
    assert "case-0001" in str(exc.value)
    assert "새 데이터 폴더" in str(exc.value)
    assert [path.read_bytes() for path in paths] == before


# 기존 변형 사건·정답 삭제 거부 확인
@pytest.mark.parametrize("target", ["cases", "answers"])
@pytest.mark.parametrize("suffix", ["mv", "inj"])
def test_regeneration_refuses_dropped_variant(regeneration, target, suffix):
    paths, cases, answers = regeneration
    path, rows = (paths[0], cases) if target == "cases" else (paths[1], answers)
    variant_id = f"case-0001-{suffix}"
    cases_cli.write_jsonl(path, [*rows, {**rows[0], "id": variant_id}])
    before = [path.read_bytes() for path in paths]
    with pytest.raises(SystemExit, match=variant_id):
        cases_cli.main()
    assert [path.read_bytes() for path in paths] == before


# 동일한 행의 재생성 허용 확인
def test_regeneration_allows_identical_rows(regeneration):
    paths, cases, answers = regeneration
    for path, rows in zip(paths, (cases, answers)):
        path.write_text(json.dumps(dict(reversed(list(rows[0].items())))) + "\n", encoding="utf-8")
    cases_cli.main()
    assert [json.loads(paths[0].read_text(encoding="utf-8"))] == cases
    assert [json.loads(paths[1].read_text(encoding="utf-8"))] == answers


# 빈 대상과 없는 대상의 사건 생성 허용 확인
@pytest.mark.parametrize("existing", ["empty", "missing"])
def test_regeneration_allows_empty_or_missing_targets(regeneration, existing):
    paths, cases, answers = regeneration
    for path in paths:
        if existing == "empty":
            path.write_text("", encoding="utf-8")
        else:
            path.unlink()
    cases_cli.main()
    assert [json.loads(paths[0].read_text(encoding="utf-8"))] == cases
    assert [json.loads(paths[1].read_text(encoding="utf-8"))] == answers


# 재생성 거부 메시지의 영향 ID 수 제한 확인
def test_regeneration_reports_at_most_five_affected_ids(regeneration):
    paths, _, _ = regeneration
    cases_cli.write_jsonl(paths[0], [{"id": f"case-{i:04d}"} for i in range(1, 7)])
    before = [path.read_bytes() for path in paths]
    with pytest.raises(SystemExit) as exc:
        cases_cli.main()
    for i in range(1, 6):
        assert f"case-{i:04d}" in str(exc.value)
    assert "case-0006" not in str(exc.value)
    assert [path.read_bytes() for path in paths] == before


# 실제 Validation 표본 변환 확인
@pytest.mark.skipif(not os.environ.get("TRITON_DATA"), reason="set TRITON_DATA to the AI-Hub data root")
def test_real_validation_sample():
    cases, answers = build(os.environ["TRITON_DATA"], "validation", 1, seed=7)
    assert len(cases) == 42
    for case, answer in zip(cases, answers):
        assert case["title"] and case["sentences"]
        assert all('\\"' not in s["text"] for s in case["sentences"])
        if answer["part"] == 2 and answer["isClickbait"]:
            assert answer["insertedSentenceNos"], answer["sourceId"]


# 문자열 "null" 부제의 빈 부제 처리
def test_null_subtitle_becomes_empty():
    raw = label_file(1, 0)
    raw["sourceDataInfo"]["newsSubTitle"] = "null"
    case, _ = convert(raw, "case-0001")
    assert case["subtitle"] == ""
