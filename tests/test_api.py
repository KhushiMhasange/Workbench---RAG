import hashlib
import io
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np
from fastapi.testclient import TestClient
from fpdf import FPDF


def _fake_vectors(texts):
    out = []
    for t in texts:
        h = int(hashlib.sha256(t.encode()).hexdigest(), 16)
        v = np.zeros(8, dtype=np.float32)
        v[h % 8] = 1.0
        out.append((v / np.linalg.norm(v)).tolist())
    return out


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("RAG_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("RAG_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("RAG_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("RAG_MAX_UPLOAD_MB", "1")
    from rag import config, embeddings, generation, registry, store

    config.get_settings.cache_clear()
    store.get_client.cache_clear()
    try:
        embeddings.embedding_dim.cache_clear()
    except Exception:
        pass

    from qdrant_client import QdrantClient, models

    mem = QdrantClient(":memory:")
    monkeypatch.setattr(embeddings, "embed_dense", lambda texts, kind="document": _fake_vectors(texts))
    monkeypatch.setattr(embeddings, "embedding_dim", lambda: 8)
    from qdrant_client.models import SparseVector as SV

    monkeypatch.setattr(embeddings, "embed_sparse", lambda texts, kind="document": [SV(indices=[0], values=[1.0]) for _ in texts])
    monkeypatch.setattr(store, "get_client", lambda: mem)
    monkeypatch.setattr(store, "collection_name", lambda: "test_api")
    monkeypatch.setattr(store, "ensure_collection", lambda: _ensure(mem))

    def _ensure(client):
        if not client.collection_exists("test_api"):
            client.create_collection(
                collection_name="test_api",
                vectors_config={"dense": models.VectorParams(size=8, distance=models.Distance.COSINE)},
                sparse_vectors_config={"sparse": models.SparseVectorParams()},
            )
        return "test_api"

    import rag.retrieval as ret

    orig_retrieve = ret.retrieve

    def fake_retrieve(query, workspace, doc_ids=None):
        from rag.models import Hit

        filt = store.workspace_filter(workspace, doc_ids)
        pts = store.query_dense(_fake_vectors([query])[0], filt, 10)
        hits = []
        for p in pts:
            pay = p.payload or {}
            hits.append(Hit(chunk_id=pay.get("chunk_id", ""), doc_id=pay.get("doc_id", ""),
                            filename=pay.get("filename", ""), page=pay.get("page"),
                            heading=None, text=pay.get("text", ""), score=0.9))
        s = config.get_settings()
        return hits[: s.top_k]

    monkeypatch.setattr(ret, "retrieve", fake_retrieve)

    def fake_answer(question, workspace, doc_ids=None):
        from rag.models import Answer

        hits = fake_retrieve(question, workspace, doc_ids)
        if not hits:
            return Answer(question=question, text="I don't know from the given context.",
                          results=(), citations=(), abstained=True, gated=True, refusal_reason="gate")
        return Answer(question=question, text=f"answer here [1]", results=tuple(hits),
                      citations=(1,), abstained=False, refusal_reason=None)

    monkeypatch.setattr(generation, "answer", fake_answer)
    monkeypatch.setattr("rag.pipeline.ask", fake_answer)

    registry.init_db()
    from rag import api

    return TestClient(api.app)


def _pdf_bytes(text="hello pdf"):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    pdf.cell(text=text)
    p = "/tmp/_t_api.pdf"
    pdf.output(p)
    return Path(p).read_bytes()


def test_workspaces_and_upload_chat(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    assert c.post("/api/workspaces", json={"name": "BAD NAME!"}).status_code == 400
    r = c.post("/api/workspaces", json={"name": "ws1"})
    assert r.status_code in (200, 201)
    assert c.post("/api/workspaces", json={"name": "ws1"}).status_code == 409
    up = c.post("/api/workspaces/ws1/documents", files=[("files", ("a.txt", b"hello world " * 50, "text/plain"))])
    assert up.status_code == 202
    import time

    for _ in range(60):
        docs = c.get("/api/workspaces/ws1/documents").json()["documents"]
        if docs and docs[0]["status"] == "ready":
            break
        time.sleep(0.5)
    docs = c.get("/api/workspaces/ws1/documents").json()["documents"]
    assert docs[0]["status"] == "ready"
    dup = c.post("/api/workspaces/ws1/documents", files=[("files", ("a.txt", b"hello world " * 50, "text/plain"))])
    assert dup.json()["documents"][0]["doc_id"] == docs[0]["doc_id"]
    pdf = _pdf_bytes("pdf content here " * 20)
    up2 = c.post("/api/workspaces/ws1/documents", files=[("files", ("b.pdf", pdf, "application/pdf"))])
    assert up2.status_code == 202
    chat = c.post("/api/chat", json={"question": "hello?", "workspace": "ws1"})
    assert chat.status_code == 200
    body = chat.json()
    assert body["citations"] and body["sources"][0]["filename"]
    big = c.post("/api/workspaces/ws1/documents", files=[("files", ("big.txt", b"x" * (2 * 1024 * 1024), "text/plain"))])
    assert big.status_code in (202, 413)
    if big.status_code == 202:
        assert "error" in big.json()["documents"][0]
    bad = c.post("/api/workspaces/ws1/documents", files=[("files", ("a.bin", bytes(range(256)) * 10, "application/octet-stream"))])
    assert bad.status_code == 202
    assert "error" in bad.json()["documents"][0]
    doc_id = docs[0]["doc_id"]
    assert c.delete(f"/api/workspaces/ws1/documents/{doc_id}").status_code == 200
    assert c.delete("/api/workspaces/ws1").status_code == 200


def test_isolation(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    c.post("/api/workspaces", json={"name": "a"})
    c.post("/api/workspaces", json={"name": "b"})
    c.post("/api/workspaces/a/documents", files=[("files", ("a.txt", b"content a " * 50, "text/plain"))])
    c.post("/api/workspaces/b/documents", files=[("files", ("b.txt", b"content b " * 50, "text/plain"))])
    import time

    for _ in range(60):
        da = c.get("/api/workspaces/a/documents").json()["documents"]
        dbb = c.get("/api/workspaces/b/documents").json()["documents"]
        if da and dbb and da[0]["status"] == "ready" and dbb[0]["status"] == "ready":
            break
        time.sleep(0.5)
    ra = c.post("/api/chat", json={"question": "content?", "workspace": "a"}).json()
    assert all(s["filename"] == "a.txt" for s in ra["sources"])
