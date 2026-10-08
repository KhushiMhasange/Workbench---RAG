import hashlib
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np
from fpdf import FPDF


def _fake_vectors(texts):
    out = []
    for t in texts:
        h = int(hashlib.sha256(t.encode()).hexdigest(), 16)
        v = np.zeros(8, dtype=np.float32)
        v[h % 8] = 1.0
        v = v / np.linalg.norm(v)
        out.append(v.tolist())
    return out


def _setup_tmp(tmp_path, monkeypatch):
    monkeypatch.setenv("RAG_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("RAG_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("RAG_DATA_DIR", str(tmp_path))
    from rag import config, embeddings, registry, store

    config.get_settings.cache_clear()
    store.get_client.cache_clear()
    try:
        embeddings.embedding_dim.cache_clear()
    except Exception:
        pass
    try:
        embeddings.embed_query_dense_cached.cache_clear()
    except Exception:
        pass

    from qdrant_client import QdrantClient, models

    mem = QdrantClient(":memory:")
    monkeypatch.setattr(embeddings, "embed_dense", lambda texts, kind="document": _fake_vectors(texts))
    monkeypatch.setattr(embeddings, "embedding_dim", lambda: 8)
    from qdrant_client.models import SparseVector as SV

    def fake_sparse(texts, kind="document"):
        return [SV(indices=[0], values=[1.0]) for _ in texts]

    monkeypatch.setattr(embeddings, "embed_sparse", fake_sparse)
    monkeypatch.setattr(store, "get_client", lambda: mem)
    monkeypatch.setattr(store, "ensure_collection", lambda: _ensure_mem(mem))
    monkeypatch.setattr(store, "collection_name", lambda: "test_chunks")

    def _ensure_mem(client):
        if not client.collection_exists("test_chunks"):
            client.create_collection(
                collection_name="test_chunks",
                vectors_config={"dense": models.VectorParams(size=8, distance=models.Distance.COSINE)},
                sparse_vectors_config={"sparse": models.SparseVectorParams()},
            )
        return "test_chunks"

    registry.init_db()
    return mem


def test_ingest_query_no_dup(tmp_path, monkeypatch):
    from rag import ingest, registry, store

    _setup_tmp(tmp_path, monkeypatch)
    row = ingest.save_upload("default", "a.txt", b"hello world\nsecond line here\n")
    assert row["status"] == "queued"
    done = ingest.ingest_document("default", row["doc_id"])
    assert done["status"] == "ready"
    assert done["chunks"] >= 1
    n1 = store.count_workspace("default")
    assert n1 >= 1
    row2 = ingest.save_upload("default", "a.txt", b"hello world\nsecond line here\n")
    assert row2["doc_id"] == row["doc_id"]
    ingest.ingest_document("default", row["doc_id"])
    assert store.count_workspace("default") == n1


def test_workspace_isolation_and_doc_filter(tmp_path, monkeypatch):
    from rag import ingest, store

    _setup_tmp(tmp_path, monkeypatch)
    r1 = ingest.save_upload("w1", "a.txt", b"alpha beta gamma " * 50)
    ingest.ingest_document("w1", r1["doc_id"])
    r2 = ingest.save_upload("w2", "b.txt", b"alpha beta gamma " * 50)
    ingest.ingest_document("w2", r2["doc_id"])
    assert store.count_workspace("w1") >= 1
    assert store.count_workspace("w2") >= 1
    flt = store.workspace_filter("w1")
    pts = store.query_dense(_fake_vectors(["alpha"])[0], flt, 10)
    assert all(p.payload["workspace"] == "w1" for p in pts)
    flt2 = store.workspace_filter("w1", [r1["doc_id"]])
    pts2 = store.query_dense(_fake_vectors(["alpha"])[0], flt2, 10)
    assert pts2
    flt3 = store.workspace_filter("w1", ["nope"])
    assert store.query_dense(_fake_vectors(["alpha"])[0], flt3, 10) == []


def test_delete_and_failed(tmp_path, monkeypatch):
    from rag import ingest, registry, store

    _setup_tmp(tmp_path, monkeypatch)
    row = ingest.save_upload("default", "a.txt", b"some content here " * 20)
    ingest.ingest_document("default", row["doc_id"])
    assert store.count_workspace("default") >= 1
    ingest.remove_document("default", row["doc_id"])
    assert store.count_workspace("default") == 0
    assert registry.get_document("default", row["doc_id"]) is None

    pdf = FPDF()
    pdf.add_page()
    p = tmp_path / "blank.pdf"
    pdf.output(str(p))
    data = p.read_bytes()
    row2 = ingest.save_upload("default", "blank.pdf", data)
    done = ingest.ingest_document("default", row2["doc_id"])
    assert done["status"] == "failed"
    assert store.count_workspace("default") == 0
