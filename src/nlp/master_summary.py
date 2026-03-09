"""
src/nlp/master_summary.py
Master Summary Engine — maintains the living narrative document.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional
import sqlite3
import yaml

import anthropic

# ── Load Config ───────────────────────────────────────────────

from src.config import CONFIG_PATH, PROMPTS_PATH, MASTER_SUMMARY_DIR, load_config
# PROMPTS_PATH imported from src.config

def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)

def load_prompts() -> dict:
    with open(PROMPTS_PATH) as f:
        return yaml.safe_load(f)

config = load_config()
prompts = load_prompts()

DB_PATH = Path(config["database"]["path"])
ANTHROPIC_API_KEY = config["anthropic"]["api_key"]
MODEL = config["anthropic"]["model"]
MAX_TOKENS = config["anthropic"]["max_tokens"]

# Master summary file storage
MASTER_SUMMARY_PATH = Path(config["storage"]["base_path"]) / config["storage"]["master_summaries"]


# ── Database Connection ───────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ── Anthropic Client ──────────────────────────────────────────

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def call_anthropic(system: str, user: str, max_tokens: int, _user_id=None) -> str:
    """Route through unified ai_client."""
    from src.api.ai_client import create_message as _cm
    return _cm(_user_id, system=system, user_prompt=user, max_tokens=max_tokens)

# ── Get Latest Master Summary ─────────────────────────────────

def get_latest_master_summary() -> Optional[dict]:
    """Fetch the most recent master summary from database."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM master_summaries
        ORDER BY version DESC
        LIMIT 1
    """)
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None


def get_master_summary_version() -> int:
    """Get the next version number."""
    current = get_latest_master_summary()
    if current:
        return current["version"] + 1
    return 1


# ── Format Master Summary for Prompt ──────────────────────────

def format_master_summary_for_prompt(summary: dict) -> str:
    """Format master summary dict as readable text for AI prompt."""
    if not summary:
        return "No previous master summary exists. This is the first entry."
    
    parts = []
    
    if summary.get("overall_arc"):
        parts.append(f"**Overall Arc:**\n{summary['overall_arc']}")
    
    if summary.get("current_state"):
        parts.append(f"**Current State:**\n{summary['current_state']}")
    
    if summary.get("key_themes"):
        themes = json.loads(summary["key_themes"]) if isinstance(summary["key_themes"], str) else summary["key_themes"]
        if themes:
            parts.append(f"**Key Themes:**\n" + "\n".join(f"- {t}" for t in themes))
    
    if summary.get("key_people"):
        people = json.loads(summary["key_people"]) if isinstance(summary["key_people"], str) else summary["key_people"]
        if people:
            people_lines = [f"- {p.get('name', 'Unknown')}: {p.get('role', '')} (Recent: {p.get('recent', '')})" for p in people]
            parts.append(f"**Key People:**\n" + "\n".join(people_lines))
    
    if summary.get("active_threads"):
        threads = json.loads(summary["active_threads"]) if isinstance(summary["active_threads"], str) else summary["active_threads"]
        if threads:
            parts.append(f"**Active Threads:**\n" + "\n".join(f"- {t}" for t in threads))
    
    if summary.get("notable_patterns"):
        patterns = json.loads(summary["notable_patterns"]) if isinstance(summary["notable_patterns"], str) else summary["notable_patterns"]
        if patterns:
            parts.append(f"**Notable Patterns:**\n" + "\n".join(f"- {p}" for p in patterns))
    
    if summary.get("last_entry_date"):
        parts.append(f"**Last Updated:** {summary['last_entry_date']}")
    
    return "\n\n".join(parts)


# ── Get All Daily Summaries ───────────────────────────────────

def get_all_daily_summaries() -> list[dict]:
    """Get all daily summaries for initial master summary creation."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT e.entry_date, ds.summary_text
        FROM entries e
        JOIN derived_summaries ds ON e.id = ds.entry_id
        WHERE e.is_current = 1 AND ds.summary_text IS NOT NULL
        ORDER BY e.entry_date ASC
    """)
    
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]


def format_daily_summaries_for_prompt(summaries: list[dict]) -> str:
    """Format daily summaries for initial master summary creation."""
    lines = []
    for s in summaries:
        lines.append(f"**{s['entry_date']}:** {s['summary_text']}")
    return "\n\n".join(lines)


# ── Create Initial Master Summary ─────────────────────────────

def create_initial_master_summary() -> dict:
    """Create the first master summary from all existing daily summaries."""
    daily_summaries = get_all_daily_summaries()
    
    if not daily_summaries:
        return {"error": "No daily summaries available"}
    
    prompt_config = prompts["master_summary_initial"]
    
    system = prompt_config["system"]
    user = prompt_config["user"].format(
        all_daily_summaries=format_daily_summaries_for_prompt(daily_summaries)
    )
    
    try:
        response = call_anthropic(system, user, MAX_TOKENS["master_summary"], override_client=_override_client)
        
        # Parse JSON
        response = response.strip()
        if response.startswith("```json"):
            response = response[7:]
        if response.startswith("```"):
            response = response[3:]
        if response.endswith("```"):
            response = response[:-3]
        
        data = json.loads(response.strip())
        data["prompt_version"] = prompt_config["version"]
        data["last_entry_date"] = daily_summaries[-1]["entry_date"]
        
        return data
    
    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse JSON: {e}"}
    except Exception as e:
        return {"error": str(e)}


# ── Update Master Summary ─────────────────────────────────────

def update_master_summary(new_entry_date: str, new_daily_summary: str) -> dict:
    """
    Update master summary with a new daily summary.
    Uses incremental approach: previous master + new daily only.
    """
    current = get_latest_master_summary()
    
    # If no master summary exists, create initial
    if not current:
        return create_initial_master_summary()
    
    prompt_config = prompts["master_summary_update"]
    
    system = prompt_config["system"]
    user = prompt_config["user"].format(
        previous_master_summary=format_master_summary_for_prompt(current),
        new_entry_date=new_entry_date,
        new_daily_summary=new_daily_summary
    )
    
    try:
        response = call_anthropic(system, user, MAX_TOKENS["master_summary"], override_client=_override_client)
        
        # Parse JSON
        response = response.strip()
        if response.startswith("```json"):
            response = response[7:]
        if response.startswith("```"):
            response = response[3:]
        if response.endswith("```"):
            response = response[:-3]
        
        data = json.loads(response.strip())
        data["prompt_version"] = prompt_config["version"]
        data["last_entry_date"] = new_entry_date
        
        return data
    
    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse JSON: {e}"}
    except Exception as e:
        return {"error": str(e)}


# ── Store Master Summary ──────────────────────────────────────

def store_master_summary(data: dict) -> int:
    """Store master summary to database and file."""
    version = get_master_summary_version()
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO master_summaries (
            version, overall_arc, current_state, key_themes, key_people,
            active_threads, notable_patterns, last_entry_date, prompt_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        version,
        data.get("overall_arc"),
        data.get("current_state"),
        json.dumps(data.get("key_themes", [])),
        json.dumps(data.get("key_people", [])),
        json.dumps(data.get("active_threads", [])),
        json.dumps(data.get("notable_patterns", [])),
        data.get("last_entry_date"),
        data.get("prompt_version")
    ))
    
    conn.commit()
    summary_id = cursor.lastrowid
    conn.close()
    
    # Also save to file for versioning
    MASTER_SUMMARY_PATH.mkdir(parents=True, exist_ok=True)
    file_path = MASTER_SUMMARY_PATH / f"master_summary_v{version}.json"
    
    with open(file_path, 'w') as f:
        json.dump({
            "version": version,
            "created_at": datetime.now().isoformat(),
            **data
        }, f, indent=2)
    
    return summary_id


# ── Main Processing Function ──────────────────────────────────

def process_master_summary(entry_date: str, daily_summary: str, user_id: int = None) -> dict:
    # Per-user Anthropic client
    _override_client = None
    if user_id is not None:
        try:
            from src.api.anthropic_helper import get_anthropic_client as _get_ac
            _override_client = _get_ac(user_id)
        except Exception:
            pass
    """
    Update master summary after a new entry is processed.
    
    Args:
        entry_date: Date of the new entry
        daily_summary: The daily summary text for the new entry
    
    Returns:
        {
            "status": "success" | "error",
            "version": int,
            "data": {...}
        }
    """
    # Check if AI is enabled
    if not config["features"]["ai_master_summary_enabled"]:
        return {"status": "skipped", "message": "Master summary AI is disabled"}
    
    # Update master summary
    result = update_master_summary(entry_date, daily_summary)
    
    if "error" in result:
        return {
            "status": "error",
            "error": result["error"]
        }
    
    # Store it
    summary_id = store_master_summary(result)
    
    return {
        "status": "success",
        "version": get_master_summary_version() - 1,  # The one we just stored
        "summary_id": summary_id,
        "data": result
    }
