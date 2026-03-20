"""
src/api/decision_routes.py
POST /api/journal/decide        — generate 3 structured decision options from journal history
POST /api/journal/decide/save   — save a chosen option
GET  /api/journal/decide/saved  — list saved decisions for this user
"""

from __future__ import annotations
import json
import logging
from typing import Optional

from fastapi import HTTPException, Depends
from pydantic import BaseModel

logger = logging.getLogger("journal")

GOALS = {
    "protect_peace":        "Protect my peace",
    "get_clarity":          "Get clarity",
    "reduce_conflict":      "Reduce conflict",
    "stay_safe":            "Stay safe",
    "preserve_relationship":"Preserve the relationship (if possible)",
    "prepare_before_acting":"Prepare before acting",
}

_DECIDE_SYSTEM = """You are a thoughtful, neutral decision-support assistant embedded in a private journaling app.
Your job is NOT to tell the user what to do. Your job is to present 3 clearly distinct options with honest tradeoffs,
grounded entirely in their own journal history.

RULES:
- Never use authoritative language like "You need to…" or "The correct decision is…"
- Use language like "One possible approach…", "Based on what you've shared…", "This option tends to…"
- Every option must reference the user's actual history. Pull specific dates, patterns, and outcomes.
- Do not diagnose, label, or make clinical claims.
- Do not mention legal or medical advice — add a brief note that this is not professional advice.
- Be warm but neutral. Present tradeoffs honestly.

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown, no preamble:
{
  "history_summary": "2-3 sentence summary of the most relevant patterns from their journal that inform these options",
  "options": [
    {
      "type": "lowest-risk",
      "title": "short actionable title",
      "summary": "1-2 sentence overview",
      "why_it_fits": "1-2 sentences grounded in their specific history",
      "risk_level": "low",
      "emotional_cost_level": "low|medium|high",
      "emotional_cost_explanation": "brief explanation",
      "practical_effort": "low|medium|high",
      "reversibility": "easy|moderate|difficult",
      "next_48h": "what the next 48 hours looks like",
      "next_30d": "what the next 30 days looks like",
      "best_if": "one short phrase: best if your goal is...",
      "avoid_if": "one short phrase: avoid if...",
      "past_pattern_note": "optional: if their history shows a specific pattern relevant to this option, cite it briefly. Empty string if none."
    },
    {
      "type": "balanced",
      ...same fields...
    },
    {
      "type": "decisive",
      ...same fields...
    }
  ]
}
"""


class DecideRequest(BaseModel):
    goal: str
    context_hint: Optional[str] = None   # free-text from user about current situation


class SaveDecisionRequest(BaseModel):
    goal: str
    option_type: str
    title: str
    full_json: str    # raw JSON string of the full option object


def register_decision_routes(app, require_any_user):

    @app.post("/api/journal/decide")
    async def decide(body: DecideRequest, current_user: dict = Depends(require_any_user)):
        if body.goal not in GOALS:
            raise HTTPException(status_code=400, detail=f"Invalid goal. Must be one of: {list(GOALS.keys())}")

        user_id = current_user["id"]
        goal_label = GOALS[body.goal]

        # ── 1. RAG — pull semantically relevant entries ──────────────────────
        search_query = body.context_hint or f"decision conflict stress situation {goal_label}"
        try:
            from src.api.rag_engine import search_entries
            matches = search_entries(search_query, user_id, top_k=8)
        except Exception as e:
            logger.error(f"[decide] rag search failed: {e}")
            matches = []

        entry_context = ""
        if matches:
            parts = []
            for m in matches[:6]:
                parts.append(
                    f"[{m['entry_date']} | severity: {m.get('severity','?')} | relevance: {m['score']:.2f}]\n"
                    f"{m['full_text'][:600]}"
                )
            entry_context = "\n\n---\n\n".join(parts)

        # ── 2. User memory — situation + people ──────────────────────────────
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
                    parts.append(f"Situation type: {mem['situation_type']}")
                if mem["situation_story"]:
                    parts.append(f"Background: {mem['situation_story'][:400]}")
                if mem["people"]:
                    parts.append(f"Key people: {mem['people']}")
                if mem["goals"]:
                    parts.append(f"User's stated goals: {mem['goals']}")
                if mem["ai_summary"]:
                    parts.append(f"AI-generated life summary: {mem['ai_summary'][:400]}")
                memory_context = "\n".join(parts)
        except Exception as e:
            logger.warning(f"[decide] memory fetch failed: {e}")

        # ── 3. Recent alerts / patterns ───────────────────────────────────────
        pattern_context = ""
        try:
            from src.auth.auth_db import get_db
            conn = get_db()
            rows = conn.execute(
                """SELECT alert_type, description, priority FROM alerts
                   WHERE user_id = ? AND acknowledged = 0
                   ORDER BY priority DESC LIMIT 5""",
                (user_id,)
            ).fetchall()
            conn.close()
            if rows:
                pattern_lines = [f"- [{r['alert_type']}] (priority {r['priority']:.1f}): {r['description'][:150]}" for r in rows]
                pattern_context = "Active patterns / alerts:\n" + "\n".join(pattern_lines)
        except Exception as e:
            logger.warning(f"[decide] pattern fetch failed: {e}")

        # ── 4. Build prompt ───────────────────────────────────────────────────
        sections = [f"The user's primary goal right now: {goal_label}"]

        if body.context_hint:
            sections.append(f"What they're facing right now (in their own words): {body.context_hint}")

        if memory_context:
            sections.append(f"User background:\n{memory_context}")

        if pattern_context:
            sections.append(pattern_context)

        if entry_context:
            sections.append(
                f"Most relevant journal entries (by semantic similarity to their current situation):\n\n{entry_context}"
            )
        else:
            sections.append("No indexed journal entries found — generate options based on the goal and context provided.")

        sections.append(
            "Generate exactly 3 decision options: one lowest-risk, one balanced, one decisive. "
            "Ground each in the user's actual history above. Respond ONLY with the JSON structure described in your instructions."
        )

        user_prompt = "\n\n".join(sections)

        # ── 5. Call AI ─────────────────────────────────────────────────────────
        try:
            from src.api.ai_client import create_message
            raw = create_message(
                user_id,
                system=_DECIDE_SYSTEM,
                user_prompt=user_prompt,
                max_tokens=2000,
                call_type="decision_assist",
            )
        except Exception as e:
            logger.error(f"[decide] AI call failed: {e}")
            raise HTTPException(status_code=500, detail="AI generation failed. Please try again.")

        # ── 6. Parse JSON response ────────────────────────────────────────────
        try:
            clean = raw.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            result = json.loads(clean)
        except Exception as e:
            logger.error(f"[decide] JSON parse failed: {e}\nRaw: {raw[:300]}")
            raise HTTPException(status_code=500, detail="Could not parse AI response. Please try again.")

        result["goal"] = body.goal
        result["goal_label"] = goal_label
        return result


    @app.post("/api/journal/decide/save")
    async def save_decision(body: SaveDecisionRequest, current_user: dict = Depends(require_any_user)):
        user_id = current_user["id"]
        try:
            from src.auth.auth_db import get_db
            conn = get_db()
            conn.execute(
                """INSERT INTO saved_decisions (user_id, goal, option_type, title, full_json, created_at)
                   VALUES (?, ?, ?, ?, ?, datetime('now'))""",
                (user_id, body.goal, body.option_type, body.title, body.full_json)
            )
            conn.commit()
            conn.close()
            return {"status": "saved"}
        except Exception as e:
            logger.error(f"[decide] save failed: {e}")
            raise HTTPException(status_code=500, detail="Failed to save decision.")


    @app.get("/api/journal/decide/saved")
    async def get_saved_decisions(current_user: dict = Depends(require_any_user)):
        user_id = current_user["id"]
        try:
            from src.auth.auth_db import get_db
            conn = get_db()
            rows = conn.execute(
                """SELECT id, goal, option_type, title, full_json, created_at
                   FROM saved_decisions WHERE user_id = ?
                   ORDER BY created_at DESC LIMIT 20""",
                (user_id,)
            ).fetchall()
            conn.close()
            return {"decisions": [dict(r) for r in rows]}
        except Exception as e:
            logger.error(f"[decide] fetch saved failed: {e}")
            raise HTTPException(status_code=500, detail="Failed to fetch saved decisions.")


    @app.post("/api/journal/decide/script")
    async def generate_script(body: dict, current_user: dict = Depends(require_any_user)):
        from pydantic import BaseModel as BM
        title         = body.get("option_title", "")
        summary       = body.get("option_summary", "")
        why_it_fits   = body.get("why_it_fits", "")
        user_id       = current_user["id"]

        system = (
            "You are a warm, practical writing assistant. The user is working through a difficult "
            "personal situation and needs help putting words to a possible next step. "
            "Write a short, direct script or message they could actually use or say. "
            "It should sound like a real person, not corporate language. "
            "Keep it under 150 words. Do not include any preamble — just the script text."
        )
        prompt = (
            f"The user is considering this approach: {title}\n\n"
            f"Summary: {summary}\n\n"
            f"Why it fits their situation: {why_it_fits}\n\n"
            "Write a short, practical script — a message, conversation opener, or internal reminder — "
            "they could use when taking this approach. Keep it natural and concise."
        )
        try:
            from src.api.ai_client import create_message
            script = create_message(user_id, system=system, user_prompt=prompt, max_tokens=400, call_type="decision_script")
        except Exception as e:
            logger.error(f"[decide] script gen failed: {e}")
            raise HTTPException(status_code=500, detail="Script generation failed.")

        return {"script": script}


    @app.delete("/api/journal/decide/saved/{decision_id}")
    async def delete_saved_decision(decision_id: int, current_user: dict = Depends(require_any_user)):
        user_id = current_user["id"]
        try:
            from src.auth.auth_db import get_db
            conn = get_db()
            conn.execute(
                "DELETE FROM saved_decisions WHERE id = ? AND user_id = ?",
                (decision_id, user_id)
            )
            conn.commit()
            conn.close()
            return {"status": "deleted"}
        except Exception as e:
            logger.error(f"[decide] delete failed: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete decision.")
