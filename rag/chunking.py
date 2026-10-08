from __future__ import annotations

import re

from .config import Settings, get_settings
from .models import Chunk, Section

_SENT = re.compile(r"(?<=[.!?])\s+")
_WS = re.compile(r"\s+")


def _is_line_mode(text: str) -> bool:
    lines = [l for l in text.splitlines() if l.strip()]
    if len(lines) < 20:
        return False
    avg = sum(len(l) for l in lines) / len(lines)
    if avg >= 200:
        return False
    over = sum(1 for l in lines if len(l) > 400) / len(lines)
    return over <= 0.05


def _split_long(text: str, limit: int) -> list[str]:
    if len(text) <= limit:
        return [text]
    parts = _SENT.split(text)
    if len(parts) > 1 and all(len(p) <= limit for p in parts):
        return [p for p in parts if p.strip()]
    out: list[str] = []
    for p in parts:
        while len(p) > limit:
            cut = p.rfind(" ", 0, limit)
            if cut <= 0:
                cut = limit
            out.append(p[:cut])
            p = p[cut:].lstrip()
        if p.strip():
            out.append(p)
    return [o for o in out if o.strip()]


def _trim_overlap(tail: str) -> str:
    i = tail.find(" ")
    return tail[i + 1:] if i >= 0 else tail


def chunk_sections(
    doc_id: str,
    sections: list[Section],
    file_type: str,
    settings: Settings | None = None,
) -> list[Chunk]:
    settings = settings or get_settings()
    full = "\n".join(s.text for s in sections)
    if file_type == "txt" and _is_line_mode(full):
        lines = [l.strip() for l in full.splitlines() if l.strip()]
        return [
            Chunk(chunk_id=f"{doc_id}:c{i + 1:04d}", doc_id=doc_id, ordinal=i + 1,
                  text=_WS.sub(" ", l).strip())
            for i, l in enumerate(lines) if l.strip()
        ]
    chunks: list[Chunk] = []
    ordinal = 0
    for sec in sections:
        paras = [p.strip() for p in re.split(r"\n\s*\n", sec.text) if p.strip()]
        units: list[str] = []
        for para in paras:
            units.extend(_split_long(para, settings.chunk_chars))
        buf = ""
        for u in units:
            cand = f"{buf} {u}".strip() if buf else u
            if len(cand) > settings.chunk_chars and buf:
                chunks.append(_make(doc_id, ordinal + 1, buf, sec))
                ordinal += 1
                tail = buf[-settings.chunk_overlap:] if settings.chunk_overlap else ""
                tail = _trim_overlap(tail)
                buf = f"{tail} {u}".strip() if tail else u
            else:
                buf = cand
        if buf.strip():
            if len(buf.strip()) < 80 and chunks and chunks[-1].doc_id == doc_id:
                prev = chunks.pop()
                ordinal -= 1
                merged = f"{prev.text} {buf.strip()}"
                chunks.append(_make(doc_id, ordinal + 1, merged, sec))
                ordinal += 1
            else:
                chunks.append(_make(doc_id, ordinal + 1, buf, sec))
                ordinal += 1
    return [c for c in chunks if c.text.strip()]


def _make(doc_id: str, ordinal: int, text: str, sec: Section) -> Chunk:
    return Chunk(
        chunk_id=f"{doc_id}:c{ordinal:04d}",
        doc_id=doc_id,
        ordinal=ordinal,
        text=_WS.sub(" ", text).strip(),
        page=sec.page,
        heading=sec.heading,
    )
