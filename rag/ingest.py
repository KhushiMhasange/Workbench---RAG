from __future__ import annotations

import hashlib
import shutil
import threading
import time
from pathlib import Path

from . import embeddings, registry, store
from .chunking import chunk_sections
from .config import get_settings
from .loaders import detect_type, load, sanitise_filename

_embed_lock = threading.Lock()


def _mime(kind: str) -> str:
    return {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "csv": "text/csv",
        "md": "text/markdown",
        "txt": "text/plain",
    }.get(kind, "application/octet-stream")


def save_upload(workspace: str, filename: str, data: bytes) -> dict:
    s = get_settings()
    registry.init_db()
    if not registry.workspace_exists(workspace):
        if not registry.valid_workspace_name(workspace):
            raise ValueError("invalid workspace name")
        registry.create_workspace(workspace)
    if len(data) > s.max_upload_bytes:
        raise ValueError(f"file too large (limit {s.max_upload_mb} MB)")
    sha = hashlib.sha256(data).hexdigest()
    doc_id = sha[:16]
    existing = registry.find_by_hash(workspace, sha)
    if existing:
        return existing
    safe = sanitise_filename(filename)
    folder = s.upload_dir / workspace / doc_id
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / safe
    target.write_bytes(data)
    try:
        kind = detect_type(target)
    except ValueError as exc:
        shutil.rmtree(folder, ignore_errors=True)
        raise ValueError(str(exc))
    row = {
        "workspace": workspace,
        "doc_id": doc_id,
        "filename": safe,
        "mime": _mime(kind),
        "size_bytes": len(data),
        "sha256": sha,
        "status": "queued",
    }
    return registry.insert_document(row)


def ingest_document(workspace: str, doc_id: str) -> dict | None:
    s = get_settings()
    registry.init_db()
    try:
        row = registry.get_document(workspace, doc_id)
        if not row:
            return None
        registry.update_status(workspace, doc_id, "parsing", db_path=None)
        folder = s.upload_dir / workspace / doc_id
        files = list(folder.glob("*")) if folder.exists() else []
        if not files:
            raise ValueError("upload missing")
        path = files[0]
        kind, sections = load(path)
        pages = max([sec.page or 0 for sec in sections] + [0])
        if not pages:
            pages = 1 if sections else 0
        chunks = chunk_sections(doc_id, sections, kind, s)
        registry.update_status(workspace, doc_id, "embedding", db_path=None)
        with _embed_lock:
            dense = embeddings.embed_dense([c.text for c in chunks], "document")
            sparse = embeddings.embed_sparse([c.text for c in chunks], "document")
        store.upsert_chunks(workspace, row["filename"], chunks, dense, sparse)
        return registry.update_status(
            workspace, doc_id, "ready", db_path=None,
            pages=pages, chunks=len(chunks), embedding_model=s.embedding_model,
            error="",
        )
    except Exception as exc:
        try:
            store.delete_document(workspace, doc_id)
        except Exception:
            pass
        registry.update_status(workspace, doc_id, "failed", error=str(exc)[:300])
        return registry.get_document(workspace, doc_id)


def ingest_file(workspace: str, path: Path | str) -> dict:
    p = Path(path)
    data = p.read_bytes()
    row = save_upload(workspace, p.name, data)
    return ingest_document(workspace, row["doc_id"]) or row


def remove_document(workspace: str, doc_id: str) -> None:
    s = get_settings()
    try:
        store.delete_document(workspace, doc_id)
    except Exception:
        pass
    folder = s.upload_dir / workspace / doc_id
    shutil.rmtree(folder, ignore_errors=True)
    registry.delete_document_row(workspace, doc_id)


def remove_workspace(workspace: str) -> None:
    s = get_settings()
    try:
        store.delete_workspace(workspace)
    except Exception:
        pass
    folder = s.upload_dir / workspace
    shutil.rmtree(folder, ignore_errors=True)
    registry.delete_workspace_row(workspace)


def reindex(workspace: str | None = None) -> list[dict]:
    s = get_settings()
    docs: list[dict] = []
    if workspace:
        docs = registry.list_documents(workspace)
    else:
        for ws in registry.list_workspaces():
            docs.extend(registry.list_documents(ws["name"]))
        with registry.db() as conn:
            rows = conn.execute(
                "SELECT * FROM documents WHERE status='ready'"
            ).fetchall()
            docs = [dict(r) for r in rows]
    out = []
    for d in docs:
        if d.get("status") == "ready" and d.get("embedding_model") != s.embedding_model:
            out.append(ingest_document(d["workspace"], d["doc_id"]))
        elif workspace and d.get("workspace") == workspace:
            pass
    return [r for r in out if r]
