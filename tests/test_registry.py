import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from rag import registry


def _row(ws="default", doc="abc123"):
    return {
        "workspace": ws,
        "doc_id": doc,
        "filename": "a.txt",
        "mime": "text/plain",
        "size_bytes": 10,
        "sha256": "deadbeef",
        "status": "queued",
    }


def test_workspace_crud(tmp_path):
    db = tmp_path / "t.db"
    registry.init_db(db)
    assert registry.workspace_exists("default", db)
    registry.create_workspace("my-ws_1", db)
    assert registry.workspace_exists("my-ws_1", db)
    names = [w["name"] for w in registry.list_workspaces(db)]
    assert "my-ws_1" in names and "default" in names
    registry.delete_workspace_row("my-ws_1", db)
    assert not registry.workspace_exists("my-ws_1", db)


def test_workspace_validation(tmp_path):
    db = tmp_path / "t.db"
    registry.init_db(db)
    assert registry.valid_workspace_name("abc")
    assert registry.valid_workspace_name("a0-_1234567890")
    assert not registry.valid_workspace_name("")
    assert not registry.valid_workspace_name("UPPER")
    assert not registry.valid_workspace_name(".hidden")
    assert not registry.valid_workspace_name("a" * 41)
    try:
        registry.create_workspace("BAD", db)
        assert False, "should raise"
    except ValueError:
        pass
    registry.create_workspace("dup", db)
    try:
        registry.create_workspace("dup", db)
        assert False, "duplicate should raise"
    except ValueError:
        pass


def test_eval_workspaces_hidden(tmp_path):
    db = tmp_path / "t.db"
    registry.init_db(db)
    registry.create_workspace("eval-cats", db)
    names = [w["name"] for w in registry.list_workspaces(db)]
    assert "eval-cats" not in names
    assert registry.workspace_exists("eval-cats", db)


def test_document_crud(tmp_path):
    db = tmp_path / "t.db"
    registry.init_db(db)
    r = registry.insert_document(_row(), db)
    assert r["status"] == "queued"
    assert registry.get_document("default", "abc123", db)["filename"] == "a.txt"
    assert registry.find_by_hash("default", "deadbeef", db)["doc_id"] == "abc123"
    registry.update_status("default", "abc123", "ready", db_path=db, chunks=5, pages=1)
    got = registry.get_document("default", "abc123", db)
    assert got["status"] == "ready" and got["chunks"] == 5
    assert len(registry.list_documents("default", db)) == 1
    registry.delete_document_row("default", "abc123", db)
    assert registry.get_document("default", "abc123", db) is None


def test_fail_unfinished(tmp_path):
    db = tmp_path / "t.db"
    registry.init_db(db)
    registry.insert_document(_row(doc="d1"), db)
    registry.insert_document({**_row(doc="d2"), "sha256": "h2"}, db)
    registry.update_status("default", "d1", "parsing", db_path=db)
    registry.update_status("default", "d2", "ready", db_path=db)
    n = registry.fail_unfinished(db)
    assert n >= 1
    assert registry.get_document("default", "d1", db)["status"] == "failed"
    assert registry.get_document("default", "d1", db)["error"] == "interrupted"
    assert registry.get_document("default", "d2", db)["status"] == "ready"
