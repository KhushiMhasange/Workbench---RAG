from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Sequence

STOPWORDS = frozenset(
    """
a an the and or but if then than that this these those there here of in on at to for with from by
about into over after before between during without within is are was were be been being am do does
did done have has had having i me my we our you your he she it they them their as not no nor so
such only own same too very can will just should now also may might must would could shall
because while when where which who whom whose what how why all any both each few more most other some
such against above below up down out off again further once during under over per via etc
thing things lot lots kind sort way ways one two three
""".split()
)

_EXTRA_STOP = frozenset(
    "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december i introduction overview summary conclusion chapter section appendix table figure".split()
)

_NUMBER = re.compile(r"\d[\d,.]*\s*(?:%|percent|mph|km|m|ft|feet|in|inch|inches|lbs?|kg|million|billion|thousand|years?|times|octaves|times)?", re.I)
_WORD = re.compile(r"[A-Za-z][A-Za-z'\-]*")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
_CITATION = re.compile(r"\[(\d+)\]")
_LEADING = re.compile(r"^\s*\[(\d+)\]")
_ORPHAN_CITATION = re.compile(r"([.!?])\s+(\[\d+\])")
_SENTENCE_KEEP_SEP = re.compile(r"((?<=[.!?])\s+(?!\[\d+\])|\n+)")


def stem(word: str) -> str:
    w = word.lower().strip("'-")
    for suffix in ("ies", "es", "s"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            w = w[: -len(suffix)]
            break
    for suffix in ("ing", "ed"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 4:
            w = w[: -len(suffix)]
            break
    if w.endswith("e") and len(w) > 4:
        w = w[:-1]
    return w


def tokens(text: str) -> list[str]:
    return [w.lower() for w in _WORD.findall(text)]


def content_terms(text: str) -> set[str]:
    return {stem(w) for w in tokens(text) if w not in STOPWORDS and len(w) > 2}


def _norm_num(raw: str) -> str:
    digits = re.sub(r"[^\d.]", "", raw.lower().strip())
    digits = digits.replace(",", "")
    if "." in digits:
        digits = digits.rstrip("0").rstrip(".")
    return digits.rstrip(".")


def numbers_in(text: str) -> set[str]:
    found = set()
    for m in _NUMBER.finditer(text):
        n = _norm_num(m.group(0))
        if n and n.strip("."):
            found.add(n)
    return found


def entities_in(text: str) -> set[str]:
    out = set()
    for sentence in _SENTENCE_SPLIT.split(text):
        words = _WORD.findall(sentence)
        for w in words[1:]:
            lw = w.lower()
            if w[:1].isupper() and lw not in STOPWORDS and lw not in _EXTRA_STOP:
                out.add(stem(w))
    return out


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(text) if s and s.strip()]


def attach_citations(text: str) -> str:
    previous = None
    current = text
    while current != previous:
        previous, current = current, _ORPHAN_CITATION.sub(r" \2\1", current)
    return current


def split_claims(text: str) -> list[tuple[str, list[int]]]:
    stripped = text.strip()
    if not stripped:
        return []
    leading_style = bool(_LEADING.match(stripped))
    if not leading_style:
        stripped = attach_citations(stripped)
    claims: list[tuple[str, list[int]]] = []
    pending: list[int] = []
    for raw in split_sentences(stripped):
        if leading_style:
            m = _LEADING.match(raw)
            own = [int(n) for n in m.groups()] if m else []
            body = _clean(raw)
        else:
            own = [int(n) for n in _CITATION.findall(raw)]
            body = _clean(raw)
        if not body:
            pending.extend(own)
            continue
        citations = own or pending
        claims.append((body, list(dict.fromkeys(citations))))
        pending = []
    if pending and claims:
        claims[-1] = (claims[-1][0], list(dict.fromkeys(claims[-1][1] + pending)))
    return claims


def _clean(sentence: str) -> str:
    return _CITATION.sub("", sentence).strip()


@dataclass
class Claim:
    sentence: str
    citations: list[int]
    missing_terms: list[str] = field(default_factory=list)
    missing_numbers: list[str] = field(default_factory=list)
    missing_entities: list[str] = field(default_factory=list)

    @property
    def checkable_failure(self) -> bool:
        return bool(self.missing_numbers or self.missing_entities)

    @property
    def drifted(self) -> bool:
        return bool(self.missing_terms) and not self.checkable_failure

    def to_dict(self) -> dict:
        return {
            "sentence": self.sentence,
            "citations": self.citations,
            "missing_terms": self.missing_terms,
            "missing_numbers": self.missing_numbers,
            "missing_entities": self.missing_entities,
            "verdict": ("unsupported" if self.checkable_failure else ("drift" if self.drifted else "supported")),
        }


@dataclass
class Groundedness:
    claim_support_rate: float
    citation_coverage: float
    drift_rate: float
    numeric_grounded: bool
    entity_grounded: bool
    context_terms_matched: float
    abstained: bool
    claims: list[Claim]

    def to_dict(self) -> dict:
        return {
            "claim_support_rate": round(self.claim_support_rate, 4),
            "citation_coverage": round(self.citation_coverage, 4),
            "drift_rate": round(self.drift_rate, 4),
            "numeric_grounded": self.numeric_grounded,
            "entity_grounded": self.entity_grounded,
            "context_terms_matched": round(self.context_terms_matched, 4),
            "abstained": self.abstained,
            "claims": [c.to_dict() for c in self.claims],
        }


def _hit_text_by_rank(results, rank: int) -> str:
    for i, r in enumerate(results, start=1):
        rid = getattr(r, "rank", i)
        if rid == rank:
            return getattr(r, "text", "")
    return ""


def cited_context(results, citations: Iterable[int]) -> str:
    wanted = set(citations)
    if not wanted:
        return " ".join(getattr(r, "text", "") for r in results)
    parts = []
    for i, r in enumerate(results, start=1):
        rid = getattr(r, "rank", i)
        if rid in wanted:
            parts.append(getattr(r, "text", ""))
    return " ".join(parts)


QUESTION_FRAME_WORDS = frozenset(
    """
much many long often tell name called does doing do is are was were can could would should will
happen happens happen? difference between most least best better more less least number amount
kind type sort reason cause happen mean means
""".split()
)


def question_terms(question: str) -> set[str]:
    return {stem(w) for w in tokens(question) if w not in STOPWORDS and w not in QUESTION_FRAME_WORDS and len(w) > 2}


def question_relevance(question: str, answer: str) -> float:
    wanted = question_terms(question)
    if not wanted:
        return 1.0
    answered = content_terms(answer)
    return len(wanted & answered) / len(wanted)


def analyze(answer) -> Groundedness:
    from .generation import is_abstention

    if getattr(answer, "abstained", False) or is_abstention(getattr(answer, "text", "")):
        return Groundedness(1.0, 1.0 if getattr(answer, "abstained", False) else 0.0, 0.0, True, True, 0.0, True, [])

    results = list(getattr(answer, "results", []))
    by_rank = {}
    for i, r in enumerate(results, start=1):
        by_rank[getattr(r, "rank", i)] = getattr(r, "text", "")

    claims: list[Claim] = []
    for sentence, local_cits in split_claims(getattr(answer, "text", "")):
        if not local_cits:
            continue
        ctx_parts = [by_rank[c] for c in local_cits if c in by_rank]
        if not ctx_parts and results:
            ctx_parts = [getattr(r, "text", "") for r in results]
        context = " ".join(ctx_parts)
        ctx_fold = context.casefold()
        sent_numbers = numbers_in(sentence)
        sent_entities = entities_in(sentence)
        ctx_numbers = numbers_in(context)
        ctx_entities = content_terms(context)
        missing_numbers = sorted(n for n in sent_numbers if n not in ctx_numbers)
        missing_entities = sorted(e for e in sent_entities if e not in ctx_entities)
        sentence_terms = content_terms(sentence)
        context_terms = content_terms(context)
        claims.append(
            Claim(
                sentence=sentence,
                citations=local_cits,
                missing_terms=sorted(sentence_terms - context_terms),
                missing_numbers=missing_numbers,
                missing_entities=missing_entities,
            )
        )

    if not claims:
        all_ctx = " ".join(getattr(r, "text", "") for r in results)
        all_terms = content_terms(getattr(answer, "text", "") or "")
        ctx_terms = content_terms(all_ctx)
        matched = len(all_terms & ctx_terms) / len(all_terms) if all_terms else 0.0
        return Groundedness(1.0, 0.0, 0.0, True, True, matched, False, [])

    total = len(claims)
    supported = sum(1 for c in claims if not c.checkable_failure)
    drifted = sum(1 for c in claims if c.drifted)
    all_sentences = split_claims(getattr(answer, "text", ""))
    with_citation = sum(1 for _, c in all_sentences if c)
    coverage = with_citation / len(all_sentences) if all_sentences else 0.0
    all_ctx = " ".join(getattr(r, "text", "") for r in results)
    ctx_terms_all = content_terms(all_ctx)
    all_answer_terms = content_terms(getattr(answer, "text", ""))
    matched = len(all_answer_terms & ctx_terms_all) / len(all_answer_terms) if all_answer_terms else 0.0
    return Groundedness(
        claim_support_rate=supported / total,
        citation_coverage=coverage,
        drift_rate=drifted / total,
        numeric_grounded=not any(c.missing_numbers for c in claims),
        entity_grounded=not any(c.missing_entities for c in claims),
        context_terms_matched=matched,
        abstained=False,
        claims=claims,
    )


def _split_keep_separators(text: str) -> list[str]:
    return _SENTENCE_KEEP_SEP.split(text or "")


def _is_separator(bit: str) -> bool:
    return not bit.strip() or bool(re.fullmatch(r"\s+", bit))


def _claim_core(bit: str) -> str:
    """Sentence text minus bare list enumerators ("1.", "2)", ": 1.").
    Prevents enumeration digits from looking like checkable content."""
    core = re.sub(r"^\s*\d{1,3}[.)]\s*", "", bit)
    core = re.sub(r":\s*\d{1,2}\.?\s*$", "", core)
    return core


def supporting_passage(sentence: str, results) -> int | None:
    """Best supporting passage rank for a sentence, or None.

    Conservative: only returns a rank when the passage shares a number,
    a named entity, or at least 3 content terms with the sentence.
    List enumerators are ignored so "1." never counts as content.
    """
    core = _claim_core(sentence)
    if not _WORD.search(core):
        return None
    st = content_terms(core)
    sn = numbers_in(core)
    se = entities_in(core)
    if not st and not sn and not se:
        return None
    scored: list[tuple[int, set[str], set[str]]] = []
    for i, r in enumerate(results, start=1):
        rid = getattr(r, "rank", i)
        ptext = getattr(r, "text", "")
        scored.append((rid, content_terms(ptext), numbers_in(ptext)))
    best: int | None = None
    best_score = -1
    for rid, pt, pn in scored:
        shared = st & pt
        score = len(shared)
        if sn and (sn & pn):
            score += 10
        if se and (se & pt):
            score += 5
        if score > best_score:
            best, best_score = rid, score
    if best is None:
        return None
    pt = next(pt for rid, pt, _ in scored if rid == best)
    pn = next(pn for rid, _, pn in scored if rid == best)
    if (sn and (sn & pn)) or (se and (se & pt)) or len(st & pt) >= 3:
        return best
    return None


def heal_citations(text: str, results) -> str:
    """Append [rank] markers to sentences that lack them but are supported
    by a retrieved passage. Separators and existing markers are untouched,
    so formatting is preserved byte-for-byte otherwise."""
    results = list(results or [])
    if not results or not (text or "").strip():
        return text
    out: list[str] = []
    for bit in _split_keep_separators(text):
        if _is_separator(bit) or _CITATION.search(bit) or not _WORD.search(bit):
            out.append(bit)
            continue
        rid = supporting_passage(bit, results)
        out.append(f"{bit.rstrip()} [{rid}]" if rid is not None else bit)
    return "".join(out)


def uncited_sentences(text: str) -> list[str]:
    """Bare sentences (no [n] marker) carrying checkable content
    (numbers or named entities). Framing sentences are ignored."""
    out: list[str] = []
    for bit in _split_keep_separators(text):
        if _is_separator(bit) or _CITATION.search(bit) or not _WORD.search(bit):
            continue
        core = _claim_core(bit)
        if numbers_in(core) or entities_in(core):
            sent = " ".join(bit.split())
            out.append(sent[:137] + "..." if len(sent) > 140 else sent)
    return out


def analyze_batch(answers: Sequence) -> dict:
    reports = [analyze(a) for a in answers]
    if not reports:
        return {}
    n = len(reports)
    answerable = [r for r in reports if not r.abstained]

    def mean(values: Sequence[float]) -> float:
        return sum(values) / len(values) if values else 0.0

    return {
        "answers": n,
        "abstention_rate": mean([1.0 if r.abstained else 0.0 for r in reports]),
        "claim_support_rate": mean([r.claim_support_rate for r in reports]),
        "claim_support_rate_given_answer": mean([r.claim_support_rate for r in answerable]),
        "citation_coverage": mean([r.citation_coverage for r in answerable]),
        "drift_rate": mean([r.drift_rate for r in answerable]),
        "context_terms_matched": mean([r.context_terms_matched for r in answerable]),
        "numeric_grounded_rate": mean([1.0 if r.numeric_grounded else 0.0 for r in answerable]),
        "entity_grounded_rate": mean([1.0 if r.entity_grounded else 0.0 for r in answerable]),
        "unsupported_claims": [],
    }
