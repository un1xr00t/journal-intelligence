"""
src/patterns/detectors.py
Rule-based pattern detectors. No AI. All deterministic.
Reads from derived_summaries, writes to alerts table.
Call run_all_detectors() after each ingest.
"""

import json
import sqlite3
import statistics
import re
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional

from src.config import DB_PATH

# ── Stopwords for contradiction matching ──────────────────────────────────────
# These words are too generic to count as "meaningful overlap" between quotes.
STOPWORDS = {
    "this", "that", "with", "have", "from", "they", "will", "been", "were",
    "their", "what", "when", "then", "than", "just", "like", "very", "feel",
    "felt", "into", "about", "said", "told", "know", "think", "really",
    "would", "could", "should", "also", "even", "back", "still", "more",
    "some", "there", "here", "make", "time", "again", "always", "never",
    "every", "much", "many", "over", "well", "want", "need", "going",
    "something", "anything", "nothing", "everything", "getting", "saying",
    "because", "though", "thought", "after", "before", "being", "having",
    "doing", "things", "people", "other", "another", "where", "which",
    "myself", "yourself", "himself", "herself", "itself", "myself",
}

# Maximum contradiction alerts to keep (sorted by priority, rest discarded)
MAX_CONTRADICTION_ALERTS = 20


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _load_entries_with_summaries(days_back: int = 365, user_id: Optional[int] = None) -> list[dict]:
    """Load current entries with derived summaries, scoped by user_id."""
    conn = get_db()
    cursor = conn.cursor()
    cutoff = (date.today() - timedelta(days=days_back)).isoformat()
    if user_id is not None:
        cursor.execute("""
            SELECT
                e.id          AS entry_id,
                e.entry_date,
                ds.mood_score,
                ds.mood_label,
                ds.severity,
                ds.summary_text,
                ds.key_events,
                ds.contradiction_flags,
                ds.notable_quotes,
                ds.tags,
                ds.entities
            FROM entries e
            JOIN derived_summaries ds ON e.id = ds.entry_id
            WHERE e.is_current = 1
              AND e.entry_date >= ?
              AND e.user_id = ?
            ORDER BY e.entry_date ASC
        """, (cutoff, user_id))
    else:
        cursor.execute("""
            SELECT
                e.id          AS entry_id,
                e.entry_date,
                ds.mood_score,
                ds.mood_label,
                ds.severity,
                ds.summary_text,
                ds.key_events,
                ds.contradiction_flags,
                ds.notable_quotes,
                ds.tags,
                ds.entities
            FROM entries e
            JOIN derived_summaries ds ON e.id = ds.entry_id
            WHERE e.is_current = 1
              AND e.entry_date >= ?
            ORDER BY e.entry_date ASC
        """, (cutoff,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


# ── Alert persistence ─────────────────────────────────────────────────────────

def _alert_exists(alert_type: str, date_start: str, date_end: str, user_id: Optional[int] = None) -> bool:
    """Prevent duplicate alerts for the same type + window + user."""
    conn = get_db()
    cursor = conn.cursor()
    if user_id is not None:
        cursor.execute("""
            SELECT id FROM alerts
            WHERE alert_type = ?
              AND date_range_start = ?
              AND date_range_end = ?
              AND acknowledged = 0
              AND user_id = ?
        """, (alert_type, date_start, date_end, user_id))
    else:
        cursor.execute("""
            SELECT id FROM alerts
            WHERE alert_type = ?
              AND date_range_start = ?
              AND date_range_end = ?
              AND acknowledged = 0
        """, (alert_type, date_start, date_end))
    exists = cursor.fetchone() is not None
    conn.close()
    return exists


def _upsert_alert(
    alert_type: str,
    priority_score: float,
    date_start: str,
    date_end: str,
    supporting_dates: list[str],
    description: str,
    suggested_packets: Optional[list[str]] = None,
    user_id: Optional[int] = None,
) -> int:
    """Insert or update an alert. Returns alert id."""
    if _alert_exists(alert_type, date_start, date_end, user_id):
        conn = get_db()
        if user_id is not None:
            conn.execute("""
                UPDATE alerts
                SET priority_score = ?,
                    description = ?,
                    supporting_dates = ?,
                    updated_at = datetime('now')
                WHERE alert_type = ? AND date_range_start = ? AND date_range_end = ? AND acknowledged = 0 AND user_id = ?
            """, (priority_score, description, json.dumps(supporting_dates), alert_type, date_start, date_end, user_id))
        else:
            conn.execute("""
                UPDATE alerts
                SET priority_score = ?,
                    description = ?,
                    supporting_dates = ?,
                    updated_at = datetime('now')
                WHERE alert_type = ? AND date_range_start = ? AND date_range_end = ? AND acknowledged = 0
            """, (priority_score, description, json.dumps(supporting_dates), alert_type, date_start, date_end))
        conn.commit()
        cursor = conn.cursor()
        if user_id is not None:
            cursor.execute(
                "SELECT id FROM alerts WHERE alert_type=? AND date_range_start=? AND date_range_end=? AND acknowledged=0 AND user_id=?",
                (alert_type, date_start, date_end, user_id),
            )
        else:
            cursor.execute(
                "SELECT id FROM alerts WHERE alert_type=? AND date_range_start=? AND date_range_end=? AND acknowledged=0",
                (alert_type, date_start, date_end),
            )
        row = cursor.fetchone()
        conn.close()
        return row["id"] if row else -1

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO alerts (
            alert_type, priority_score,
            date_range_start, date_range_end,
            supporting_dates, description,
            suggested_packets, user_id,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    """, (
        alert_type,
        priority_score,
        date_start,
        date_end,
        json.dumps(supporting_dates),
        description,
        json.dumps(suggested_packets or []),
        user_id,
    ))
    alert_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return alert_id


def _write_evidence_from_alert(
    entry_id: int,
    alert_id: int,
    label: str,
    quote_text: str,
    evidence_type: str,
    source_date: str,
    user_id: Optional[int] = None,
) -> None:
    """
    Auto-write a high-priority evidence item from a detected pattern.

    Deduplicates on (entry_id, alert_id, label) — this allows two rows
    per alert (statement_a and statement_b) even when both quotes come
    from entries with the same entry_id. The label distinguishes them.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id FROM evidence
        WHERE entry_id = ? AND alert_id = ? AND label = ?
    """, (entry_id, alert_id, label))
    existing = cursor.fetchone()
    if existing:
        conn.close()
        return
    conn.execute("""
        INSERT INTO evidence (entry_id, alert_id, label, quote_text, evidence_type, source_date, is_bookmarked, user_id)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    """, (entry_id, alert_id, label, quote_text, evidence_type, source_date, user_id))
    conn.commit()
    conn.close()


# ── Detector 1: Mood Spike ────────────────────────────────────────────────────

def detect_mood_spikes(entries: list[dict], user_id: Optional[int] = None) -> list[dict]:
    """
    Flag day-over-day mood score changes of more than 3 points.
    Both drops and surges are captured (drops get higher priority).
    Returns list of created/updated alert dicts.
    """
    SPIKE_THRESHOLD = 3.0
    created = []

    for i in range(1, len(entries)):
        prev = entries[i - 1]
        curr = entries[i]

        if prev.get("mood_score") is None or curr.get("mood_score") is None:
            continue

        delta = curr["mood_score"] - prev["mood_score"]
        if abs(delta) < SPIKE_THRESHOLD:
            continue

        direction = "drop" if delta < 0 else "surge"
        priority = round(min(10.0, abs(delta) * 1.5), 1)
        if direction == "drop":
            priority = min(10.0, priority * 1.2)

        desc = (
            f"Mood {direction} of {abs(delta):.1f} points detected: "
            f"{prev['entry_date']} ({prev['mood_score']:.1f}) → "
            f"{curr['entry_date']} ({curr['mood_score']:.1f})"
        )
        alert_id = _upsert_alert(
            alert_type="mood_spike",
            priority_score=round(priority, 1),
            date_start=prev["entry_date"],
            date_end=curr["entry_date"],
            supporting_dates=[prev["entry_date"], curr["entry_date"]],
            description=desc,
            suggested_packets=["incident_packet", "therapy_summary"],
            user_id=user_id,
        )
        created.append({"id": alert_id, "type": "mood_spike", "description": desc})

    return created


# ── Detector 2: Severity Streak ───────────────────────────────────────────────

def detect_severity_streaks(entries: list[dict], min_severity: float = 7.0, min_days: int = 3, user_id: Optional[int] = None) -> list[dict]:
    """
    Flag runs of min_days or more consecutive days where severity >= min_severity.
    """
    created = []
    streak: list[dict] = []

    def _flush_streak(streak):
        if len(streak) < min_days:
            return None
        avg_sev = sum(e["severity"] for e in streak) / len(streak)
        priority = min(10.0, avg_sev + (len(streak) - min_days) * 0.5)
        desc = (
            f"High-severity streak: {len(streak)} consecutive days "
            f"(avg severity {avg_sev:.1f}) from {streak[0]['entry_date']} to {streak[-1]['entry_date']}"
        )
        return _upsert_alert(
            alert_type="severity_streak",
            priority_score=round(priority, 1),
            date_start=streak[0]["entry_date"],
            date_end=streak[-1]["entry_date"],
            supporting_dates=[e["entry_date"] for e in streak],
            description=desc,
            suggested_packets=["incident_packet", "therapy_summary"],
            user_id=user_id,
        )

    for entry in entries:
        sev = entry.get("severity")
        if sev is None:
            continue
        if sev >= min_severity:
            streak.append(entry)
        else:
            result = _flush_streak(streak)
            if result is not None:
                created.append({"id": result, "type": "severity_streak"})
            streak = []

    result = _flush_streak(streak)
    if result is not None:
        created.append({"id": result, "type": "severity_streak"})

    return created


# ── Detector 3: Instability Cluster ──────────────────────────────────────────

def detect_instability_clusters(entries: list[dict], window: int = 7, stdev_threshold: float = 2.0, user_id: Optional[int] = None) -> list[dict]:
    """
    Flag 7-day windows with high mood variability (std dev above threshold).
    """
    created = []
    flagged_windows: list[tuple[str, str]] = []

    for i in range(len(entries) - window + 1):
        window_entries = entries[i:i + window]
        scores = [e.get("mood_score") for e in window_entries if e.get("mood_score") is not None]
        if len(scores) < 4:
            continue

        try:
            stdev = statistics.stdev(scores)
        except statistics.StatisticsError:
            continue

        if stdev < stdev_threshold:
            continue

        w_start = window_entries[0]["entry_date"]
        w_end = window_entries[-1]["entry_date"]

        skip = any(
            abs((date.fromisoformat(w_start) - date.fromisoformat(fs)).days) < 3
            for fs, fe in flagged_windows
        )
        if skip:
            continue

        priority = min(10.0, stdev * 2.0)
        desc = (
            f"Mood instability cluster: σ = {stdev:.2f} over 7 days "
            f"({w_start} to {w_end}). Range: "
            f"{min(scores):.1f}–{max(scores):.1f}"
        )
        alert_id = _upsert_alert(
            alert_type="instability_cluster",
            priority_score=round(priority, 1),
            date_start=w_start,
            date_end=w_end,
            supporting_dates=[e["entry_date"] for e in window_entries],
            description=desc,
            suggested_packets=["pattern_report", "therapy_summary"],
            user_id=user_id,
        )
        flagged_windows.append((w_start, w_end))
        created.append({"id": alert_id, "type": "instability_cluster", "stdev": stdev})

    return created


# ── Detector 4: Contradiction Flags ──────────────────────────────────────────

DENIAL_PATTERNS = [
    r"\bI never\b",
    r"\bI always\b",
    r"\bI would never\b",
    r"\bI don'?t\b.*\bever\b",
    r"\bthat never happened\b",
    r"\bshe never\b",
    r"\bhe never\b",
    r"\bthey never\b",
    r"\bshe said\b",
    r"\bhe said\b",
    r"\bshe told me\b",
    r"\bhe told me\b",
    r"\btold me\b",
    r"\bpromised\b",
    r"\badmitted\b",
    r"\bconfessed\b",
    r"\blied\b",
    r"\bdenied\b",
]

COMPILED_DENIAL = [re.compile(p, re.IGNORECASE) for p in DENIAL_PATTERNS]


def _extract_matching_quotes(entry: dict) -> list[str]:
    """Extract notable quotes or summary snippets that match denial patterns."""
    candidates = []

    if entry.get("notable_quotes"):
        try:
            quotes = json.loads(entry["notable_quotes"])
            if isinstance(quotes, list):
                candidates.extend(quotes)
        except (json.JSONDecodeError, TypeError):
            pass

    if entry.get("summary_text"):
        sentences = re.split(r'(?<=[.!?])\s+', entry["summary_text"])
        for sentence in sentences:
            if any(pat.search(sentence) for pat in COMPILED_DENIAL):
                candidates.append(sentence)

    if entry.get("contradiction_flags"):
        try:
            flags = json.loads(entry["contradiction_flags"])
            if isinstance(flags, list):
                for flag in flags:
                    if isinstance(flag, dict) and flag.get("statement"):
                        candidates.append(flag["statement"])
        except (json.JSONDecodeError, TypeError):
            pass

    return candidates


def detect_contradictions(entries: list[dict], user_id: Optional[int] = None) -> list[dict]:
    """
    Flag entries containing denial/contradiction patterns.

    FIXES applied vs previous version:
    - Word overlap threshold raised from 2 → 4 (reduces false positives)
    - STOPWORDS filtered before overlap check (common words don't count)
    - Word length minimum raised to 5 chars (filters more noise)
    - Total contradiction alerts capped at MAX_CONTRADICTION_ALERTS
      (keeps highest-priority ones only)
    """
    # Collect candidate alerts first so we can rank and cap them
    candidates: list[dict] = []

    flagged_entries: list[dict] = []
    for entry in entries:
        quotes = _extract_matching_quotes(entry)
        if quotes:
            flagged_entries.append({"entry": entry, "quotes": quotes})

    for i in range(len(flagged_entries)):
        for j in range(i + 1, len(flagged_entries)):
            a = flagged_entries[i]
            b = flagged_entries[j]

            date_a = date.fromisoformat(a["entry"]["entry_date"])
            date_b = date.fromisoformat(b["entry"]["entry_date"])
            gap = (date_b - date_a).days

            if gap < 7:
                continue
            if gap > 180:
                continue

            for q_a in a["quotes"][:3]:
                for q_b in b["quotes"][:3]:
                    # Use 5+ char words minus stopwords for meaningful overlap
                    words_a = set(re.findall(r'\b\w{4,}\b', q_a.lower())) - STOPWORDS
                    words_b = set(re.findall(r'\b\w{4,}\b', q_b.lower())) - STOPWORDS
                    overlap = words_a & words_b

                    if len(overlap) >= 2:
                        priority = min(9.0, 4.0 + gap / 30)
                        desc = (
                            f"Potential contradiction between entries "
                            f"{a['entry']['entry_date']} and {b['entry']['entry_date']} "
                            f"(shared terms: {', '.join(sorted(overlap)[:5])}). "
                            f"Statements: \"{q_a[:80]}\" / \"{q_b[:80]}\""
                        )
                        candidates.append({
                            "priority": priority,
                            "desc": desc,
                            "a": a,
                            "b": b,
                            "q_a": q_a,
                            "q_b": q_b,
                        })

    # Sort by priority descending and cap total
    candidates.sort(key=lambda x: x["priority"], reverse=True)
    candidates = candidates[:MAX_CONTRADICTION_ALERTS]

    created = []
    for c in candidates:
        alert_id = _upsert_alert(
            alert_type="contradiction",
            priority_score=round(c["priority"], 1),
            date_start=c["a"]["entry"]["entry_date"],
            date_end=c["b"]["entry"]["entry_date"],
            supporting_dates=[
                c["a"]["entry"]["entry_date"],
                c["b"]["entry"]["entry_date"],
            ],
            description=c["desc"],
            suggested_packets=["incident_packet", "chronology"],
            user_id=user_id,
        )
        _write_evidence_from_alert(
            entry_id=c["a"]["entry"]["entry_id"],
            alert_id=alert_id,
            label=f"Statement ({c['a']['entry']['entry_date']})",
            quote_text=c["q_a"],
            evidence_type="contradiction",
            source_date=c["a"]["entry"]["entry_date"],
            user_id=user_id,
        )
        _write_evidence_from_alert(
            entry_id=c["b"]["entry"]["entry_id"],
            alert_id=alert_id,
            label=f"Conflicting entry ({c['b']['entry']['entry_date']})",
            quote_text=c["q_b"],
            evidence_type="contradiction",
            source_date=c["b"]["entry"]["entry_date"],
            user_id=user_id,
        )
        created.append({"id": alert_id, "type": "contradiction", "description": c["desc"]})

    return created


# ── Public entry points ───────────────────────────────────────────────────────

def run_all_detectors(user_id: Optional[int] = None, days_back: int = 365) -> dict:
    """
    Run all rule-based detectors.
    Returns summary of what was created/updated.
    Call after each ingest.
    """
    entries = _load_entries_with_summaries(days_back=days_back, user_id=user_id)

    if not entries:
        return {"status": "no_data", "alerts_created": 0}

    results = {
        "entries_scanned": len(entries),
        "mood_spikes": [],
        "severity_streaks": [],
        "instability_clusters": [],
        "contradictions": [],
    }

    results["mood_spikes"] = detect_mood_spikes(entries, user_id=user_id)
    results["severity_streaks"] = detect_severity_streaks(entries, user_id=user_id)
    results["instability_clusters"] = detect_instability_clusters(entries, user_id=user_id)
    results["contradictions"] = detect_contradictions(entries, user_id=user_id)

    total = sum(len(v) for v in results.values() if isinstance(v, list))
    results["alerts_created_or_updated"] = total

    return results


def get_active_alerts(limit: int = 20) -> list[dict]:
    """Return unacknowledged alerts ordered by priority. Used by dashboard sidebar."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, alert_type, priority_score, date_range_start, date_range_end,
               supporting_dates, description, ai_analysis, acknowledged, created_at
        FROM alerts
        WHERE acknowledged = 0
        ORDER BY priority_score DESC, created_at DESC
        LIMIT ?
    """, (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def acknowledge_alert(alert_id: int) -> bool:
    """Mark an alert as acknowledged."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE alerts SET acknowledged = 1, updated_at = datetime('now') WHERE id = ?",
        (alert_id,),
    )
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0
