from __future__ import annotations

import re
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import get_settings

_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")
_TERMINAL = ("ready", "failed")


def valid_workspace_name(name: str) -> bool:
    return bool(_NAME_RE.match(name or ""))


def _db_path(db_path: Path | str | None) -> Path:
    if db_path is not None:
        return Path(db_path)
    return get_settings().db_path


@contextmanager
def db(db_path: Path | str | None = None) -> Iterator[sqlite3.Connection]:
    path = _db_path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: Path | str | None = None) -> None:
    with db(db_path) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS workspaces (name TEXT PRIMARY KEY, created_at REAL)"
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS documents (
                workspace TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                mime TEXT DEFAULT '',
                size_bytes INTEGER DEFAULT 0,
                sha256 TEXT DEFAULT '',
                status TEXT DEFAULT 'queued',
                error TEXT DEFAULT '',
                pages INTEGER DEFAULT 0,
                chunks INTEGER DEFAULT 0,
                embedding_model TEXT DEFAULT '',
                created_at REAL,
                updated_at REAL,
                PRIMARY KEY (workspace, doc_id),
                FOREIGN KEY (workspace) REFERENCES workspaces(name) ON DELETE CASCADE
            )"""
        )
        now = time.time()
        conn.execute(
            "INSERT OR IGNORE INTO workspaces (name, created_at) VALUES (?, ?)",
            (get_settings().default_workspace, now),
        )


def workspace_exists(workspace: str, db_path: Path | str | None = None) -> bool:
    with db(db_path) as conn:
        row = conn.execute(
            "SELECT 1 FROM workspaces WHERE name=?", (workspace,)
        ).fetchone()
        return row is not None


def create_workspace(name: str, db_path: Path | str | None = None) -> dict:
    if not valid_workspace_name(name):
        raise ValueError("invalid workspace name")
    with db(db_path) as conn:
        exists = conn.execute(
            "SELECT 1 FROM workspaces WHERE name=?", (name,)
        ).fetchone()
        if exists:
            raise ValueError("workspace exists")
        now = time.time()
        conn.execute(
            "INSERT INTO workspaces (name, created_at) VALUES (?, ?)", (name, now)
        )
        return {"name": name, "created_at": now, "documents": 0}


def list_workspaces(db_path: Path | str | None = None) -> list[dict]:
    with db(db_path) as conn:
        rows = conn.execute("SELECT name, created_at FROM workspaces").fetchall()
        out = []
        for r in rows:
            if r["name"].startswith("eval-"):
                continue
            n = conn.execute(
                "SELECT COUNT(*) AS c FROM documents WHERE workspace=?", (r["name"],)
            ).fetchone()["c"]
            out.append(
                {"name": r["name"], "created_at": r["created_at"], "documents": n}
            )
        out.sort(key=lambda d: d["name"])
        return out


def delete_workspace_row(workspace: str, db_path: Path | str | None = None) -> None:
    with db(db_path) as conn:
        conn.execute("DELETE FROM documents WHERE workspace=?", (workspace,))
        conn.execute("DELETE FROM workspaces WHERE name=?", (workspace,))


def insert_document(row: dict, db_path: Path | str | None = None) -> dict:
    now = time.time()
    with db(db_path) as conn:
        conn.execute(
            """INSERT OR REPLACE INTO documents
            (workspace, doc_id, filename, mime, size_bytes, sha256, status, error,
             pages, chunks, embedding_model, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                row["workspace"],
                row["doc_id"],
                row["filename"],
                row.get("mime", ""),
                row.get("size_bytes", 0),
                row.get("sha256", ""),
                row.get("status", "queued"),
                row.get("error", ""),
                row.get("pages", 0),
                row.get("chunks", 0),
                row.get("embedding_model", ""),
                row.get("created_at", now),
                now,
            ),
        )
        cur = conn.execute(
            "SELECT * FROM documents WHERE workspace=? AND doc_id=?",
            (row["workspace"], row["doc_id"]),
        ).fetchone()
        return dict(cur) if cur else dict(row)


def get_document(
    workspace: str, doc_id: str, db_path: Path | str | None = None
) -> dict | None:
    with db(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM documents WHERE workspace=? AND doc_id=?",
            (workspace, doc_id),
        ).fetchone()
        return dict(row) if row else None


def list_documents(workspace: str, db_path: Path | str | None = None) -> list[dict]:
    with db(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM documents WHERE workspace=? ORDER BY created_at",
            (workspace,),
        ).fetchall()
        return [dict(r) for r in rows]


def update_status(
    workspace: str,
    doc_id: str,
    status: str,
    error: str | None = None,
    db_path: Path | str | None = None,
    **fields,
) -> dict | None:
    with db(db_path) as conn:
        sets = ["status=?", "updated_at=?"]
        vals: list = [status, time.time()]
        if error is not None:
            sets.append("error=?")
            vals.append(error)
        for k, v in fields.items():
            if k in ("pages", "chunks", "embedding_model", "filename", "mime",
                     "size_bytes", "sha256"):
                sets.append(f"{k}=?")
                vals.append(v)
        vals.extend([workspace, doc_id])
        conn.execute(
            f"UPDATE documents SET {', '.join(sets)} WHERE workspace=? AND doc_id=?",
            vals,
        )
        row = conn.execute(
            "SELECT * FROM documents WHERE workspace=? AND doc_id=?",
            (workspace, doc_id),
        ).fetchone()
        return dict(row) if row else None


def delete_document_row(
    workspace: str, doc_id: str, db_path: Path | str | None = None
) -> None:
    with db(db_path) as conn:
        conn.execute(
            "DELETE FROM documents WHERE workspace=? AND doc_id=?",
            (workspace, doc_id),
        )


def find_by_hash(
    workspace: str, sha256: str, db_path: Path | str | None = None
) -> dict | None:
    with db(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM documents WHERE workspace=? AND sha256=?",
            (workspace, sha256),
        ).fetchone()
        return dict(row) if row else None


def fail_unfinished(db_path: Path | str | None = None) -> int:
    with db(db_path) as conn:
        cur = conn.execute(
            "UPDATE documents SET status='failed', error='interrupted', updated_at=? "
            "WHERE status IN ('queued','parsing','embedding')",
            (time.time(),),
        )
        return cur.rowcount
