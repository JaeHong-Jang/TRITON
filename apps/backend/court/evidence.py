# 증거 검증관 (LLM 없이 원문 대조)
import re
from difflib import SequenceMatcher

QUOTE_COVERAGE = 0.8
_QUOTES = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'", "`": "'"})


# 공백·따옴표 정규화
def normalize(text):
    return re.sub(r"\s+", " ", text.translate(_QUOTES)).strip()


# 인용이 문장 안에서 이어진 비율 계산
def coverage(quote, sentence):
    q, s = normalize(quote), normalize(sentence)
    if not q:
        return 0.0
    if q in s:
        return 1.0
    match = SequenceMatcher(None, q, s, autojunk=False).find_longest_match(0, len(q), 0, len(s))
    return match.size / len(q)


# 본문 인용 검증
def check_quote(sentence_no, quote, case):
    sentences = case["sentences"]
    by_no = {s["no"]: s["text"] for s in sentences}
    if sentence_no in by_no and coverage(quote, by_no[sentence_no]) >= QUOTE_COVERAGE:
        return {"status": "verified", "foundIn": sentence_no}
    for s in sentences:
        if coverage(quote, s["text"]) >= QUOTE_COVERAGE:
            return {"status": "misnumbered", "foundIn": s["no"]}
    if any(coverage(quote, head) >= QUOTE_COVERAGE for head in (case["title"], case["subtitle"]) if head):
        return {"status": "title", "foundIn": None}
    return {"status": "fabricated", "foundIn": None}


# 핵심어 포함 여부 (공백 제거 비교 포함)
def _contains(text, keyword):
    t, k = normalize(text), normalize(keyword)
    return k in t or k.replace(" ", "") in t.replace(" ", "")


# 핵심어가 들어 있는 본문 문장 번호 목록
def find_sentences(keyword, case):
    return [s["no"] for s in case["sentences"] if normalize(keyword) and _contains(s["text"], keyword)]


# 핵심어 부재 검증
def check_absence(keyword, case):
    if not normalize(keyword):
        return {"status": "fabricated", "foundIn": None}
    if any(_contains(s["text"], keyword) for s in case["sentences"]):
        return {"status": "present", "foundIn": None}
    if any(_contains(head, keyword) for head in (case["title"], case["subtitle"]) if head):
        return {"status": "verified", "foundIn": None}
    return {"status": "fabricated", "foundIn": None}


# 근거 한 건 검증 및 계약 형식 조립
def verify(kind, case, sentence_no=None, quote=None, keyword=None):
    if kind == "absence":
        return {"kind": "absence", "sentenceNo": None, "quote": None, "keyword": keyword, **check_absence(keyword, case)}
    return {"kind": "quote", "sentenceNo": sentence_no, "quote": quote, "keyword": None, **check_quote(sentence_no, quote, case)}


JOSA = sorted(["이", "가", "은", "는", "을", "를", "의", "에", "에서", "로", "으로", "와", "과", "도", "만", "까지"], key=len, reverse=True)


# 단어 끝 조사 제거
def _strip_josa(word):
    for j in JOSA:
        if word.endswith(j) and len(word) - len(j) >= 2:
            return word[: -len(j)]
    return word


# 용언 활용형으로 보이는 어미 (핵심어 후보 제외)
PREDICATE_ENDINGS = ("다", "야", "나", "데", "서", "어", "아", "고", "면", "지", "요")


# 제목·부제 명사형 단어 중 본문 모든 문장에 없는 핵심어 후보 추출
def absence_candidates(case):
    headline = re.sub(r"\[[^\]]*\]|【[^】]*】|<[^>]*>", " ", f"{case['title']} {case['subtitle']}")
    words = re.findall(r"\w+", headline)
    found = []
    for word in words:
        word = _strip_josa(word)
        if len(word) < 2 or word in found or word.lower() == "null" or word.endswith(PREDICATE_ENDINGS) or re.search(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]", word):
            continue
        if not any(_contains(s["text"], word) or _contains(s["text"], word[:2]) for s in case["sentences"]):
            found.append(word)
    return found
