"""
src/api/crisis_routes.py
GET /api/crisis/status — checks for sustained high-severity streaks
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "db" / "journal.db"

CRISIS_SEVERITY_THRESHOLD = 8.5
CRISIS_MIN_DAYS           = 3


def register_crisis_routes(app, require_any_user):

    @app.get("/api/crisis/status")
    def get_crisis_status(current_user: dict = require_any_user):
        user_id = current_user["id"]

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # Pull last 60 days of severity scores, most recent first
        cur.execute("""
            SELECT e.entry_date, ds.severity
            FROM entries e
            JOIN derived_summaries ds ON ds.entry_id = e.id
            WHERE e.user_id = ?
              AND e.is_current = 1
              AND ds.severity IS NOT NULL
            ORDER BY e.entry_date DESC
            LIMIT 60
        """, (user_id,))

        rows = [dict(r) for r in cur.fetchall()]
        conn.close()

        if not rows:
            return {"active": False, "days": 0, "avg_severity": None, "since_date": None}

        # Walk from most recent — find the leading streak above threshold
        streak = []
        for row in rows:
            if row["severity"] >= CRISIS_SEVERITY_THRESHOLD:
                streak.append(row)
            else:
                break  # streak must be consecutive from today backward

        if len(streak) < CRISIS_MIN_DAYS:
            return {"active": False, "days": len(streak), "avg_severity": None, "since_date": None}

        avg_sev = round(sum(r["severity"] for r in streak) / len(streak), 1)
        since_date = streak[-1]["entry_date"]  # oldest date in streak

        return {
            "active":       True,
            "days":         len(streak),
            "avg_severity": avg_sev,
            "since_date":   since_date,
        }
