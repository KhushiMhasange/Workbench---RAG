from __future__ import annotations

from typing import Iterator

from . import generation, ingest, registry, retrieval, store
from .config import get_settings
from .models import Answer, Hit


def init() -> None:
    registry.init_db()
    store.ensure_collection()


def search(query: str, workspace: str, doc_ids: list[str] | None = None) -> list[Hit]:
    registry.init_db()
    return retrieval.retrieve(query, workspace, doc_ids)


def ask(question: str, workspace: str, doc_ids: list[str] | None = None) -> Answer:
    registry.init_db()
    return generation.answer(question, workspace, doc_ids)


def ask_stream(question: str, workspace: str, doc_ids: list[str] | None = None):
    hits = retrieval.retrieve(question, workspace, doc_ids)
    return hits, generation.stream_with_hits(question, hits)


def health() -> dict:
    import httpx

    s = get_settings()
    try:
        r = httpx.get(f"{s.ollama_host.rstrip('/')}/api/tags", timeout=10)
        r.raise_for_status()
        models = [m.get("name", "") for m in r.json().get("models", [])]
        reachable = True
    except Exception as exc:
        models = [f"error: {exc}"]
        reachable = False
    try:
        store.ensure_collection()
        qdrant_ok: bool | str = True
        points = store.count_workspace(s.default_workspace)
    except Exception as exc:
        qdrant_ok = str(exc)[:200]
        points = 0
    try:
        registry.init_db()
        with registry.db() as conn:
            conn.execute("SELECT 1").fetchone()
        db_ok: bool | str = True
    except Exception as exc:
        db_ok = str(exc)[:200]
    return {
        "ollama": reachable,
        "models": models,
        "embedding_model_loaded": any(s.embedding_model.split(":")[0] in m for m in models),
        "language_model_loaded": any(s.language_model.split(":")[0] in m for m in models),
        "qdrant": qdrant_ok,
        "qdrant_points_default": points,
        "db": db_ok,
        "embedding_model": s.embedding_model,
        "language_model": s.language_model,
        "guard_mode": "warning-only",
    }
