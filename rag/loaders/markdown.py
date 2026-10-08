from pathlib import Path

from ..models import Section


def load_markdown(path: Path) -> list[Section]:
    raw = path.read_bytes().decode("utf-8").replace("\r\n", "\n")
    sections: list[Section] = []
    buf: list[str] = []
    heading: str | None = None
    for line in raw.split("\n"):
        s = line.strip()
        if s.startswith("#"):
            if buf and any(b.strip() for b in buf):
                sections.append(Section(text="\n".join(buf).strip(), heading=heading))
            heading = s.lstrip("#").strip() or None
            buf = []
        else:
            buf.append(line)
    if buf and any(b.strip() for b in buf):
        sections.append(Section(text="\n".join(buf).strip(), heading=heading))
    if not sections:
        sections.append(Section(text=raw.strip(), heading=heading))
    return [s for s in sections if s.text.strip()]
