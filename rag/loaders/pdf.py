from pathlib import Path

from pypdf import PdfReader

from ..models import Section


def load_pdf(path: Path) -> list[Section]:
    reader = PdfReader(str(path))
    if reader.is_encrypted:
        raise ValueError("PDF is password protected")
    sections: list[Section] = []
    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        if text.strip():
            sections.append(Section(text=text.strip(), page=i + 1))
    if not sections:
        raise ValueError("no extractable text (scanned PDF?), OCR is not supported yet")
    return sections
