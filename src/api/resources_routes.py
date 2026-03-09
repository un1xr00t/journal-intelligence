"""
resources_routes.py  —  src/api/resources_routes.py
Personalized support resource recommendations powered by user memory + journal patterns.

Wire up in main.py (after register_onboarding_routes):
    from src.api.resources_routes import register_resources_routes
    register_resources_routes(app, require_any_user)
"""

import json
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import anthropic
import yaml
from fastapi import Depends, HTTPException

logger = logging.getLogger("journal")

from src.config import CONFIG_PATH, load_config


def _load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


# ── Static resource library ────────────────────────────────────────────────────
# AI ranks these — it never invents or modifies them, just orders them.
RESOURCE_LIBRARY = {
    "grounding": {
        "title": "Grounding & Calming",
        "icon": "🌿",
        "color": "#10b981",
        "default_context": "Simple, accessible tools for when you need to slow down and feel steady.",
        "resources": [
            {"name": "Box Breathing", "description": "4-count inhale · hold · exhale · hold — repeat 4 times", "type": "technique"},
            {"name": "5-4-3-2-1 Grounding", "description": "Name 5 things you see, 4 you hear, 3 you can touch, 2 you smell, 1 you taste", "type": "technique"},
            {"name": "Headspace", "url": "https://headspace.com", "description": "Guided meditation and breathing exercises", "type": "app"},
            {"name": "Calm", "url": "https://calm.com", "description": "Sleep, meditation, and daily relaxation tools", "type": "app"},
            {"name": "Insight Timer", "url": "https://insighttimer.com", "description": "Free guided meditations — thousands of options", "type": "app"},
        ]
    },
    "emotional_support": {
        "title": "Emotional Support & Therapy",
        "icon": "💬",
        "color": "#8b5cf6",
        "default_context": "Talking to someone trained to listen can help you process what you're carrying.",
        "resources": [
            {"name": "BetterHelp", "url": "https://betterhelp.com", "description": "Online therapy — text, video, or phone sessions", "type": "service"},
            {"name": "Open Path Collective", "url": "https://openpathcollective.org", "description": "Affordable in-person therapy, $30–$80/session", "type": "service"},
            {"name": "Psychology Today", "url": "https://www.psychologytoday.com/us/therapists", "description": "Find local therapists by specialty and insurance", "type": "directory"},
            {"name": "NAMI Helpline", "description": "Call 1-800-950-6264 (Mon–Fri, 10am–10pm ET)", "type": "hotline"},
            {"name": "7 Cups", "url": "https://7cups.com", "description": "Free anonymous chat with trained listeners", "type": "service"},
        ]
    },
    "mental_health": {
        "title": "Mental Health & Wellbeing",
        "icon": "🧠",
        "color": "#6366f1",
        "default_context": "Resources for understanding and supporting your mental wellbeing over time.",
        "resources": [
            {"name": "NAMI", "url": "https://nami.org", "description": "National Alliance on Mental Illness — resources, helpline, support groups", "type": "organization"},
            {"name": "Anxiety & Depression Association", "url": "https://adaa.org", "description": "Find therapists, support groups, and resources", "type": "organization"},
            {"name": "MentalHealth.gov", "url": "https://www.mentalhealth.gov", "description": "US government mental health information", "type": "resource"},
            {"name": "Woebot", "url": "https://woebothealth.com", "description": "CBT-based mental health support app", "type": "app"},
        ]
    },
    "relationship": {
        "title": "Relationship & Family Support",
        "icon": "🤝",
        "color": "#ec4899",
        "default_context": "Support for navigating difficult relationships, conflict, and family dynamics.",
        "resources": [
            {"name": "National DV Hotline", "description": "1-800-799-7233 or text START to 88788 — 24/7", "type": "hotline", "url": "https://thehotline.org"},
            {"name": "Love Is Respect", "url": "https://loveisrespect.org", "description": "Relationship support — text LOVEIS to 22522", "type": "hotline"},
            {"name": "Relationship Hero", "url": "https://relationshiphero.com", "description": "Online relationship coaches available 24/7", "type": "service"},
            {"name": "Codependents Anonymous", "url": "https://coda.org", "description": "Free support groups for relationship patterns", "type": "community"},
        ]
    },
    "parenting": {
        "title": "Parenting & Co-Parenting",
        "icon": "🌻",
        "color": "#f59e0b",
        "default_context": "Support for parents navigating stress, single parenting, or co-parenting challenges.",
        "resources": [
            {"name": "Childhelp Hotline", "description": "1-800-422-4453 — support for parents and children", "type": "hotline"},
            {"name": "Zero to Three", "url": "https://zerotothree.org", "description": "Parenting resources, articles, and developmental support", "type": "resource"},
            {"name": "Our Family Wizard", "url": "https://ourfamilywizard.com", "description": "Co-parenting communication and scheduling tool", "type": "tool"},
            {"name": "Parents Helpline", "description": "1-855-427-2736 — support for parents under stress", "type": "hotline"},
        ]
    },
    "legal": {
        "title": "Legal Aid & Rights",
        "icon": "⚖️",
        "color": "#64748b",
        "default_context": "Understanding your rights and finding help navigating legal processes.",
        "resources": [
            {"name": "LawHelp.org", "url": "https://lawhelp.org", "description": "Free legal information by state", "type": "resource"},
            {"name": "Legal Services Corporation", "url": "https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help", "description": "Find free civil legal aid in your area", "type": "directory"},
            {"name": "Avvo", "url": "https://avvo.com", "description": "Free legal Q&A and attorney directory", "type": "directory"},
            {"name": "Law Help Interactive", "url": "https://lawhelpinteractive.org", "description": "Create free legal documents for your situation", "type": "tool"},
        ]
    },
    "housing": {
        "title": "Housing & Practical Needs",
        "icon": "🏠",
        "color": "#0ea5e9",
        "default_context": "Help finding stable housing and practical support in difficult times.",
        "resources": [
            {"name": "211 Helpline", "url": "https://211.org", "description": "Dial 2-1-1 — connects to local housing, food, and financial help", "type": "hotline"},
            {"name": "HUD Housing Assistance", "url": "https://www.hud.gov/topics/rental_assistance", "description": "Federal rental and housing assistance programs", "type": "resource"},
            {"name": "NLIHC Resource Finder", "url": "https://nlihc.org/find-assistance", "description": "Find rental assistance programs by state", "type": "directory"},
        ]
    },
    "burnout": {
        "title": "Burnout & Work Stress",
        "icon": "🔋",
        "color": "#f97316",
        "default_context": "When exhaustion runs deep, these tools can help you reclaim your energy.",
        "resources": [
            {"name": "Employee Assistance Program (EAP)", "description": "Check with your employer — many offer free confidential counseling", "type": "resource"},
            {"name": "OSHA Workers' Rights", "url": "https://www.osha.gov/workers/file-complaint", "description": "Report unsafe or hostile workplace conditions", "type": "resource"},
            {"name": "Mind — Workplace Stress", "url": "https://www.mind.org.uk/information-support/types-of-mental-health-problems/stress/workplace-stress/", "description": "Recognize and address workplace stress", "type": "resource"},
        ]
    },
    "grief": {
        "title": "Grief & Loss",
        "icon": "🕊️",
        "color": "#94a3b8",
        "default_context": "Support for navigating grief, loss, and the feelings that come with major endings.",
        "resources": [
            {"name": "GriefShare", "url": "https://griefshare.org", "description": "Find local grief support groups", "type": "community"},
            {"name": "What's Your Grief", "url": "https://whatsyourgrief.com", "description": "Articles, tools, and community for grief support", "type": "resource"},
            {"name": "Dougy Center", "url": "https://www.dougy.org", "description": "Support for grieving children, teens, and families", "type": "organization"},
        ]
    },
    "community": {
        "title": "Connection & Community",
        "icon": "🌱",
        "color": "#34d399",
        "default_context": "You don't have to carry this alone — finding connection can make a real difference.",
        "resources": [
            {"name": "7 Cups", "url": "https://7cups.com", "description": "Free anonymous chat with trained listeners", "type": "service"},
            {"name": "Meetup", "url": "https://meetup.com", "description": "Find local groups around shared interests", "type": "community"},
            {"name": "SMART Recovery", "url": "https://smartrecovery.org", "description": "Free support groups for behavioral challenges", "type": "community"},
        ]
    },
    "crisis": {
        "title": "Crisis & Immediate Safety",
        "icon": "🆘",
        "color": "#f59e0b",
        "is_crisis": True,
        "default_context": "If you're struggling right now, these resources are here for you — free, confidential, and always available.",
        "resources": [
            {"name": "988 Suicide & Crisis Lifeline", "description": "Call or text 988 — free, confidential, 24/7", "type": "hotline"},
            {"name": "Crisis Text Line", "description": "Text HOME to 741741 — free, confidential, 24/7", "type": "hotline"},
            {"name": "National DV Hotline", "description": "1-800-799-7233 or text START to 88788", "type": "hotline", "url": "https://thehotline.org"},
            {"name": "Emergency Services", "description": "Call 911 if you are in immediate danger", "type": "emergency"},
        ]
    },
}


# ── AI prompt ──────────────────────────────────────────────────────────────────
_RESOURCES_SYSTEM = """You are a compassionate support profile generator for a private personal journal app.
Your job is to read the user's situation and recent journal signals, then determine which support categories are most relevant for them right now.

Rules:
- Never diagnose. Never use clinical labels in context blurbs.
- Context blurbs must be warm, validating, and 1–2 sentences. They explain why this may help — not what is wrong.
- Surface the "crisis" category ONLY if: avg severity >= 7.5, OR active alerts mention self-harm, danger, or crisis language. Otherwise exclude it entirely.
- Rank categories by relevance (0.0 to 1.0). Include only categories with relevance >= 0.35.
- Maximum 8 categories in ranked_categories (excluding crisis if surfaced).
- Return ONLY valid JSON — no preamble, no markdown, no extra text.

Required JSON format:
{
  "intro": "One warm sentence about what you noticed (no diagnosis, no labels, second person)",
  "ranked_categories": [
    {
      "id": "category_id",
      "relevance": 0.0,
      "context": "1-2 sentence gentle explanation of why this may help"
    }
  ],
  "surface_crisis": false
}

Available category IDs: grounding, emotional_support, mental_health, relationship, parenting, burnout, grief, legal, housing, community, crisis"""


def _build_prompt(memory: dict, alerts: list, avg_severity: float, avg_mood: float, entry_count: int) -> str:
    sit_map = {
        "relationship": "relationship difficulty or planning to leave a relationship",
        "custody":      "custody or co-parenting conflict",
        "workplace":    "workplace conflict or hostile work environment",
        "housing":      "housing instability or unsafe living situation",
        "legal":        "ongoing legal matter",
        "mental_health":"mental health tracking and management",
        "growth":       "personal growth and self-reflection",
        "other":        "a personal situation",
    }
    goal_map = {
        "document": "document experience accurately",
        "patterns": "find hidden patterns",
        "case_file": "build a legal/medical case file",
        "mental":   "track mental health",
        "exit":     "plan a major life change",
        "process":  "process and understand feelings",
        "evidence": "gather evidence",
        "heal":     "grow and heal",
    }

    parts = []

    if memory.get("situation_type"):
        parts.append(f"Primary situation: {sit_map.get(memory['situation_type'], memory['situation_type'])}")
    if memory.get("situation_story"):
        parts.append(f"In their words: \"{memory['situation_story'][:400]}\"")
    if memory.get("goals"):
        goals = [goal_map.get(g, g) for g in memory["goals"]]
        parts.append(f"Goals: {', '.join(goals)}")
    if memory.get("topics"):
        parts.append(f"Topics they care about: {', '.join(memory['topics'][:10])}")
    if memory.get("ai_summary"):
        parts.append(f"AI memory profile: {memory['ai_summary']}")
    if not memory:
        parts.append("No onboarding memory profile available — rely on journal signals only.")

    parts.append(f"\nRecent journal signals ({entry_count} entries, last 30 days):")
    parts.append(f"Average mood score: {avg_mood:.1f}/10")
    parts.append(f"Average severity: {avg_severity:.1f}/10")

    if alerts:
        summaries = []
        for a in alerts[:10]:
            summaries.append(f"- {a.get('alert_type', '?').replace('_', ' ')}: {a.get('description', '')[:120]}")
        parts.append("Active pattern alerts:\n" + "\n".join(summaries))
    else:
        parts.append("No active pattern alerts currently detected.")

    parts.append("\nRank the most relevant support categories for this person right now.")
    return "\n".join(parts)


def _signal_hash(memory: dict, alerts: list, avg_sev: float) -> str:
    key = json.dumps({
        "sit":      memory.get("situation_type"),
        "goals":    sorted(memory.get("goals") or []),
        "alerts":   sorted(a.get("id", 0) for a in alerts[:20]),
        "avg_sev":  round(avg_sev, 1),
    }, sort_keys=True)
    return hashlib.sha256(key.encode()).hexdigest()[:16]


# ── Route registration ─────────────────────────────────────────────────────────
def register_resources_routes(app, require_any_user):
    from src.auth.auth_db import get_db
    from src.api.onboarding_routes import load_user_memory

    def _ensure_table(conn):
        conn.execute("""
            CREATE TABLE IF NOT EXISTS resource_profiles (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NOT NULL UNIQUE,
                profile_json TEXT NOT NULL,
                signal_ver   TEXT,
                generated_at TEXT NOT NULL
            )
        """)
        conn.commit()

    @app.get("/api/resources")
    async def get_resources(current_user: dict = Depends(require_any_user)):
        """Return cached resource profile for current user, or empty if none yet."""
        conn = get_db()
        try:
            _ensure_table(conn)
            row = conn.execute(
                "SELECT profile_json, signal_ver, generated_at FROM resource_profiles WHERE user_id = ?",
                (current_user["id"],)
            ).fetchone()
            if not row:
                return {"profile": None, "has_profile": False}
            return {
                "profile":      json.loads(row["profile_json"]),
                "has_profile":  True,
                "generated_at": row["generated_at"],
                "signal_ver":   row["signal_ver"],
            }
        finally:
            conn.close()

    @app.post("/api/resources/generate")
    async def generate_resources(
        force: bool = False,
        current_user: dict = Depends(require_any_user),
    ):
        """Generate personalized resource recommendations from user signals."""
        conn = get_db()
        try:
            _ensure_table(conn)

            # Load user memory (graceful if missing)
            memory = load_user_memory(current_user["id"]) or {}

            # Load active alerts
            alerts = [dict(r) for r in conn.execute(
                """SELECT id, alert_type, description, priority_score
                   FROM alerts
                   WHERE user_id = ? AND acknowledged = 0
                   ORDER BY priority_score DESC LIMIT 15""",
                (current_user["id"],)
            ).fetchall()]

            # Mood + severity stats — last 30 days
            cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
            stats = conn.execute(
                """SELECT AVG(ds.mood_score) as avg_mood,
                          AVG(ds.severity)   as avg_sev,
                          COUNT(*)           as cnt
                   FROM entries e
                   JOIN derived_summaries ds ON e.id = ds.entry_id
                   WHERE e.user_id = ? AND e.is_current = 1 AND e.entry_date >= ?""",
                (current_user["id"], cutoff)
            ).fetchone()

            avg_mood    = float(stats["avg_mood"] or 5.0)
            avg_sev     = float(stats["avg_sev"]  or 3.0)
            entry_count = int(stats["cnt"] or 0)
            sig_ver     = _signal_hash(memory, alerts, avg_sev)

            # Return cached if signal hasn't changed (unless forced)
            if not force:
                existing = conn.execute(
                    "SELECT profile_json, signal_ver, generated_at FROM resource_profiles WHERE user_id = ?",
                    (current_user["id"],)
                ).fetchone()
                if existing and existing["signal_ver"] == sig_ver:
                    return {
                        "profile":      json.loads(existing["profile_json"]),
                        "generated_at": existing["generated_at"],
                        "cached":       True,
                    }

        finally:
            conn.close()

        # ── AI call ───────────────────────────────────────────────────────────
        prompt = _build_prompt(memory, alerts, avg_sev, avg_mood, entry_count)
        cfg    = _load_config()
        from src.api.anthropic_helper import get_anthropic_client as _get_ac
        client = _get_ac(current_user["id"])

        try:
            from src.api.ai_client import create_message as _cm
            raw = _cm(
                current_user["id"],
                system=_RESOURCES_SYSTEM,
                user_prompt=prompt,
                max_tokens=800,
            ).strip()
            # Strip accidental markdown fences
            if raw.startswith("```"):
                raw = "\n".join(raw.split("\n")[1:])
            if raw.endswith("```"):
                raw = "\n".join(raw.split("\n")[:-1])
            raw = raw.strip()
            profile = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"[resources] JSON parse error: {e}")
            raise HTTPException(502, "AI returned invalid JSON — try again")
        except Exception as e:
            logger.error(f"[resources] AI error: {e}")
            raise HTTPException(502, f"AI generation failed: {e}")

        now_iso = datetime.now(timezone.utc).isoformat()

        # ── Persist ───────────────────────────────────────────────────────────
        conn2 = get_db()
        try:
            conn2.execute("""
                INSERT INTO resource_profiles (user_id, profile_json, signal_ver, generated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    profile_json = excluded.profile_json,
                    signal_ver   = excluded.signal_ver,
                    generated_at = excluded.generated_at
            """, (current_user["id"], json.dumps(profile), sig_ver, now_iso))
            conn2.commit()
        finally:
            conn2.close()

        logger.info(f"[resources] generated user={current_user['id']} categories={len(profile.get('ranked_categories', []))}")

        return {
            "profile":      profile,
            "generated_at": now_iso,
            "cached":       False,
        }
