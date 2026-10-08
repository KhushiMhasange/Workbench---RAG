from __future__ import annotations

import re
import uuid
from functools import lru_cache

from . import embeddings
from .config import get_settings
from .models import Chunk

NAMESPACE = uuid.UUID("12345678-1234-5678-1234-567812345678")


def _client():
    from qdrant_client import QdrantClient

    s = get_settings()
    return QdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key or None)


@lru_cache(maxsize=1)
def get_client():
    return _client()


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "model"


def collection_name() -> str:
    s = get_settings()
    return f"chunks_{slug(s.embedding_model)}_{embeddings.embedding_dim()}"


def ensure_collection() -> str:
    from qdrant_client import models

    name = collection_name()
    client = get_client()
    dim = embeddings.embedding_dim()
    if not client.collection_exists(name):
        client.create_collection(
            collection_name=name,
            vectors_config={"dense": models.VectorParams(size=dim, distance=models.Distance.COSINE)},
            sparse_vectors_config={"sparse": models.SparseVectorParams(modifier=models.Modifier.IDF)},
        )
        client.create_payload_index(name, "workspace", models.PayloadSchemaType.KEYWORD)
        client.create_payload_index(name, "doc_id", models.PayloadSchemaType.KEYWORD)
    return name


def point_id(workspace: str, chunk_id: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"{workspace}/{chunk_id}"))


def upsert_chunks(workspace: str, filename: str, chunks: list[Chunk], dense, sparse) -> None:
    from qdrant_client import models

    name = ensure_collection()
    client = get_client()
    points = []
    for c, d, sp in zip(chunks, dense, sparse):
        payload = {
            "workspace": workspace,
            "doc_id": c.doc_id,
            "chunk_id": c.chunk_id,
            "filename": filename,
            "page": c.page,
            "heading": c.heading,
            "text": c.text,
            "modality": "text",
            "ordinal": c.ordinal,
        }
        points.append(
            models.PointStruct(
                id=point_id(workspace, c.chunk_id),
                vector={"dense": list(d), "sparse": sp},
                payload=payload,
            )
        )
    for i in range(0, len(points), 128):
        client.upsert(collection_name=name, points=points[i:i + 128], wait=True)


def delete_document(workspace: str, doc_id: str) -> None:
    from qdrant_client import models

    name = collection_name()
    client = get_client()
    if not client.collection_exists(name):
        return
    client.delete(
        collection_name=name,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(key="workspace", match=models.MatchValue(value=workspace)),
                    models.FieldCondition(key="doc_id", match=models.MatchValue(value=doc_id)),
                ]
            )
        ),
    )


def delete_workspace(workspace: str) -> None:
    from qdrant_client import models

    name = collection_name()
    client = get_client()
    if not client.collection_exists(name):
        return
    client.delete(
        collection_name=name,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[models.FieldCondition(key="workspace", match=models.MatchValue(value=workspace))]
            )
        ),
    )


def workspace_filter(workspace: str, doc_ids: list[str] | None = None):
    from qdrant_client import models

    must = [models.FieldCondition(key="workspace", match=models.MatchValue(value=workspace))]
    if doc_ids:
        must.append(models.FieldCondition(key="doc_id", match=models.MatchAny(any=doc_ids)))
    return models.Filter(must=must)


def query_hybrid(dense_q, sparse_q, flt, candidates: int):
    from qdrant_client import models

    name = collection_name()
    client = get_client()
    return client.query_points(
        collection_name=name,
        prefetch=[
            models.Prefetch(query=dense_q, using="dense", limit=candidates, filter=flt),
            models.Prefetch(query=sparse_q, using="sparse", limit=candidates, filter=flt),
        ],
        query=models.FusionQuery(fusion=models.Fusion.RRF),
        limit=candidates,
        with_payload=True,
        with_vectors=["dense"],
    ).points


def query_dense(dense_q, flt, candidates: int):
    name = collection_name()
    client = get_client()
    return client.query_points(
        collection_name=name,
        query=dense_q,
        using="dense",
        limit=candidates,
        query_filter=flt,
        with_payload=True,
        with_vectors=["dense"],
    ).points


def scroll_workspace(workspace: str, limit: int = 100, offset=None):
    name = collection_name()
    client = get_client()
    if not client.collection_exists(name):
        return [], None
    records, nxt = client.scroll(
        collection_name=name,
        scroll_filter=workspace_filter(workspace),
        limit=limit,
        offset=offset,
        with_payload=True,
    )
    return records, nxt


def count_workspace(workspace: str) -> int:
    name = collection_name()
    client = get_client()
    if not client.collection_exists(name):
        return 0
    res = client.count(collection_name=name, count_filter=workspace_filter(workspace))
    return res.count
