"""
onboarding_routes.py  —  src/api/onboarding_routes.py
Self-registration, AI memory preview, and user memory storage.

Wire up in main.py (before the static file mount):

    from src.api.onboarding_routes import register_onboarding_routes
    register_onboarding_routes(app, require_any_user, require_owner)
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import anthropic
import yaml
from fastapi import Depends, HTTPException
from pydantic import BaseModel

# ─── Paths ────────────────────────────────────────────────────────────────────
from src.config import CONFIG_PATH, USER_MEMORY_DIR as MEMORY_DIR, load_config
# MEMORY_DIR imported from src.config as USER_MEMORY_DIR
MEMORY_DIR.mkdir(parents=True, exist_ok=True)


def _load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


# ─── Pydantic models ──────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class MemoryPreviewRequest(BaseModel):
    preferred_name:  Optional[str] = None
    pronouns:        Optional[str] = None
    situation_type:  Optional[str] = None
    situation_story: Optional[str] = None
    people:          Optional[list] = []
    topics:          Optional[list] = []
    goals:           Optional[list] = []


class MemorySaveRequest(MemoryPreviewRequest):
    ai_summary: Optional[str] = None


class MemoryUpdateRequest(BaseModel):
    """Partial update — only provided fields are changed."""
    preferred_name:  Optional[str] = None
    pronouns:        Optional[str] = None
    situation_type:  Optional[str] = None
    situation_story: Optional[str] = None
    people:          Optional[list] = None
    topics:          Optional[list] = None
    goals:           Optional[list] = None
    ai_summary:      Optional[str] = None
    preferred_tone:  Optional[str] = None


# ─── Memory file helpers ──────────────────────────────────────────────────────
def _memory_path(user_id: int) -> Path:
    return MEMORY_DIR / f"user_{user_id}.json"


def load_user_memory(user_id: int) -> dict:
    """Returns memory dict or empty dict if none exists."""
    p = _memory_path(user_id)
    if not p.exists():
        return {}
    with open(p) as f:
        return json.load(f)


def save_user_memory(user_id: int, data: dict) -> dict:
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(_memory_path(user_id), "w") as f:
        json.dump(data, f, indent=2)
    return data


def build_memory_context_string(memory: dict) -> str:
    """
    Formats user memory as a context block injected into AI prompts.
    Returns empty string if no useful memory.
    """
    if not memory:
        return ""

    parts = ["=== USER CONTEXT (from memory profile) ==="]

    if memory.get("preferred_name"):
        name_line = f"Name: {memory['preferred_name']}"
        if memory.get("pronouns"):
            name_line += f" ({memory['pronouns']})"
        parts.append(name_line)

    sit_map = {
        "relationship": "Relationship difficulty / planning to leave",
        "custody":      "Custody / co-parenting conflict",
        "workplace":    "Workplace conflict or HR matter",
        "housing":      "Housing instability or unsafe living",
        "legal":        "Ongoing legal matter",
        "mental_health":"Mental health tracking",
        "growth":       "Personal growth and self-reflection",
        "other":        "Personal situation",
    }
    if memory.get("situation_type"):
        parts.append(f"Situation: {sit_map.get(memory['situation_type'], memory['situation_type'])}")

    if memory.get("situation_story"):
        parts.append(f"Their words: \"{memory['situation_story'][:300]}\"")

    if memory.get("people"):
        people_str = ", ".join(
            f"{p.get('name','?')} ({p.get('role','?')})" + (f" — {p['note']}" if p.get("note") else "")
            for p in memory["people"][:10]
        )
        parts.append(f"Key people: {people_str}")

    if memory.get("topics"):
        parts.append(f"Topics they care about: {', '.join(memory['topics'][:15])}")

    goal_map = {
        "document":  "Document experience accurately",
        "patterns":  "Find patterns they're missing",
        "case_file": "Build a legal/medical case file",
        "mental":    "Track mental health over time",
        "exit":      "Plan a major life change / exit",
        "process":   "Process and understand feelings",
        "evidence":  "Gather evidence for legal matters",
        "heal":      "Grow and heal long-term",
    }
    if memory.get("goals"):
        goal_labels = [goal_map.get(g, g) for g in memory["goals"]]
        parts.append(f"Goals: {', '.join(goal_labels)}")

    if memory.get("ai_summary"):
        parts.append(f"\nAI assessment: {memory['ai_summary']}")

    parts.append("=== END USER CONTEXT ===\n")
    return "\n".join(parts)


# ─── Route registration ───────────────────────────────────────────────────────
def register_onboarding_routes(app, require_any_user, require_owner):
    """
    Call this from main.py:
        from src.api.onboarding_routes import register_onboarding_routes
        register_onboarding_routes(app, require_any_user, require_owner)
    """

    # ── Registration ──────────────────────────────────────────────────────────
    @app.post("/api/register")
    async def register_user(req: RegisterRequest):
        """Self-registration. First account = owner, rest = viewer."""
        from src.auth.auth_db import get_db
        from src.auth.auth_service import hash_password

        # Password validation
        if len(req.password) < 12:
            raise HTTPException(400, "Password must be at least 12 characters")
        if not re.search(r'[A-Z]', req.password):
            raise HTTPException(400, "Password must include an uppercase letter")
        if not re.search(r'[0-9]', req.password):
            raise HTTPException(400, "Password must include a number")
        if not re.search(r'[^a-zA-Z0-9]', req.password):
            raise HTTPException(400, "Password must include a symbol")
        if len(req.username) < 3:
            raise HTTPException(400, "Username must be at least 3 characters")
        if not re.match(r'^[a-zA-Z0-9_\-]+$', req.username):
            raise HTTPException(400, "Username can only contain letters, numbers, - and _")

        conn = get_db()
        try:
            existing = conn.execute(
                "SELECT id FROM users WHERE username = ? OR email = ?",
                (req.username, req.email)
            ).fetchone()
            if existing:
                raise HTTPException(409, "Username or email already taken")

            count = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
            role  = "owner" if count == 0 else "viewer"
            now   = datetime.now(timezone.utc).isoformat()
            pw_h  = hash_password(req.password)

            conn.execute(
                "INSERT INTO users (email, username, password_hash, role, is_active, created_at) VALUES (?,?,?,?,1,?)",
                (req.email, req.username, pw_h, role, now)
            )
            conn.commit()
            return {"status": "created", "role": role}
        finally:
            conn.close()

    # ── Memory preview (AI-generated, called during onboarding) ──────────────
    @app.post("/api/onboarding/memory-preview")
    async def memory_preview(
        req: MemoryPreviewRequest,
        current_user: dict = Depends(require_any_user),
    ):
        """
        Generates an AI-written context summary from onboarding answers.
        Called on the Memory slide — user is already logged in at this point.
        """
        cfg = _load_config()

        sit_labels = {
            "relationship": "relationship difficulty / planning to leave",
            "custody":      "custody or co-parenting conflict",
            "workplace":    "workplace conflict or hostile environment",
            "housing":      "housing instability or unsafe living situation",
            "legal":        "ongoing legal matter",
            "mental_health":"mental health tracking",
            "growth":       "personal growth and self-reflection",
            "other":        "a personal situation",
        }

        goal_labels = {
            "document":  "document their experience accurately",
            "patterns":  "find patterns they're missing",
            "case_file": "build a legal/medical case file",
            "mental":    "track their mental health over time",
            "exit":      "plan a major life change",
            "process":   "process and understand their feelings",
            "evidence":  "gather evidence for legal matters",
            "heal":      "grow and heal long-term",
        }

        name_part    = req.preferred_name or "this person"
        sit_part     = sit_labels.get(req.situation_type or "", req.situation_type or "an unspecified situation")
        people_part  = ", ".join(f"{p.get('name','?')} ({p.get('role','?')})" for p in (req.people or [])[:8]) or "not specified"
        topics_part  = ", ".join((req.topics or [])[:12]) or "not specified"
        goals_part   = ", ".join(goal_labels.get(g, g) for g in (req.goals or [])[:6]) or "not specified"
        story_part   = f'Their own description: "{req.situation_story}"' if req.situation_story else ""

        prompt = f"""You are writing a private AI memory profile entry. Based on the following onboarding information, write 2-3 sentences in second person that will serve as a persistent context note for an AI assistant. This note will be prepended to every AI prompt — reflections, pattern analysis, summaries, etc. — so it must be concise, accurate, and personally meaningful.

Name/pronouns: {name_part}{f' ({req.pronouns})' if req.pronouns else ''}
Situation: {sit_part}
{story_part}
Key people: {people_part}
Topics they care about: {topics_part}
Goals: {goals_part}

Write ONLY the 2-3 sentence summary. No preamble, no headers. Address them directly (second person). Be warm, specific, and grounded in what they shared."""

        try:
            from src.auth.auth_db import get_db
            _conn = get_db()
            _row  = _conn.execute(
                "SELECT ai_api_key, ai_provider, ai_model FROM user_settings WHERE user_id = ?",
                (current_user["id"],)
            ).fetchone()
            _conn.close()

            _api_key = (_row["ai_api_key"] if _row else None) or cfg.get("anthropic", {}).get("api_key")
            _model   = (_row["ai_model"]   if _row else None) or cfg.get("anthropic", {}).get("model", "claude-sonnet-4-5")

            if not _api_key:
                return {"ai_summary": None, "fields": {
                    "preferred_name": req.preferred_name, "pronouns": req.pronouns,
                    "situation_type": req.situation_type,
                    "people_count": len(req.people or []),
                    "topics_count": len(req.topics or []),
                    "goals_count":  len(req.goals or []),
                }}

            client = anthropic.Anthropic(api_key=_api_key)
            msg = client.messages.create(
                model=_model,
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )
            ai_summary = msg.content[0].text.strip()
        except Exception as e:
            ai_summary = None

        return {
            "ai_summary": ai_summary,
            "fields": {
                "preferred_name":  req.preferred_name,
                "pronouns":        req.pronouns,
                "situation_type":  req.situation_type,
                "people_count":    len(req.people or []),
                "topics_count":    len(req.topics or []),
                "goals_count":     len(req.goals or []),
            }
        }

    # ── Save memory after onboarding ──────────────────────────────────────────
    @app.post("/api/onboarding/memory")
    async def save_onboarding_memory(
        req: MemorySaveRequest,
        current_user: dict = Depends(require_any_user),
    ):
        """Save onboarding data as the user's AI memory profile."""
        user_id = current_user["id"]
        data = {
            "user_id":        user_id,
            "preferred_name": req.preferred_name,
            "pronouns":       req.pronouns,
            "situation_type": req.situation_type,
            "situation_story":req.situation_story,
            "people":         req.people or [],
            "topics":         req.topics or [],
            "goals":          req.goals or [],
            "ai_summary":     req.ai_summary,
            "created_at":     datetime.now(timezone.utc).isoformat(),
        }
        saved = save_user_memory(user_id, data)
        return {"status": "saved", "memory": saved}

    # ── Get memory ────────────────────────────────────────────────────────────
    @app.get("/api/memory")
    async def get_memory(current_user: dict = Depends(require_any_user)):
        """Return the current user's AI memory profile."""
        memory = load_user_memory(current_user["id"])
        return {"memory": memory, "has_memory": bool(memory)}

    # ── Update memory (partial) ───────────────────────────────────────────────
    @app.patch("/api/memory")
    async def update_memory(
        req: MemoryUpdateRequest,
        current_user: dict = Depends(require_any_user),
    ):
        """Partially update the user's memory profile."""
        user_id = current_user["id"]
        existing = load_user_memory(user_id)
        updates = req.dict(exclude_none=True)
        existing.update(updates)
        saved = save_user_memory(user_id, existing)
        return {"status": "updated", "memory": saved}

    # ── Admin: view any user's memory (owner only) ────────────────────────────
    @app.get("/api/admin/memory/{user_id}")
    async def admin_get_memory(
        user_id: int,
        current_user: dict = Depends(require_owner),
    ):
        memory = load_user_memory(user_id)
        return {"memory": memory, "user_id": user_id}
