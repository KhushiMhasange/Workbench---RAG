import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from rag.chunking import chunk_sections
from rag.config import Settings
from rag.loaders import load
from rag.models import Section

SETTINGS = Settings(chunk_chars=700, chunk_overlap=120)


def test_line_mode_cat():
    kind, sections = load(ROOT / "eval" / "fixtures" / "cat.txt")
    assert kind == "txt"
    chunks = chunk_sections("abc123", sections, kind, SETTINGS)
    assert len(chunks) == 150
    assert chunks[0].chunk_id == "abc123:c0001"
    assert chunks[-1].ordinal == 150


def test_packing_respects_budget():
    secs = [Section(text="word " * 500 + "\n\nshort para here.")]
    chunks = chunk_sections("d1", secs, "md", SETTINGS)
    for c in chunks:
        assert len(c.text) <= 700 + 120
    assert chunks


def test_stable_ids():
    secs = [Section(text="hello world. " * 100)]
    a = chunk_sections("d1", secs, "md", SETTINGS)
    b = chunk_sections("d1", secs, "md", SETTINGS)
    assert [c.chunk_id for c in a] == [c.chunk_id for c in b]


def test_no_span_sections():
    secs = [Section(text="aaa " * 200, page=1), Section(text="bbb " * 200, page=2)]
    chunks = chunk_sections("d1", secs, "md", SETTINGS)
    assert {c.page for c in chunks} <= {1, 2}
    for c in chunks:
        assert c.page in (1, 2)
