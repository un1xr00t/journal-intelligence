"""
src/api/early_warning_routes.py
Early Warning System — pattern-based pre-spike detection.

Algorithm:
  1. Scan all historical entries, find severity spikes (>= 7.5) that emerged
     from a calm baseline (prev 7-day avg < 6.0).
  2. For each spike, record the 3-day pre-spike window signals: topics, people,
     stress keywords, mood trend direction.
  3. On status check, compute same signals for the current 3-day window and
     score against every stored historical pattern (0-100).
  4. If >= 2 patterns score >= 35 -> warning active.

Routes:
  GET  /api/early-warning/status    — compute + return warning status
  POST /api/early-warning/dismiss   — dismiss for 24h
  POST /api/early-warning/rebuild   — recompute all historical patterns
"""

import json
import logging
from datetime import datetime, timezone

_logger = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────

SPIKE_THRESHOLD  = 7.5   # severity score treated as a spike
BASELINE_WINDOW  = 7     # days before spike used to establish baseline
BASELINE_MAX_AVG = 6.0   # baseline avg must be below this (real spike from calm)
PRE_WINDOW_DAYS  = 3     # days before spike to extract pre-spike signals from
MATCH_THRESHOLD  = 35    # min score (0-100) to count a pattern as matched
MATCHES_NEEDED   = 2     # how many matched patterns trigger the warning
DISMISS_HOURS    = 24

# Keywords that frequently appear before high-severity windows
_STRESS_KEYWORDS = [
    "hopeless", "exhausted", "can't sleep", "dreading", "scared",
    "anxious", "overwhelmed", "stuck", "trapped", "alone", "terrified",
    "can't take", "breaking point", "falling apart", "spiral", "losing it",
    "numb", "worthless", "give up", "shutdown", "empty",
]


# ── DB helper ─────────────────────────────────────────────────────────────────

def _get_db():
    from src.auth.auth_db import get_db
    return get_db()


# ── Signal extraction helpers ─────────────────────────────────────────────────

def _parse_json_field(val) -> list:
    if not val:
        return []
    if isinstance(val, list):
        return val
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _extract_people(entities_json) -> list:
    entities = _parse_json_field(entities_json)
    people = set()
    for e in entities:
        if isinstance(e, dict):
            if (e.get("type") or "").upper() == "PERSON":
                n = (e.get("name") or "").strip().lower()
                if n:
                    people.add(n)
        elif isinstance(e, str):
            people.add(e.lower().strip())
    return list(people)


def _extract_topics(tags_json) -> list:
    return [str(t).lower().strip() for t in _parse_json_field(tags_json) if t]


def _keyword_flags(text: str) -> list:
    if not text:
        return []
    lower = text.lower()
    return [kw for kw in _STRESS_KEYWORDS if kw in lower]


def _mood_trend(entries: list) -> str:
    scores = [e.get("mood_score") for e in entries if e.get("mood_score") is not None]
    if len(scores) < 2:
        return "stable"
    delta = scores[-1] - scores[0]
    if delta < -1.5:
        return "declining"
    if delta > 1.5:
        return "rising"
    return "stable"


# ── Pattern builder ───────────────────────────────────────────────────────────

def _build_patterns_for_user(user_id: int) -> int:
    """
    Scan all historical entries, identify true severity spikes, extract
    pre-spike signals, write to signal_patterns table.
    Returns number of patterns written.
    """
    conn = _get_db()
    try:
        rows = conn.execute("""
            SELECT e.entry_date, ds.severity, ds.mood_score,
                   ds.tags, ds.entities, ds.summary_text
            FROM entries e
            JOIN derived_summaries ds ON ds.entry_id = e.id
            WHERE e.user_id = ? AND e.is_current = 1
              AND ds.severity IS NOT NULL
            ORDER BY e.entry_date ASC
        """, (user_id,)).fetchall()
    finally:
        conn.close()

    min_entries = BASELINE_WINDOW + PRE_WINDOW_DAYS + 1
    if len(rows) < min_entries:
        return 0

    entries = [dict(r) for r in rows]

    # Wipe existing patterns so rebuild is clean
    conn2 = _get_db()
    try:
        conn2.execute("DELETE FROM signal_patterns WHERE user_id = ?", (user_id,))
        conn2.commit()
    finally:
        conn2.close()

    written = 0

    for i, entry in enumerate(entries):
        sev = entry.get("severity")
        if sev is None or sev < SPIKE_THRESHOLD:
            continue
        if i < BASELINE_WINDOW + PRE_WINDOW_DAYS:
            continue

        # Verify this is a spike from calm (not already elevated)
        baseline = entries[i - BASELINE_WINDOW:i]
        baseline_sevs = [e["severity"] for e in baseline if e.get("severity") is not None]
        if not baseline_sevs or (sum(baseline_sevs) / len(baseline_sevs)) >= BASELINE_MAX_AVG:
            continue

        # Extract signals from the 3-day pre-spike window
        pre = entries[max(0, i - PRE_WINDOW_DAYS):i]
        if not pre:
            continue

        pre_sevs = [e["severity"] for e in pre if e.get("severity") is not None]
        pre_avg = round(sum(pre_sevs) / len(pre_sevs), 2) if pre_sevs else None

        all_topics, all_people, combined_text = [], [], ""
        for pw in pre:
            all_topics.extend(_extract_topics(pw.get("tags")))
            all_people.extend(_extract_people(pw.get("entities")))
            combined_text += " " + (pw.get("summary_text") or "")

        conn3 = _get_db()
        try:
            conn3.execute("""
                INSERT INTO signal_patterns
                  (user_id, spike_date, spike_severity, pre_avg_severity,
                   pre_mood_trend, pre_topics, pre_people,
                   pre_keyword_flags, entry_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                entry["entry_date"],
                sev,
                pre_avg,
                _mood_trend(pre),
                json.dumps(list(set(all_topics))),
                json.dumps(list(set(all_people))),
                json.dumps(_keyword_flags(combined_text)),
                len(pre),
            ))
            conn3.commit()
            written += 1
        finally:
            conn3.close()

    _logger.info(f"[early_warning] built {written} patterns for user {user_id}")
    return written


# ── Pattern scoring ───────────────────────────────────────────────────────────

def _score_match(pattern: dict, current: dict) -> int:
    """Score how closely the current 3-day window matches a historical pattern. 0-100."""
    score = 0

    # Topic overlap — up to 25 points
    p_topics = set(_parse_json_field(pattern.get("pre_topics")))
    c_topics = set(current.get("topics", []))
    if p_topics or c_topics:
        overlap = len(p_topics & c_topics)
        denom = max(len(p_topics), len(c_topics), 1)
        score += round((overlap / denom) * 25)

    # People overlap — up to 25 points
    p_people = set(_parse_json_field(pattern.get("pre_people")))
    c_people = set(current.get("people", []))
    if p_people or c_people:
        overlap = len(p_people & c_people)
        denom = max(len(p_people), len(c_people), 1)
        score += round((overlap / denom) * 25)

    # Stress keyword overlap — up to 20 points
    p_kw = set(_parse_json_field(pattern.get("pre_keyword_flags")))
    c_kw = set(current.get("keywords", []))
    if p_kw:
        overlap = len(p_kw & c_kw)
        score += min(round((overlap / len(p_kw)) * 20), 20)
    elif c_kw:
        # Current has stress keywords even though pattern didn't — partial credit
        score += min(len(c_kw) * 3, 10)

    # Mood trend match — 15 points
    if pattern.get("pre_mood_trend") == "declining" and current.get("trend") == "declining":
        score += 15

    # Severity trending up in current window — 15 points
    if current.get("sev_trending_up") and (pattern.get("pre_avg_severity") or 0) > 0:
        score += 15

    return min(score, 100)


# ── Warning computation ───────────────────────────────────────────────────────

def _compute_warning_status(user_id: int) -> dict:
    conn = _get_db()
    try:
        recent_rows = conn.execute("""
            SELECT e.entry_date, ds.severity, ds.mood_score,
                   ds.tags, ds.entities, ds.summary_text
            FROM entries e
            JOIN derived_summaries ds ON ds.entry_id = e.id
            WHERE e.user_id = ? AND e.is_current = 1
              AND ds.severity IS NOT NULL
            ORDER BY e.entry_date DESC
            LIMIT ?
        """, (user_id, PRE_WINDOW_DAYS)).fetchall()

        pattern_rows = conn.execute(
            "SELECT * FROM signal_patterns WHERE user_id = ? ORDER BY spike_date ASC",
            (user_id,)
        ).fetchall()

        warning_row = conn.execute(
            "SELECT dismissed_at FROM early_warnings WHERE user_id = ?",
            (user_id,)
        ).fetchone()
    finally:
        conn.close()

    if not recent_rows:
        return {"active": False, "reason": "insufficient_data", "total_patterns": 0}

    recent = [dict(r) for r in recent_rows]

    # Build current signals
    all_topics, all_people, combined_text = [], [], ""
    for e in recent:
        all_topics.extend(_extract_topics(e.get("tags")))
        all_people.extend(_extract_people(e.get("entities")))
        combined_text += " " + (e.get("summary_text") or "")

    sevs = [e["severity"] for e in recent if e.get("severity") is not None]
    sev_trending_up = False
    if len(sevs) >= 2:
        sorted_r = sorted(recent, key=lambda x: x["entry_date"])
        sorted_s = [e["severity"] for e in sorted_r if e.get("severity") is not None]
        if len(sorted_s) >= 2:
            sev_trending_up = sorted_s[-1] > sorted_s[0]

    current_signals = {
        "topics": list(set(all_topics)),
        "people": list(set(all_people)),
        "keywords": _keyword_flags(combined_text),
        "trend": _mood_trend(recent),
        "sev_trending_up": sev_trending_up,
        "avg_severity": round(sum(sevs) / len(sevs), 1) if sevs else None,
    }

    patterns = [dict(p) for p in pattern_rows]
    if not patterns:
        return {
            "active": False,
            "reason": "no_historical_patterns",
            "total_patterns": 0,
            "current_signals": current_signals,
        }

    # Score each pattern against current window
    scored = []
    for p in patterns:
        s = _score_match(p, current_signals)
        if s >= MATCH_THRESHOLD:
            scored.append({
                "spike_date": p["spike_date"],
                "spike_severity": p["spike_severity"],
                "score": s,
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    matched_count = len(scored)
    warning_active = matched_count >= MATCHES_NEEDED

    # Check if within dismiss window
    dismissed = False
    if warning_row and warning_row["dismissed_at"]:
        try:
            dismissed_dt = datetime.fromisoformat(warning_row["dismissed_at"])
            age_h = (datetime.now(timezone.utc) - dismissed_dt).total_seconds() / 3600
            if age_h < DISMISS_HOURS:
                dismissed = True
        except Exception:
            pass

    best = scored[0] if scored else None
    confidence = round(best["score"] / 100, 2) if best else 0.0

    # Persist to early_warnings
    now_iso = datetime.now(timezone.utc).isoformat()
    conn4 = _get_db()
    try:
        conn4.execute("""
            INSERT INTO early_warnings
              (user_id, warning_active, confidence, matched_pattern_count,
               matched_signals, last_spike_date, last_spike_severity, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              warning_active          = excluded.warning_active,
              confidence              = excluded.confidence,
              matched_pattern_count   = excluded.matched_pattern_count,
              matched_signals         = excluded.matched_signals,
              last_spike_date         = excluded.last_spike_date,
              last_spike_severity     = excluded.last_spike_severity,
              computed_at             = excluded.computed_at
        """, (
            user_id,
            1 if warning_active else 0,
            confidence,
            matched_count,
            json.dumps(current_signals),
            best["spike_date"] if best else None,
            best["spike_severity"] if best else None,
            now_iso,
        ))
        conn4.commit()
    finally:
        conn4.close()

    return {
        "active":             warning_active and not dismissed,
        "dismissed":          dismissed,
        "confidence":         confidence,
        "matched_count":      matched_count,
        "total_patterns":     len(patterns),
        "current_signals":    current_signals,
        "matched_spikes":     scored[:5],
        "last_spike_date":    best["spike_date"] if best else None,
        "last_spike_severity": best["spike_severity"] if best else None,
    }


# ── Migration ─────────────────────────────────────────────────────────────────

def _run_migration():
    conn = _get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS signal_patterns (
              id                 INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id            INTEGER NOT NULL,
              spike_date         TEXT NOT NULL,
              spike_severity     REAL NOT NULL,
              pre_avg_severity   REAL,
              pre_mood_trend     TEXT,
              pre_topics         TEXT,
              pre_people         TEXT,
              pre_keyword_flags  TEXT,
              entry_count        INTEGER DEFAULT 0,
              created_at         TEXT DEFAULT (datetime('now')),
              FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS early_warnings (
              id                      INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id                 INTEGER NOT NULL UNIQUE,
              warning_active          INTEGER DEFAULT 0,
              confidence              REAL DEFAULT 0.0,
              matched_pattern_count   INTEGER DEFAULT 0,
              matched_signals         TEXT,
              last_spike_date         TEXT,
              last_spike_severity     REAL,
              dismissed_at            TEXT,
              computed_at             TEXT,
              FOREIGN KEY (user_id) REFERENCES users(id)
            );
        """)
        conn.commit()
        _logger.info("[early_warning] migration complete")
    except Exception as e:
        _logger.warning(f"[early_warning] migration warning: {e}")
    finally:
        conn.close()


# ── Route registration ────────────────────────────────────────────────────────

def register_early_warning_routes(app, require_any_user):
    from fastapi import Depends, HTTPException

    _run_migration()

    @app.get("/api/early-warning/status")
    async def get_early_warning_status(current_user: dict = Depends(require_any_user)):
        try:
            conn = _get_db()
            try:
                count = conn.execute(
                    "SELECT COUNT(*) as n FROM signal_patterns WHERE user_id = ?",
                    (current_user["id"],)
                ).fetchone()["n"]
            finally:
                conn.close()

            if count == 0:
                _build_patterns_for_user(current_user["id"])

            return _compute_warning_status(current_user["id"])
        except Exception as e:
            _logger.error(f"[early_warning] status error: {e}", exc_info=True)
            return {"active": False, "error": str(e), "total_patterns": 0}

    @app.post("/api/early-warning/dismiss")
    async def dismiss_early_warning(current_user: dict = Depends(require_any_user)):
        now = datetime.now(timezone.utc).isoformat()
        conn = _get_db()
        try:
            conn.execute("""
                INSERT INTO early_warnings (user_id, dismissed_at, computed_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET dismissed_at = excluded.dismissed_at
            """, (current_user["id"], now, now))
            conn.commit()
        finally:
            conn.close()
        return {"dismissed": True, "dismissed_at": now}

    @app.post("/api/early-warning/rebuild")
    async def rebuild_patterns(current_user: dict = Depends(require_any_user)):
        try:
            n = _build_patterns_for_user(current_user["id"])
            return {"patterns_built": n}
        except Exception as e:
            _logger.error(f"[early_warning] rebuild error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))
