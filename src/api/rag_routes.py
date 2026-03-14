"""
src/api/rag_routes.py
POST /api/journal/ask  — semantic search + Claude synthesis
GET  /api/journal/ask/status — embedding coverage stats
"""

from __future__ import annotations
import logging
from typing import Optional

from fastapi import HTTPException, Depends
from pydantic import BaseModel

logger = logging.getLogger("journal")

_ASK_SYSTEM = """You are a compassionate, insightful assistant helping someone understand patterns in their own journal.

You have been given a selection of their past journal entries that are semantically relevant to their question.
Your job is to synthesize what you find and answer their question directly, warmly, and honestly.

Rules:
- Reference specific dates and details from the entries.
- Do not make things up — only work from what's in the provided entries.
- If the entries don't clearly answer the question, say so honestly and share what you did find.
- Keep your response conversational and under 300 words.
- Do not repeat entry text verbatim — synthesize and reflect it back.
"""


class AskRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5


def register_rag_routes(app, require_any_user):

    @app.post("/api/journal/ask")
    async def ask_journal(body: AskRequest, current_user: dict = Depends(require_any_user)):
        if not body.query or not body.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty.")

        query = body.query.strip()
        user_id = current_user["id"]
        top_k = min(max(body.top_k or 5, 1), 10)

        try:
            from src.api.rag_engine import search_entries
            matches = search_entries(query, user_id, top_k=top_k)
        except Exception as e:
            logger.error(f"[rag] search failed: {e}")
            raise HTTPException(status_code=500, detail="Embedding search failed.")

        if not matches:
            return {
                "answer": "I couldn't find any relevant journal entries to answer that question. Try writing more entries first, or rephrase your question.",
                "matches": [],
            }

        # Build context block for Claude
        context_parts = []
        for m in matches:
            context_parts.append(
                f"[Entry: {m['entry_date']} | relevance: {m['score']}]\n{m['full_text'][:800]}"
            )
        context = "\n\n---\n\n".join(context_parts)

        user_prompt = f"""The user asked: "{query}"

Here are the most relevant journal entries I found:

{context}

Please answer their question based on these entries."""

        try:
            from src.api.ai_client import create_message
            answer = create_message(
                user_id,
                system=_ASK_SYSTEM,
                user_prompt=user_prompt,
                max_tokens=600,
            )
        except Exception as e:
            logger.error(f"[rag] Claude synthesis failed: {e}")
            raise HTTPException(status_code=500, detail="AI synthesis failed.")

        # Return matches without full_text to keep response lean
        safe_matches = [
            {
                "entry_id":   m["entry_id"],
                "entry_date": m["entry_date"],
                "score":      m["score"],
                "snippet":    m["snippet"],
            }
            for m in matches
        ]

        return {"answer": answer, "matches": safe_matches}


    @app.get("/api/journal/ask/status")
    async def ask_status(current_user: dict = Depends(require_any_user)):
        """Return embedding coverage — how many entries have been indexed."""
        from src.auth.auth_db import get_db
        user_id = current_user["id"]
        conn = get_db()
        total = conn.execute(
            "SELECT COUNT(*) FROM entries WHERE user_id = ? AND is_current = 1",
            (user_id,)
        ).fetchone()[0]
        indexed = conn.execute(
            """SELECT COUNT(*) FROM entry_embeddings ee
               JOIN entries e ON e.id = ee.entry_id
               WHERE ee.user_id = ? AND e.is_current = 1""",
            (user_id,)
        ).fetchone()[0]
        conn.close()
        return {"total_entries": total, "indexed_entries": indexed, "coverage_pct": round(indexed / total * 100) if total else 0}
