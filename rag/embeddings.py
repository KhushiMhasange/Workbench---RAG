from __future__ import annotations

from functools import lru_cache

import httpx
import numpy as np

from .config import get_settings

_sparse_model = None


def _settings():
    return get_settings()


def embed_dense(texts: list[str], kind: str) -> list[list[float]]:
    s = _settings()
    inputs = [(s.query_prefix + t) if kind == "query" and s.query_prefix else t for t in texts]
    out: list[list[float]] = []
    for i in range(0, len(inputs), s.embed_batch or 32):
        batch = inputs[i:i + (s.embed_batch or 32)]
        try:
            r = httpx.post(
                f"{s.ollama_host.rstrip('/')}/api/embed",
                json={"model": s.embedding_model, "input": batch},
                timeout=s.request_timeout,
            )
            r.raise_for_status()
            vecs = r.json()["embeddings"]
        except Exception as exc:
            raise RuntimeError(f"embedding failed (model={s.embedding_model}): {exc}")
        arr = np.asarray(vecs, dtype=np.float32)
        norms = np.linalg.norm(arr, axis=-1, keepdims=True)
        norms[norms == 0] = 1.0
        arr = (arr / norms).astype(np.float32)
        out.extend(arr.tolist())
    return out


def _sparse_client():
    global _sparse_model
    if _sparse_model is None:
        from fastembed import SparseTextEmbedding

        s = _settings()
        try:
            _sparse_model = SparseTextEmbedding(s.sparse_model, language=s.bm25_language)
        except TypeError:
            _sparse_model = SparseTextEmbedding(s.sparse_model)
    return _sparse_model


def embed_sparse(texts: list[str], kind: str):
    from qdrant_client import models

    client = _sparse_client()
    fn = client.query_embed if kind == "query" else client.embed
    out = []
    for e in fn(texts):
        out.append(models.SparseVector(indices=list(e.indices), values=list(e.values)))
    return out


@lru_cache(maxsize=1)
def embedding_dim() -> int:
    return len(embed_dense(["probe"], "document")[0])


@lru_cache(maxsize=512)
def embed_query_dense_cached(query: str) -> tuple:
    return tuple(embed_dense([query], "query")[0])
