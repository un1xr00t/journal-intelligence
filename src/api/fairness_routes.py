"""
src/api/fairness_routes.py
Fairness Ledger — who does what, who does more.

Routes:
  GET    /api/fairness/config           — get partner setup
  POST   /api/fairness/config           — create/update partner setup
  GET    /api/fairness/tasks            — list tasks for this user
  POST   /api/fairness/tasks            — add a task
  PATCH  /api/fairness/tasks/{id}       — update/deactivate a task
  POST   /api/fairness/log              — log a task completion
  DELETE /api/fairness/log/{id}         — delete a log entry
  GET    /api/fairness/logs             — recent log history
  GET    /api/fairness/summary          — get current living summary
  POST   /api/fairness/summary/generate — regenerate AI summary
"""

from __future__ import annotations
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Depends
from pydantic import BaseModel

logger = logging.getLogger("journal")

# ── Default task seed list ────────────────────────────────────────────────────
DEFAULT_TASKS = [
    # Childcare — morning
    {"name": "Morning meds",                    "category": "childcare"},
    {"name": "Changed pull-up",                 "category": "childcare"},
    {"name": "Got child dressed",               "category": "childcare"},
    {"name": "Morning prep (bag, water, toys)",  "category": "childcare"},
    {"name": "School drop-off",                 "category": "childcare"},
    {"name": "Put child on bus",                "category": "childcare"},
    {"name": "Got child off bus",               "category": "childcare"},
    {"name": "After-school snacks",             "category": "childcare"},
    # Childcare — evening
    {"name": "Evening walk with child",         "category": "childcare"},
    {"name": "Fed child dinner",                "category": "childcare"},
    {"name": "Child bath/shower",               "category": "childcare"},
    {"name": "Brushed child's teeth",           "category": "childcare"},
    {"name": "Child bedtime routine",           "category": "childcare"},
    {"name": "Managed child behavior",          "category": "childcare"},
    # Childcare — other child
    {"name": "Woke older child for school",     "category": "childcare"},
    {"name": "Reminded older child to shower",  "category": "childcare"},
    # Childcare — appointments & medical
    {"name": "Scheduled doctor appointment",    "category": "childcare"},
    {"name": "Took child to appointment",       "category": "childcare"},
    {"name": "Managed therapy coordination",    "category": "childcare"},
    # Childcare — outings
    {"name": "Took child on errand/outing",     "category": "childcare"},
    {"name": "Park / outdoor activity",         "category": "childcare"},
    # Dog care
    {"name": "Dog walk",                        "category": "chores"},
    {"name": "Dog food & water",                "category": "chores"},
    {"name": "Cleaned dog cage",                "category": "chores"},
    # Chores
    {"name": "Cooked dinner",                   "category": "chores"},
    {"name": "Dishes",                          "category": "chores"},
    {"name": "Laundry",                         "category": "chores"},
    {"name": "Grocery shopping",                "category": "chores"},
    {"name": "Took out all trash",              "category": "chores"},
    {"name": "Took trash cans to curb",         "category": "chores"},
    {"name": "Cleaned house",                   "category": "chores"},
    # Emotional labor
    {"name": "Handled partner request/errand",  "category": "emotional_labor"},
    {"name": "Took non-urgent call from partner","category": "emotional_labor"},
    {"name": "Covered partner's shift with kids","category": "emotional_labor"},
    {"name": "Managed situation alone",         "category": "emotional_labor"},
    # Finances
    {"name": "Paid bills",                      "category": "finances"},
    {"name": "Grocery bill",                    "category": "finances"},
    {"name": "Fast food / dinner run",          "category": "finances"},
    # Logistics
    {"name": "Car shuffle (driveway)",          "category": "logistics"},
    {"name": "Coordinated schedules",           "category": "logistics"},
    {"name": "Handled household errand",        "category": "logistics"},
]

CATEGORY_LABELS = {
    "childcare":      "Childcare",
    "chores":         "Chores",
    "emotional_labor":"Emotional Labor",
    "finances":       "Finances",
    "logistics":      "Logistics",
}

# ── Pydantic models ───────────────────────────────────────────────────────────

class ConfigUpsert(BaseModel):
    my_name: str = "Me"
    partner_name: str
    partner_relationship: Optional[str] = None
    member3_name: Optional[str] = None
    member3_relationship: Optional[str] = None

class TaskCreate(BaseModel):
    name: str
    category: str

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[int] = None

class LogCreate(BaseModel):
    task_id: int
    performed_by: str   # 'me' | 'partner'
    note: Optional[str] = None
    logged_at: Optional[str] = None  # ISO string, defaults to now


class ContributionCreate(BaseModel):
    performed_by: str        # 'me' | 'partner'
    category: str
    description: str
    contribution_date: Optional[str] = None  # YYYY-MM-DD, defaults to today
# ── Route factory ─────────────────────────────────────────────────────────────

def register_fairness_routes(app, get_db, require_any_user, create_message):

    # ── Config ────────────────────────────────────────────────────────────────

    @app.get("/api/fairness/config")
    def get_fairness_config(db=Depends(get_db), user=Depends(require_any_user)):
        row = db.execute(
            "SELECT my_name, partner_name FROM fairness_config WHERE user_id=?",
            (user["id"],)
        ).fetchone()
        if not row:
            return {"configured": False}
        return {"configured": True, "my_name": row["my_name"], "partner_name": row["partner_name"]}

    @app.post("/api/fairness/config")
    def upsert_fairness_config(body: ConfigUpsert, db=Depends(get_db), user=Depends(require_any_user)):
        now = datetime.now(timezone.utc).isoformat()
        existing = db.execute(
            "SELECT id FROM fairness_config WHERE user_id=?", (user["id"],)
        ).fetchone()

        if existing:
            db.execute(
                "UPDATE fairness_config SET my_name=?, partner_name=?, updated_at=? WHERE user_id=?",
                (body.my_name, body.partner_name, now, user["id"])
            )
        else:
            db.execute(
                "INSERT INTO fairness_config (user_id, my_name, partner_name, created_at, updated_at) VALUES (?,?,?,?,?)",
                (user["id"], body.my_name, body.partner_name, now, now)
            )
            # Seed default tasks on first setup
            for task in DEFAULT_TASKS:
                try:
                    db.execute(
                        "INSERT INTO fairness_tasks (user_id, name, category, created_at) VALUES (?,?,?,?)",
                        (user["id"], task["name"], task["category"], now)
                    )
                except Exception:
                    pass  # UNIQUE constraint — skip if already exists

        db.commit()
        return {"ok": True, "my_name": body.my_name, "partner_name": body.partner_name}

    # ── Tasks ─────────────────────────────────────────────────────────────────

    @app.get("/api/fairness/tasks")
    def get_fairness_tasks(db=Depends(get_db), user=Depends(require_any_user)):
        rows = db.execute(
            "SELECT id, name, category, is_active FROM fairness_tasks WHERE user_id=? ORDER BY category, name",
            (user["id"],)
        ).fetchall()
        return {"tasks": [dict(r) for r in rows]}

    @app.post("/api/fairness/tasks")
    def create_fairness_task(body: TaskCreate, db=Depends(get_db), user=Depends(require_any_user)):
        if body.category not in CATEGORY_LABELS:
            raise HTTPException(400, f"Invalid category. Must be one of: {list(CATEGORY_LABELS.keys())}")
        now = datetime.now(timezone.utc).isoformat()
        try:
            cur = db.execute(
                "INSERT INTO fairness_tasks (user_id, name, category, created_at) VALUES (?,?,?,?)",
                (user["id"], body.name.strip(), body.category, now)
            )
            db.commit()
            return {"ok": True, "task_id": cur.lastrowid}
        except Exception:
            raise HTTPException(409, "Task with that name already exists")

    @app.patch("/api/fairness/tasks/{task_id}")
    def update_fairness_task(task_id: int, body: TaskUpdate, db=Depends(get_db), user=Depends(require_any_user)):
        row = db.execute(
            "SELECT id FROM fairness_tasks WHERE id=? AND user_id=?", (task_id, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Task not found")
        updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
        if not updates:
            return {"ok": True}
        set_clause = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE fairness_tasks SET {set_clause} WHERE id=?", (*updates.values(), task_id))
        db.commit()
        return {"ok": True}

    # ── Logs ──────────────────────────────────────────────────────────────────

    @app.post("/api/fairness/log")
    def log_fairness_task(body: LogCreate, db=Depends(get_db), user=Depends(require_any_user)):
        if body.performed_by not in ("me", "partner"):
            raise HTTPException(400, "performed_by must be 'me' or 'partner'")
        task = db.execute(
            "SELECT id FROM fairness_tasks WHERE id=? AND user_id=?", (body.task_id, user["id"])
        ).fetchone()
        if not task:
            raise HTTPException(404, "Task not found")
        logged_at = body.logged_at or datetime.now(timezone.utc).isoformat()
        cur = db.execute(
            "INSERT INTO fairness_logs (user_id, task_id, performed_by, logged_at, note) VALUES (?,?,?,?,?)",
            (user["id"], body.task_id, body.performed_by, logged_at, body.note)
        )
        db.commit()
        return {"ok": True, "log_id": cur.lastrowid}

    @app.delete("/api/fairness/log/{log_id}")
    def delete_fairness_log(log_id: int, db=Depends(get_db), user=Depends(require_any_user)):
        row = db.execute(
            "SELECT id FROM fairness_logs WHERE id=? AND user_id=?", (log_id, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Log entry not found")
        db.execute("DELETE FROM fairness_logs WHERE id=?", (log_id,))
        db.commit()
        return {"ok": True}

    @app.get("/api/fairness/logs")
    def get_fairness_logs(limit: int = 50, offset: int = 0, db=Depends(get_db), user=Depends(require_any_user)):
        rows = db.execute(
            """
            SELECT fl.id, fl.performed_by, fl.logged_at, fl.note,
                   ft.name AS task_name, ft.category
            FROM fairness_logs fl
            JOIN fairness_tasks ft ON ft.id = fl.task_id
            WHERE fl.user_id=?
            ORDER BY fl.logged_at DESC
            LIMIT ? OFFSET ?
            """,
            (user["id"], limit, offset)
        ).fetchall()
        total = db.execute("SELECT COUNT(*) FROM fairness_logs WHERE user_id=?", (user["id"],)).fetchone()[0]
        return {"logs": [dict(r) for r in rows], "total": total}

    # ── Summary ───────────────────────────────────────────────────────────────

    @app.get("/api/fairness/summary")
    def get_fairness_summary(db=Depends(get_db), user=Depends(require_any_user)):
        row = db.execute(
            "SELECT summary_text, score_json, log_count, generated_at FROM fairness_summary WHERE user_id=?",
            (user["id"],)
        ).fetchone()
        if not row:
            return {"exists": False}
        return {
            "exists": True,
            "summary_text": row["summary_text"],
            "score": json.loads(row["score_json"]),
            "log_count": row["log_count"],
            "generated_at": row["generated_at"],
        }

    @app.post("/api/fairness/summary/generate")
    def generate_fairness_summary(db=Depends(get_db), user=Depends(require_any_user)):
        # Load config
        config = db.execute(
            "SELECT my_name, partner_name FROM fairness_config WHERE user_id=?", (user["id"],)
        ).fetchone()
        if not config:
            raise HTTPException(400, "Fairness Ledger not configured yet")

        my_name = config["my_name"]
        partner_name = config["partner_name"]

        # Load all logs with task info
        logs = db.execute(
            """
            SELECT fl.performed_by, fl.logged_at, fl.note,
                   ft.name AS task_name, ft.category
            FROM fairness_logs fl
            JOIN fairness_tasks ft ON ft.id = fl.task_id
            WHERE fl.user_id=?
            ORDER BY fl.logged_at ASC
            """,
            (user["id"],)
        ).fetchall()

        # Load freeform contributions too
        contributions = db.execute(
            """
            SELECT performed_by, category, description, contribution_date
            FROM fairness_contributions WHERE user_id=?
            ORDER BY contribution_date ASC
            """,
            (user["id"],)
        ).fetchall()

        if not logs and not contributions:
            raise HTTPException(400, "No logs yet — start logging tasks first")

        total = len(logs)
        log_count = total + len(contributions)

        # Build score counts from task logs
        score = {
            "me":      {"total": 0, "by_category": {c: 0 for c in CATEGORY_LABELS}},
            "partner": {"total": 0, "by_category": {c: 0 for c in CATEGORY_LABELS}},
            "member3": {"total": 0, "by_category": {c: 0 for c in CATEGORY_LABELS}},
        }
        for log in logs:
            who = log["performed_by"]
            cat = log["category"]
            if who not in score:
                continue
            score[who]["total"] += 1
            if cat in score[who]["by_category"]:
                score[who]["by_category"][cat] += 1

        me_pct = round((score["me"]["total"] / total) * 100) if total else 0
        partner_pct = 100 - me_pct

        # Build log digest for AI prompt (cap at 200 most recent)
        recent = list(logs)[-200:]
        log_lines = []
        for log in recent:
            who_label = my_name if log["performed_by"] == "me" else partner_name
            note_part = f" ({log['note']})" if log["note"] else ""
            log_lines.append(f"- {log['logged_at'][:10]} | {who_label} | {log['task_name']} [{log['category']}]{note_part}")
        log_digest = "\n".join(log_lines)

        # Build freeform contributions digest
        contrib_lines = []
        for c in list(contributions)[-100:]:
            who_label = my_name if c["performed_by"] == "me" else partner_name
            contrib_lines.append(f"- {c['contribution_date']} | {who_label} | [{c['category']}] {c['description']}")
        contrib_digest = "\n".join(contrib_lines) if contrib_lines else "None recorded."

        system = f"""You are an honest, clear-eyed relationship analyst embedded in a private journaling app.
Your job is to analyze who does what in a household/co-parenting relationship and produce a living summary.

You have two data sources:
1. Task logs — recurring daily/weekly tasks that were logged each time they were done
2. Freeform contributions — bigger one-off things that don't fit a task template

Be factual, specific, and direct. Do not sugarcoat. Do not take sides. Reference actual tasks and contributions.
Identify who carries the load in which areas. Note any trends — did the split improve or worsen over time?
Give credit where it's due for both people.

The two people are: {my_name} (logged as 'me') and {partner_name} (logged as 'partner').
Task log split: {my_name} {me_pct}% vs {partner_name} {partner_pct}% ({total} total task logs).

Respond with plain text only. 3-5 paragraphs. No bullet points. No headers. No JSON.
Write as if you're giving a frank assessment to someone who needs to understand their situation clearly."""

        user_prompt = f"""TASK LOGS ({total} entries, most recent shown):
{log_digest}

Task counts by category:
{my_name}: {json.dumps(score['me']['by_category'], indent=2)}
{partner_name}: {json.dumps(score['partner']['by_category'], indent=2)}

FREEFORM CONTRIBUTIONS ({len(contributions)} entries):
{contrib_digest}

Write the living summary."""

        summary_text = create_message(
            user["id"],
            system=system,
            user_prompt=user_prompt,
            max_tokens=800
        )

        # Save/update
        now = datetime.now(timezone.utc).isoformat()
        score_json = json.dumps(score)
        existing = db.execute("SELECT id FROM fairness_summary WHERE user_id=?", (user["id"],)).fetchone()
        if existing:
            db.execute(
                "UPDATE fairness_summary SET summary_text=?, score_json=?, log_count=?, generated_at=? WHERE user_id=?",
                (summary_text, score_json, log_count, now, user["id"])
            )
        else:
            db.execute(
                "INSERT INTO fairness_summary (user_id, summary_text, score_json, log_count, generated_at) VALUES (?,?,?,?,?)",
                (user["id"], summary_text, score_json, log_count, now)
            )
        db.commit()

        return {
            "ok": True,
            "summary_text": summary_text,
            "score": score,
            "log_count": log_count,
            "generated_at": now,
            "me_pct": me_pct,
            "partner_pct": partner_pct,
        }

    # ── Freeform Contributions ────────────────────────────────────────────────

    @app.post("/api/fairness/contributions")
    def add_fairness_contribution(body: ContributionCreate, db=Depends(get_db), user=Depends(require_any_user)):
        if body.performed_by not in ("me", "partner"):
            raise HTTPException(400, "performed_by must be 'me' or 'partner'")
        if body.category not in CATEGORY_LABELS:
            raise HTTPException(400, f"Invalid category. Must be one of: {list(CATEGORY_LABELS.keys())}")
        now = datetime.now(timezone.utc).isoformat()
        from datetime import date
        contribution_date = body.contribution_date or date.today().isoformat()
        cur = db.execute(
            "INSERT INTO fairness_contributions (user_id, performed_by, category, description, contribution_date, logged_at) VALUES (?,?,?,?,?,?)",
            (user["id"], body.performed_by, body.category, body.description.strip(), contribution_date, now)
        )
        db.commit()
        return {"ok": True, "contribution_id": cur.lastrowid}

    @app.get("/api/fairness/contributions")
    def get_fairness_contributions(limit: int = 50, offset: int = 0, db=Depends(get_db), user=Depends(require_any_user)):
        rows = db.execute(
            """
            SELECT id, performed_by, category, description, contribution_date, logged_at
            FROM fairness_contributions
            WHERE user_id=?
            ORDER BY contribution_date DESC, logged_at DESC
            LIMIT ? OFFSET ?
            """,
            (user["id"], limit, offset)
        ).fetchall()
        total = db.execute("SELECT COUNT(*) FROM fairness_contributions WHERE user_id=?", (user["id"],)).fetchone()[0]
        return {"contributions": [dict(r) for r in rows], "total": total}

    @app.delete("/api/fairness/contributions/{contribution_id}")
    def delete_fairness_contribution(contribution_id: int, db=Depends(get_db), user=Depends(require_any_user)):
        row = db.execute(
            "SELECT id FROM fairness_contributions WHERE id=? AND user_id=?", (contribution_id, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Contribution not found")
        db.execute("DELETE FROM fairness_contributions WHERE id=?", (contribution_id,))
        db.commit()
        return {"ok": True}

