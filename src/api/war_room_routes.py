"""
src/api/war_room_routes.py
POST /api/war-room/triage  — brain dump → triaged action plan
"""

from __future__ import annotations
import json
import logging
from typing import Optional

from fastapi import HTTPException, Depends
from pydantic import BaseModel

logger = logging.getLogger("journal")


_SYSTEM = """You are a calm, strategic triage assistant inside a private journaling app.
The user is overwhelmed and needs you to untangle everything swirling in their head
and sort it into a clear action plan using their own journal history.

Your output has three buckets:
1. act_now     — things they can do TODAY that reduce chaos or provide relief
2. plan_week   — decisions, conversations, logistics to schedule this week
3. let_go      — things outside their control right now that are burning mental energy

For each item, identify which app tool is best suited:
  - exit_plan       → /exit-plan       (planning separations, breakups, major life changes)
  - decide          → /decide          (single decision with clear options)
  - detective       → /detective       (logging incidents, building a case, patterns of behavior)
  - fairness        → /fairness        (one-sided relationship dynamics, imbalance tracking)
  - people_intel    → /people-intel    (understanding a person's behavior patterns)
  - ask_journal     → /ask             (search your own history for context)
  - mental_health   → /mental-health   (tracking emotional state over time)
  - write           → /write           (just needs to be journaled first)
  - none            → null             (external action, no tool fits)

RULES:
- Be warm but direct. No clinical labels. No diagnoses.
- Ground every item in either the user's brain dump or their journal history.
- Urgency notes should be honest — don't catastrophize, don't minimize.
- Items in let_go must feel genuinely validating, not dismissive.
- Keep titles short (5–8 words max).
- Return ONLY valid JSON. No markdown, no preamble.

OUTPUT FORMAT:
{
  "situation_read": "1–2 sentence warm acknowledgment of what you're seeing in their situation",
  "act_now": [
    {
      "title": "short action title",
      "why": "1–2 sentences grounded in their situation or journal",
      "urgency_note": "brief honest note on why this matters today",
      "tool": "tool_key_or_none",
      "tool_label": "Tool display name or null",
      "tool_route": "/route or null"
    }
  ],
  "plan_week": [ ...same shape... ],
  "let_go": [
    {
      "title": "short title",
      "why": "why this is outside your control right now",
      "reframe": "one sentence reframe to ease the mental hold this has"
    }
  ]
}
"""


class TriageRequest(BaseModel):
    brain_dump: str
    include_journal_context: Optional[bool] = True


def register_war_room_routes(app, require_any_user):

    @app.post("/api/war-room/triage")
    async def triage(body: TriageRequest, current_user: dict = Depends(require_any_user)):
        if not body.brain_dump or len(body.brain_dump.strip()) < 10:
            raise HTTPException(status_code=400, detail="Brain dump too short. Just write — anything.")

        user_id = current_user["id"]

        # ── 1. RAG — pull relevant journal entries ────────────────────────────
        entry_context = ""
        if body.include_journal_context:
            try:
                from src.api.rag_engine import search_entries
                matches = search_entries(body.brain_dump[:500], user_id, top_k=8)
                if matches:
                    parts = []
                    for m in matches[:6]:
                        parts.append(
                            f"[{m['entry_date']} | severity: {m.get('severity', '?')}]\n"
                            f"{m['full_text'][:500]}"
                        )
                    entry_context = "\n\n---\n\n".join(parts)
            except Exception as e:
                logger.warning(f"[war_room] rag failed: {e}")

        # ── 2. User memory ────────────────────────────────────────────────────
        memory_context = ""
        try:
            from src.auth.auth_db import get_db
            conn = get_db()
            mem = conn.execute(
                "SELECT situation_type, situation_story, people, goals, ai_summary FROM user_memory WHERE user_id = ?",
                (user_id,)
            ).fetchone()
            conn.close()
            if mem:
                parts = []
                if mem["situation_type"]:
                    parts.append(f"Situation: {mem['situation_type']}")
                if mem["situation_story"]:
                    parts.append(f"Background: {mem['situation_story'][:400]}")
                if mem["people"]:
                    parts.append(f"Key people: {mem['people']}")
                if mem["ai_summary"]:
                    parts.append(f"Life summary: {mem['ai_summary'][:400]}")
                memory_context = "\n".join(parts)
        except Exception as e:
            logger.warning(f"[war_room] memory fetch failed: {e}")

        # ── 3. Active alerts ──────────────────────────────────────────────────
        alert_context = ""
        try:
            from src.auth.auth_db import get_db
            conn = get_db()
            rows = conn.execute(
                """SELECT alert_type, description, priority FROM alerts
                   WHERE user_id = ? AND acknowledged = 0
                   ORDER BY priority DESC LIMIT 6""",
                (user_id,)
            ).fetchall()
            conn.close()
            if rows:
                lines = [f"- [{r['alert_type']}] (priority {r['priority']:.1f}): {r['description'][:150]}" for r in rows]
                alert_context = "Active pattern alerts:\n" + "\n".join(lines)
        except Exception as e:
            logger.warning(f"[war_room] alerts fetch failed: {e}")

        # ── 4. Build prompt ───────────────────────────────────────────────────
        sections = [f"What the user just told me (brain dump):\n\"{body.brain_dump[:2000]}\""]

        if memory_context:
            sections.append(f"User background:\n{memory_context}")

        if alert_context:
            sections.append(alert_context)

        if entry_context:
            sections.append(f"Most relevant journal entries:\n\n{entry_context}")
        else:
            sections.append("No indexed journal entries matched — base triage on the brain dump and background above.")

        sections.append(
            "Triage everything above into act_now, plan_week, and let_go. "
            "Be strategic, warm, and specific to this person's actual situation. "
            "Respond ONLY with the JSON structure from your instructions."
        )

        user_prompt = "\n\n".join(sections)

        # ── 5. AI call ────────────────────────────────────────────────────────
        try:
            from src.api.ai_client import create_message
            raw = create_message(
                user_id,
                system=_SYSTEM,
                user_prompt=user_prompt,
                max_tokens=2500,
                call_type="war_room_triage",
            )
        except Exception as e:
            logger.error(f"[war_room] AI call failed: {e}")
            raise HTTPException(status_code=500, detail="AI triage failed. Please try again.")

        # ── 6. Parse ──────────────────────────────────────────────────────────
        try:
            clean = raw.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            result = json.loads(clean)
        except Exception as e:
            logger.error(f"[war_room] JSON parse failed: {e}\nRaw: {raw[:300]}")
            raise HTTPException(status_code=500, detail="Could not parse AI response. Please try again.")

        return result
