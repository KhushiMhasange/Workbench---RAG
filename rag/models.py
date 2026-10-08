from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Section:
    text: str
    page: int | None = None
    heading: str | None = None


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    doc_id: str
    ordinal: int
    text: str
    page: int | None = None
    heading: str | None = None


@dataclass(frozen=True)
class Hit:
    chunk_id: str
    doc_id: str
    filename: str
    page: int | None
    heading: str | None
    text: str
    score: float
    vector: list[float] | None = None


@dataclass(frozen=True)
class Answer:
    question: str
    text: str
    results: tuple = ()
    citations: tuple = ()
    abstained: bool = False
    gated: bool = False
    guarded: bool = False
    guard_reasons: tuple = ()
    latency_ms: int = 0
    mode: str = "rag"
    relevance: float = 1.0
    refusal_reason: str | None = None

    def to_dict(self) -> dict:
        return {
            "question": self.question,
            "answer": self.text,
            "citations": list(self.citations),
            "abstained": self.abstained,
            "gated": self.gated,
            "guarded": self.guarded,
            "guard_reasons": list(self.guard_reasons),
            "latency_ms": self.latency_ms,
            "mode": self.mode,
            "relevance": self.relevance,
            "refused": self.abstained,
            "refusal_reason": self.refusal_reason,
            "sources": [
                {
                    "chunk_id": getattr(r, "chunk_id", getattr(r, "id", "")),
                    "doc_id": getattr(r, "doc_id", ""),
                    "filename": getattr(r, "filename", getattr(r, "source", "")),
                    "page": getattr(r, "page", None),
                    "heading": getattr(r, "heading", None),
                    "text": getattr(r, "text", ""),
                    "score": round(float(getattr(r, "score", 0.0)), 4),
                    "cited": (getattr(r, "rank", None) in list(self.citations))
                    if hasattr(r, "rank") else False,
                    "id": getattr(r, "chunk_id", getattr(r, "id", "")),
                    "rank": getattr(r, "rank", 0),
                    "source": getattr(r, "filename", getattr(r, "source", "")),
                }
                for r in self.results
            ],
        }
