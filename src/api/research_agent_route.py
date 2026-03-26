"""
src/api/research_agent_route.py
AI Research Agent — deployed from Detective Engine.

Uses Anthropic's built-in web_search tool (web_search_20250305) to gather
publicly available information about a subject and stores it as a case entry.

Routes:
  POST /api/detective/cases/{id}/research  — run research agent
  GET  /api/detective/cases/{id}/research  — list research reports for case
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional, List

from fastapi import Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("journal")

# ── Research system prompt ────────────────────────────────────────────────────

_RESEARCH_SYSTEM = """You are an AI research agent embedded in a private journaling and case-building platform.
Your job is to research ONE SPECIFIC INDIVIDUAL using ONLY publicly available information that anyone can legally access.

══════════════════════════════════════════════════
CRITICAL: IDENTITY FOCUS — YOU ARE RESEARCHING ONE PERSON
══════════════════════════════════════════════════
- You must lock onto a SINGLE, SPECIFIC individual. Do NOT mix information from multiple people who share a name.
- Common names (e.g. "John Smith", "Maria Garcia") will return results for many different people. You must ONLY include information that can be confidently attributed to the TARGET individual based on the provided identifiers (location, employer, relationship, etc.).
- PHASE 1 — IDENTIFY FIRST: Before broad research, your first search must narrow down which specific person you are targeting. Use the provided identifiers (city, employer, relationship, age range) to run a targeted disambiguation search.
- If you find multiple people with the same name, clearly note this and only report on the one matching the provided identifiers.
- If you cannot confidently distinguish the target from other people with the same name, say so clearly in the Subject Overview section rather than guessing.
- DISCARD any search result that appears to be about a different person with a similar name. When in doubt, skip it.
══════════════════════════════════════════════════

WHAT TO RESEARCH (public sources only):
- Full name variations, nicknames, aliases
- Public social media profiles (LinkedIn, Twitter/X, Facebook, Instagram — public accounts only)
- News articles and press mentions
- Public business records, LLC filings, professional licenses
- Publicly available court records, restraining orders, criminal convictions
- General location/city if mentioned in public records
- Employment history from public professional profiles
- Public reviews, ratings, complaints

DO NOT:
- Mix information from different people who share the same or similar name
- Access private information, hack, or use unauthorized methods
- Speculate beyond what sources confirm
- Make assumptions about guilt or intent
- Access anything behind a paywall or login wall
- Search for or report private home addresses unless explicitly in public court filings

FORMAT your final report exactly as follows (use these exact headers):

# 🔍 Research Report: [Subject Name]
**Generated:** [current date]
**Identity Anchors Used:** [list the identifiers used to distinguish this person, e.g. "Location: Austin TX, Employer: Acme Corp"]

## Subject Overview
[2-3 sentence synthesis of who this person is. If name collision risk exists, explicitly state which person this report covers and how they were distinguished.]

## Online Presence
[public social profiles, usernames, bios found — include URLs. Only include profiles confirmed to belong to THIS individual.]

## Professional Background
[employment, business affiliations, licenses — only from public sources]

## Location
[city/region if found in public records — no private residential addresses]

## News & Public Record
[media mentions, public legal records, notable public events]

## Red Flags
[concerning patterns, prior legal issues, inconsistencies between stated and found info — or "None identified"]

## Intelligence Summary
[dense paragraph for the investigator — what matters most, what to watch for, what's confirmed vs unconfirmed. Note confidence level for each key finding.]

## Name Collision Notes
[If other people with the same name were encountered during research, list them briefly here so the investigator knows what was excluded and why — or "None encountered"]

## Sources Consulted
[list each URL or source you actually searched]

## Possible Matched Photos
[IMPORTANT: Only include this section if photo search was requested AND you found image URLs that are likely profile or identity photos for THIS specific individual — not stock images, not random people, not logos.]
[For each candidate photo URL found, output ONE line per photo in EXACTLY this format:]
[PHOTO_URL]: https://actual-direct-image-url.jpg | Source: LinkedIn | Caption: John Smith profile photo - Software Engineer

[Rules for photo URLs:]
[- Must be a direct image URL ending in .jpg, .jpeg, .png, .gif, .webp, or a known CDN image path]
[- Must come from the subject's identified social profile, news article, or professional listing]
[- Do NOT include Google search thumbnail URLs (lh3.googleusercontent.com/p/ short links etc.) — find the original source URL]
[- If no photos found, write: No photos identified]
[- Maximum 6 photo entries]

---
⚠️ This report contains only publicly available information. For personal safety and legal case-building purposes only."""


class ResearchRequest(BaseModel):
    subject: str
    context: Optional[str] = None
    focus: Optional[List[str]] = None  # e.g. ["employment", "social", "legal", "address"]
    identifiers: Optional[dict] = None  # e.g. {"location": "Austin TX", "employer": "Acme", "relationship": "ex-partner", "age_range": "30s"}
    include_photos: bool = True  # Whether to search for and return matched profile photos
    search_options: Optional[List[str]] = None  # e.g. ["court", "business", "social", "news", "licenses", "phone", "address"]


def _serialize_block(block) -> dict:
    """Serialize an Anthropic content block to a plain dict for re-injection."""
    btype = getattr(block, "type", None)
    if btype == "text":
        return {"type": "text", "text": block.text}
    if btype == "tool_use":
        return {
            "type": "tool_use",
            "id": block.id,
            "name": block.name,
            "input": block.input,
        }
    # web_search_tool_result and any other types
    try:
        return block.model_dump()
    except Exception:
        pass
    try:
        return block.dict()
    except Exception:
        pass
    return {"type": str(btype)}


async def _run_agent(subject: str, context: Optional[str], focus: Optional[List[str]], identifiers: Optional[dict], include_photos: bool, search_options: Optional[List[str]], api_key: str, model: str) -> str:
    """Run the agentic web search loop and return the final report text."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    focus_str = ", ".join(focus) if focus else "all public information including employment, social media, legal records, and location"

    # Build identity anchors block — critical for disambiguation
    identity_lines = []
    if identifiers:
        if identifiers.get("location"):
            identity_lines.append(f"  Location/City: {identifiers['location']}")
        if identifiers.get("employer"):
            identity_lines.append(f"  Employer/Organization: {identifiers['employer']}")
        if identifiers.get("relationship"):
            identity_lines.append(f"  Relationship to investigator: {identifiers['relationship']}")
        if identifiers.get("age_range"):
            identity_lines.append(f"  Approximate age/age range: {identifiers['age_range']}")
        if identifiers.get("other"):
            identity_lines.append(f"  Other identifiers: {identifiers['other']}")

    user_prompt = f"TARGET SUBJECT: {subject}\n"

    if identity_lines:
        user_prompt += "\nIDENTITY ANCHORS (use these to distinguish the target from others with the same name):\n"
        user_prompt += "\n".join(identity_lines) + "\n"
    else:
        user_prompt += "\n⚠️  No identity anchors provided. Use any contextual clues below to distinguish the subject. If the name is common, note name collision risk clearly in the report.\n"

    user_prompt += f"\nFocus areas: {focus_str}\n"

    if context:
        user_prompt += f"\nAdditional investigator context: {context}\n"

    # Build search options instruction block
    SEARCH_OPTION_MAP = {
        "court":     "Perform a deep search of court records, restraining orders, criminal history, civil litigation, and public legal filings.",
        "business":  "Search business registrations, LLC filings, UCC filings, professional licenses, registered agents, and corporate officer records.",
        "social":    "Do a thorough deep-dive across all public social media: LinkedIn, Twitter/X, Facebook, Instagram, TikTok, Reddit, YouTube. Look for usernames, bios, post history (public only), follower counts, and connections.",
        "news":      "Search news archives, local newspapers, press releases, and media mentions. Include older archived articles, not just recent coverage.",
        "licenses":  "Search state professional license databases, contractor licenses, medical/legal/financial licenses, certifications, and any regulatory filings.",
        "phone":     "Search public white pages, reverse phone directories, and any publicly listed phone numbers associated with the subject.",
        "address":   "Search public voter registration records, property tax records, business registered addresses, and any publicly filed address information. No private residential addresses unless in public court filings.",
        "photos":    "Search for publicly available profile photos, headshots, and identity images. Return direct image URLs in the [PHOTO_URL]: format specified.",
    }

    active_options = search_options or ["court", "business", "social", "news", "licenses"]
    if include_photos and "photos" not in active_options:
        active_options = list(active_options) + ["photos"]

    option_instructions = []
    for opt in active_options:
        if opt in SEARCH_OPTION_MAP:
            option_instructions.append(f"  [{opt.upper()}] {SEARCH_OPTION_MAP[opt]}")

    if option_instructions:
        user_prompt += "\nACTIVE SEARCH MODULES:\n" + "\n".join(option_instructions) + "\n"

    if not include_photos:
        user_prompt += "\n⚠️ Photo search is DISABLED. Do NOT include the 'Possible Matched Photos' section in the report.\n"

    user_prompt += (
        "\nINSTRUCTIONS:\n"
        "PHASE 1 — Start with a targeted disambiguation search using the subject name + identity anchors "
        "(e.g. search 'John Smith Austin Texas software engineer'). Lock onto the specific individual before broad research.\n"
        "PHASE 2 — Once you have confirmed the identity of the target, execute the ACTIVE SEARCH MODULES above thoroughly.\n"
        "PHASE 3 — Compile the comprehensive research report using the exact format specified. "
        "Only include information you can confidently attribute to THIS specific individual."
    )

    messages = [{"role": "user", "content": user_prompt}]
    tools = [{"type": "web_search_20250305", "name": "web_search"}]

    MAX_ITERATIONS = 10
    for iteration in range(MAX_ITERATIONS):
        logger.info(f"[research_agent] iteration {iteration + 1} for subject '{subject}'")

        response = client.messages.create(
            model=model,
            max_tokens=4000,
            system=_RESEARCH_SYSTEM,
            tools=tools,
            messages=messages,
        )

        logger.info(f"[research_agent] stop_reason={response.stop_reason}, blocks={len(response.content)}")

        if response.stop_reason == "end_turn":
            # Extract final text
            parts = []
            for block in response.content:
                if getattr(block, "type", None) == "text":
                    parts.append(block.text)
            result = "\n".join(parts).strip()
            if result:
                return result
            # Edge case: no text blocks — shouldn't happen but be safe
            return "Research agent completed but returned no text. Try again with a more specific subject name."

        elif response.stop_reason == "tool_use":
            # Append the full assistant response (includes tool_use + auto-executed tool_result blocks)
            serialized = [_serialize_block(b) for b in response.content]
            messages.append({"role": "assistant", "content": serialized})

            # Build the user turn: pass tool_results for each tool_use block
            tool_results = []
            result_map: dict[str, list] = {}

            # Map any tool_result blocks already present in the response (Anthropic auto-executes)
            for block in response.content:
                btype = getattr(block, "type", None)
                if btype in ("tool_result", "web_search_tool_result"):
                    tool_use_id = getattr(block, "tool_use_id", None)
                    if tool_use_id:
                        result_map[tool_use_id] = _serialize_block(block)

            for block in response.content:
                if getattr(block, "type", None) == "tool_use":
                    bid = block.id
                    if bid in result_map:
                        tool_results.append(result_map[bid])
                    else:
                        # Fallback: Anthropic already executed it server-side, just ack
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": bid,
                            "content": "",
                        })

            if tool_results:
                messages.append({"role": "user", "content": tool_results})
            else:
                # No tool results to return — force continuation
                messages.append({"role": "user", "content": "Please continue and compile your research report now."})

        else:
            # Unknown stop reason — extract whatever text we have
            parts = []
            for block in response.content:
                if getattr(block, "type", None) == "text":
                    parts.append(block.text)
            return "\n".join(parts).strip() or f"Research agent stopped unexpectedly (stop_reason={response.stop_reason})."

    return "Research agent reached iteration limit. Partial data may have been gathered — try running again with narrower focus areas."


def register_research_agent_routes(app, require_any_user, require_owner):

    def _db():
        from src.auth.auth_db import get_db
        return get_db()

    def _has_detective_access(user: dict) -> bool:
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
        if not _has_detective_access(user):
            raise HTTPException(status_code=403, detail="Detective Mode access required.")
        return user

    def _get_anthropic_key_and_model(user_id: int) -> tuple[str, str]:
        """Get API key + model. Research agent requires Anthropic (web_search is Anthropic-only)."""
        from src.api.ai_client import get_user_ai_settings, _load_config, DEFAULT_MODELS
        settings = get_user_ai_settings(user_id)
        provider = settings.get("ai_provider") or "anthropic"
        if provider != "anthropic":
            raise HTTPException(
                status_code=400,
                detail=f"Research Agent requires an Anthropic API key. Your current provider is '{provider}'. Switch to Anthropic in Settings → AI Preferences."
            )
        cfg = _load_config()
        key = settings.get("ai_api_key") or cfg.get("anthropic", {}).get("api_key", "")
        if not key:
            raise HTTPException(
                status_code=400,
                detail="No Anthropic API key configured. Add one in Settings → AI Preferences."
            )
        model = settings.get("ai_model") or cfg.get("anthropic", {}).get("model", DEFAULT_MODELS["anthropic"])
        return key, model

    def _get_case(case_id: int, user_id: int, conn):
        row = conn.execute(
            "SELECT id, title FROM detective_cases WHERE id = ? AND user_id = ?",
            (case_id, user_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found.")
        return row

    # ── POST: run research agent ──────────────────────────────────────────────

    @app.post("/api/detective/cases/{case_id}/research")
    async def run_research_agent(
        case_id: int,
        body: ResearchRequest,
        user: dict = Depends(_require_detective),
    ):
        if not body.subject or not body.subject.strip():
            raise HTTPException(status_code=400, detail="Subject name is required.")

        subject = body.subject.strip()
        api_key, model = _get_anthropic_key_and_model(user["id"])

        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
        finally:
            conn.close()

        logger.info(f"[research_agent] starting research on '{subject}' for case {case_id}, user {user['id']}")

        try:
            report = await _run_agent(
                subject=subject,
                context=body.context,
                focus=body.focus,
                identifiers=body.identifiers,
                include_photos=body.include_photos,
                search_options=body.search_options,
                api_key=api_key,
                model=model,
            )
        except Exception as e:
            logger.error(f"[research_agent] agent error: {e}")
            raise HTTPException(status_code=500, detail=f"Research agent failed: {str(e)}")

        # Store as detective entry — flows into case context automatically
        entry_content = f"[RESEARCH AGENT REPORT]\nSubject: {subject}\n\n{report}"
        conn = _db()
        try:
            cur = conn.execute(
                "INSERT INTO detective_entries (case_id, user_id, content, entry_type, severity) "
                "VALUES (?, ?, ?, ?, ?)",
                (case_id, user["id"], entry_content, "research_report", "info"),
            )
            conn.execute(
                "UPDATE detective_cases SET updated_at = datetime('now') WHERE id = ?",
                (case_id,)
            )
            conn.commit()
            entry_id = cur.lastrowid
        finally:
            conn.close()

        logger.info(f"[research_agent] report saved as entry {entry_id} for case {case_id}")

        return {
            "entry_id": entry_id,
            "subject": subject,
            "report": report,
            "saved_at": datetime.utcnow().isoformat(),
        }

    # ── GET: list research reports for a case ─────────────────────────────────

    @app.get("/api/detective/cases/{case_id}/research")
    async def list_research_reports(
        case_id: int,
        user: dict = Depends(_require_detective),
    ):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            rows = conn.execute(
                "SELECT id, content, created_at FROM detective_entries "
                "WHERE case_id = ? AND user_id = ? AND entry_type = 'research_report' "
                "ORDER BY created_at DESC",
                (case_id, user["id"])
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
