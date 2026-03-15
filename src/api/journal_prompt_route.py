"""
journal_prompt_route.py  —  src/api/journal_prompt_route.py
AI-generated daily writing prompt based on the user's journal history.

Wire up in main.py:
    from src.api.journal_prompt_route import register_journal_prompt_routes
    register_journal_prompt_routes(app, require_any_user)
"""

import json
import logging
from datetime import datetime, timezone, date

from fastapi import Depends, HTTPException
from src.auth.auth_db import get_db

logger = logging.getLogger("journal")


def register_journal_prompt_routes(app, require_any_user):

    @app.get("/api/journal/prompt")
    async def get_journal_prompt(current_user: dict = Depends(require_any_user)):
        user_id = current_user["id"]
        today = date.today().isoformat()

        conn = get_db()
        try:
            # ── Check cache ────────────────────────────────────────────────
            # Reuse today's prompt if already generated
            row = conn.execute(
                "SELECT value FROM journal_prompt_cache WHERE user_id = ? AND cache_date = ?",
                (user_id, today)
            ).fetchone()
            if row:
                return {"prompt": row["value"], "cached": True, "date": today}

            # ── Fetch master summary ───────────────────────────────────────
            ms_row = conn.execute(
                "SELECT active_threads, current_state FROM master_summaries WHERE user_id = ? ORDER BY version DESC LIMIT 1",
                (user_id,)
            ).fetchone()

            active_threads = []
            current_state = ""
            if ms_row:
                try:
                    raw = ms_row["active_threads"]
                    if isinstance(raw, str):
                        active_threads = json.loads(raw) if raw else []
                    elif isinstance(raw, list):
                        active_threads = raw
                except Exception:
                    pass
                try:
                    current_state = ms_row["current_state"] or ""
                except Exception:
                    pass

            # ── Fetch recent 7 days of key_events ─────────────────────────
            recent_rows = conn.execute(
                """
                SELECT e.entry_date, ds.key_events, ds.tags
                FROM entries e
                JOIN derived_summaries ds ON ds.entry_id = e.id
                WHERE e.user_id = ? AND e.is_current = 1
                ORDER BY e.entry_date DESC
                LIMIT 7
                """,
                (user_id,)
            ).fetchall()

            recent_context = []
            for r in recent_rows:
                events = []
                try:
                    raw = r["key_events"]
                    if isinstance(raw, str):
                        events = json.loads(raw) if raw else []
                    elif isinstance(raw, list):
                        events = raw
                except Exception:
                    pass
                if events:
                    recent_context.append(f"{r['entry_date']}: {', '.join(events[:3])}")

        finally:
            conn.close()

        # ── Build AI prompt ────────────────────────────────────────────────
        context_parts = []
        if current_state:
            context_parts.append(f"Current state: {current_state}")
        if active_threads:
            context_parts.append("Unresolved threads:\n" + "\n".join(f"- {t}" for t in active_threads[:5]))
        if recent_context:
            context_parts.append("Recent entries:\n" + "\n".join(recent_context))

        if not context_parts:
            # No data yet — return a generic prompt without calling AI
            return {
                "prompt": "What's been on your mind lately that you haven't had a chance to sit with?",
                "cached": False,
                "date": today
            }

        context_block = "\n\n".join(context_parts)

        system = (
            "You generate a single, specific writing prompt for a personal journal. "
            "The prompt should reference something real and unresolved from the person's actual history. "
            "It must be one sentence, under 25 words, warm but direct. "
            "Never generic. Never use 'today' or 'right now'. "
            "Output only the prompt text — no quotes, no preamble."
        )

        user_prompt = (
            f"Here is context from this person's journal history:\n\n"
            f"{context_block}\n\n"
            f"Generate one specific writing prompt that invites them to revisit something unresolved or important."
        )

        try:
            from src.api.ai_client import create_message
            prompt_text = create_message(
                user_id=user_id,
                system=system,
                user_prompt=user_prompt,
                max_tokens=80,
                call_type="journal_prompt",
            )
            prompt_text = (prompt_text or "").strip().strip('"').strip("'")
        except Exception as e:
            logger.error(f"[journal_prompt] AI call failed for user {user_id}: {e}")
            # Fall back gracefully — pick the first unresolved thread
            if active_threads:
                prompt_text = f"What's the current state of: {active_threads[0]}?"
            else:
                prompt_text = "What's been weighing on you that you haven't fully written through?"

        # ── Cache result ───────────────────────────────────────────────────
        try:
            conn2 = get_db()
            conn2.execute(
                """
                CREATE TABLE IF NOT EXISTS journal_prompt_cache (
                    user_id   INTEGER NOT NULL,
                    cache_date TEXT NOT NULL,
                    value     TEXT NOT NULL,
                    PRIMARY KEY (user_id, cache_date)
                )
                """
            )
            conn2.execute(
                "INSERT OR REPLACE INTO journal_prompt_cache (user_id, cache_date, value) VALUES (?, ?, ?)",
                (user_id, today, prompt_text)
            )
            conn2.commit()
            conn2.close()
        except Exception as e:
            logger.warning(f"[journal_prompt] Cache write failed: {e}")

        return {"prompt": prompt_text, "cached": False, "date": today}
