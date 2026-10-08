# RAG Workspaces

Multi-document RAG with workspaces, uploads (PDF, TXT, MD, DOCX, CSV), Qdrant hybrid retrieval, and an eval harness. See `docs/ARCHITECTURE.md` for design and env var table.

## Prerequisites

- Docker (for Qdrant), Ollama on host, Python 3.10+, Node 20+
- Pull models: `ollama pull bge-m3` (1024-d) and `ollama pull hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF`

## Run

```bash
docker compose up -d
pip install -r requirements.txt
python -m rag.cli ingest eval/fixtures/cat.txt --workspace default
python -m rag.cli serve  # API :8000
cd web && npm install && npm run dev  # UI :3000
```

Env vars: see `docs/ARCHITECTURE.md` configuration table. All `RAG_*` plus `OLLAMA_HOST`.

## Tests and eval

```bash
./venv/bin/python -m pytest -q -m "not integration"
./venv/bin/python -m pytest tests/test_api.py tests/test_ingest_store.py -q
python -m rag.cli eval run [--suite eval-cats]
python -m rag.cli eval calibrate
python -m rag.cli eval check
```

## Change models

- Embedding: set `RAG_EMBEDDING_MODEL`, then `python -m rag.cli reindex` (fills new `chunks_<model>_<dim>` collection, old untouched).
- Language: set `RAG_LANGUAGE_MODEL`, rerun eval.


