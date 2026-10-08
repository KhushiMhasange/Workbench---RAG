import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from rag.evaluate import Case, case_hits, is_relevant, load_cases, retrieval_scores
from rag.groundedness import analyze
from rag.models import Hit


def _hit(filename, text, score=0.9):
    return Hit(chunk_id="d:c0001", doc_id="d", filename=filename, page=None, heading=None, text=text, score=score)


def test_anchors_exist():
    cases = load_cases()
    assert len(cases) >= 20
    for case in cases:
        for fname, anchor in case.gold:
            target = None
            for cand in (ROOT / "eval" / "fixtures" / fname, ROOT / "eval" / fname):
                if cand.exists():
                    target = cand
                    break
            assert target is not None, f"{case.id} missing file {fname}"
            if target.suffix == ".txt" or target.suffix == ".csv":
                content = target.read_text(encoding="utf-8", errors="ignore")
                norm = lambda t: " ".join(t.casefold().split())
                assert norm(anchor) in norm(content), f"{case.id} anchor missing in {fname}"


def test_relevance():
    h = _hit("pricing.csv", "SKU WDG-1001 price 49")
    assert is_relevant(h, "pricing.csv", "WDG-1001")
    assert not is_relevant(h, "other.csv", "WDG-1001")
    assert not is_relevant(h, "pricing.csv", "missing")


def test_scores():
    case = Case(id="x", question="q", suite="s", answerable=True, gold=(("f.txt", "alpha"),))
    hits = [_hit("f.txt", "nothing"), _hit("f.txt", "has alpha here")]
    s = retrieval_scores(case, hits, 2)
    assert s["hit"] == 1.0 and s["first_rank"] == 2 and s["mrr"] == 0.5


def test_groundedness_rules():
    from rag.models import Answer

    good = Answer(question="q", text="It costs 49 [1]", results=(_hit("f", "price 49"),), citations=(1,))
    assert analyze(good).claim_support_rate == 1.0
    bad = Answer(question="q", text="It costs 80 [1]", results=(_hit("f", "price 49"),), citations=(1,))
    assert analyze(bad).claim_support_rate == 0.0
    init_cap = Answer(question="q", text="Cats are nice [1]", results=(_hit("f", "cats are nice"),), citations=(1,))
    assert analyze(init_cap).claim_support_rate == 1.0
    thousand = Answer(question="q", text="Price 1,000 [1]", results=(_hit("f", "price 1000"),), citations=(1,))
    assert analyze(thousand).claim_support_rate == 1.0
