"""
exit_plan_share_routes.py  —  src/api/exit_plan_share_routes.py
Token-based read-only share links for the exit plan.

Security model:
  - Raw token returned once at creation, never stored.
  - DB stores SHA-256(token) only — leaked DB reveals nothing usable.
  - Configurable expiry: 1h, 24h, 1w, 30d, 90d (default 90d).
  - Create / revoke require owner role.
  - Public endpoint is IP rate-limited (60 req / 5 min).
  - _ensure_table() runs once at registration, never inside a request.
  - last_accessed_at update is fire-and-forget, never blocks the response.
  - Max 10 active tokens per plan.

Wire up in main.py (after register_exit_plan_routes):
    from src.api.exit_plan_share_routes import register_exit_plan_share_routes
    register_exit_plan_share_routes(app, require_any_user, require_owner)
"""

import hashlib
import logging
import secrets
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from src.auth.auth_db import check_rate_limit
from src.auth.middleware import get_client_ip

logger    = logging.getLogger("journal")
DB_PATH   = Path(__file__).parent.parent.parent / "db" / "journal.db"
TOKEN_CAP = 10

# Allowed expiry windows. Key is the value accepted in the API request.
ALLOWED_DURATIONS: dict[str, timedelta] = {
    "1h":     timedelta(hours=1),
    "24h":    timedelta(hours=24),
    "1w":     timedelta(weeks=1),
    "30d":    timedelta(days=30),
    "90d":    timedelta(days=90),
}
DEFAULT_DURATION = "90d"


# ── DB helpers ────────────────────────────────────────────────────────────────

def _db():
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _ensure_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS exit_plan_share_tokens (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id          INTEGER NOT NULL,
            user_id          INTEGER NOT NULL,
            token_hash       TEXT NOT NULL UNIQUE,
            label            TEXT,
            created_at       TEXT NOT NULL,
            expires_at       TEXT NOT NULL,
            last_accessed_at TEXT,
            FOREIGN KEY (plan_id) REFERENCES exit_plans(id) ON DELETE CASCADE
        )
    """)
    conn.commit()


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Plan payload builder ──────────────────────────────────────────────────────

def _build_plan_payload(conn, plan_id: int) -> Optional[dict]:
    """Phases + tasks only. No notes, contacts, attachments, or journal text."""
    import json

    plan_row = conn.execute(
        "SELECT * FROM exit_plans WHERE id = ?", (plan_id,)
    ).fetchone()
    if not plan_row:
        return None

    branches = json.loads(plan_row["branches"] or "[]")
    phases   = conn.execute(
        "SELECT * FROM exit_plan_phases WHERE plan_id = ? ORDER BY phase_order",
        (plan_id,)
    ).fetchall()

    PLAN_TYPE_LABELS = {
        "separation_planning": "Separation Planning",
        "safety_first":        "Safety Planning",
        "financial_recovery":  "Financial Recovery",
        "housing_transition":  "Housing Transition",
        "general_transition":  "Life Transition",
    }

    phases_out  = []
    total_tasks = 0
    total_done  = 0

    for ph in phases:
        tasks = conn.execute(
            "SELECT id, title, status, priority, completed_at "
            "FROM exit_plan_tasks WHERE phase_id = ? ORDER BY id",
            (ph["id"],)
        ).fetchall()

        task_list = []
        ph_done   = 0
        for t in tasks:
            task_list.append({
                "id":           t["id"],
                "title":        t["title"],
                "status":       t["status"],
                "priority":     t["priority"],
                "completed_at": t["completed_at"],
            })
            if t["status"] == "done":
                ph_done += 1

        ph_total    = len(task_list)
        ph_progress = round(ph_done / ph_total, 2) if ph_total else 0.0
        total_tasks += ph_total
        total_done  += ph_done

        phases_out.append({
            "id":          ph["id"],
            "phase_order": ph["phase_order"],
            "title":       ph["title"],
            "status":      ph["status"],
            "progress":    ph_progress,
            "task_count":  ph_total,
            "done_count":  ph_done,
            "tasks":       task_list,
        })

    return {
        "plan_type":       plan_row["plan_type"],
        "plan_type_label": PLAN_TYPE_LABELS.get(
            plan_row["plan_type"],
            plan_row["plan_type"].replace("_", " ").title()
        ),
        "branches":         branches,
        "status":           plan_row["status"],
        "overall_progress": round(total_done / total_tasks, 2) if total_tasks else 0.0,
        "total_tasks":      total_tasks,
        "done_tasks":       total_done,
        "phases":           phases_out,
        "generated_at":     plan_row["generated_at"],
        "updated_at":       plan_row["updated_at"],
    }


# ── Background touch ──────────────────────────────────────────────────────────

def _touch_accessed(token_id: int):
    """Update last_accessed_at without blocking the response."""
    def _run():
        try:
            conn = _db()
            conn.execute(
                "UPDATE exit_plan_share_tokens SET last_accessed_at = ? WHERE id = ?",
                (datetime.now(timezone.utc).isoformat(), token_id)
            )
            conn.commit()
            conn.close()
        except Exception:
            pass
    threading.Thread(target=_run, daemon=True).start()


# ── Pydantic ──────────────────────────────────────────────────────────────────

class CreateShareTokenRequest(BaseModel):
    label:      Optional[str] = None
    expires_in: Optional[str] = DEFAULT_DURATION  # one of ALLOWED_DURATIONS keys


# ── Routes ────────────────────────────────────────────────────────────────────

def register_exit_plan_share_routes(app, require_any_user, require_owner):

    # Run DDL once at startup
    _c = _db()
    _ensure_table(_c)
    _c.close()

    # ── Create ────────────────────────────────────────────────────────────────

    @app.post("/api/exit-plan/share")
    def create_share_token(
        body: CreateShareTokenRequest,
        current_user: dict = Depends(require_owner),
    ):
        user_id = current_user["id"]
        conn    = _db()

        plan = conn.execute(
            "SELECT id FROM exit_plans WHERE user_id = ?", (user_id,)
        ).fetchone()
        if not plan:
            conn.close()
            raise HTTPException(status_code=404, detail="No exit plan found.")

        plan_id = plan["id"]

        count = conn.execute(
            "SELECT COUNT(*) FROM exit_plan_share_tokens WHERE plan_id = ?",
            (plan_id,)
        ).fetchone()[0]
        if count >= TOKEN_CAP:
            conn.close()
            raise HTTPException(
                status_code=400,
                detail=f"Maximum of {TOKEN_CAP} share links per plan. Revoke one first."
            )

        raw_token  = secrets.token_urlsafe(32)
        token_hash = _hash_token(raw_token)
        now        = datetime.now(timezone.utc)
        now_iso    = now.isoformat()
        duration   = ALLOWED_DURATIONS.get(body.expires_in or DEFAULT_DURATION, ALLOWED_DURATIONS[DEFAULT_DURATION])
        expires_at = (now + duration).isoformat()
        label      = (body.label or "").strip() or None

        conn.execute(
            "INSERT INTO exit_plan_share_tokens "
            "(plan_id, user_id, token_hash, label, created_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (plan_id, user_id, token_hash, label, now_iso, expires_at)
        )
        conn.commit()

        token_id = conn.execute(
            "SELECT id FROM exit_plan_share_tokens WHERE token_hash = ?",
            (token_hash,)
        ).fetchone()["id"]
        conn.close()

        logger.info(f"[share] created token id={token_id} user={user_id} plan={plan_id}")

        # Raw token returned ONCE. Never stored. Never retrievable again.
        return {
            "token_id":   token_id,
            "token":      raw_token,
            "label":      label,
            "created_at": now_iso,
            "expires_at": expires_at,
        }

    # ── List ──────────────────────────────────────────────────────────────────

    @app.get("/api/exit-plan/share")
    def list_share_tokens(current_user: dict = Depends(require_owner)):
        user_id = current_user["id"]
        conn    = _db()

        rows = conn.execute(
            "SELECT id, label, created_at, expires_at, last_accessed_at "
            "FROM exit_plan_share_tokens WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        conn.close()

        now = datetime.now(timezone.utc).isoformat()
        return {
            "tokens": [
                {**dict(r), "expired": r["expires_at"] < now}
                for r in rows
            ]
        }

    # ── Revoke ────────────────────────────────────────────────────────────────

    @app.delete("/api/exit-plan/share/{token_id}")
    def revoke_share_token(
        token_id: int,
        current_user: dict = Depends(require_owner),
    ):
        user_id = current_user["id"]
        conn    = _db()

        row = conn.execute(
            "SELECT id FROM exit_plan_share_tokens WHERE id = ? AND user_id = ?",
            (token_id, user_id)
        ).fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Token not found.")

        conn.execute("DELETE FROM exit_plan_share_tokens WHERE id = ?", (token_id,))
        conn.commit()
        conn.close()

        logger.info(f"[share] token {token_id} revoked by user {user_id}")
        return {"revoked": True}

    # ── Public view (no auth) ─────────────────────────────────────────────────

    @app.get("/api/share/plan/{token}")
    def public_plan_view(token: str, request: Request):
        ip = get_client_ip(request)
        if not check_rate_limit(ip, "share_plan_view", max_attempts=60, window_minutes=5):
            raise HTTPException(status_code=429, detail="Too many requests. Try again later.")

        token_hash = _hash_token(token)
        conn       = _db()

        row = conn.execute(
            "SELECT id, plan_id, label, expires_at "
            "FROM exit_plan_share_tokens WHERE token_hash = ?",
            (token_hash,)
        ).fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Link not found or has been revoked.")

        if row["expires_at"] < datetime.now(timezone.utc).isoformat():
            conn.close()
            raise HTTPException(status_code=410, detail="This link has expired.")

        plan_data = _build_plan_payload(conn, row["plan_id"])
        conn.close()

        if not plan_data:
            raise HTTPException(status_code=404, detail="Plan not found.")

        _touch_accessed(row["id"])

        plan_data["share_label"] = row["label"]
        plan_data["expires_at"]  = row["expires_at"]
        return plan_data
