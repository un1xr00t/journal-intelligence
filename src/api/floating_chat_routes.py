"""
src/api/floating_chat_routes.py
Persistent floating chat — context snapshot + message endpoint.

GET  /api/floatchat/context   — DB-only, no AI. Loads once per chat session.
POST /api/floatchat/message   — AI chat using cached context string from frontend.
"""

from __future__ import annotations
import json
import logging
from typing import Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("journal")


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context_string: str   # cached from /context — never re-fetched per session


def register_floating_chat_routes(app, require_any_user):

    # ── GET /api/floatchat/context ────────────────────────────────────────────
    @app.get("/api/floatchat/context")
    async def get_chat_context(current_user: dict = Depends(require_any_user)):
        """
        Assembles a compact context snapshot from DB + files — no AI calls.
        Frontend caches this string for the entire chat session.
        """
        from src.auth.auth_db import get_db
        from src.api.onboarding_routes import load_user_memory, build_memory_context_string

        user_id = current_user["id"]
        conn = get_db()
        parts = []
        entry_count = 0

        try:
            # ── User memory / profile (file-based) ───────────────────────────
            memory = load_user_memory(user_id)
            mem_ctx = build_memory_context_string(memory)
            if mem_ctx:
                parts.append(mem_ctx)

            # ── Master summary ────────────────────────────────────────────────
            ms = conn.execute(
                """
                SELECT current_state, active_threads, overall_arc, key_themes, last_entry_date
                FROM master_summaries
                WHERE user_id = ?
                ORDER BY version DESC LIMIT 1
                """,
                (user_id,)
            ).fetchone()

            if ms:
                ms_parts = []
                if ms["current_state"]:
                    ms_parts.append(f"Current state: {ms['current_state']}")
                if ms["overall_arc"]:
                    ms_parts.append(f"Overall arc: {ms['overall_arc']}")
                try:
                    threads = json.loads(ms["active_threads"] or "[]")
                    if threads:
                        ms_parts.append("Open threads:\n" + "\n".join(f"  {t}" for t in threads[:8]))
                except Exception:
                    pass
                try:
                    themes = json.loads(ms["key_themes"] or "[]")
                    if themes:
                        ms_parts.append("Key themes: " + ", ".join(themes[:6]))
                except Exception:
                    pass
                if ms_parts:
                    parts.append("=== NARRATIVE SUMMARY ===\n" + "\n".join(ms_parts))

            # ── Recent entry summaries ────────────────────────────────────────
            recent = conn.execute(
                """
                SELECT e.entry_date, ds.summary_text, ds.mood_label, ds.severity
                FROM entries e
                JOIN derived_summaries ds ON ds.entry_id = e.id
                WHERE e.user_id = ? AND e.is_current = 1
                  AND ds.summary_text IS NOT NULL
                ORDER BY e.entry_date DESC
                LIMIT 15
                """,
                (user_id,)
            ).fetchall()

            if recent:
                lines = []
                for r in recent:
                    mood = f" [{r['mood_label']}]" if r['mood_label'] else ""
                    sev  = f" sev={r['severity']:.1f}" if r['severity'] else ""
                    lines.append(f"{r['entry_date']}{mood}{sev}: {r['summary_text']}")
                parts.append("=== RECENT JOURNAL ENTRIES ===\n" + "\n".join(lines))

            # ── Entry stats ───────────────────────────────────────────────────
            stats = conn.execute(
                """
                SELECT COUNT(*) as cnt, MIN(entry_date) as first, MAX(entry_date) as last
                FROM entries WHERE user_id = ? AND is_current = 1
                """,
                (user_id,)
            ).fetchone()

            if stats and stats["cnt"]:
                entry_count = stats["cnt"]
                parts.append(f"=== JOURNAL STATS ===\nTotal entries: {entry_count} | First: {stats['first']} | Latest: {stats['last']}")

            # ── Active alerts / patterns ──────────────────────────────────────
            alerts = conn.execute(
                """
                SELECT alert_type, description, priority_score
                FROM alerts
                WHERE user_id = ? AND acknowledged = 0
                ORDER BY priority_score DESC LIMIT 8
                """,
                (user_id,)
            ).fetchall()

            if alerts:
                lines = [
                    f"  [{a['alert_type']}] (priority {a['priority_score']:.1f}): {a['description'][:200]}"
                    for a in alerts
                ]
                parts.append("=== ACTIVE PATTERNS / ALERTS ===\n" + "\n".join(lines))

            # ── Evidence vault summary ────────────────────────────────────────
            evidence = conn.execute(
                """
                SELECT evidence_type, label, quote_text
                FROM evidence
                WHERE user_id = ?
                ORDER BY created_at DESC LIMIT 10
                """,
                (user_id,)
            ).fetchall()

            if evidence:
                lines = [
                    f"  [{e['evidence_type']}] {e['label']}" + (f': "{e["quote_text"][:120]}"' if e['quote_text'] else "")
                    for e in evidence
                ]
                parts.append("=== EVIDENCE VAULT (recent) ===\n" + "\n".join(lines))

            # ── Detective cases ───────────────────────────────────────────────
            cases = conn.execute(
                """
                SELECT title, description, status, updated_at
                FROM detective_cases
                WHERE user_id = ?
                ORDER BY updated_at DESC LIMIT 6
                """,
                (user_id,)
            ).fetchall()

            if cases:
                lines = []
                for c in cases:
                    desc = f": {c['description'][:120]}" if c['description'] else ""
                    lines.append(f"  [{c['status']}] {c['title']}{desc}")
                parts.append("=== DETECTIVE CASES ===\n" + "\n".join(lines))

            # ── Exit plan ─────────────────────────────────────────────────────
            try:
                exit_plan = conn.execute(
                    """
                    SELECT ep.summary, ep.status,
                           COUNT(ept.id) as task_count,
                           SUM(CASE WHEN ept.completed = 1 THEN 1 ELSE 0 END) as done_count
                    FROM exit_plans ep
                    LEFT JOIN exit_plan_tasks ept ON ept.plan_id = ep.id
                    WHERE ep.user_id = ?
                    GROUP BY ep.id
                    ORDER BY ep.created_at DESC LIMIT 1
                    """,
                    (user_id,)
                ).fetchone()

                if exit_plan and exit_plan["summary"]:
                    progress = ""
                    if exit_plan["task_count"]:
                        done = exit_plan["done_count"] or 0
                        progress = f" ({done}/{exit_plan['task_count']} tasks done)"
                    parts.append(f"=== EXIT PLAN ===\nStatus: {exit_plan['status']}{progress}\n{exit_plan['summary'][:400]}")
            except Exception:
                pass  # exit plan table may not exist for all users

            # ── Contradiction count ───────────────────────────────────────────
            contra = conn.execute(
                "SELECT COUNT(*) as cnt FROM alerts WHERE user_id = ? AND alert_type = 'contradiction' AND acknowledged = 0",
                (user_id,)
            ).fetchone()
            if contra and contra["cnt"]:
                parts.append(f"=== CONTRADICTIONS ===\n{contra['cnt']} unacknowledged contradiction(s) detected in journal.")

        except Exception as e:
            logger.error(f"[floatchat/context] error for user {user_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Context load failed: {str(e)}")
        finally:
            conn.close()

        context_string = "\n\n".join(parts) if parts else "No journal data loaded yet. Add some entries first."

        return {
            "context_string": context_string,
            "entry_count": entry_count,
        }

    # ── POST /api/floatchat/message ───────────────────────────────────────────
    @app.post("/api/floatchat/message")
    async def chat_message(body: ChatRequest, current_user: dict = Depends(require_any_user)):
        """
        AI chat using pre-cached context string from the frontend.
        Only the new user message triggers an AI call — context never re-fetched.
        """
        if not body.messages:
            raise HTTPException(status_code=400, detail="No messages provided.")

        user_id = current_user["id"]

        system_prompt = (
            "You are a personal AI assistant embedded in a private journal dashboard. "
            "You have full context from this person's journal entries, patterns, detective cases, exit plan, and evidence vault. "
            "Answer their questions directly and specifically — reference real dates, names, and events from the context. "
            "Be warm but direct. Keep responses under 200 words unless they explicitly ask for more. "
            "Never make things up — if you don't see it in context, say so honestly.\n\n"
            "=== YOUR CONTEXT ===\n"
            f"{body.context_string}\n"
            "=== END CONTEXT ==="
        )

        # Cap at last 20 messages to avoid runaway token growth
        history = body.messages[-20:]
        messages_payload = [{"role": m.role, "content": m.content} for m in history]

        try:
            from src.api.ai_client import create_message
            response = create_message(
                user_id=user_id,
                system=system_prompt,
                user_prompt=messages_payload[-1]["content"],
                max_tokens=500,
                call_type="floating_chat",
            )
        except Exception as e:
            logger.error(f"[floatchat/message] AI call failed for user {user_id}: {e}")
            raise HTTPException(
                status_code=500,
                detail="AI call failed. Make sure your API key is set in Settings -> AI Preferences."
            )

        return {"reply": (response or "").strip()}
