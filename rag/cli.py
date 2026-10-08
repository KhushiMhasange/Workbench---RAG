from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import get_settings
from .groundedness import analyze


def cmd_health(args) -> int:
    from . import pipeline

    print(json.dumps(pipeline.health(), indent=2))
    h = pipeline.health()
    return 0 if h["ollama"] else 1


def cmd_ingest(args) -> int:
    from . import ingest, registry

    s = get_settings()
    registry.init_db()
    ws = args.workspace or s.default_workspace
    if not registry.workspace_exists(ws):
        registry.create_workspace(ws)
    row = ingest.ingest_file(ws, args.path)
    print(json.dumps(row, indent=2, default=str))
    return 0 if row and row.get("status") == "ready" else 1


def cmd_search(args) -> int:
    from . import pipeline

    s = get_settings()
    hits = pipeline.search(args.query, args.workspace or s.default_workspace, args.doc_ids)
    if not hits:
        print("no passages above the similarity floor")
    for i, h in enumerate(hits, start=1):
        print(f"\n[{i}] {h.chunk_id} ({h.filename}" + (f" p.{h.page}" if h.page else "") + f") score={h.score:.4f}")
        print(f"    {h.text[:300]}")
    return 0


def cmd_ask(args) -> int:
    from . import pipeline

    s = get_settings()
    ans = pipeline.ask(args.question, args.workspace or s.default_workspace, args.doc_ids)
    report = analyze(ans)
    print(f"Q: {ans.question}")
    print(f"A: {ans.text}\n")
    print("sources:")
    for i, h in enumerate(ans.results, start=1):
        marker = "*" if i in ans.citations else " "
        print(f" {marker}[{i}] {h.chunk_id} ({h.score:.3f}) {h.text[:110]}")
    print(f"\nclaim_support={report.claim_support_rate:.2f} citation_coverage={report.citation_coverage:.2f} abstained={ans.abstained} refusal={ans.refusal_reason} latency={ans.latency_ms}ms")
    return 0


def cmd_serve(args) -> int:
    import uvicorn

    uvicorn.run("rag.api:app", host=args.host, port=args.port, reload=args.reload, log_level=args.log_level)
    return 0


def cmd_reindex(args) -> int:
    from . import ingest

    rows = ingest.reindex(args.workspace)
    print(f"reindexed {len(rows)} documents")
    return 0


def cmd_workspaces(args) -> int:
    from . import registry

    registry.init_db()
    for w in registry.list_workspaces():
        print(f"{w['name']} ({w['documents']} docs)")
    return 0


def cmd_docs(args) -> int:
    from . import registry

    s = get_settings()
    ws = args.workspace or s.default_workspace
    for d in registry.list_documents(ws):
        print(f"{d['doc_id']} {d['filename']} {d['status']} chunks={d['chunks']} pages={d['pages']} {d.get('error','')}")
    return 0


def cmd_eval(args) -> int:
    from . import evaluate

    if args.eval_cmd == "run":
        return evaluate.cli_run(args.suite)
    if args.eval_cmd == "calibrate":
        return evaluate.cli_calibrate()
    if args.eval_cmd == "check":
        return evaluate.cli_check()
    print("unknown eval command")
    return 2


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="rag")
    sub = ap.add_subparsers(dest="command", required=True)

    sub.add_parser("health").set_defaults(func=cmd_health)

    p = sub.add_parser("ingest")
    p.add_argument("path", type=Path)
    p.add_argument("--workspace", default=None)
    p.set_defaults(func=cmd_ingest)

    p = sub.add_parser("search")
    p.add_argument("query")
    p.add_argument("--workspace", default=None)
    p.add_argument("--doc-ids", nargs="*", default=None, dest="doc_ids")
    p.set_defaults(func=cmd_search)

    p = sub.add_parser("ask")
    p.add_argument("question")
    p.add_argument("--workspace", default=None)
    p.add_argument("--doc-ids", nargs="*", default=None, dest="doc_ids")
    p.set_defaults(func=cmd_ask)

    p = sub.add_parser("serve")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--reload", action="store_true")
    p.add_argument("--log-level", default="info")
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser("reindex")
    p.add_argument("--workspace", default=None)
    p.set_defaults(func=cmd_reindex)

    sub.add_parser("workspaces").set_defaults(func=cmd_workspaces)

    p = sub.add_parser("docs")
    p.add_argument("--workspace", default=None)
    p.set_defaults(func=cmd_docs)

    p = sub.add_parser("eval")
    p.add_argument("eval_cmd", choices=["run", "calibrate", "check"])
    p.add_argument("--suite", default=None)
    p.set_defaults(func=cmd_eval)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
