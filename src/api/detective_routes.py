"""
src/api/detective_routes.py
Detective Mode — AI-powered investigation workspace.

Access:  owner always has access; other users granted individually via detective_access table.

Routes:
  GET  /api/detective/access                              — check access
  GET  /api/detective/cases                               — list cases
  POST /api/detective/cases                               — create case
  PUT  /api/detective/cases/{id}                          — update case
  DEL  /api/detective/cases/{id}                          — delete case
  GET  /api/detective/cases/{id}/entries                  — list investigation log entries
  POST /api/detective/cases/{id}/entries                  — add log entry
  DEL  /api/detective/cases/{id}/entries/{eid}            — delete entry
  GET  /api/detective/cases/{id}/uploads                  — list uploaded photos
  POST /api/detective/cases/{id}/upload                   — upload + analyze photo
  GET  /api/detective/cases/{id}/uploads/{uid}/image      — serve photo (auth-gated)
  DEL  /api/detective/cases/{id}/uploads/{uid}            — delete upload
  POST /api/detective/cases/{id}/chat                     — chat with Case Partner AI
  POST /api/detective/cases/{id}/wire                     — DROP A WIRE (full briefing)
  POST /api/detective/cache/refresh                       — force-refresh journal cache
  GET  /api/detective/admin/access                        — (owner) list granted users
  POST /api/detective/admin/grant                         — (owner) grant access
  DEL  /api/detective/admin/revoke/{user_id}              — (owner) revoke access
  GET  /api/detective/admin/users                         — (owner) list grantable users
"""

from __future__ import annotations

import base64
import logging
import sys
import sys
import os
import shutil
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

logger = logging.getLogger("journal")
if not logging.root.handlers:
    logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger.setLevel(logging.INFO)


# ── Request models (module-level required for FastAPI schema resolution) ───────

class CaseCreate(BaseModel):
    title: str
    description: Optional[str] = None

class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class EntryCreate(BaseModel):
    content: str
    entry_type: Optional[str] = "note"
    severity: Optional[str] = "medium"

class ChatRequest(BaseModel):
    message: str
    history: Optional[list] = []
    compressed_context: Optional[str] = None

class SaveMessagesRequest(BaseModel):
    session_id: str
    messages: list

class CompressRequest(BaseModel):
    messages: list

class GrantRequest(BaseModel):
    user_id: int

DETECTIVE_STORAGE = "/opt/journal-dashboard/data/detective"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024   # 10 MB
CACHE_TTL_HOURS = 6


# ── AI Prompts ────────────────────────────────────────────────────────────────

_PARTNER_SYSTEM = """You are this person's Case Partner — their sharp, perceptive best friend who also happens to have a detective's instincts. You've been following their situation closely: you've read their journal, seen the photos they've shared, and reviewed their investigation notes.

You talk like a real friend: direct, warm, honest. No corporate tone, no clinical distance. You notice things other people would miss. You connect dots. You don't sugarcoat — if something looks off, you call it out. But you're always in their corner.

When someone shares evidence or photos, get specific and observational. When they vent, listen and then redirect toward what's actionable. When they ask what you think — tell them.

Keep responses focused and conversational. No unnecessary bullet-point walls."""

_WIRE_PROMPT = """You're about to drop a full case briefing to your best friend. They've been building this investigation and they need a clear-eyed intelligence summary from someone who's seen everything.

Based on everything in front of you — the investigation log, evidence photos, and journal background — give them a complete case briefing. Cover:

1. The core picture: what's actually going on here, from where you're standing
2. Key patterns you're seeing — behavioral, timeline, things that repeat
3. What stands out or doesn't add up (contradictions, gaps, anomalies)
4. The strongest pieces of evidence so far
5. What to watch for next
6. One honest, direct thing they should do right now

Be real. Be specific. Reference actual things from the case file. This is a private conversation between friends — no fluff, no hedging."""

_INTELLIGENCE_UPDATE_PROMPT = """Based on the complete case file, generate a compact CASE INTELLIGENCE BRIEF that persists between sessions and replaces loading all raw case data on every chat message.

Format exactly as shown (use these exact headers):

CORE PICTURE: [2-3 sentence synthesis of what is actually happening]

KEY SUBJECTS: [comma-separated names/roles with brief context]

BEHAVIORAL PATTERNS:
• [specific observable pattern 1]
• [specific observable pattern 2]
• [specific observable pattern 3 if notable]

CRITICAL EVIDENCE: [top 3 items with dates, be specific]

ANOMALIES/RED FLAGS: [top 2 things that don't add up or are suspicious]

RECOMMENDED ACTION: [single most important next step]

Max 350 words total. Dense. Factual. No hedging. Every word counts — this is a living document that gets injected into every AI conversation."""


def register_detective_routes(app, require_any_user, require_owner):

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _db():
        from src.auth.auth_db import get_db
        return get_db()

    def _has_access(user: dict) -> bool:
        if user.get("role") == "owner":
            return True
        conn = _db()
        try:
            row = conn.execute(
                "SELECT id FROM detective_access WHERE user_id = ?",
                (user["id"],)
            ).fetchone()
            return row is not None
        finally:
            conn.close()

    def _require_detective(user: dict = Depends(require_any_user)):
        if not _has_access(user):
            raise HTTPException(status_code=403, detail="Detective Mode access required.")
        return user

    def _get_case(case_id: int, user_id: int, conn):
        row = conn.execute(
            "SELECT id, title, description, status FROM detective_cases WHERE id = ? AND user_id = ?",
            (case_id, user_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found.")
        return row

    def _journal_cache(user_id: int, conn) -> str:
        """Return cached journal summary, generating fresh if stale/missing."""
        cutoff = (datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS)).strftime("%Y-%m-%d %H:%M:%S")
        row = conn.execute(
            "SELECT journal_summary FROM detective_cache WHERE user_id = ? AND cached_at > ?",
            (user_id, cutoff)
        ).fetchone()
        if row and row["journal_summary"]:
            return row["journal_summary"]

        # Build fresh summary from recent journal
        entries = conn.execute(
            """SELECT e.normalized_text, e.entry_date,
                      ds.mood_label, ds.severity, ds.key_events
               FROM entries e
               LEFT JOIN derived_summaries ds ON ds.entry_id = e.id
               WHERE e.user_id = ? AND e.is_current = 1
               ORDER BY e.entry_date DESC LIMIT 25""",
            (user_id,)
        ).fetchall()

        if not entries:
            summary = "No journal entries on file yet."
        else:
            lines = []
            for e in entries:
                line = f"[{e['entry_date']} | mood {e['mood_label']} | sev {e['severity']}]"
                if e["key_events"]:
                    line += f" Events: {e['key_events']}"
                line += f"\n{(e['normalized_text'] or '')[:400]}"
                lines.append(line)
            raw_text = "\n---\n".join(lines)

            try:
                from src.api.ai_client import create_message
                summary = create_message(
                    user_id,
                    system=(
                        "Create a concise intelligence brief from journal entries for an AI case partner. "
                        "Summarize: key patterns, recurring people, emotional state trends, significant events, "
                        "and any behavioral red flags. Factual, analytical. Max 500 words."
                    ),
                    user_prompt=f"Summarize these journal entries:\n\n{raw_text}",
                    max_tokens=700,
                    call_type="detective_journal_cache",
                )
            except Exception as ex:
                logger.warning(f"[detective] journal cache AI failed: {ex}")
                summary = (
                    f"Journal: {len(entries)} recent entries. "
                    + " | ".join(f"{e['entry_date']}: {(e['normalized_text'] or '')[:80]}" for e in entries[:4])
                )

        conn.execute(
            "INSERT OR REPLACE INTO detective_cache (user_id, journal_summary, cached_at) VALUES (?, ?, datetime('now'))",
            (user_id, summary)
        )
        conn.commit()
        return summary

    def _case_context(case_id: int, user_id: int, conn) -> str:
        """Full case context — every piece of logged evidence assembled."""
        case = _get_case(case_id, user_id, conn)

        entries = conn.execute(
            "SELECT id, content, entry_type, severity, created_at, "
            "attachment_filename, attachment_analysis, attachment_status "
            "FROM detective_entries WHERE case_id = ? ORDER BY created_at DESC LIMIT 20",
            (case_id,)
        ).fetchall()

        uploads = conn.execute(
            "SELECT original_filename, ai_analysis, created_at FROM detective_uploads "
            "WHERE case_id = ? AND analysis_status = 'done' ORDER BY created_at DESC LIMIT 10",
            (case_id,)
        ).fetchall()

        wires = conn.execute(
            "SELECT briefing, created_at FROM detective_wire_history "
            "WHERE case_id = ? ORDER BY created_at DESC LIMIT 5",
            (case_id,)
        ).fetchall()

        parts = [f"=== CASE FILE: {case['title']} ==="]
        if case["description"]:
            parts.append(f"Case overview: {case['description']}")

        if entries:
            parts.append("\n--- INVESTIGATION LOG ---")
            for e in entries:
                line = (
                    f"[{e['created_at'][:10]} | {e['entry_type'].upper()} | {e['severity'].upper()}] "
                    f"{e['content']}"
                )
                parts.append(line)
                if e["attachment_status"] == "done" and e["attachment_analysis"]:
                    parts.append(
                        f"  ^ ATTACHED PHOTO EVIDENCE ('{e['attachment_filename']}'):\n"
                        f"  {e['attachment_analysis']}"
                    )

        if uploads:
            parts.append("\n--- PHOTO EVIDENCE (GALLERY UPLOADS) ---")
            for u in uploads:
                parts.append(f"Photo '{u['original_filename']}' ({u['created_at'][:10]}):\n{u['ai_analysis']}")

        if wires:
            parts.append("\n--- PRIOR WIRE BRIEFINGS ---")
            for w in wires:
                parts.append(f"[Wire {w['created_at'][:10]}]\n{w['briefing'][:800]}")

        return "\n".join(parts)

    def _get_intelligence(case_id: int, user_id: int, conn):
        """Return current case intelligence record or None."""
        return conn.execute(
            "SELECT summary, entry_count, wire_count, last_updated "
            "FROM case_intelligence WHERE case_id = ? AND user_id = ?",
            (case_id, user_id)
        ).fetchone()

    def _efficient_case_context(case_id: int, user_id: int, conn) -> str:
        """Token-efficient context: intelligence brief + recent activity + all current evidence.
        Falls back to full _case_context if no intelligence exists yet."""
        intel = _get_intelligence(case_id, user_id, conn)
        case = _get_case(case_id, user_id, conn)
        if intel and intel["summary"]:
            # Recent log entries (with attachment analyses inline)
            recent = conn.execute(
                "SELECT id, content, entry_type, severity, created_at, "
                "attachment_filename, attachment_analysis, attachment_status "
                "FROM detective_entries WHERE case_id = ? ORDER BY created_at DESC LIMIT 5",
                (case_id,)
            ).fetchall()
            recent_lines = []
            for e in recent:
                line = (
                    f"[{e['created_at'][:10]}|{e['entry_type'].upper()}|{e['severity'].upper()}] "
                    f"{e['content']}"
                )
                recent_lines.append(line)
                if e["attachment_status"] == "done" and e["attachment_analysis"]:
                    recent_lines.append(
                        f"  ^ PHOTO ATTACHED ('{e['attachment_filename']}'):\n"
                        f"  {e['attachment_analysis']}"
                    )
            recent_text = "\n".join(recent_lines) or "No recent entries."

            # Recent photo uploads not yet covered by attachment-on-entries
            recent_uploads = conn.execute(
                "SELECT original_filename, ai_analysis, created_at FROM detective_uploads "
                "WHERE case_id = ? AND analysis_status = 'done' ORDER BY created_at DESC LIMIT 5",
                (case_id,)
            ).fetchall()
            uploads_text = ""
            if recent_uploads:
                uploads_text = "\n\nRECENT PHOTO EVIDENCE:\n" + "\n".join(
                    f"Photo '{u['original_filename']}' ({u['created_at'][:10]}): {u['ai_analysis'][:300]}"
                    for u in recent_uploads
                )

            # Journal background (always included)
            journal_summary = _journal_cache(user_id, conn)

            return (
                f"=== CASE: {case['title']} ===\n\n"
                f"PERSISTENT CASE INTELLIGENCE (last updated {intel['last_updated'][:16]}):\n"
                f"{intel['summary']}\n\n"
                f"RECENT LOG ACTIVITY (last 5 entries + any attached photos):\n{recent_text}"
                f"{uploads_text}\n\n"
                f"--- JOURNAL BACKGROUND ---\n{journal_summary}"
            )
        # No intelligence yet — fall back to full context + journal
        journal_summary = _journal_cache(user_id, conn)
        return _case_context(case_id, user_id, conn) + f"\n\n--- JOURNAL BACKGROUND ---\n{journal_summary}"

    def _update_intelligence(case_id: int, user_id: int, conn) -> None:
        """Generate and persist a compressed case intelligence brief.
        Includes ALL evidence: log entries + attachment analyses + photo uploads +
        wire history + journal background.
        Called automatically after every wire drop. Also callable on demand."""
        from src.api.ai_client import create_message
        # _case_context now includes entry attachments + wire history
        full_ctx = _case_context(case_id, user_id, conn)
        # Journal background
        journal_summary = _journal_cache(user_id, conn)
        entry_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM detective_entries WHERE case_id = ?", (case_id,)
        ).fetchone()["cnt"]
        wire_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM detective_wire_history WHERE case_id = ?", (case_id,)
        ).fetchone()["cnt"]
        full_data = (
            f"{full_ctx}\n\n"
            f"--- JOURNAL BACKGROUND ---\n{journal_summary}"
        )
        summary = create_message(
            user_id,
            system=(
                "You are generating a persistent case intelligence brief for a detective investigation system. "
                "This brief persists between sessions and replaces loading all raw data every time. "
                "All evidence — log entries, attached photo analyses, gallery photo analyses, wire briefings, "
                "and journal background — has been provided. Synthesize everything. "
                "Be analytical and precise. Follow the format instructions exactly."
            ),
            user_prompt=_INTELLIGENCE_UPDATE_PROMPT + f"\n\nCASE DATA + JOURNAL:\n{full_data}",
            max_tokens=800,
            call_type="detective_intelligence",
        )
        conn.execute(
            """INSERT INTO case_intelligence (case_id, user_id, summary, entry_count, wire_count, last_updated)
               VALUES (?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(case_id) DO UPDATE SET
                 summary = excluded.summary,
                 entry_count = excluded.entry_count,
                 wire_count = excluded.wire_count,
                 last_updated = excluded.last_updated""",
            (case_id, user_id, summary, entry_count, wire_count)
        )
        conn.commit()
        logger.info(f"[detective] intelligence updated for case {case_id} ({entry_count} entries, {wire_count} wires)")

    def _call_vision(user_id: int, image_b64: str, media_type: str, prompt: str) -> str:
        from src.api.ai_client import get_anthropic_key, get_model
        import anthropic

        # Normalize media_type — Anthropic only accepts these four values
        _mime_map = {
            "image/jpg":  "image/jpeg",
            "image/jpeg": "image/jpeg",
            "image/png":  "image/png",
            "image/gif":  "image/gif",
            "image/webp": "image/webp",
        }
        safe_mime = _mime_map.get(media_type.lower(), "image/jpeg")

        key = get_anthropic_key(user_id)
        if not key:
            raise RuntimeError("No Anthropic API key configured.")
        model = get_model()
        client = anthropic.Anthropic(api_key=key)
        msg = client.messages.create(
            model=model,
            max_tokens=800,
            system=_PARTNER_SYSTEM,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": safe_mime, "data": image_b64}},
                    {"type": "text", "text": prompt}
                ]
            }]
        )
        # Log usage
        try:
            from src.api.ai_client import _log_usage
            _log_usage(user_id, "anthropic", model, msg.usage.input_tokens, msg.usage.output_tokens, call_type="detective_photo_analysis")
        except Exception:
            pass
        return msg.content[0].text


    # ── Access Check ──────────────────────────────────────────────────────────

    @app.get("/api/detective/access")
    async def detective_access_check(user: dict = Depends(require_any_user)):
        return {"has_access": _has_access(user), "role": user.get("role")}


    # ── Cases ─────────────────────────────────────────────────────────────────

    @app.get("/api/detective/cases")
    async def list_cases(user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            rows = conn.execute(
                "SELECT id, title, description, status, created_at, updated_at "
                "FROM detective_cases WHERE user_id = ? ORDER BY updated_at DESC",
                (user["id"],)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    @app.post("/api/detective/cases")
    async def create_case(body: CaseCreate, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            cur = conn.execute(
                "INSERT INTO detective_cases (user_id, title, description) VALUES (?, ?, ?)",
                (user["id"], body.title.strip(), body.description)
            )
            conn.commit()
            return {"id": cur.lastrowid, "title": body.title, "status": "active",
                    "created_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()}
        finally:
            conn.close()

    @app.put("/api/detective/cases/{case_id}")
    async def update_case(case_id: int, body: CaseUpdate, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            fields, vals = [], []
            if body.title is not None:
                fields.append("title = ?"); vals.append(body.title.strip())
            if body.description is not None:
                fields.append("description = ?"); vals.append(body.description)
            if body.status is not None and body.status in ("active", "closed", "archived"):
                fields.append("status = ?"); vals.append(body.status)
            if fields:
                fields.append("updated_at = datetime('now')")
                conn.execute(f"UPDATE detective_cases SET {', '.join(fields)} WHERE id = ?", [*vals, case_id])
                conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    @app.delete("/api/detective/cases/{case_id}")
    async def delete_case(case_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            conn.execute("DELETE FROM detective_cases WHERE id = ? AND user_id = ?", (case_id, user["id"]))
            conn.commit()
            case_dir = os.path.join(DETECTIVE_STORAGE, f"user_{user['id']}", f"case_{case_id}")
            if os.path.exists(case_dir):
                shutil.rmtree(case_dir, ignore_errors=True)
            return {"ok": True}
        finally:
            conn.close()


    # ── Investigation Log Entries ─────────────────────────────────────────────

    @app.get("/api/detective/cases/{case_id}/entries")
    async def list_entries(case_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            rows = conn.execute(
                "SELECT id, content, entry_type, severity, created_at, "
                "attachment_filename, attachment_analysis, attachment_status "
                "FROM detective_entries WHERE case_id = ? ORDER BY created_at DESC",
                (case_id,)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def _bg_intelligence_refresh(case_id: int, user_id: int):
        """Background task: refresh intelligence brief. Called via FastAPI BackgroundTasks."""
        try:
            bg_conn = _db()
            _update_intelligence(case_id, user_id, bg_conn)
            bg_conn.close()
            logger.info(f"[detective] bg intelligence refresh complete for case {case_id}")
        except Exception as be:
            logger.info(f"[detective] bg intelligence refresh failed: {be}")

    @app.post("/api/detective/cases/{case_id}/entries")
    async def create_entry(case_id: int, body: EntryCreate, background_tasks: BackgroundTasks, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            cur = conn.execute(
                "INSERT INTO detective_entries (case_id, user_id, content, entry_type, severity) VALUES (?, ?, ?, ?, ?)",
                (case_id, user["id"], body.content.strip(), body.entry_type or "note", body.severity or "medium")
            )
            conn.execute("UPDATE detective_cases SET updated_at = datetime('now') WHERE id = ?", (case_id,))
            conn.commit()
            entry_id = cur.lastrowid

            # Debounce: only refresh if last update was 10+ min ago
            intel = _get_intelligence(case_id, user["id"], conn)
            should_refresh = True
            if intel and intel["last_updated"]:
                try:
                    last = datetime.strptime(intel["last_updated"][:19], "%Y-%m-%d %H:%M:%S")
                    age = (datetime.utcnow() - last).total_seconds()
                    logger.info(f"[detective] intelligence age: {age:.0f}s for case {case_id}")
                    if age < 600:
                        should_refresh = False
                        logger.info(f"[detective] debounce active — skipping refresh for case {case_id}")
                except Exception as de:
                    logger.warning(f"[detective] debounce check failed: {de}")

            logger.info(f"[detective] should_refresh={should_refresh} for case {case_id}")
            if should_refresh:
                background_tasks.add_task(_bg_intelligence_refresh, case_id, user["id"])
                logger.info(f"[detective] queued intelligence refresh for case {case_id}")

            return {"id": entry_id, "content": body.content, "entry_type": body.entry_type,
                    "severity": body.severity, "created_at": datetime.utcnow().isoformat()}
        finally:
            conn.close()

    @app.delete("/api/detective/cases/{case_id}/entries/{entry_id}")
    async def delete_entry(case_id: int, entry_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            conn.execute(
                "DELETE FROM detective_entries WHERE id = ? AND case_id = ? AND user_id = ?",
                (entry_id, case_id, user["id"])
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()


    # ── Entry Attachments ─────────────────────────────────────────────────────

    _ENTRY_ATTACHMENT_VISION_PROMPT = (
        "You are analyzing an image attached to an investigation log entry. "
        "\n\nCRITICAL CONTEXT: The person who submitted this image is the INVESTIGATOR documenting the situation "
        "— they are the one logging observations. They are NOT a subject or participant in anything shown in this image. "
        "Do not attribute actions, behaviors, or roles in the photo to the person who submitted it. "
        "\n\nThe investigator's written note for this entry:\n\"{}\"\n\n"
        "With that context in mind, analyze this image as evidence relevant to their note. "
        "Be specific and observational: What exactly is happening in the image? Who or what appears to be the subject? "
        "What details (text, objects, locations, timestamps, expressions, behavior patterns) are visible and significant? "
        "How does this image relate to or support what the investigator wrote? "
        "Note anything that stands out as potentially important for documentation purposes."
    )

    @app.post("/api/detective/cases/{case_id}/entries/{entry_id}/attachment")
    async def upload_entry_attachment(
        case_id: int,
        entry_id: int,
        file: UploadFile = File(...),
        user: dict = Depends(_require_detective)
    ):
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=415, detail="Only JPEG, PNG, WEBP, and GIF images are allowed.")
        data = await file.read()
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image must be under 10 MB.")

        # Resize if needed to stay under Anthropic base64 limit
        ANTHROPIC_LIMIT = 4 * 1024 * 1024
        mime_out = file.content_type
        if len(data) > ANTHROPIC_LIMIT:
            try:
                from PIL import Image
                import io
                img = Image.open(io.BytesIO(data))
                img = img.convert("RGB")
                quality = 85
                while True:
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=quality, optimize=True)
                    compressed = buf.getvalue()
                    if len(compressed) <= ANTHROPIC_LIMIT or quality < 40:
                        data = compressed
                        mime_out = "image/jpeg"
                        break
                    quality -= 10
            except Exception as _re:
                logger.warning(f"[detective] entry attachment resize failed: {_re}")

        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            entry = conn.execute(
                "SELECT id, content FROM detective_entries WHERE id = ? AND case_id = ? AND user_id = ?",
                (entry_id, case_id, user["id"])
            ).fetchone()
            if not entry:
                raise HTTPException(status_code=404, detail="Entry not found.")

            # Remove old attachment file if one exists
            old = conn.execute(
                "SELECT attachment_path FROM detective_entries WHERE id = ?", (entry_id,)
            ).fetchone()
            if old and old["attachment_path"] and os.path.exists(old["attachment_path"]):
                try:
                    os.remove(old["attachment_path"])
                except Exception:
                    pass

            # Save new file
            case_dir = os.path.join(DETECTIVE_STORAGE, f"user_{user['id']}", f"case_{case_id}", "entry_attachments")
            os.makedirs(case_dir, exist_ok=True)
            ext = os.path.splitext(file.filename or "img.jpg")[1] or ".jpg"
            stored = f"entry_{entry_id}_{uuid.uuid4().hex[:8]}{ext}"
            fpath = os.path.join(case_dir, stored)
            with open(fpath, "wb") as fh:
                fh.write(data)

            # Set status to analyzing
            conn.execute(
                "UPDATE detective_entries SET attachment_path=?, attachment_filename=?, attachment_mime=?, "
                "attachment_status='analyzing', attachment_analysis=NULL WHERE id=?",
                (fpath, file.filename, mime_out, entry_id)
            )
            conn.commit()

            # Run context-aware vision analysis
            entry_content = entry["content"] or ""
            vision_prompt = _ENTRY_ATTACHMENT_VISION_PROMPT.format(
                entry_content.replace('"', '\"')[:600]
            )
            try:
                b64 = base64.standard_b64encode(data).decode()
                analysis = _call_vision(user["id"], b64, mime_out, vision_prompt)
                conn.execute(
                    "UPDATE detective_entries SET attachment_analysis=?, attachment_status='done' WHERE id=?",
                    (analysis, entry_id)
                )
                conn.commit()
                status_out = "done"
            except Exception as ex:
                logger.error(f"[detective] entry attachment vision failed: {ex}")
                analysis = f"Analysis unavailable: {str(ex)[:400]}"
                conn.execute(
                    "UPDATE detective_entries SET attachment_analysis=?, attachment_status='failed' WHERE id=?",
                    (analysis, entry_id)
                )
                conn.commit()
                status_out = "failed"

            return {
                "attachment_filename": file.filename,
                "attachment_analysis": analysis,
                "attachment_status": status_out,
            }
        finally:
            conn.close()

    @app.get("/api/detective/cases/{case_id}/entries/{entry_id}/attachment/image")
    async def get_entry_attachment(case_id: int, entry_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            row = conn.execute(
                "SELECT attachment_path, attachment_mime FROM detective_entries "
                "WHERE id = ? AND case_id = ? AND user_id = ?",
                (entry_id, case_id, user["id"])
            ).fetchone()
            if not row or not row["attachment_path"] or not os.path.exists(row["attachment_path"]):
                raise HTTPException(status_code=404, detail="Attachment not found.")
            return FileResponse(row["attachment_path"], media_type=row["attachment_mime"] or "image/jpeg")
        finally:
            conn.close()

    @app.delete("/api/detective/cases/{case_id}/entries/{entry_id}/attachment")
    async def delete_entry_attachment(case_id: int, entry_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            row = conn.execute(
                "SELECT attachment_path FROM detective_entries WHERE id = ? AND case_id = ? AND user_id = ?",
                (entry_id, case_id, user["id"])
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Entry not found.")
            if row["attachment_path"] and os.path.exists(row["attachment_path"]):
                try:
                    os.remove(row["attachment_path"])
                except Exception:
                    pass
            conn.execute(
                "UPDATE detective_entries SET attachment_path=NULL, attachment_filename=NULL, "
                "attachment_mime=NULL, attachment_analysis=NULL, attachment_status='none' WHERE id=?",
                (entry_id,)
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()



    # ── Photo Uploads + Vision Analysis ───────────────────────────────────────

    @app.get("/api/detective/cases/{case_id}/uploads")
    async def list_uploads(case_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            rows = conn.execute(
                "SELECT id, original_filename, file_size, mime_type, ai_analysis, analysis_status, created_at "
                "FROM detective_uploads WHERE case_id = ? ORDER BY created_at DESC",
                (case_id,)
            ).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d['image_url'] = f"/api/detective/cases/{case_id}/uploads/{r['id']}/image"
                d['source'] = 'upload'
                d['source_note'] = None
                result.append(d)
            # Include entry attachments
            entry_rows = conn.execute(
                "SELECT id, content, attachment_filename, attachment_analysis, attachment_status, created_at "
                "FROM detective_entries "
                "WHERE case_id = ? AND attachment_status IS NOT NULL AND attachment_status != 'none' "
                "AND attachment_filename IS NOT NULL ORDER BY created_at DESC",
                (case_id,)
            ).fetchall()
            for r in entry_rows:
                result.append({
                    'id': f"entry_{r['id']}",
                    'original_filename': r['attachment_filename'],
                    'file_size': None,
                    'mime_type': None,
                    'ai_analysis': r['attachment_analysis'],
                    'analysis_status': r['attachment_status'],
                    'created_at': r['created_at'],
                    'image_url': f"/api/detective/cases/{case_id}/entries/{r['id']}/attachment/image",
                    'source': 'entry',
                    'source_note': (r['content'] or '')[:100],
                })
            result.sort(key=lambda x: x['created_at'] or '', reverse=True)
            return result
        finally:
            conn.close()

    @app.post("/api/detective/cases/{case_id}/upload")
    async def upload_photo(case_id: int, file: UploadFile = File(...), user: dict = Depends(_require_detective)):
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=415, detail="Only JPEG, PNG, WEBP, and GIF images are allowed.")
        data = await file.read()
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image must be under 10 MB.")

        # Resize/compress if image would exceed Anthropic's 5MB base64 limit
        ANTHROPIC_LIMIT = 4 * 1024 * 1024  # 4MB raw to be safe after base64 overhead
        if len(data) > ANTHROPIC_LIMIT:
            try:
                from PIL import Image
                import io
                img = Image.open(io.BytesIO(data))
                img = img.convert("RGB")
                quality = 85
                while True:
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=quality, optimize=True)
                    compressed = buf.getvalue()
                    if len(compressed) <= ANTHROPIC_LIMIT or quality < 40:
                        data = compressed
                        file = type('F', (), {'content_type': 'image/jpeg', 'filename': file.filename})()
                        break
                    quality -= 10
            except Exception as _resize_err:
                logger.warning(f"[detective] image resize failed: {_resize_err}")

        case_dir = os.path.join(DETECTIVE_STORAGE, f"user_{user['id']}", f"case_{case_id}")
        os.makedirs(case_dir, exist_ok=True)

        ext = os.path.splitext(file.filename or "img.jpg")[1] or ".jpg"
        stored = f"{uuid.uuid4().hex}{ext}"
        fpath = os.path.join(case_dir, stored)
        with open(fpath, "wb") as fh:
            fh.write(data)

        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            cur = conn.execute(
                "INSERT INTO detective_uploads "
                "(case_id, user_id, original_filename, stored_filename, file_path, file_size, mime_type, analysis_status) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 'analyzing')",
                (case_id, user["id"], file.filename, stored, fpath, len(data), file.content_type)
            )
            conn.execute("UPDATE detective_cases SET updated_at = datetime('now') WHERE id = ?", (case_id,))
            conn.commit()
            upload_id = cur.lastrowid

            # Vision analysis
            try:
                b64 = base64.standard_b64encode(data).decode()
                analysis = _call_vision(
                    user["id"], b64, file.content_type,
                    "Analyze this image carefully. What do you see? What stands out? "
                    "Note specific details, any text visible, people, objects, locations, timestamps, "
                    "anything that might be significant for an investigation. Be specific and observational."
                )
                conn.execute(
                    "UPDATE detective_uploads SET ai_analysis = ?, analysis_status = 'done' WHERE id = ?",
                    (analysis, upload_id)
                )
                status_out = "done"
            except Exception as ex:
                logger.error(f"[detective] vision analysis failed: {ex}")
                analysis = f"Analysis unavailable: {str(ex)[:500]}"
                conn.execute(
                    "UPDATE detective_uploads SET ai_analysis = ?, analysis_status = 'failed' WHERE id = ?",
                    (analysis, upload_id)
                )
                status_out = "failed"
            conn.commit()

            return {
                "id": upload_id, "filename": file.filename, "file_size": len(data),
                "mime_type": file.content_type, "ai_analysis": analysis,
                "analysis_status": status_out, "created_at": datetime.utcnow().isoformat()
            }
        finally:
            conn.close()

    @app.get("/api/detective/cases/{case_id}/uploads/{upload_id}/image")
    async def get_image(case_id: int, upload_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            row = conn.execute(
                "SELECT file_path, mime_type FROM detective_uploads WHERE id = ? AND case_id = ? AND user_id = ?",
                (upload_id, case_id, user["id"])
            ).fetchone()
            if not row or not os.path.exists(row["file_path"]):
                raise HTTPException(status_code=404, detail="Image not found.")
            return FileResponse(row["file_path"], media_type=row["mime_type"] or "image/jpeg")
        finally:
            conn.close()

    @app.delete("/api/detective/cases/{case_id}/uploads/{upload_id}")
    async def delete_upload(case_id: int, upload_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            row = conn.execute(
                "SELECT file_path FROM detective_uploads WHERE id = ? AND case_id = ? AND user_id = ?",
                (upload_id, case_id, user["id"])
            ).fetchone()
            if row and row["file_path"] and os.path.exists(row["file_path"]):
                os.remove(row["file_path"])
            conn.execute("DELETE FROM detective_uploads WHERE id = ?", (upload_id,))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()


    # ── Case Partner Chat ─────────────────────────────────────────────────────

    @app.post("/api/detective/cases/{case_id}/chat")
    async def case_chat(case_id: int, body: ChatRequest, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            # _efficient_case_context always includes: intel brief (if exists), recent entries
            # + attachment analyses, gallery photo analyses, wire history, journal background.
            context_block = _efficient_case_context(case_id, user["id"], conn)
            system = _PARTNER_SYSTEM + f"\n\nHere's everything you know:\n\n{context_block}"

            # Format conversation history into the prompt (ai_client is single-turn)
            history_text = ""
            # Prepend compressed context if available (earlier conversation summary)
            if body.compressed_context:
                history_text += f"[EARLIER CONVERSATION SUMMARY]\n{body.compressed_context}\n[END SUMMARY]\n"
            for msg in (body.history or [])[-8:]:
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role == "user":
                    history_text += f"\nYou: {content}"
                elif role == "assistant":
                    history_text += f"\nCase Partner: {content}"

            user_prompt = history_text.strip()
            if user_prompt:
                user_prompt += f"\n\nYou: {body.message}"
            else:
                user_prompt = body.message

            from src.api.ai_client import create_message
            response = create_message(
                user["id"],
                system=system,
                user_prompt=user_prompt,
                max_tokens=900,
                call_type="detective_chat",
            )
            return {"response": response}
        except HTTPException:
            raise
        except Exception as ex:
            logger.error(f"[detective] chat failed: {ex}")
            raise HTTPException(status_code=500, detail="AI call failed. Check your API key in Settings.")
        finally:
            conn.close()


    # ── Drop a Wire ───────────────────────────────────────────────────────────

    @app.post("/api/detective/cases/{case_id}/wire")
    async def drop_wire(case_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            # Full context: log entries + attachment analyses + gallery photos +
            # prior wire briefings + journal background — everything.
            journal_summary = _journal_cache(user["id"], conn)
            case_ctx = _case_context(case_id, user["id"], conn)
            context_block = f"{case_ctx}\n\n--- JOURNAL BACKGROUND ---\n{journal_summary}"
            system = _PARTNER_SYSTEM + f"\n\nHere's the complete case file — every piece of evidence:\n\n{context_block}"

            from src.api.ai_client import create_message
            briefing = create_message(
                user["id"],
                system=system,
                user_prompt=_WIRE_PROMPT,
                max_tokens=1400,
                call_type="detective_wire",
            )

            conn.execute(
                "INSERT INTO detective_wire_history (case_id, user_id, briefing) VALUES (?, ?, ?)",
                (case_id, user["id"], briefing)
            )
            conn.commit()
            # Auto-update case intelligence after wire drop (non-critical — won't fail the request)
            try:
                _update_intelligence(case_id, user["id"], conn)
            except Exception as _ie:
                logger.warning(f"[detective] intelligence auto-update failed (non-critical): {_ie}")
            return {"briefing": briefing}
        except HTTPException:
            raise
        except Exception as ex:
            logger.error(f"[detective] wire failed: {ex}")
            raise HTTPException(status_code=500, detail="Wire failed. Check your API key in Settings.")
        finally:
            conn.close()


    # ── Cache Management ──────────────────────────────────────────────────────

    @app.post("/api/detective/cache/refresh")
    async def refresh_cache(user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            conn.execute("DELETE FROM detective_cache WHERE user_id = ?", (user["id"],))
            conn.commit()
            summary = _journal_cache(user["id"], conn)
            return {"ok": True, "summary_preview": summary[:200]}
        finally:
            conn.close()


    # ── Chat Persistence ─────────────────────────────────────────────────────

    @app.get("/api/detective/cases/{case_id}/chat/sessions")
    async def list_chat_sessions(case_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            rows = conn.execute(
                """SELECT session_id,
                          MIN(created_at) as started_at,
                          COUNT(*) as message_count
                   FROM detective_chat_messages
                   WHERE case_id = ? AND user_id = ?
                   GROUP BY session_id
                   ORDER BY started_at DESC""",
                (case_id, user["id"])
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    @app.get("/api/detective/cases/{case_id}/chat/session/{session_id}")
    async def load_chat_session(case_id: int, session_id: str, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            rows = conn.execute(
                """SELECT role, content, created_at
                   FROM detective_chat_messages
                   WHERE case_id = ? AND user_id = ? AND session_id = ?
                   ORDER BY created_at ASC""",
                (case_id, user["id"], session_id)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def _bg_digest_and_purge(case_id: int, user_id: int, session_ids: list):
        """Background: digest chat history into intelligence brief, then purge old sessions."""
        try:
            bg_conn = _db()
            try:
                all_msgs = bg_conn.execute(
                    """SELECT role, content, created_at FROM detective_chat_messages
                       WHERE case_id = ? AND user_id = ?
                       AND role IN ('user', 'assistant')
                       ORDER BY created_at ASC""",
                    (case_id, user_id)
                ).fetchall()

                if len(all_msgs) >= 4:
                    from src.api.ai_client import create_message
                    chat_text = "\n".join(
                        f"{'User' if m['role'] == 'user' else 'Case Partner'}: {m['content'][:300]}"
                        for m in all_msgs[-40:]
                    )
                    # Use _case_context (full evidence: entries + attachments + photos + wires)
                    full_ctx = _case_context(case_id, user_id, bg_conn)
                    journal_summary = _journal_cache(user_id, bg_conn)
                    combined = (
                        f"{full_ctx}\n\n"
                        f"--- JOURNAL BACKGROUND ---\n{journal_summary}\n\n"
                        f"--- CONVERSATION HISTORY (being archived) ---\n{chat_text}"
                    )
                    summary = create_message(
                        user_id,
                        system=(
                            "You are updating a persistent case intelligence brief. "
                            "The conversation history shown is being archived — extract anything important "
                            "from it and incorporate it into the brief along with all case evidence. "
                            "Follow the format instructions exactly."
                        ),
                        user_prompt=_INTELLIGENCE_UPDATE_PROMPT + f"\n\nFULL CASE DATA + ARCHIVED CHATS:\n{combined}",
                        max_tokens=800,
                        call_type="detective_intelligence",
                    )
                    entry_count = bg_conn.execute(
                        "SELECT COUNT(*) as cnt FROM detective_entries WHERE case_id = ?", (case_id,)
                    ).fetchone()["cnt"]
                    wire_count = bg_conn.execute(
                        "SELECT COUNT(*) as cnt FROM detective_wire_history WHERE case_id = ?", (case_id,)
                    ).fetchone()["cnt"]
                    bg_conn.execute(
                        """INSERT INTO case_intelligence (case_id, user_id, summary, entry_count, wire_count, last_updated)
                           VALUES (?, ?, ?, ?, ?, datetime('now'))
                           ON CONFLICT(case_id) DO UPDATE SET
                             summary = excluded.summary,
                             entry_count = excluded.entry_count,
                             wire_count = excluded.wire_count,
                             last_updated = excluded.last_updated""",
                        (case_id, user_id, summary, entry_count, wire_count)
                    )
                    bg_conn.commit()
                    logger.info(f"[detective] bg digest complete for case {case_id}")

                # Purge old sessions (keep 2 most recent)
                if len(session_ids) >= 2:
                    keep_ids = set(session_ids[:2])
                    purge_ids = [s for s in session_ids if s not in keep_ids]
                    for sid in purge_ids:
                        bg_conn.execute(
                            "DELETE FROM detective_chat_messages WHERE case_id = ? AND user_id = ? AND session_id = ?",
                            (case_id, user_id, sid)
                        )
                    bg_conn.commit()
                    if purge_ids:
                        logger.info(f"[detective] purged {len(purge_ids)} old session(s) for case {case_id}")
            finally:
                bg_conn.close()
        except Exception as be:
            logger.warning(f"[detective] bg digest/purge failed: {be}")

    @app.post("/api/detective/cases/{case_id}/chat/session")
    async def new_chat_session(case_id: int, background_tasks: BackgroundTasks, user: dict = Depends(_require_detective)):
        import uuid as _uuid
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)

            sessions = conn.execute(
                """SELECT session_id, MIN(created_at) as started_at
                   FROM detective_chat_messages
                   WHERE case_id = ? AND user_id = ?
                   GROUP BY session_id
                   ORDER BY started_at DESC""",
                (case_id, user["id"])
            ).fetchall()

            session_id = str(_uuid.uuid4())

            # Fire digest + purge in background — don't block the response
            if sessions:
                session_ids = [s["session_id"] for s in sessions]
                background_tasks.add_task(_bg_digest_and_purge, case_id, user["id"], session_ids)

            return {"session_id": session_id}
        finally:
            conn.close()

    @app.get("/api/detective/cases/{case_id}/chat/latest-session")
    async def latest_chat_session(case_id: int, user: dict = Depends(_require_detective)):
        """Returns the most recent session_id and its messages. Used on mount."""
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            row = conn.execute(
                """SELECT session_id FROM detective_chat_messages
                   WHERE case_id = ? AND user_id = ?
                   ORDER BY created_at DESC LIMIT 1""",
                (case_id, user["id"])
            ).fetchone()
            if not row:
                import uuid as _uuid
                return {"session_id": str(_uuid.uuid4()), "messages": []}
            session_id = row["session_id"]
            msgs = conn.execute(
                """SELECT role, content FROM detective_chat_messages
                   WHERE case_id = ? AND user_id = ? AND session_id = ?
                   ORDER BY created_at ASC""",
                (case_id, user["id"], session_id)
            ).fetchall()
            return {"session_id": session_id, "messages": [dict(m) for m in msgs]}
        finally:
            conn.close()

    @app.post("/api/detective/cases/{case_id}/chat/messages")
    async def save_chat_messages(case_id: int, body: SaveMessagesRequest, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            conn.executemany(
                """INSERT INTO detective_chat_messages (case_id, user_id, session_id, role, content)
                   VALUES (?, ?, ?, ?, ?)""",
                [(case_id, user["id"], body.session_id, m["role"], m["content"])
                 for m in body.messages if m.get("role") and m.get("content")]
            )
            conn.commit()
            return {"ok": True, "saved": len(body.messages)}
        finally:
            conn.close()

    # ── Chat Compression ─────────────────────────────────────────────────────

    @app.post("/api/detective/cases/{case_id}/chat/compress")
    async def compress_chat(case_id: int, body: CompressRequest, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            if not body.messages:
                return {"summary": "No prior conversation."}

            convo_text = ""
            for msg in body.messages:
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role == "user":
                    convo_text += f"User: {content}\n"
                elif role == "assistant":
                    convo_text += f"Case Partner: {content}\n"

            from src.api.ai_client import create_message
            summary = create_message(
                user["id"],
                system=(
                    "You are compressing an investigation conversation to save tokens. "
                    "Summarize the key points discussed: decisions made, leads identified, "
                    "things ruled out, emotional context, and any action items. "
                    "Dense and factual. Max 200 words. Write in third person past tense."
                ),
                user_prompt=f"Compress this conversation:\n\n{convo_text}",
                max_tokens=350,
                call_type="detective_chat_compress",
            )
            return {"summary": summary}
        except HTTPException:
            raise
        except Exception as ex:
            logger.error(f"[detective] compress failed: {ex}")
            raise HTTPException(status_code=500, detail="Compression failed.")
        finally:
            conn.close()

    # ── Case Intelligence ─────────────────────────────────────────────────────

    @app.get("/api/detective/cases/{case_id}/intelligence")
    async def get_case_intelligence(case_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            intel = _get_intelligence(case_id, user["id"], conn)
            if not intel:
                return {"summary": None, "entry_count": 0, "wire_count": 0, "last_updated": None}
            return dict(intel)
        finally:
            conn.close()

    @app.post("/api/detective/cases/{case_id}/intelligence/refresh")
    async def refresh_case_intelligence(case_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            _update_intelligence(case_id, user["id"], conn)
            intel = _get_intelligence(case_id, user["id"], conn)
            return dict(intel)
        except Exception as ex:
            logger.error(f"[detective] intelligence refresh failed: {ex}")
            raise HTTPException(status_code=500, detail="Intelligence update failed. Check your API key in Settings.")
        finally:
            conn.close()

    @app.get("/api/detective/cases/{case_id}/wire-history")
    async def get_wire_history(case_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            rows = conn.execute(
                "SELECT id, briefing, created_at FROM detective_wire_history "
                "WHERE case_id = ? AND user_id = ? ORDER BY created_at DESC",
                (case_id, user["id"])
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    # ── Admin: Access Management ──────────────────────────────────────────────

    @app.get("/api/detective/admin/users")
    async def admin_list_users(user: dict = Depends(require_owner)):
        conn = _db()
        try:
            rows = conn.execute(
                "SELECT u.id, u.username, u.role, "
                "CASE WHEN da.user_id IS NOT NULL THEN 1 ELSE 0 END as has_access "
                "FROM users u LEFT JOIN detective_access da ON da.user_id = u.id "
                "WHERE u.role != 'owner' ORDER BY u.username"
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    @app.get("/api/detective/admin/access")
    async def admin_list_access(user: dict = Depends(require_owner)):
        conn = _db()
        try:
            rows = conn.execute(
                "SELECT da.user_id, u.username, da.granted_at "
                "FROM detective_access da JOIN users u ON u.id = da.user_id "
                "ORDER BY da.granted_at DESC"
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    @app.post("/api/detective/admin/grant")
    async def admin_grant(body: GrantRequest, user: dict = Depends(require_owner)):
        conn = _db()
        try:
            target = conn.execute("SELECT id, username FROM users WHERE id = ?", (body.user_id,)).fetchone()
            if not target:
                raise HTTPException(status_code=404, detail="User not found.")
            conn.execute(
                "INSERT OR IGNORE INTO detective_access (user_id, granted_by) VALUES (?, ?)",
                (body.user_id, user["id"])
            )
            conn.commit()
            return {"ok": True, "granted_to": target["username"]}
        finally:
            conn.close()

    @app.delete("/api/detective/admin/revoke/{target_user_id}")
    async def admin_revoke(target_user_id: int, user: dict = Depends(require_owner)):
        conn = _db()
        try:
            conn.execute("DELETE FROM detective_access WHERE user_id = ?", (target_user_id,))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
