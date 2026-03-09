"""
src/nlp/extractor.py
AI extraction — calls Anthropic API for daily extraction and summary.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional
import sqlite3
import yaml

import anthropic

# ── Load Config ───────────────────────────────────────────────

from src.config import CONFIG_PATH, PROMPTS_PATH, load_config
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

# ── Daily Extraction ──────────────────────────────────────────

def extract_daily(entry_date: str, entry_text: str, override_client=None, user_id=None) -> dict:
    """
    Extract structured fields from a journal entry.
    Returns dict with: mood_label, mood_score, severity, key_events, people, topics, etc.
    """
    prompt_config = prompts["daily_extraction"]
    
    system = prompt_config["system"]
    user = prompt_config["user"].format(
        entry_date=entry_date,
        entry_text=entry_text
    )
    
    try:
        response = call_anthropic(system, user, MAX_TOKENS["daily_extraction"], _user_id=user_id)
        
        # Parse JSON response
        # Handle potential markdown code blocks
        response = response.strip()
        if response.startswith("```json"):
            response = response[7:]
        if response.startswith("```"):
            response = response[3:]
        if response.endswith("```"):
            response = response[:-3]
        
        data = json.loads(response.strip())
        data["prompt_version"] = prompt_config["version"]
        
        return data
    
    except json.JSONDecodeError as e:
        return {
            "error": f"Failed to parse JSON: {e}",
            "raw_response": response if 'response' in dir() else None
        }
    except Exception as e:
        return {"error": str(e)}


# ── Daily Summary ─────────────────────────────────────────────

def generate_daily_summary(entry_date: str, entry_text: str, override_client=None, user_id=None) -> dict:
    """
    Generate a 2-4 sentence narrative summary of the day.
    """
    prompt_config = prompts["daily_summary"]
    
    system = prompt_config["system"]
    user = prompt_config["user"].format(
        entry_date=entry_date,
        entry_text=entry_text
    )
    
    try:
        response = call_anthropic(system, user, MAX_TOKENS["daily_summary"], _user_id=user_id)
        
        return {
            "summary_text": response.strip(),
            "prompt_version": prompt_config["version"]
        }
    
    except Exception as e:
        return {"error": str(e)}


# ── Store Derived Summary ─────────────────────────────────────

def store_derived_summary(entry_id: int, extraction: dict, summary: dict) -> int:
    """Store extraction and summary results in derived_summaries table."""
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if already exists
    cursor.execute("SELECT id FROM derived_summaries WHERE entry_id = ?", (entry_id,))
    existing = cursor.fetchone()
    
    if existing:
        # Update existing
        cursor.execute("""
            UPDATE derived_summaries SET
                summary_text = ?,
                key_events = ?,
                contradiction_flags = ?,
                mood_label = ?,
                mood_score = ?,
                severity = ?,
                tags = ?,
                entities = ?,
                notable_quotes = ?,
                prompt_version = ?,
                generated_at = ?
            WHERE entry_id = ?
        """, (
            summary.get("summary_text"),
            json.dumps(extraction.get("key_events", [])),
            json.dumps(extraction.get("contradiction_flags", [])),
            extraction.get("mood_label"),
            extraction.get("mood_score"),
            extraction.get("severity"),
            json.dumps(extraction.get("tags", [])),
            json.dumps([
                {"name": p.get("name"), "type": "PERSON", "context": p.get("context")}
                for p in extraction.get("people", [])
            ] + [
                {"name": t, "type": "TOPIC"}
                for t in extraction.get("topics", [])
            ]),
            json.dumps(extraction.get("notable_quotes", [])),
            extraction.get("prompt_version"),
            datetime.now().isoformat(),
            entry_id
        ))
        summary_id = existing["id"]
    else:
        # Insert new
        cursor.execute("""
            INSERT INTO derived_summaries (
                entry_id, summary_text, key_events, contradiction_flags,
                mood_label, mood_score, severity, tags, entities, notable_quotes,
                prompt_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            entry_id,
            summary.get("summary_text"),
            json.dumps(extraction.get("key_events", [])),
            json.dumps(extraction.get("contradiction_flags", [])),
            extraction.get("mood_label"),
            extraction.get("mood_score"),
            extraction.get("severity"),
            json.dumps(extraction.get("tags", [])),
            json.dumps([
                {"name": p.get("name"), "type": "PERSON", "context": p.get("context")}
                for p in extraction.get("people", [])
            ] + [
                {"name": t, "type": "TOPIC"}
                for t in extraction.get("topics", [])
            ]),
            json.dumps(extraction.get("notable_quotes", [])),
            extraction.get("prompt_version")
        ))
        summary_id = cursor.lastrowid
    
    conn.commit()
    conn.close()
    
    return summary_id


# ── Main Processing Function ──────────────────────────────────



def populate_evidence_from_extraction(entry_id: int, entry_date: str, extraction: dict, user_id: int) -> int:
    """
    Write evidence rows from a completed extraction.
    Called after store_derived_summary in process_entry.
    Skips if evidence rows already exist for this entry.
    Returns count of rows inserted.
    """
    conn = get_db()
    cursor = conn.cursor()

    # Don't double-populate
    cursor.execute("SELECT COUNT(*) FROM evidence WHERE entry_id = ? AND user_id = ?", (entry_id, user_id))
    if cursor.fetchone()[0] > 0:
        conn.close()
        return 0

    inserted = 0

    # key_events → type "event"
    key_events = extraction.get("key_events", [])
    if isinstance(key_events, str):
        try:
            key_events = json.loads(key_events)
        except Exception:
            key_events = []
    for event in key_events:
        if not event or not str(event).strip():
            continue
        cursor.execute(
            """INSERT INTO evidence (entry_id, label, evidence_type, source_date, is_bookmarked, user_id)
               VALUES (?, ?, 'event', ?, 0, ?)""",
            (entry_id, str(event).strip(), entry_date, user_id),
        )
        inserted += 1

    # notable_quotes → type "statement", quote_text = the quote
    notable_quotes = extraction.get("notable_quotes", [])
    if isinstance(notable_quotes, str):
        try:
            notable_quotes = json.loads(notable_quotes)
        except Exception:
            notable_quotes = []
    for quote in notable_quotes:
        if not quote or not str(quote).strip():
            continue
        cursor.execute(
            """INSERT INTO evidence (entry_id, label, quote_text, evidence_type, source_date, is_bookmarked, user_id)
               VALUES (?, 'Notable quote', ?, 'statement', ?, 0, ?)""",
            (entry_id, str(quote).strip(), entry_date, user_id),
        )
        inserted += 1

    # contradiction_flags → type "admission" or "contradiction"
    contradiction_flags = extraction.get("contradiction_flags", [])
    if isinstance(contradiction_flags, str):
        try:
            contradiction_flags = json.loads(contradiction_flags)
        except Exception:
            contradiction_flags = []
    for flag in contradiction_flags:
        if not flag:
            continue
        if isinstance(flag, str):
            label = flag.strip()
            ev_type = "contradiction"
        else:
            label = flag.get("statement", "").strip()
            flag_type = flag.get("type", "contradiction")
            ev_type = "admission" if flag_type == "admission" else "contradiction"
        if not label:
            continue
        cursor.execute(
            """INSERT INTO evidence (entry_id, label, evidence_type, source_date, is_bookmarked, user_id)
               VALUES (?, ?, ?, ?, 0, ?)""",
            (entry_id, label, ev_type, entry_date, user_id),
        )
        inserted += 1

    conn.commit()
    conn.close()
    return inserted

def process_entry(entry_id: int, entry_date: str, entry_text: str, user_id: int = None) -> dict:
    """
    Run full AI extraction + summary on an entry.
    
    Returns:
        {
            "status": "success" | "error",
            "extraction": {...},
            "summary": {...},
            "summary_id": int
        }
    """
    # Per-user Anthropic client (falls back to config.yaml key)
    _override_client = None
    if user_id is not None:
        try:
            from src.api.anthropic_helper import get_anthropic_client as _get_ac
            _override_client = _get_ac(user_id)
        except Exception:
            pass

    # Run extraction
    extraction = extract_daily(entry_date, entry_text, user_id=user_id)
    
    if "error" in extraction:
        return {
            "status": "error",
            "stage": "extraction",
            "error": extraction["error"]
        }
    
    # Run summary
    summary = generate_daily_summary(entry_date, entry_text, user_id=user_id)
    
    if "error" in summary:
        return {
            "status": "error", 
            "stage": "summary",
            "error": summary["error"]
        }
    
    # Store results
    summary_id = store_derived_summary(entry_id, extraction, summary)
    
    return {
        "status": "success",
        "extraction": extraction,
        "summary": summary,
        "summary_id": summary_id
    }


def check_if_processed(entry_id: int) -> bool:
    """Check if entry has already been processed."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id FROM derived_summaries WHERE entry_id = ?
    """, (entry_id,))
    
    row = cursor.fetchone()
    conn.close()
    
    return row is not None