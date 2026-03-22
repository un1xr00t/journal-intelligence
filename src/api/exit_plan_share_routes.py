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
  - Passphrase generated at creation (3 words + 4-digit number), hash stored.
  - Correct passphrase returns a stateless session token (HMAC) + grants temp IP access.
  - /internal/ip-check called by nginx auth_request — checks static CIDRs + temp_access table.

Wire up in main.py (after register_exit_plan_routes):
    from src.api.exit_plan_share_routes import register_exit_plan_share_routes
    register_exit_plan_share_routes(app, require_any_user, require_owner)
"""

import hashlib
import hmac
import ipaddress
import logging
import secrets
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from src.auth.auth_db import check_rate_limit
from src.auth.middleware import get_client_ip

logger    = logging.getLogger("journal")
DB_PATH   = Path(__file__).parent.parent.parent / "db" / "journal.db"
TOKEN_CAP = 10

# Allowed expiry windows.
ALLOWED_DURATIONS: dict[str, timedelta] = {
    "1h":  timedelta(hours=1),
    "24h": timedelta(hours=24),
    "1w":  timedelta(weeks=1),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
}
DEFAULT_DURATION = "90d"

# Static IP allowlist — mirrors nginx config.
# Add / remove CIDRs here to match your nginx allow directives.
ALLOWED_CIDRS = [
    "73.174.44.217/32",   # home
    "163.114.130.0/24",   # work
    "172.59.140.0/24",    # mobile
]

# Wordlist for passphrase generation (3 words + 4-digit PIN)
WORDS = [
    "amber","arctic","aspen","azure","birch","blade","bloom","bold","brave","cedar",
    "chill","clear","cliff","cloud","coral","crane","crisp","delta","dusk","eagle",
    "ember","flame","frost","ghost","grace","grove","haven","hawk","haze","holly",
    "ivory","jade","karma","lake","lemon","light","lunar","maple","marsh","mist",
    "moon","north","ocean","olive","onyx","orbit","peak","pearl","pine","prism",
    "quest","raven","river","rock","rose","sage","salt","sand","shore","silk",
    "slate","snow","solar","south","spark","steel","stone","storm","swift","teal",
    "tiger","trail","vault","violet","wave","whale","willow","wind","wolf","zenith",
]

# Populated once at startup by _ensure_table via _load_share_secret()
_SHARE_SECRET: str = ""


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
            passphrase_hash  TEXT,
            label            TEXT,
            created_at       TEXT NOT NULL,
            expires_at       TEXT NOT NULL,
            last_accessed_at TEXT,
            FOREIGN KEY (plan_id) REFERENCES exit_plans(id) ON DELETE CASCADE
        )
    """)

    # Add passphrase_hash column to existing tables (safe — ignores if already present)
    try:
        conn.execute("ALTER TABLE exit_plan_share_tokens ADD COLUMN passphrase_hash TEXT")
    except Exception:
        pass

    conn.execute("""
        CREATE TABLE IF NOT EXISTS share_temp_access (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            ip         TEXT    NOT NULL,
            token_id   INTEGER NOT NULL,
            expires_at TEXT    NOT NULL,
            created_at TEXT    NOT NULL,
            UNIQUE(ip, token_id),
            FOREIGN KEY (token_id) REFERENCES exit_plan_share_tokens(id) ON DELETE CASCADE
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sta_ip      ON share_temp_access(ip)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sta_expires ON share_temp_access(expires_at)")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS app_config (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.commit()


def _load_share_secret(conn):
    """Load or generate the HMAC secret used to sign session tokens."""
    global _SHARE_SECRET
    row = conn.execute("SELECT value FROM app_config WHERE key='share_secret'").fetchone()
    if row:
        _SHARE_SECRET = row["value"]
        return
    secret = secrets.token_hex(32)
    conn.execute("INSERT INTO app_config(key, value) VALUES('share_secret', ?)", (secret,))
    conn.commit()
    _SHARE_SECRET = secret
    logger.info("[share] generated new share_secret")


# ── Crypto helpers ────────────────────────────────────────────────────────────

def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _hash_passphrase(raw: str) -> str:
    """Normalise and SHA-256 hash a passphrase."""
    return hashlib.sha256(raw.lower().strip().encode()).hexdigest()


def _generate_passphrase() -> str:
    """Return a memorable 3-word + 4-digit passphrase, e.g. 'violet-storm-cedar-4729'."""
    import random
    words = random.sample(WORDS, 3)
    pin   = random.randint(1000, 9999)
    return f"{words[0]}-{words[1]}-{words[2]}-{pin}"


def _make_session_token(passphrase_hash: str, token_id: int) -> str:
    """Create a stateless HMAC session token from passphrase_hash + token_id."""
    msg = f"{passphrase_hash}:{token_id}"
    return hmac.new(_SHARE_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()


def _verify_session_token(session: str, passphrase_hash: str, token_id: int) -> bool:
    expected = _make_session_token(passphrase_hash, token_id)
    return hmac.compare_digest(session, expected)


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
    expires_in: Optional[str] = DEFAULT_DURATION


class VerifyPassphraseRequest(BaseModel):
    passphrase: str


# ── Routes ────────────────────────────────────────────────────────────────────

def register_exit_plan_share_routes(app, require_any_user, require_owner):

    # Run DDL once at startup
    _c = _db()
    _ensure_table(_c)
    _load_share_secret(_c)
    _c.close()

    # ── nginx auth_request check ──────────────────────────────────────────────
    # Called internally by nginx auth_request — never exposed externally.
    # Returns 200 if IP is allowed (static CIDR or temp access), 401 otherwise.

    @app.get("/internal/ip-check")
    def internal_ip_check(request: Request):
        # ── Check invite access token first (IP-independent) ─────────────────
        # Browser sends X-Invite-Token on every request after claiming an invite.
        # This is an HMAC over (token_id:expires_at) — validated without a DB hit.
        invite_header = request.headers.get("X-Invite-Token", "")
        if invite_header:
            try:
                from src.api.invite_routes import _verify_access_token, _db as _invite_db
                # Token format: "{token_id}:{hmac_hex}"
                parts = invite_header.split(":", 1)
                if len(parts) == 2:
                    tid_str, tok = parts
                    token_id = int(tid_str)
                    iconn = _invite_db()
                    inv_row = iconn.execute(
                        "SELECT expires_at, revoked, invalidated FROM invite_tokens WHERE id = ?",
                        (token_id,)
                    ).fetchone()
                    iconn.close()
                    if inv_row and not inv_row["revoked"] and not inv_row["invalidated"]:
                        now = datetime.now(timezone.utc).isoformat()
                        if inv_row["expires_at"] > now:
                            if _verify_access_token(tok, token_id, inv_row["expires_at"]):
                                logger.debug(f"[ip-check] invite token {token_id} granted access")
                                return Response(status_code=200)
            except Exception as e:
                logger.warning(f"[ip-check] invite token validation error: {e}")

        ip_str = request.headers.get("X-Real-IP") or get_client_ip(request)

        # Check static CIDR allowlist
        try:
            ip = ipaddress.ip_address(ip_str)
            for cidr in ALLOWED_CIDRS:
                if ip in ipaddress.ip_network(cidr, strict=False):
                    return Response(status_code=200)
        except ValueError:
            logger.warning(f"[ip-check] could not parse IP: {ip_str!r}")

        # Check temp access table (exit plan share)
        now  = datetime.now(timezone.utc).isoformat()
        conn = _db()
        row  = conn.execute(
            "SELECT id FROM share_temp_access WHERE ip = ? AND expires_at > ? LIMIT 1",
            (ip_str, now)
        ).fetchone()

        # Lazy cleanup of expired share_temp_access entries
        conn.execute("DELETE FROM share_temp_access WHERE expires_at <= ?", (now,))
        conn.commit()

        if row:
            conn.close()
            logger.debug(f"[ip-check] share temp access granted for {ip_str}")
            return Response(status_code=200)

        # Check invite_temp_access table
        invite_row = conn.execute(
            "SELECT id FROM invite_temp_access WHERE ip = ? AND expires_at > ? LIMIT 1",
            (ip_str, now)
        ).fetchone()

        # Lazy cleanup of expired invite_temp_access entries
        conn.execute("DELETE FROM invite_temp_access WHERE expires_at <= ?", (now,))
        conn.commit()
        conn.close()

        if invite_row:
            logger.debug(f"[ip-check] invite temp access granted for {ip_str}")
            return Response(status_code=200)

        logger.info(f"[ip-check] denied {ip_str}")
        return Response(status_code=401)

    # ── Create ────────────────────────────────────────────────────────────────

    @app.post("/api/exit-plan/share")
    def create_share_token(
        body: CreateShareTokenRequest,
        current_user: dict = Depends(require_any_user),
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

        raw_token       = secrets.token_urlsafe(32)
        token_hash      = _hash_token(raw_token)
        passphrase      = _generate_passphrase()
        passphrase_hash = _hash_passphrase(passphrase)
        now             = datetime.now(timezone.utc)
        now_iso         = now.isoformat()
        duration        = ALLOWED_DURATIONS.get(body.expires_in or DEFAULT_DURATION, ALLOWED_DURATIONS[DEFAULT_DURATION])
        expires_at      = (now + duration).isoformat()
        label           = (body.label or "").strip() or None

        conn.execute(
            "INSERT INTO exit_plan_share_tokens "
            "(plan_id, user_id, token_hash, passphrase_hash, label, created_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (plan_id, user_id, token_hash, passphrase_hash, label, now_iso, expires_at)
        )
        conn.commit()

        token_id = conn.execute(
            "SELECT id FROM exit_plan_share_tokens WHERE token_hash = ?",
            (token_hash,)
        ).fetchone()["id"]
        conn.close()

        logger.info(f"[share] created token id={token_id} user={user_id} plan={plan_id}")

        # Raw token AND passphrase returned ONCE. Never stored in plaintext. Never retrievable again.
        return {
            "token_id":   token_id,
            "token":      raw_token,
            "passphrase": passphrase,
            "label":      label,
            "created_at": now_iso,
            "expires_at": expires_at,
        }

    # ── List ──────────────────────────────────────────────────────────────────

    @app.get("/api/exit-plan/share")
    def list_share_tokens(current_user: dict = Depends(require_any_user)):
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
        current_user: dict = Depends(require_any_user),
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

    # ── Regenerate passphrase ───────────────────────────────────────────────

    @app.post("/api/exit-plan/share/{token_id}/regenerate-passphrase")
    def regenerate_share_passphrase(
        token_id: int,
        current_user: dict = Depends(require_any_user),
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

        passphrase      = _generate_passphrase()
        passphrase_hash = _hash_passphrase(passphrase)

        conn.execute(
            "UPDATE exit_plan_share_tokens SET passphrase_hash = ? WHERE id = ?",
            (passphrase_hash, token_id)
        )
        conn.commit()
        conn.close()

        logger.info(f"[share] passphrase regenerated for token id={token_id} user={user_id}")

        # New passphrase returned ONCE — never stored in plaintext.
        return {"passphrase": passphrase}

    # ── Verify passphrase (public) ────────────────────────────────────────────

    @app.post("/api/share/verify/{token}")
    def verify_share_passphrase(token: str, body: VerifyPassphraseRequest, request: Request):
        ip = get_client_ip(request)
        if not check_rate_limit(ip, "share_verify", max_attempts=10, window_minutes=15):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")

        token_hash = _hash_token(token)
        conn       = _db()

        row = conn.execute(
            "SELECT id, expires_at, passphrase_hash "
            "FROM exit_plan_share_tokens WHERE token_hash = ?",
            (token_hash,)
        ).fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Link not found or has been revoked.")

        if row["expires_at"] < datetime.now(timezone.utc).isoformat():
            conn.close()
            raise HTTPException(status_code=410, detail="This link has expired.")

        if not row["passphrase_hash"]:
            conn.close()
            raise HTTPException(status_code=400, detail="This link was created without passphrase protection. Please generate a new link.")

        candidate = _hash_passphrase(body.passphrase)
        if not hmac.compare_digest(candidate, row["passphrase_hash"]):
            conn.close()
            raise HTTPException(status_code=401, detail="Incorrect passphrase.")

        # Grant temporary IP access until the share token expires
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO share_temp_access (ip, token_id, expires_at, created_at) "
            "VALUES (?, ?, ?, ?) ON CONFLICT(ip, token_id) DO UPDATE SET expires_at = excluded.expires_at",
            (ip, row["id"], row["expires_at"], now)
        )
        conn.commit()
        conn.close()

        session_token = _make_session_token(row["passphrase_hash"], row["id"])
        logger.info(f"[share] passphrase verified, temp IP access granted to {ip} via token id={row['id']}")

        return {
            "access_granted": True,
            "session_token":  session_token,
            "expires_at":     row["expires_at"],
        }

    # ── Public plan view (no auth — protected by passphrase session token) ────

    @app.get("/api/share/plan/{token}")
    def public_plan_view(token: str, request: Request):
        ip = get_client_ip(request)
        if not check_rate_limit(ip, "share_plan_view", max_attempts=60, window_minutes=5):
            raise HTTPException(status_code=429, detail="Too many requests. Try again later.")

        token_hash = _hash_token(token)
        conn       = _db()

        row = conn.execute(
            "SELECT id, plan_id, label, expires_at, passphrase_hash "
            "FROM exit_plan_share_tokens WHERE token_hash = ?",
            (token_hash,)
        ).fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Link not found or has been revoked.")

        if row["expires_at"] < datetime.now(timezone.utc).isoformat():
            conn.close()
            raise HTTPException(status_code=410, detail="This link has expired.")

        # Validate passphrase session token
        if row["passphrase_hash"]:
            auth    = request.headers.get("Authorization", "")
            session = auth[7:] if auth.startswith("Bearer ") else ""
            if not session or not _verify_session_token(session, row["passphrase_hash"], row["id"]):
                conn.close()
                raise HTTPException(
                    status_code=401,
                    detail={"message": "Passphrase required.", "passphrase_required": True}
                )

        plan_data = _build_plan_payload(conn, row["plan_id"])
        conn.close()

        if not plan_data:
            raise HTTPException(status_code=404, detail="Plan not found.")

        _touch_accessed(row["id"])

        plan_data["share_label"] = row["label"]
        plan_data["expires_at"]  = row["expires_at"]
        return plan_data
