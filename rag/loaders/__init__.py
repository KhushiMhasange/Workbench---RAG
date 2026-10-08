from __future__ import annotations

import re
import zipfile
from pathlib import Path

from ..models import Section
from .csv import load_csv
from .docx import load_docx
from .markdown import load_markdown
from .pdf import load_pdf
from .text import load_text

_SANITISE_RE = re.compile(r"[^A-Za-z0-9._-]")


def sanitise_filename(name: str) -> str:
    base = Path(name or "").name or "file"
    base = _SANITISE_RE.sub("_", base).strip()
    if not base or base.startswith("."):
        base = "_" + base.lstrip(".") or "file"
    if len(base) > 100:
        stem, dot, ext = base[:100].rpartition(".")
        base = base[:100]
    if not base.strip("._-"):
        base = "file"
    return base[:100]


def detect_type(path: Path) -> str:
    data = path.read_bytes()[:8192]
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(path) as z:
                if "word/document.xml" in z.namelist():
                    return "docx"
        except Exception:
            pass
    try:
        path.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("unsupported file type")
    ext = path.suffix.lower()
    if ext == ".pdf":
        return "pdf"
    if ext == ".docx":
        return "docx"
    if ext in (".md", ".markdown"):
        return "md"
    if ext == ".csv":
        return "csv"
    if ext in (".txt", ".text", ""):
        return "txt"
    raise ValueError("unsupported file type")


def load(path: Path) -> tuple[str, list[Section]]:
    kind = detect_type(path)
    if kind == "pdf":
        return kind, load_pdf(path)
    if kind == "docx":
        return kind, load_docx(path)
    if kind == "md":
        return kind, load_markdown(path)
    if kind == "csv":
        return kind, load_csv(path)
    raw = path.read_bytes().decode("utf-8")
    if raw.count("\ufffd") > max(1, len(raw) // 100):
        raise ValueError("not a text file")
    return "txt", load_text(path)
