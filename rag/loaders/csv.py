import csv
from pathlib import Path

from ..models import Section


def load_csv(path: Path) -> list[Section]:
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = [r for r in reader if any(c.strip() for c in r)]
    if not rows:
        return []
    header = rows[0]
    body = rows[1:] if len(rows) > 1 else []
    sections: list[Section] = []
    buf: list[str] = []
    for row in body:
        line = "; ".join(f"{h}={v.strip()}" for h, v in zip(header, row))
        buf.append(line)
        if len(buf) >= 50:
            sections.append(Section(text="\n".join(buf)))
            buf = []
    if buf:
        sections.append(Section(text="\n".join(buf)))
    if not sections and header:
        sections.append(Section(text="; ".join(header)))
    return [s for s in sections if s.text.strip()]
