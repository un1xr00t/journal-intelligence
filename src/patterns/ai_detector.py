"""
src/patterns/ai_detector.py
AI-assisted pattern analysis. Triggered only when a rule-based alert
crosses a priority threshold. Results cached in alerts.ai_analysis.
Never processes raw entry text — only stored summaries for the alert's date range.
"""

import json
import sqlite3
import yaml
from pathlib import Path
from typing import Optional

from src.config import DB_PATH, CONFIG_PATH, PROMPTS_PATH, load_config
# CONFIG_PATH imported from src.config
# PROMPTS_PATH imported from src.config

AI_PRIORITY_THRESHOLD = 6.0  # Only run AI analysis above this score


def _load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def _load_prompts() -> dict:
    with open(PROMPTS_PATH) as f:
        return yaml.safe_load(f)


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _get_summaries_for_range(date_start: str, date_end: str) -> list[dict]:
    """Fetch daily summaries for the alert's date range. Never raw text."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT e.entry_date, ds.summary_text, ds.mood_label, ds.mood_score, ds.severity
        FROM entries e
        JOIN derived_summaries ds ON e.id = ds.entry_id
        WHERE e.is_current = 1
          AND e.entry_date BETWEEN ? AND ?
        ORDER BY e.entry_date ASC
    """, (date_start, date_end))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def _format_summaries(summaries: list[dict]) -> str:
    lines = []
    for s in summaries:
        lines.append(
            f"[{s['entry_date']}] mood={s.get('mood_label','?')} "
            f"({s.get('mood_score','?')}) severity={s.get('severity','?')}: "
            f"{s.get('summary_text','(no summary)')}"
        )
    return "\n".join(lines)


def _cache_ai_result(alert_id: int, analysis_json: str) -> None:
    conn = get_db()
    conn.execute("""
        UPDATE alerts
        SET ai_analysis = ?, updated_at = datetime('now')
        WHERE id = ?
    """, (analysis_json, alert_id))
    conn.commit()
    conn.close()


def run_ai_analysis(alert_id: int, force: bool = False) -> dict:
    """
    Run AI deep analysis for a specific alert.
    Returns the analysis dict. Result is cached in alerts.ai_analysis.
    ALL exit paths write to DB so frontend polling always terminates.
    """
    import logging
    logger = logging.getLogger(__name__)

    def _bail(reason: str) -> dict:
        """Write an error sentinel to DB and return. Guarantees polling terminates."""
        sentinel = {"error": reason}
        try:
            _cache_ai_result(alert_id, json.dumps(sentinel))
        except Exception as e:
            logger.error(f"run_ai_analysis: failed to write sentinel for alert {alert_id}: {e}")
        logger.error(f"run_ai_analysis alert {alert_id}: {reason}")
        return sentinel

    try:
        config = _load_config()
        prompts = _load_prompts()
    except Exception as e:
        return _bail(f"Config load failed: {e}")

    # Fetch the alert
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,))
    alert = cursor.fetchone()
    conn.close()

    if not alert:
        return _bail(f"Alert {alert_id} not found")

    alert = dict(alert)

    # Return cached result unless forced
    if alert.get("ai_analysis") and not force:
        try:
            return {"status": "cached", "analysis": json.loads(alert["ai_analysis"])}
        except json.JSONDecodeError:
            pass  # fall through and re-run

    # Check priority threshold
    if alert["priority_score"] < AI_PRIORITY_THRESHOLD and not force:
        return _bail(f"Priority {alert['priority_score']:.1f} below threshold {AI_PRIORITY_THRESHOLD}")

    # For contradiction alerts, fetch the two specific evidence statements directly
    # rather than all summaries between two dates (which may span months with gaps)
    is_contradiction = alert.get("alert_type") == "contradiction"
    evidence_context = ""
    summaries = []

    if is_contradiction:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT label, quote_text, source_date
            FROM evidence
            WHERE alert_id = ? AND evidence_type = 'contradiction'
            ORDER BY source_date ASC
        """, (alert_id,))
        ev_rows = [dict(r) for r in cursor.fetchall()]
        conn.close()

        if ev_rows:
            lines = [f"[{r['source_date']}] {r['quote_text']}" for r in ev_rows]
            evidence_context = "Contradiction statements:\n" + "\n".join(lines)
        else:
            # Fall back to summaries if no evidence rows
            summaries = _get_summaries_for_range(alert["date_range_start"], alert["date_range_end"])
            if summaries:
                evidence_context = _format_summaries(summaries)

    else:
        summaries = _get_summaries_for_range(alert["date_range_start"], alert["date_range_end"])
        if summaries:
            evidence_context = _format_summaries(summaries)

    if not evidence_context:
        return _bail("No evidence or summaries found for this alert")

    prompt_cfg = prompts.get("pattern_analysis", {})
    system_prompt = prompt_cfg.get("system", "You are a journal pattern analyst.")
    user_template = prompt_cfg.get("user", "{alert_type} {date_range_start} {date_range_end} {alert_description} {period_summaries}")

    user_prompt = user_template.format(
        alert_type=alert["alert_type"],
        date_range_start=alert["date_range_start"],
        date_range_end=alert["date_range_end"],
        alert_description=alert.get("description", ""),
        period_summaries=evidence_context,
    )

    # Call Claude via ai_client (respects per-user API key)
    try:
        from src.api.ai_client import create_message
        import re as _re

        raw = create_message(
            user_id=alert.get("user_id"),
            system=system_prompt,
            user_prompt=user_prompt,
            max_tokens=1200,
        )

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = _re.sub(r'^```(?:json)?\s*\n?', '', raw)
            raw = _re.sub(r'\n?```\s*$', '', raw)
            raw = raw.strip()

        analysis = json.loads(raw)
        _cache_ai_result(alert_id, json.dumps(analysis))

        if analysis.get("severity_assessment") in ("high", "critical"):
            _write_evidence_for_analysis(alert, analysis, summaries)

        return {"status": "success", "analysis": analysis}

    except json.JSONDecodeError as e:
        return _bail(f"AI response was not valid JSON: {e}. Raw: {raw[:200] if 'raw' in dir() else 'n/a'}")
    except Exception as e:
        return _bail(f"AI call failed: {type(e).__name__}: {e}")


def _write_evidence_for_analysis(alert: dict, analysis: dict, summaries: list[dict]) -> None:
    """Auto-create evidence items from high-priority AI analysis findings."""
    from src.patterns.detectors import _write_evidence_from_alert

    # Write AI analysis as an observation evidence item
    if analysis.get("analysis") and summaries:
        # Link to the first entry in the range
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT e.id FROM entries e
            WHERE e.entry_date = ? AND e.is_current = 1
        """, (summaries[0]["entry_date"],))
        row = cursor.fetchone()
        conn.close()

        if row:
            _write_evidence_from_alert(
                entry_id=row["id"],
                alert_id=alert["id"],
                label=f"AI Pattern Analysis: {alert['alert_type']} ({alert['date_range_start']}–{alert['date_range_end']})",
                quote_text=analysis["analysis"][:500],
                evidence_type="observation",
                source_date=alert["date_range_start"],
            )

    # Write each evidence point from the AI response
    for i, ev_point in enumerate(analysis.get("evidence", [])[:3]):
        if summaries and i < len(summaries):
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT e.id FROM entries e
                WHERE e.entry_date = ? AND e.is_current = 1
            """, (summaries[min(i, len(summaries)-1)]["entry_date"],))
            row = cursor.fetchone()
            conn.close()
            if row:
                _write_evidence_from_alert(
                    entry_id=row["id"],
                    alert_id=alert["id"],
                    label=f"Evidence point {i+1} ({alert['date_range_start']})",
                    quote_text=ev_point[:300],
                    evidence_type="observation",
                    source_date=summaries[min(i, len(summaries)-1)]["entry_date"],
                )


def run_pending_ai_analyses(max_alerts: int = 5) -> dict:
    """
    Check for high-priority unanalyzed alerts and run AI on them.
    Called automatically after pattern detection if any alert >= threshold.
    Processes up to max_alerts to control costs.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, alert_type, priority_score FROM alerts
        WHERE acknowledged = 0
          AND ai_analysis IS NULL
          AND priority_score >= ?
        ORDER BY priority_score DESC
        LIMIT ?
    """, (AI_PRIORITY_THRESHOLD, max_alerts))
    pending = [dict(r) for r in cursor.fetchall()]
    conn.close()

    results = []
    for alert in pending:
        result = run_ai_analysis(alert["id"])
        results.append({
            "alert_id": alert["id"],
            "alert_type": alert["alert_type"],
            "priority": alert["priority_score"],
            "status": result.get("status", "error"),
        })

    return {"processed": len(results), "results": results}
