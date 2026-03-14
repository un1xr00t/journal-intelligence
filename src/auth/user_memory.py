"""
src/auth/user_memory.py

User memory profile system.
Stores onboarding answers and injects personalized context into every AI prompt.

Usage:
    from src.auth.user_memory import get_memory_context, save_user_profile, get_user_profile

    # In any AI call:
    memory = get_memory_context(user_id=1)
    system_prompt = memory + "\n" + your_normal_system_prompt
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml

CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")


def _get_db() -> sqlite3.Connection:
    with open(CONFIG_PATH) as f:
        config = yaml.safe_load(f)
    db_path = Path(config["database"]["path"])
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_user_profiles_table():
    """Create user_profiles table. Call once on startup from main.py."""
    conn = _get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_profiles (
            id                       INTEGER PRIMARY KEY,
            user_id                  INTEGER UNIQUE NOT NULL REFERENCES users(id),
            preferred_name           TEXT,
            pronouns                 TEXT,
            situation_type           TEXT,
            situation_description    TEXT,
            people                   TEXT,
            goals                    TEXT,
            support_people           TEXT,
            preferred_tone           TEXT DEFAULT 'therapist',
            default_redaction        INTEGER DEFAULT 1,
            onboarding_completed_at  TEXT,
            updated_at               TEXT
        )
    """)
    conn.commit()
    conn.close()


def get_user_profile(user_id: int) -> Optional[dict]:
    """Return the full profile dict for a user, or None."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)
        ).fetchone()
        if not row:
            return None
        profile = dict(row)
        for field in ('people', 'goals', 'support_people'):
            raw = profile.get(field)
            try:
                profile[field] = json.loads(raw) if raw else []
            except (json.JSONDecodeError, TypeError):
                profile[field] = []
        return profile
    finally:
        conn.close()


def save_user_profile(user_id: int, data: dict) -> dict:
    """Insert or update a user memory profile."""
    now = datetime.now(timezone.utc).isoformat()
    serialized = dict(data)
    for field in ('people', 'goals', 'support_people'):
        if field in serialized and isinstance(serialized[field], list):
            serialized[field] = json.dumps(serialized[field], ensure_ascii=False)

    conn = _get_db()
    try:
        existing = conn.execute(
            "SELECT id FROM user_profiles WHERE user_id = ?", (user_id,)
        ).fetchone()

        if existing:
            allowed = {
                'preferred_name', 'pronouns', 'situation_type', 'situation_description',
                'people', 'goals', 'support_people', 'preferred_tone',
                'default_redaction', 'onboarding_completed_at',
            }
            updates = {k: v for k, v in serialized.items() if k in allowed}
            updates['updated_at'] = now
            set_clause = ', '.join(f"{k} = ?" for k in updates)
            vals = list(updates.values()) + [user_id]
            conn.execute(f"UPDATE user_profiles SET {set_clause} WHERE user_id = ?", vals)
        else:
            conn.execute("""
                INSERT INTO user_profiles (
                    user_id, preferred_name, pronouns, situation_type,
                    situation_description, people, goals, support_people,
                    preferred_tone, default_redaction, onboarding_completed_at, updated_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                user_id,
                serialized.get('preferred_name'),
                serialized.get('pronouns'),
                serialized.get('situation_type'),
                serialized.get('situation_description'),
                serialized.get('people', '[]'),
                serialized.get('goals', '[]'),
                serialized.get('support_people', '[]'),
                serialized.get('preferred_tone', 'therapist'),
                1 if serialized.get('default_redaction', True) else 0,
                serialized.get('onboarding_completed_at', now),
                now,
            ))

        conn.commit()
        return get_user_profile(user_id) or {}
    finally:
        conn.close()


SITUATION_LABELS = {
    'relationship': 'a difficult relationship (partner/spouse)',
    'custody':      'a custody or co-parenting dispute',
    'workplace':    'a workplace or employment conflict',
    'housing':      'a housing or tenancy issue',
    'legal':        'an active legal matter',
    'family':       'family dynamics or conflict',
    'personal':     'personal growth and mental health',
    'other':        'a personal situation',
}

GOAL_LABELS = {
    'document':   'build a timestamped record of events',
    'exit':       'plan and execute a safe exit',
    'therapy':    'generate insights to share with a therapist',
    'legal_prep': 'gather evidence for legal proceedings',
    'patterns':   'identify behavioral and situational patterns',
    'clarity':    'gain clarity about their situation',
    'healing':    'track emotional healing and progress',
}

TONE_INSTRUCTIONS = {
    'therapist':   'Respond in a warm, clinical, validating tone. Acknowledge feelings. Use their name occasionally.',
    'coach':       'Be direct and action-oriented. Give concrete next steps. No fluff.',
    'best_friend': 'Be casual and real. No clinical language. Talk like you know them.',
    'mentor':      'Take a wise, long-view perspective. Connect patterns to growth arcs.',
}


def get_memory_context(user_id: int) -> str:
    """
    Returns a structured context string to prepend to any AI system prompt.
    This is the persistent memory that makes every AI response personalized.
    Returns empty string if no profile exists.
    """
    profile = get_user_profile(user_id)
    if not profile:
        return ""

    name = profile.get('preferred_name') or 'the user'
    pronouns = profile.get('pronouns', '')
    situation_type = profile.get('situation_type', '')
    situation_desc = profile.get('situation_description', '')
    people = profile.get('people') or []
    goals = profile.get('goals') or []
    support = profile.get('support_people') or []
    tone = profile.get('preferred_tone', 'therapist')

    lines = ["=== PERSONAL CONTEXT (use this to personalize all analysis) ===", ""]

    name_line = f"The person you are helping is named {name}"
    if pronouns and pronouns != 'prefer not to say':
        name_line += f" (pronouns: {pronouns})"
    lines.append(name_line + ".")

    if situation_type:
        lines.append(f"They are dealing with {SITUATION_LABELS.get(situation_type, 'a personal situation')}.")
    if situation_desc:
        lines.append(f'In their own words: "{situation_desc}"')

    if goals:
        goal_strs = [GOAL_LABELS.get(g, g) for g in goals]
        lines.append(f"Their primary goals: {'; '.join(goal_strs)}.")

    if people:
        lines.append("\nKey people in their life:")
        for p in people:
            line = f"  - {p.get('name', '?')} ({p.get('role', 'person')})"
            if p.get('note'):
                line += f" — {p['note']}"
            lines.append(line)

    if support:
        lines.append("\nSupport network:")
        for s in support:
            line = f"  - {s.get('name', '?')} ({s.get('role', 'contact')})"
            if s.get('contact'):
                line += f" — {s['contact']}"
            lines.append(line)

    tone_instr = TONE_INSTRUCTIONS.get(tone, TONE_INSTRUCTIONS['therapist'])
    lines.append(f"\nPreferred tone: {tone_instr}")
    lines.append("\n=== END PERSONAL CONTEXT ===\n")

    return "\n".join(lines)


def get_owner_memory_context() -> str:
    """Get memory context for the owner account (for AI calls not tied to a request)."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1"
        ).fetchone()
        return get_memory_context(row['id']) if row else ""
    finally:
        conn.close()
