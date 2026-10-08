from __future__ import annotations

import re

import numpy as np

from . import embeddings, store
from .config import get_settings
from .models import Hit

_CITATION = re.compile(r"\[(\d+)\]")


def parse_citations(text: str) -> list[int]:
    return sorted({int(n) for n in _CITATION.findall(text)})


def build_context(results) -> str:
    return "\n\n".join(f"[{r.rank if hasattr(r, 'rank') else i+1}] {r.text}" for i, r in enumerate(results))


def _mmr_order(hits: list[Hit], vecs: list[list[float]], lam: float = 0.7) -> list[Hit]:
    if not hits:
        return []
    mat = np.asarray(vecs, dtype=np.float32)
    selected: list[int] = []
    remaining = list(range(len(hits)))
    while remaining and len(selected) < len(hits):
        best, best_val = None, -1e9
        for c in remaining:
            rel = hits[c].score
            if selected:
                red = float(np.max(mat[c] @ mat[selected].T))
                val = lam * rel - (1 - lam) * red
            else:
                val = rel
            if val > best_val:
                best, best_val = c, val
        selected.append(best)
        remaining.remove(best)
    return [hits[i] for i in selected]


def retrieve(query: str, workspace: str, doc_ids: list[str] | None = None) -> list[Hit]:
    s = get_settings()
    dense_q = embeddings.embed_dense([query], "query")[0]
    flt = store.workspace_filter(workspace, doc_ids)
    if s.hybrid:
        sparse_q = embeddings.embed_sparse([query], "query")[0]
        points = store.query_hybrid(dense_q, sparse_q, flt, s.candidates)
    else:
        points = store.query_dense(dense_q, flt, s.candidates)
    qv = np.asarray(dense_q, dtype=np.float32)
    scored: list[Hit] = []
    vecs: list[list[float]] = []
    for p in points:
        payload = p.payload or {}
        dv = None
        if p.vector:
            dv = p.vector.get("dense") if isinstance(p.vector, dict) else None
        if dv is None:
            continue
        score = float(np.dot(qv, np.asarray(dv, dtype=np.float32)))
        vecs.append(list(dv))
        scored.append(
            Hit(
                chunk_id=payload.get("chunk_id", ""),
                doc_id=payload.get("doc_id", ""),
                filename=payload.get("filename", ""),
                page=payload.get("page"),
                heading=payload.get("heading"),
                text=payload.get("text", ""),
                score=score,
                vector=list(dv),
            )
        )
    scored = [h for h in scored if h.score >= s.min_score]
    if s.mmr and scored:
        scored = _mmr_order(scored, vecs[: len(scored)])
        scored = [{**h.__dict__, "vector": None} if False else h for h in scored]
        out = []
        for h in scored:
            out.append(Hit(h.chunk_id, h.doc_id, h.filename, h.page, h.heading, h.text, h.score, None))
        scored = out
    else:
        scored = [Hit(h.chunk_id, h.doc_id, h.filename, h.page, h.heading, h.text, h.score, None) for h in scored]
    return scored[: s.top_k]
