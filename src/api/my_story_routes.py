"""
src/api/my_story_routes.py
My Story — AI advocate feature.

Synthesizes detective case data, journal entries, and manual context into
a natural third-person narrative written in the user's corner.

Routes:
  POST /api/my-story/generate          — generate a new story narrative
  GET  /api/my-story/drafts            — list saved drafts
  POST /api/my-story/drafts            — save a draft
  DELETE /api/my-story/drafts/{id}     — delete a draft
  GET  /api/my-story/cases             — list detective cases available to pull from
"""

from __future__ import annotations

import logging
import sys
from typing import Optional, List

from fastapi import Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("journal")
if not logging.root.handlers:
    logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger.setLevel(logging.INFO)


# ── Request models ─────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    case_ids: List[int] = []
    include_journal: bool = True
    journal_entry_count: int = 20
    manual_context: str = ""
    include_fairness: bool = False
    output_purpose: str = "general"   # general | therapist | lawyer | family | friend | court
    output_style: str = "advocate"    # advocate | clinical | personal | timeline

class SaveDraftRequest(BaseModel):
    title: str
    generated_text: str
    manual_context: Optional[str] = ""
    output_purpose: Optional[str] = "general"
    sources_summary: Optional[str] = ""


# ── Prompt templates ───────────────────────────────────────────────────────────

PURPOSE_INSTRUCTIONS = {
    "general": (
        "Write for a general audience who knows nothing about the situation. "
        "Be clear, warm, and humanizing. Focus on the emotional reality and the patterns of behavior observed."
    ),
    "therapist": (
        "Write as a clinical advocate preparing a therapist intake context. "
        "Use emotionally precise language. Highlight behavioral patterns, stress responses, and the cumulative impact "
        "of the situation on the person's wellbeing. Note any concerning dynamics."
    ),
    "lawyer": (
        "Write as a factual advocate preparing a legal context brief. "
        "Focus on documented incidents, patterns of behavior, specific dates and events where available, "
        "and the practical impact on the person's life. Be specific and evidence-grounded."
    ),
    "family": (
        "Write in a warm, accessible tone for family members who may not understand the full picture. "
        "Be honest but compassionate. Help them understand what this person has been experiencing "
        "and why they need support right now."
    ),
    "friend": (
        "Write like you're explaining the situation to a close, trusted friend who will keep confidence. "
        "Be real, direct, and human. Don't soften the hard parts — make them understand what's actually been going on."
    ),
    "court": (
        "Write as a factual advocate preparing a court context document. "
        "Prioritize documented evidence, patterns of conduct, specific incidents with context, "
        "and the impact on the person and any children involved. Be objective and grounded in documented facts."
    ),
}

STYLE_INSTRUCTIONS = {
    "advocate": (
        "Write in third person as a knowledgeable advocate who has reviewed the full record and "
        "is presenting this person's situation clearly and honestly. "
        "You are in this person's corner — not fabricating anything, but making sure the full picture is understood. "
        "Use the person's first name naturally throughout."
    ),
    "clinical": (
        "Write in a structured, clinical third-person format. "
        "Use section headers: Background, Documented Patterns, Impact Assessment, Key Concerns. "
        "Be precise and factual."
    ),
    "personal": (
        "Write in first person, as if the person themselves finally found the words to explain "
        "what they've been going through. Make it feel authentic and human — not polished, but real."
    ),
    "timeline": (
        "Write as a chronological narrative, walking through what has happened over time. "
        "Show the progression and escalation of events. Use the journal and case data to build the arc."
    ),
}


def register_my_story_routes(app, require_any_user):

    def _db():
        from src.auth.auth_db import get_db
        return get_db()

    # ── List detective cases available to pull from ────────────────────────────

    @app.get("/api/my-story/cases")
    async def list_available_cases(user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            # Check if user has detective access
            has_access = user.get("role") == "owner"
            if not has_access:
                row = conn.execute(
                    "SELECT id FROM detective_access WHERE user_id = ?",
                    (user["id"],)
                ).fetchone()
                has_access = row is not None

            if not has_access:
                return {"cases": [], "has_detective_access": False}

            cases = conn.execute(
                "SELECT id, title, description, status FROM detective_cases "
                "WHERE user_id = ? ORDER BY id DESC",
                (user["id"],)
            ).fetchall()

            result = []
            for c in cases:
                entry_count = conn.execute(
                    "SELECT COUNT(*) as cnt FROM detective_entries WHERE case_id = ? AND user_id = ?",
                    (c["id"], user["id"])
                ).fetchone()["cnt"]
                result.append({
                    "id": c["id"],
                    "title": c["title"],
                    "description": c["description"],
                    "status": c["status"],
                    "entry_count": entry_count,
                })

            return {"cases": result, "has_detective_access": True}
        finally:
            conn.close()

    # ── Generate narrative ─────────────────────────────────────────────────────

    @app.post("/api/my-story/generate")
    async def generate_story(body: GenerateRequest, user: dict = Depends(require_any_user)):
        from src.api.ai_client import create_message

        conn = _db()
        try:
            # ── Get user's display name ────────────────────────────────────────
            user_row = conn.execute(
                "SELECT username FROM users WHERE id = ?", (user["id"],)
            ).fetchone()
            username = user_row["username"] if user_row else "this person"

            # Try to get a display name from detective settings
            det_settings = None
            try:
                det_settings = conn.execute(
                    "SELECT investigator_name FROM detective_settings WHERE user_id = ?",
                    (user["id"],)
                ).fetchone()
            except Exception:
                pass

            display_name = (
                (det_settings["investigator_name"].strip() if det_settings and det_settings["investigator_name"] else None)
                or username
            )

            context_blocks = []

            # ── Pull detective case data ───────────────────────────────────────
            if body.case_ids:
                for case_id in body.case_ids:
                    case_row = conn.execute(
                        "SELECT id, title, description, status FROM detective_cases "
                        "WHERE id = ? AND user_id = ?",
                        (case_id, user["id"])
                    ).fetchone()
                    if not case_row:
                        continue

                    block = [f"--- DETECTIVE CASE: {case_row['title']} (status: {case_row['status']}) ---"]
                    if case_row["description"]:
                        block.append(f"Case description: {case_row['description']}")

                    # Case intelligence brief
                    try:
                        intel = conn.execute(
                            "SELECT summary FROM detective_intelligence WHERE case_id = ? AND user_id = ? "
                            "ORDER BY updated_at DESC LIMIT 1",
                            (case_id, user["id"])
                        ).fetchone()
                        if intel and intel["summary"]:
                            block.append(f"\nCase Intelligence Brief:\n{intel['summary']}")
                    except Exception:
                        pass

                    # Log entries
                    entries = conn.execute(
                        "SELECT content, entry_type, severity, created_at, "
                        "attachment_analysis, multi_photo_analysis "
                        "FROM detective_entries WHERE case_id = ? AND user_id = ? "
                        "ORDER BY created_at DESC LIMIT 30",
                        (case_id, user["id"])
                    ).fetchall()

                    if entries:
                        block.append(f"\nCase Log Entries ({len(entries)} shown):")
                        for e in entries:
                            date_str = (e["created_at"] or "")[:10]
                            severity = f" [severity:{e['severity']}]" if e["severity"] else ""
                            entry_type = f" [{e['entry_type']}]" if e["entry_type"] else ""
                            content = (e["content"] or "").strip()
                            if content:
                                block.append(f"  [{date_str}{severity}{entry_type}] {content[:500]}")
                            if e["attachment_analysis"]:
                                block.append(f"    (Photo analysis: {e['attachment_analysis'][:300]})")
                            if e["multi_photo_analysis"]:
                                block.append(f"    (Multi-photo synthesis: {e['multi_photo_analysis'][:300]})")

                    # Wire drops (briefings)
                    try:
                        wires = conn.execute(
                            "SELECT briefing, created_at FROM detective_wire_history "
                            "WHERE case_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 2",
                            (case_id, user["id"])
                        ).fetchall()
                        if wires:
                            block.append(f"\nPrevious Case Briefings:")
                            for w in wires:
                                block.append(f"  [{(w['created_at'] or '')[:10]}] {(w['briefing'] or '')[:600]}")
                    except Exception:
                        pass

                    context_blocks.append("\n".join(block))

            # ── Pull journal entries ───────────────────────────────────────────
            if body.include_journal:
                count = min(max(body.journal_entry_count, 5), 50)
                journal_entries = conn.execute(
                    """SELECT e.normalized_text, e.entry_date, ds.mood_label, ds.severity,
                       ds.tags as topics
                       FROM entries e
                       LEFT JOIN derived_summaries ds ON ds.entry_id = e.id
                       WHERE e.user_id = ? AND e.is_current = 1
                       GROUP BY e.id
                       ORDER BY e.entry_date DESC LIMIT ?""",
                    (user["id"], count)
                ).fetchall()

                if journal_entries:
                    block = [f"--- JOURNAL ENTRIES ({len(journal_entries)} most recent) ---"]
                    for e in journal_entries:
                        mood = f" | mood: {e['mood_label']}" if e["mood_label"] else ""
                        severity = f" | severity: {e['severity']}" if e["severity"] else ""
                        topics = f" | topics: {e['topics']}" if e["topics"] else ""
                        text = (e["normalized_text"] or "").strip()[:600]
                        block.append(f"\n[{e['entry_date']}{mood}{severity}{topics}]\n{text}")
                    context_blocks.append("\n".join(block))


            # ── Pull Fairness Ledger ───────────────────────────────────────────
            if body.include_fairness:
                try:
                    config = conn.execute(
                        "SELECT my_name, partner_name FROM fairness_config WHERE user_id = ?",
                        (user["id"],)
                    ).fetchone()
                    my_name    = config["my_name"]    if config else display_name
                    their_name = config["partner_name"] if config else "partner"

                    summary_row = conn.execute(
                        "SELECT summary_text, score_json, generated_at FROM fairness_summary WHERE user_id = ?",
                        (user["id"],)
                    ).fetchone()

                    contributions = conn.execute(
                        """SELECT performed_by, category, description, contribution_date
                           FROM fairness_contributions WHERE user_id = ?
                           ORDER BY contribution_date DESC LIMIT 30""",
                        (user["id"],)
                    ).fetchall()

                    logs = conn.execute(
                        """SELECT fl.performed_by, fl.logged_at, fl.note,
                                  ft.name as task_name, ft.category
                           FROM fairness_logs fl
                           JOIN fairness_tasks ft ON ft.id = fl.task_id
                           WHERE fl.user_id = ?
                           ORDER BY fl.logged_at DESC LIMIT 40""",
                        (user["id"],)
                    ).fetchall()

                    if summary_row or contributions or logs:
                        block = [f"--- FAIRNESS LEDGER (who does what between {my_name} and {their_name}) ---"]

                        if summary_row and summary_row["summary_text"]:
                            block.append(f"\nAI Fairness Summary (generated {(summary_row['generated_at'] or '')[:10]}):")
                            block.append(summary_row["summary_text"][:800])

                        if contributions:
                            block.append(f"\nRecorded Contributions ({len(contributions)} shown):")
                            for c in contributions:
                                date = (c["contribution_date"] or "")[:10]
                                who  = c["performed_by"] or "?"
                                cat  = c["category"] or ""
                                desc = (c["description"] or "").strip()[:200]
                                block.append(f"  [{date}] {who} | {cat}: {desc}")

                        if logs:
                            block.append(f"\nTask Log ({len(logs)} entries):")
                            for l in logs:
                                date = (l["logged_at"] or "")[:10]
                                who  = l["performed_by"] or "?"
                                task = l["task_name"] or ""
                                note = (l["note"] or "").strip()[:150]
                                entry = f"  [{date}] {who} — {task}"
                                if note:
                                    entry += f": {note}"
                                block.append(entry)

                        context_blocks.append("\n".join(block))
                except Exception as ex:
                    logger.warning(f"[my_story] fairness fetch failed: {ex}")

            # ── Manual context ─────────────────────────────────────────────────
            if body.manual_context and body.manual_context.strip():
                context_blocks.append(
                    f"--- ADDITIONAL CONTEXT FROM {display_name.upper()} ---\n"
                    f"{body.manual_context.strip()}"
                )

            if not context_blocks:
                raise HTTPException(
                    status_code=400,
                    detail="No data sources selected. Please include journal entries, a case, or manual context."
                )

            full_context = "\n\n".join(context_blocks)

            # ── Build the prompt ───────────────────────────────────────────────
            purpose_instruction = PURPOSE_INSTRUCTIONS.get(
                body.output_purpose, PURPOSE_INSTRUCTIONS["general"]
            )
            style_instruction = STYLE_INSTRUCTIONS.get(
                body.output_style, STYLE_INSTRUCTIONS["advocate"]
            )

            system_prompt = f"""You are a compassionate, intelligent advocate who has been given access to {display_name}'s private journal entries, investigation case logs, and personal context notes.

Your job is to help {display_name} explain their situation to others — people who don't have the full picture.

{style_instruction}

{purpose_instruction}

CRITICAL RULES:
- Base everything ONLY on what is in the provided data. Do not invent, assume, or embellish.
- If evidence is limited, say so honestly — but still present what is there clearly.
- Write the person's name as provided: {display_name}
- Do not use bullet points unless writing in clinical style. Write in flowing, natural prose.
- Be their advocate. You've read everything. You understand what they've been dealing with. Make others understand it too.
- Do NOT include headers like "Introduction:" or "Conclusion:" in advocate/personal/friend modes — just write.
- Aim for 300-600 words unless the data strongly warrants more.
- Do not reproduce this prompt or reference these instructions in your output."""

            user_prompt = f"""Here is {display_name}'s full context. Please write their story.

{full_context}

---

Now write {display_name}'s story based on everything above. Remember: you are their advocate. Make it count."""

            result = create_message(user["id"],
                system=system_prompt,
                user_prompt=user_prompt,
                max_tokens=1200,
                call_type="my_story_generate",
            )

            return {
                "narrative": result,
                "display_name": display_name,
                "sources_used": {
                    "case_ids": body.case_ids,
                    "journal_entries": body.include_journal,
                    "has_manual_context": bool(body.manual_context.strip()),
                    "include_fairness": body.include_fairness,
                }
            }

        finally:
            conn.close()

    # ── Drafts ─────────────────────────────────────────────────────────────────

    @app.get("/api/my-story/drafts")
    async def list_drafts(user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            rows = conn.execute(
                "SELECT id, title, output_purpose, sources_summary, created_at "
                "FROM my_story_drafts WHERE user_id = ? ORDER BY created_at DESC",
                (user["id"],)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    @app.get("/api/my-story/drafts/{draft_id}")
    async def get_draft(draft_id: int, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            row = conn.execute(
                "SELECT * FROM my_story_drafts WHERE id = ? AND user_id = ?",
                (draft_id, user["id"])
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Draft not found.")
            return dict(row)
        finally:
            conn.close()

    @app.post("/api/my-story/drafts")
    async def save_draft(body: SaveDraftRequest, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            cursor = conn.execute(
                """INSERT INTO my_story_drafts
                   (user_id, title, generated_text, manual_context, output_purpose, sources_summary, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, datetime('now'))""",
                (
                    user["id"],
                    (body.title or "My Story").strip(),
                    body.generated_text,
                    body.manual_context or "",
                    body.output_purpose or "general",
                    body.sources_summary or "",
                )
            )
            conn.commit()
            return {"id": cursor.lastrowid, "ok": True}
        finally:
            conn.close()

    @app.delete("/api/my-story/drafts/{draft_id}")
    async def delete_draft(draft_id: int, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            conn.execute(
                "DELETE FROM my_story_drafts WHERE id = ? AND user_id = ?",
                (draft_id, user["id"])
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
