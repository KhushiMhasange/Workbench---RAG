from pathlib import Path

from ..models import Section


def load_text(path: Path) -> list[Section]:
    raw = path.read_bytes().decode("utf-8")
    if raw.count("\ufffd") > max(1, len(raw) // 100):
        raise ValueError("not a text file")
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    return [Section(text=text)]
