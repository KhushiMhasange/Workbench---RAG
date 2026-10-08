from __future__ import annotations

import json
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from .config import get_settings


@dataclass(frozen=True)
class Case:
    id: str
    question: str
    suite: str = "eval-cats"
    answerable: bool = True
    gold: tuple = ()
    must_contain: tuple = ()


def load_cases(path: Path | str | None = None) -> list[Case]:
    p = Path(path) if path else Path(__file__).resolve().parent.parent / "eval" / "cases.json"
    raw = json.loads(p.read_text(encoding="utf-8"))
    out = []
    for c in raw.get("cases", []):
        out.append(Case(
            id=c["id"], question=c["question"], suite=c.get("suite", "eval-cats"),
            answerable=c.get("answerable", True),
            gold=tuple((g.get("file", ""), g.get("anchor", "")) for g in c.get("gold", [])),
            must_contain=tuple(c.get("must_contain", [])),
        ))
    return out


def _norm(t: str) -> str:
    return " ".join(t.casefold().split())


def is_relevant(hit, gold_file: str, anchor: str) -> bool:
    if getattr(hit, "filename", "") != gold_file:
        return False
    return _norm(anchor) in _norm(getattr(hit, "text", ""))


def case_hits(case: Case, hits) -> list[bool]:
    rel = []
    for h in hits:
        ok = any(is_relevant(h, f, a) for f, a in case.gold)
        rel.append(ok)
    return rel


def retrieval_scores(case: Case, hits, k: int) -> dict:
    rel = case_hits(case, hits[:k])
    hit = 1.0 if any(rel) else 0.0
    first = next((i + 1 for i, r in enumerate(rel) if r), None)
    mrr = 1.0 / first if first else 0.0
    recall = (sum(rel) / len(case.gold)) if case.gold else (1.0 if hit else 0.0)
    hit1 = 1.0 if rel and rel[0] else 0.0
    return {"hit": hit, "mrr": mrr, "recall": min(1.0, recall), "hit@1": hit1,
            "first_rank": first, "top_score": round(hits[0].score, 4) if hits else 0.0}


def _pct(vals: list[float]) -> float:
    return round(statistics.fmean(vals), 4) if vals else 0.0


def summarize_suite(rows: list[dict], cases: list[Case]) -> dict:
    ans = [r for r, c in zip(rows, cases) if c.answerable]
    un = [r for r, c in zip(rows, cases) if not c.answerable]
    answered = [r for r, c in zip(rows, cases) if c.answerable and not r["abstained"]]
    refused_ans = sum(1 for r, c in zip(rows, cases) if c.answerable and r["abstained"])
    refused_un = sum(1 for r, c in zip(rows, cases) if not c.answerable and r["abstained"])
    refused_all = sum(1 for r in rows if r["abstained"])
    prec = (refused_un / refused_all) if refused_all else 1.0
    rec = (refused_un / len(un)) if un else 1.0
    valid_cite = []
    for r in rows:
        hits = r.get("hits", [])
        cites = r.get("citations", [])
        valid_cite.append(1.0 if all(1 <= c <= len(hits) for c in cites) else 0.0)
    faith = [r.get("claim_support", 1.0) for r in rows if not r["abstained"]]
    lat = sorted(r.get("latency_ms", 0) for r in rows)
    by_stage: dict[str, int] = {}
    for r in rows:
        if r["abstained"]:
            by_stage[r.get("refusal_reason") or "unknown"] = by_stage.get(r.get("refusal_reason") or "unknown", 0) + 1
    return {
        "n": len(rows),
        "recall@k": _pct([r["recall"] for r in rows if next((c for c in cases if c.id == r["id"]), None) and next(c for c in cases if c.id == r["id"]).answerable]),
        "mrr": _pct([r["mrr"] for r, c in zip(rows, cases) if c.answerable]),
        "hit@1": _pct([r["hit@1"] for r, c in zip(rows, cases) if c.answerable]),
        "hit@k": _pct([r["hit"] for r, c in zip(rows, cases) if c.answerable]),
        "false_refusal_rate": round(refused_ans / len(ans), 4) if ans else 0.0,
        "abstain_precision": round(prec, 4),
        "abstain_recall": round(rec, 4),
        "citation_validity": _pct(valid_cite),
        "faithfulness": _pct(faith),
        "refusals_by_stage": by_stage,
        "latency_p50": lat[len(lat) // 2] if lat else 0,
        "latency_p95": lat[int(len(lat) * 0.95) - 1] if lat else 0,
    }


def run_suite(suite: str, cases: list[Case] | None = None) -> dict:
    from . import ingest, pipeline, registry
    from .groundedness import analyze

    s = get_settings()
    all_cases = cases or load_cases()
    suite_cases = [c for c in all_cases if c.suite == suite]
    ws = suite
    try:
        ingest.remove_workspace(ws)
    except Exception:
        pass
    registry.init_db()
    if not registry.workspace_exists(ws):
        registry.create_workspace(ws)
    import json as _json

    suites = _json.loads((Path(__file__).resolve().parent.parent / "eval" / "suites.json").read_text())
    for rel in suites.get(suite, []):
        ingest.ingest_file(ws, Path(__file__).resolve().parent.parent / "eval" / rel)
    rows = []
    for case in suite_cases:
        t0 = time.perf_counter()
        ans = pipeline.ask(case.question, ws)
        lat = int((time.perf_counter() - t0) * 1000)
        hits = list(ans.results)
        sc = retrieval_scores(case, hits, s.top_k)
        rep = analyze(ans).to_dict()
        rows.append({
            "id": case.id, "question": case.question, "answerable": case.answerable,
            "hits": [{"filename": h.filename, "text": h.text, "score": h.score} for h in hits],
            "citations": list(ans.citations), "abstained": ans.abstained,
            "refusal_reason": ans.refusal_reason, "latency_ms": lat,
            "claim_support": rep["claim_support_rate"], **sc,
        })
    summary = summarize_suite(rows, suite_cases)
    try:
        ingest.remove_workspace(ws)
    except Exception:
        pass
    return {"suite": suite, "summary": summary, "cases": rows}


def cli_run(suite: str | None = None) -> int:
    s = get_settings()
    cases = load_cases()
    suites = [suite] if suite else sorted({c.suite for c in cases})
    out_suites = {}
    all_rows, all_cases = [], []
    for su in suites:
        print(f"[{su}] running...", flush=True)
        res = run_suite(su, cases)
        out_suites[su] = res["summary"]
        all_rows.extend(res["cases"])
        all_cases.extend([c for c in cases if c.suite == su])
        print(f"  recall={res['summary']['recall@k']:.3f} abst_rec={res['summary']['abstain_recall']:.3f}", flush=True)
    overall = summarize_suite(all_rows, all_cases)
    report = {
        "meta": {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "suites": suites},
        "config": {"embedding_model": s.embedding_model, "language_model": s.language_model,
                   "hybrid": s.hybrid, "min_score": s.min_score, "abstain_score": s.abstain_score,
                   "top_k": s.top_k, "candidates": s.candidates, "chunk_chars": s.chunk_chars,
                   "chunk_overlap": s.chunk_overlap, "timestamp": time.time()},
        "suites": out_suites, "summary": overall,
        "configs": [{"config": k, "summary": v} for k, v in out_suites.items()],
    }
    p = Path(s.results_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"wrote {p}")
    return 0


def cli_calibrate() -> int:
    from . import ingest, pipeline, registry

    s = get_settings()
    cases = load_cases()
    ws = "eval-cal"
    try:
        ingest.remove_workspace(ws)
    except Exception:
        pass
    registry.init_db()
    if not registry.workspace_exists(ws):
        registry.create_workspace(ws)
    import json as _json
    suites = _json.loads((Path(__file__).resolve().parent.parent / "eval" / "suites.json").read_text())
    for su, files in suites.items():
        for rel in files:
            try:
                ingest.ingest_file(ws, Path(__file__).resolve().parent.parent / "eval" / rel)
            except Exception:
                pass
    cached = []
    for case in cases:
        hits = pipeline.search(case.question, ws)
        cached.append((case, hits))
    best = None
    ms = [round(x / 100, 2) for x in range(20, 61, 5)]
    ab = [round(x / 100, 2) for x in range(25, 71, 5)]
    for m in ms:
        for a in ab:
            fa = fr = 0
            na = nu = 0
            for case, hits in cached:
                kept = [h for h in hits if h.score >= m]
                best_score = max([h.score for h in kept], default=0.0)
                refused = (not kept) or (best_score < a)
                if case.answerable:
                    na += 1
                    fa += 1 if refused else 0
                else:
                    nu += 1
                    fr += 0 if refused else 1
            frr = fa / na if na else 0
            arec = 1 - (fr / nu) if nu else 1.0
            if frr <= 0.10 and (best is None or arec > best[2]):
                best = (m, a, arec, frr)
    try:
        ingest.remove_workspace(ws)
    except Exception:
        pass
    if best:
        print(f"best min_score={best[0]} abstain_score={best[1]} abstain_recall={best[2]:.3f} false_refusal={best[3]:.3f}")
    else:
        print("no pair satisfies false_refusal_rate <= 0.10")
    return 0


def cli_check() -> int:
    s = get_settings()
    p = Path(s.results_path)
    t = Path(__file__).resolve().parent.parent / "eval" / "thresholds.json"
    if not p.exists():
        print(f"no results at {p}")
        return 2
    if not t.exists():
        print(f"no thresholds at {t}")
        return 2
    report = json.loads(p.read_text())
    thresh = json.loads(t.read_text())
    summ = report.get("summary", {})
    bad = []
    for k, v in thresh.items():
        actual = summ.get(k)
        if actual is None:
            continue
        if k in ("false_refusal_rate",):
            if actual > v:
                bad.append(f"{k}: {actual} > max {v}")
        else:
            if actual < v:
                bad.append(f"{k}: {actual} < min {v}")
    if bad:
        print("REGRESSION:")
        for b in bad:
            print(" -", b)
        return 1
    print("eval check passed")
    return 0
