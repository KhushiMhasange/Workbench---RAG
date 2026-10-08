from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Iterator

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import ingest, pipeline, registry, store
from .config import get_settings

log = logging.getLogger("rag.api")

app = FastAPI(title="RAG", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _on_startup() -> None:
    registry.init_db()
    try:
        store.ensure_collection()
    except Exception:
        pass
    try:
        registry.fail_unfinished()
    except Exception:
        pass


class WorkspaceBody(BaseModel):
    name: str


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    workspace: str | None = None
    doc_ids: list[str] | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)
    stream: bool = False


def _ws_or_404(ws: str) -> str:
    if not registry.workspace_exists(ws):
        raise HTTPException(status_code=404, detail="unknown workspace")
    return ws


def _hit_to_dict(h, rank: int) -> dict:
    return {
        "chunk_id": h.chunk_id,
        "doc_id": h.doc_id,
        "filename": h.filename,
        "page": h.page,
        "heading": h.heading,
        "text": h.text,
        "score": round(float(h.score), 4),
        "cited": False,
        "id": h.chunk_id,
        "rank": rank,
        "source": h.filename,
    }


@app.get("/api/health")
def health() -> dict:
    return pipeline.health()


@app.get("/api/workspaces")
def list_workspaces() -> dict:
    registry.init_db()
    return {"workspaces": registry.list_workspaces()}


@app.post("/api/workspaces", status_code=201)
def create_workspace(body: WorkspaceBody) -> dict:
    registry.init_db()
    name = (body.name or "").strip()
    if not registry.valid_workspace_name(name):
        raise HTTPException(status_code=400, detail="invalid workspace name")
    try:
        return registry.create_workspace(name)
    except ValueError as exc:
        if "exists" in str(exc):
            raise HTTPException(status_code=409, detail="workspace exists")
        raise HTTPException(status_code=400, detail=str(exc))


@app.delete("/api/workspaces/{ws}")
def delete_workspace(ws: str) -> dict:
    _ws_or_404(ws)
    ingest.remove_workspace(ws)
    return {"deleted": ws}


@app.get("/api/workspaces/{ws}/documents")
def list_documents(ws: str) -> dict:
    _ws_or_404(ws)
    return {"workspace": ws, "documents": registry.list_documents(ws)}


@app.get("/api/workspaces/{ws}/documents/{doc_id}")
def get_document(ws: str, doc_id: str) -> dict:
    _ws_or_404(ws)
    row = registry.get_document(ws, doc_id)
    if not row:
        raise HTTPException(status_code=404, detail="unknown document")
    return row


@app.delete("/api/workspaces/{ws}/documents/{doc_id}")
def delete_document(ws: str, doc_id: str) -> dict:
    _ws_or_404(ws)
    if not registry.get_document(ws, doc_id):
        raise HTTPException(status_code=404, detail="unknown document")
    ingest.remove_document(ws, doc_id)
    return {"deleted": doc_id}


@app.get("/api/workspaces/{ws}/documents/{doc_id}/file")
def download_file(ws: str, doc_id: str):
    _ws_or_404(ws)
    row = registry.get_document(ws, doc_id)
    if not row:
        raise HTTPException(status_code=404, detail="unknown document")
    s = get_settings()
    base = (s.upload_dir / ws / doc_id).resolve()
    root = s.upload_dir.resolve()
    if root not in base.parents and base != root:
        raise HTTPException(status_code=404, detail="unknown document")
    candidates = list(base.glob("*")) if base.exists() else []
    if not candidates:
        raise HTTPException(status_code=404, detail="file missing")
    target = candidates[0].resolve()
    if root not in target.parents:
        raise HTTPException(status_code=404, detail="unknown document")
    return FileResponse(str(target), filename=row["filename"])


@app.post("/api/workspaces/{ws}/documents", status_code=202)
def upload_documents(ws: str, background_tasks: BackgroundTasks, files: list[UploadFile] = File(...)) -> dict:
    s = get_settings()
    if not registry.valid_workspace_name(ws):
        raise HTTPException(status_code=400, detail="invalid workspace name")
    registry.init_db()
    if not registry.workspace_exists(ws):
        registry.create_workspace(ws)
    out = []
    for f in files:
        try:
            chunks: list[bytes] = []
            total = 0
            too_big = False
            while True:
                piece = f.file.read(1024 * 1024)
                if not piece:
                    break
                total += len(piece)
                if total > s.max_upload_bytes:
                    too_big = True
                    break
                chunks.append(piece)
            if too_big:
                out.append({"filename": f.filename, "error": f"file too large (limit {s.max_upload_mb} MB)"})
                continue
            data = b"".join(chunks)
            row = ingest.save_upload(ws, f.filename or "file", data)
            is_new = row.get("status") == "queued"
            if is_new:
                background_tasks.add_task(ingest.ingest_document, ws, row["doc_id"])
            out.append(row)
        except ValueError as exc:
            msg = str(exc)
            if "too large" in msg:
                raise HTTPException(status_code=413, detail=msg)
            out.append({"filename": f.filename, "error": msg})
        except Exception as exc:
            out.append({"filename": getattr(f, "filename", "file"), "error": str(exc)[:200]})
        finally:
            try:
                f.file.close()
            except Exception:
                pass
    return {"workspace": ws, "documents": out}


@app.post("/api/search")
def search(req: ChatRequest) -> dict:
    s = get_settings()
    ws = req.question and (req.workspace or s.default_workspace)
    _ws_or_404(ws)
    hits = pipeline.search(req.question, ws, req.doc_ids)
    return {"question": req.question, "results": [_hit_to_dict(h, i + 1) for i, h in enumerate(hits)]}


@app.post("/api/chat")
def chat(req: ChatRequest) -> dict:
    import hashlib

    s = get_settings()
    ws = req.workspace or s.default_workspace
    _ws_or_404(ws)
    started = time.perf_counter()
    ans = pipeline.ask(req.question, ws, req.doc_ids)
    lat = int((time.perf_counter() - started) * 1000)
    qh = hashlib.sha256(req.question.encode()).hexdigest()[:12]
    log.info("chat ws=%s qhash=%s hits=%s scores=%s gated=%s guarded=%s lat=%d", ws, qh,
             [h.chunk_id for h in ans.results], [round(h.score, 3) for h in ans.results],
             ans.gated, ans.guarded, lat)
    d = ans.to_dict()
    sources = []
    for i, h in enumerate(ans.results, start=1):
        cited = i in list(ans.citations)
        e = _hit_to_dict(h, i)
        e["cited"] = cited
        sources.append(e)
    d["sources"] = sources
    return d


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/chat/stream", response_model=None)
def chat_stream(req: ChatRequest) -> StreamingResponse:
    from . import generation
    from .retrieval import parse_citations

    s = get_settings()
    ws = req.workspace or s.default_workspace
    _ws_or_404(ws)
    hits, stream = pipeline.ask_stream(req.question, ws, req.doc_ids)
    started = time.perf_counter()

    def generate() -> Iterator[str]:
        yield _sse("sources", {"sources": [_hit_to_dict(h, i + 1) for i, h in enumerate(hits)]})
        parts: list[str] = []
        for piece in stream:
            parts.append(piece)
            yield _sse("token", {"token": piece})
        text = "".join(parts).strip()
        citations = parse_citations(text)
        final = generation.guard(
            generation_answer_shim(req.question, text, hits, citations)
        )
        yield _sse("done", {
            "answer": final.text, "citations": list(final.citations),
            "abstained": final.abstained, "guarded": final.guarded,
            "guard_reasons": list(final.guard_reasons),
            "refusal_reason": final.refusal_reason,
            "latency_ms": int((time.perf_counter() - started) * 1000),
        })

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def generation_answer_shim(question, text, hits, citations):
    from .generation import is_abstention
    from .models import Answer

    return Answer(question=question, text=text, results=tuple(hits), citations=tuple(citations),
                  abstained=is_abstention(text))


@app.get("/api/sources")
def sources(workspace: str | None = None, limit: int = 100, offset: str | None = None) -> dict:
    s = get_settings()
    ws = workspace or s.default_workspace
    _ws_or_404(ws)
    records, nxt = store.scroll_workspace(ws, limit=limit, offset=offset)
    chunks = []
    for r in records:
        p = r.payload or {}
        chunks.append({
            "chunk_id": p.get("chunk_id", ""), "doc_id": p.get("doc_id", ""),
            "filename": p.get("filename", ""), "page": p.get("page"),
            "text": p.get("text", ""), "id": p.get("chunk_id", ""),
        })
    return {"workspace": ws, "total": store.count_workspace(ws), "chunks": chunks, "next_offset": str(nxt) if nxt else None}


@app.get("/api/eval/summary")
def eval_summary() -> dict:
    s = get_settings()
    path = Path(s.results_path)
    if not path.exists():
        return {"available": False, "hint": "run `python -m rag.cli eval run` first"}
    report = json.loads(path.read_text(encoding="utf-8"))
    return {"available": True, "meta": report.get("meta", {}), "config": report.get("config", {}),
            "suites": report.get("suites", {}), "summary": report.get("summary", {}),
            "configs": report.get("configs", []), "report": report}
