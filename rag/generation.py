from __future__ import annotations

import time
from typing import Iterator

import httpx

from . import retrieval as retrieval_mod
from .config import ANSWER_PREFIX, ABSTENTION_MARKERS, get_settings
from .models import Answer, Hit


def is_abstention(text: str) -> bool:
    lowered = " ".join((text or "").lower().split())
    if ANSWER_PREFIX.lower() in lowered:
        return True
    return any(m in lowered for m in ABSTENTION_MARKERS)


def _chat(payload: dict, stream: bool, timeout: float):
    s = get_settings()
    url = f"{s.ollama_host.rstrip('/')}/api/chat"
    if not stream:
        r = httpx.post(url, json=payload, timeout=max(timeout, 180))
        r.raise_for_status()
        return r.json()
    return _stream(url, payload)


def _stream(url: str, payload: dict):
    import json as _json

    with httpx.stream("POST", url, json=payload, timeout=300) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if not line:
                continue
            try:
                yield _json.loads(line)
            except Exception:
                continue


def build_passages(hits: list[Hit]) -> str:
    parts = []
    for i, h in enumerate(hits, start=1):
        label = f"[{i}] ({h.filename}" + (f", p.{h.page}" if h.page else "") + ")"
        parts.append(
            f"{label}\n<passage id=\"{i}\" source=\"{h.filename}\" page=\"{h.page or ''}\">{h.text}</passage>"
        )
    return "\n\n".join(parts)


def messages(question: str, hits: list[Hit]) -> list[dict]:
    s = get_settings()
    if hits:
        user = f"CONTEXT:\n{build_passages(hits)}\n\nQUESTION: {question}\n\nAnswer using only the CONTEXT above, and cite the passage numbers."
    else:
        user = (
            "CONTEXT: (empty - no relevant passages were retrieved)\n\n"
            f"QUESTION: {question}\n\nThe context is empty, so per your rules you must reply with exactly: {ANSWER_PREFIX}"
        )
    return [
        {"role": "system", "content": s.SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def _options() -> dict:
    s = get_settings()
    return {"temperature": s.temperature, "num_ctx": s.num_ctx, "num_predict": s.max_tokens}


def guard(answer: Answer, *, require_citations: bool = False) -> Answer:
    from .groundedness import analyze, heal_citations, question_relevance, uncited_sentences

    s = get_settings()
    if answer.abstained or not s.grounding_guard:
        return answer
    # Heal bare enumerations ("1. ...") by attaching [rank] where a passage
    # actually supports the sentence. Unsupported sentences stay bare and
    # are flagged instead of silently dropped.
    healed_text = heal_citations(answer.text, answer.results)
    healed = Answer(
        question=answer.question,
        text=healed_text,
        results=answer.results,
        citations=tuple(retrieval_mod.parse_citations(healed_text)),
        abstained=False,
        gated=answer.gated,
        latency_ms=answer.latency_ms,
        mode=answer.mode,
    )
    report = analyze(healed)
    reasons: list[str] = []
    if report.claim_support_rate < 1.0:
        reasons.append("claim_not_in_cited_passage")
        for claim in report.claims:
            if claim.checkable_failure:
                sent = " ".join(claim.sentence.split())
                if len(sent) > 140:
                    sent = sent[:137] + "..."
                reasons.append(f'unsupported: "{sent}"')
    for sent in uncited_sentences(healed_text):
        reasons.append(f'uncited: "{sent}"')
    relevance = question_relevance(healed.question, healed.text)
    if relevance < s.min_answer_relevance:
        reasons.append(f"off_topic_answer(relevance={relevance:.2f})")
    if require_citations and report.citation_coverage < 1.0:
        reasons.append("uncited_sentence")
    if not reasons:
        return healed
    # All guard signals are warning-only: always show the answer and surface
    # the flags in the UI, never withhold. Withholding only happens for true
    # abstentions (model said "I don't know") or the retrieval gate.
    return Answer(
        question=healed.question,
        text=healed.text,
        results=healed.results,
        citations=healed.citations,
        abstained=False,
        gated=healed.gated,
        guarded=True,
        guard_reasons=tuple(reasons),
        latency_ms=healed.latency_ms,
        mode=healed.mode,
        relevance=relevance,
        refusal_reason=None,
    )


def answer(question: str, workspace: str, doc_ids: list[str] | None = None) -> Answer:
    from .groundedness import question_relevance

    s = get_settings()
    hits = retrieval_mod.retrieve(question, workspace, doc_ids)
    if not hits or max(h.score for h in hits) < s.abstain_score:
        return Answer(
            question=question, text=ANSWER_PREFIX, results=tuple(hits),
            citations=(), abstained=True, gated=True, latency_ms=0,
            mode="rag", refusal_reason="gate",
        )
    started = time.perf_counter()
    payload = {"model": s.language_model, "messages": messages(question, hits), "stream": False, "options": _options()}
    data = _chat(payload, False, s.request_timeout)
    text = data["message"]["content"].strip()
    latency = int((time.perf_counter() - started) * 1000)
    ans = Answer(
        question=question, text=text, results=tuple(hits),
        citations=tuple(retrieval_mod.parse_citations(text)),
        abstained=is_abstention(text), latency_ms=latency, mode="rag",
        relevance=question_relevance(question, text),
        refusal_reason=None,
    )
    if ans.abstained:
        return Answer(
            question=ans.question, text=ans.text, results=ans.results, citations=ans.citations,
            abstained=True, gated=False, guarded=False, guard_reasons=(),
            latency_ms=ans.latency_ms, mode=ans.mode, relevance=ans.relevance,
            refusal_reason="relevance",
        )
    return guard(ans)


def answer_stream(question: str, workspace: str, doc_ids: list[str] | None = None):
    s = get_settings()
    hits = retrieval_mod.retrieve(question, workspace, doc_ids)
    payload = {"model": s.language_model, "messages": messages(question, hits), "stream": True, "options": _options()}
    stream = _chat(payload, True, s.request_timeout)
    return hits, stream


def answer_with_hits(question: str, hits: list[Hit]) -> Answer:
    from .groundedness import question_relevance

    s = get_settings()
    if not hits or max(h.score for h in hits) < s.abstain_score:
        return Answer(question=question, text=ANSWER_PREFIX, results=tuple(hits), citations=(),
                      abstained=True, gated=True, latency_ms=0, mode="rag", refusal_reason="gate")
    started = time.perf_counter()
    payload = {"model": s.language_model, "messages": messages(question, hits), "stream": False, "options": _options()}
    data = _chat(payload, False, s.request_timeout)
    text = data["message"]["content"].strip()
    latency = int((time.perf_counter() - started) * 1000)
    ans = Answer(question=question, text=text, results=tuple(hits),
                 citations=tuple(retrieval_mod.parse_citations(text)),
                 abstained=is_abstention(text), latency_ms=latency, mode="rag",
                 relevance=question_relevance(question, text))
    if ans.abstained:
        return Answer(question=ans.question, text=ans.text, results=ans.results, citations=ans.citations,
                      abstained=True, latency_ms=ans.latency_ms, mode=ans.mode, relevance=ans.relevance,
                      refusal_reason="relevance")
    return guard(ans)


def stream_with_hits(question: str, hits: list[Hit]) -> Iterator[str]:
    s = get_settings()
    payload = {"model": s.language_model, "messages": messages(question, hits), "stream": True, "options": _options()}
    for part in _chat(payload, True, s.request_timeout):
        piece = part.get("message", {}).get("content", "")
        if piece:
            yield piece
