"""
src/api/rag_engine.py
RAG engine — local embeddings via sentence-transformers + cosine similarity search.

Model: all-MiniLM-L6-v2 (~90MB, loaded once at startup)
Vectors stored as BLOB (numpy float32 array serialized via tobytes/frombuffer)
"""

from __future__ import annotations
import logging
import struct
from typing import Optional

import numpy as np

logger = logging.getLogger("journal")

_MODEL = None
MODEL_NAME = "all-MiniLM-L6-v2"


def _get_model():
    global _MODEL
    if _MODEL is None:
        logger.info("[rag] Loading sentence-transformer model...")
        from sentence_transformers import SentenceTransformer
        _MODEL = SentenceTransformer(MODEL_NAME)
        logger.info("[rag] Model loaded.")
    return _MODEL


def embed_text(text: str) -> np.ndarray:
    """Return a normalized float32 embedding vector for the given text."""
    model = _get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return vec.astype(np.float32)


def vec_to_blob(vec: np.ndarray) -> bytes:
    return vec.tobytes()


def blob_to_vec(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Dot product of two normalized vectors = cosine similarity."""
    return float(np.dot(a, b))


# ── DB helpers ────────────────────────────────────────────────────────────────

def store_embedding(entry_id: int, user_id: int, text: str) -> None:
    """Embed text and upsert into entry_embeddings."""
    from src.auth.auth_db import get_db
    vec = embed_text(text)
    blob = vec_to_blob(vec)
    conn = get_db()
    conn.execute(
        """
        INSERT INTO entry_embeddings (entry_id, user_id, vector, model_name)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(entry_id) DO UPDATE SET
            vector     = excluded.vector,
            model_name = excluded.model_name,
            created_at = datetime('now','utc')
        """,
        (entry_id, user_id, blob, MODEL_NAME),
    )
    conn.commit()
    conn.close()
    logger.info(f"[rag] Stored embedding for entry {entry_id}")


def search_entries(query: str, user_id: int, top_k: int = 5) -> list[dict]:
    """
    Embed the query, compare against all user's stored vectors,
    return top_k matches sorted by cosine similarity descending.
    Each result: {entry_id, entry_date, score, snippet}
    """
    from src.auth.auth_db import get_db

    query_vec = embed_text(query)

    conn = get_db()
    rows = conn.execute(
        """
        SELECT ee.entry_id, ee.vector, e.entry_date, e.normalized_text
        FROM entry_embeddings ee
        JOIN entries e ON e.id = ee.entry_id
        WHERE ee.user_id = ? AND e.is_current = 1
        """,
        (user_id,),
    ).fetchall()
    conn.close()

    if not rows:
        return []

    results = []
    for row in rows:
        vec = blob_to_vec(row["vector"])
        score = cosine_similarity(query_vec, vec)
        text = row["normalized_text"] or ""
        snippet = text[:300].strip()
        results.append({
            "entry_id":   row["entry_id"],
            "entry_date": row["entry_date"],
            "score":      round(score, 4),
            "snippet":    snippet,
            "full_text":  text,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]
