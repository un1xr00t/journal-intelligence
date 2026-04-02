"""
invite_routes.py  —  src/api/invite_routes.py

Single-use invite link system.
Security model:
  - Token returned once at creation, never stored. DB stores SHA-256(token) only.
  - Passphrase: 3 words + 4-digit PIN, same generation scheme as exit plan share.
  - On verify: first IP to enter correct passphrase claims the token.
  - Same IP returning → idempotent re-grant (refreshes invite_temp_access).
  - Different IP on a claimed token → token INVALIDATED immediately (nuclear).
    Original claimed IP keeps their invite_temp_access entry until admin revokes.
  - Revoke: deletes invite_token (CASCADE removes invite_temp_access row too).
  - /internal/ip-check is patched separately to also query invite_temp_access.

Wire up in main.py:
    from src.api.invite_routes import register_invite_routes
    register_invite_routes(app, require_any_user, require_owner)
"""

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from src.auth.auth_db import check_rate_limit
from src.auth.middleware import get_client_ip

logger  = logging.getLogger("journal")
DB_PATH = Path(__file__).parent.parent.parent / "db" / "journal.db"

ALLOWED_DURATIONS = {
    "24h":       timedelta(hours=24),
    "7d":        timedelta(days=7),
    "30d":       timedelta(days=30),
    "90d":       timedelta(days=90),
    "permanent": timedelta(days=36500),   # ~100 years
}
DEFAULT_DURATION = "30d"

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


# ── DB ────────────────────────────────────────────────────────────────────────

def _db():
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _ensure_tables(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS invite_tokens (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash         TEXT    NOT NULL UNIQUE,
            passphrase_hash    TEXT    NOT NULL,
            label              TEXT,
            created_by         INTEGER NOT NULL,
            created_at         TEXT    NOT NULL,
            expires_at         TEXT    NOT NULL,
            claimed_at         TEXT,
            claimed_ip         TEXT,
            revoked            INTEGER NOT NULL DEFAULT 0,
            revoked_at         TEXT,
            invalidated        INTEGER NOT NULL DEFAULT 0,
            invalidated_at     TEXT,
            invalidated_reason TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS invite_temp_access (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            ip              TEXT    NOT NULL UNIQUE,
            invite_token_id INTEGER NOT NULL,
            expires_at      TEXT    NOT NULL,
            created_at      TEXT    NOT NULL,
            FOREIGN KEY (invite_token_id) REFERENCES invite_tokens(id) ON DELETE CASCADE
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_invite_tokens_hash ON invite_tokens(token_hash)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ita_ip      ON invite_temp_access(ip)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ita_expires ON invite_temp_access(expires_at)")
    conn.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def _hash_passphrase(phrase: str) -> str:
    return hashlib.sha256(phrase.strip().lower().encode()).hexdigest()

def _generate_passphrase() -> str:
    words = secrets.SystemRandom().choices(WORDS, k=3)
    pin   = secrets.randbelow(9000) + 1000
    return f"{words[0]}-{words[1]}-{words[2]}-{pin}"


# ── HMAC access token (IP-independent, stored in browser) ────────────────────

_INVITE_SECRET: str = ""

def _load_invite_secret(conn):
    global _INVITE_SECRET
    row = conn.execute("SELECT value FROM app_config WHERE key='invite_secret'").fetchone()
    if row:
        _INVITE_SECRET = row["value"]
        return
    secret = secrets.token_hex(32)
    conn.execute("INSERT INTO app_config(key, value) VALUES('invite_secret', ?)", (secret,))
    conn.commit()
    _INVITE_SECRET = secret
    logger.info("[invite] generated new invite_secret")

def _make_access_token(token_id: int, expires_at: str) -> str:
    msg = f"{token_id}:{expires_at}"
    return hmac.new(_INVITE_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()

def _verify_access_token(access_token: str, token_id: int, expires_at: str) -> bool:
    expected = _make_access_token(token_id, expires_at)
    return hmac.compare_digest(access_token, expected)


# ── Pydantic ──────────────────────────────────────────────────────────────────

class CreateInviteRequest(BaseModel):
    label:      Optional[str] = None
    expires_in: Optional[str] = DEFAULT_DURATION

class VerifyInviteRequest(BaseModel):
    passphrase: str


# ── Routes ────────────────────────────────────────────────────────────────────

def register_invite_routes(app, require_any_user, require_owner):

    conn = _db()
    _ensure_tables(conn)
    # ensure app_config table exists (created by exit_plan_share_routes, but be safe)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS app_config (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.commit()
    _load_invite_secret(conn)
    conn.close()

    # ── Public: peek at invite metadata (is it valid / claimed / expired?) ──

    @app.get("/api/invite/{token}/status")
    def invite_status(token: str, request: Request):
        ip = get_client_ip(request)
        if not check_rate_limit(ip, "invite_status", max_attempts=30, window_minutes=5):
            raise HTTPException(status_code=429, detail="Too many requests.")

        token_hash = _hash_token(token)
        conn       = _db()
        row        = conn.execute(
            "SELECT id, label, expires_at, claimed_ip, revoked, invalidated FROM invite_tokens WHERE token_hash = ?",
            (token_hash,)
        ).fetchone()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="Invite link not found.")

        now = datetime.now(timezone.utc).isoformat()

        return {
            "valid":        not row["revoked"] and not row["invalidated"] and row["expires_at"] > now,
            "expired":      row["expires_at"] <= now,
            "revoked":      bool(row["revoked"]),
            "invalidated":  bool(row["invalidated"]),
            "claimed":      row["claimed_ip"] is not None,
            "claimed_by_me": row["claimed_ip"] == ip,
            "label":        row["label"],
            "expires_at":   row["expires_at"],
        }

    # ── Public: verify passphrase → grant IP access ─────────────────────────

    @app.post("/api/invite/{token}/verify")
    def verify_invite(token: str, body: VerifyInviteRequest, request: Request):
        ip = get_client_ip(request)
        if not check_rate_limit(ip, "invite_verify", max_attempts=10, window_minutes=15):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")

        token_hash = _hash_token(token)
        conn       = _db()
        row        = conn.execute(
            "SELECT id, expires_at, passphrase_hash, claimed_ip, revoked, invalidated "
            "FROM invite_tokens WHERE token_hash = ?",
            (token_hash,)
        ).fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Invite link not found.")

        if row["revoked"]:
            conn.close()
            raise HTTPException(status_code=403, detail="This invite link has been revoked.")

        if row["invalidated"]:
            conn.close()
            raise HTTPException(status_code=403, detail="This invite link has been invalidated because it was accessed from another location.")

        now = datetime.now(timezone.utc).isoformat()
        if row["expires_at"] < now:
            conn.close()
            raise HTTPException(status_code=410, detail="This invite link has expired.")

        # Passphrase check
        candidate = _hash_passphrase(body.passphrase)
        if not hmac.compare_digest(candidate, row["passphrase_hash"]):
            conn.close()
            raise HTTPException(status_code=401, detail="Incorrect passphrase.")

        token_id   = row["id"]
        expires_at = row["expires_at"]
        claimed_ip = row["claimed_ip"]

        # ── Case 1: unclaimed → claim it ──────────────────────────────────
        if claimed_ip is None:
            conn.execute(
                "UPDATE invite_tokens SET claimed_ip = ?, claimed_at = ? WHERE id = ?",
                (ip, now, token_id)
            )
            conn.execute(
                "INSERT INTO invite_temp_access (ip, invite_token_id, expires_at, created_at) "
                "VALUES (?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET invite_token_id = excluded.invite_token_id, expires_at = excluded.expires_at",
                (ip, token_id, expires_at, now)
            )
            conn.commit()
            conn.close()
            access_token = _make_access_token(token_id, expires_at)
            logger.info(f"[invite] token {token_id} claimed by {ip}")
            return {"access_granted": True, "token_id": token_id, "invite_access_token": access_token, "expires_at": expires_at, "message": "Access granted. You can now create your account."}

        # ── Case 2: same IP returns → re-grant / refresh ─────────────────
        if claimed_ip == ip:
            conn.execute(
                "INSERT INTO invite_temp_access (ip, invite_token_id, expires_at, created_at) "
                "VALUES (?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET expires_at = excluded.expires_at",
                (ip, token_id, expires_at, now)
            )
            conn.commit()
            conn.close()
            access_token = _make_access_token(token_id, expires_at)
            logger.info(f"[invite] token {token_id} re-verified by original IP {ip}")
            return {"access_granted": True, "token_id": token_id, "invite_access_token": access_token, "expires_at": expires_at, "message": "Access confirmed. Welcome back."}

        # ── Case 3: different IP → INVALIDATE token, protect original user ─
        conn.execute(
            "UPDATE invite_tokens SET invalidated = 1, invalidated_at = ?, invalidated_reason = ? WHERE id = ?",
            (now, f"Second IP {ip} attempted to use token claimed by {claimed_ip}", token_id)
        )
        conn.commit()
        conn.close()
        logger.warning(f"[invite] INVALIDATED token {token_id} — second IP {ip} tried to use token claimed by {claimed_ip}")
        raise HTTPException(
            status_code=403,
            detail="This invite link has been invalidated because it was accessed from another location. The original recipient can still use the app."
        )

    # ── Admin: create invite ─────────────────────────────────────────────────

    @app.post("/api/admin/invites")
    def create_invite(body: CreateInviteRequest, current_user: dict = Depends(require_owner)):
        duration   = ALLOWED_DURATIONS.get(body.expires_in or DEFAULT_DURATION, ALLOWED_DURATIONS[DEFAULT_DURATION])
        token      = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)
        passphrase = _generate_passphrase()
        phrase_hash = _hash_passphrase(passphrase)
        now        = datetime.now(timezone.utc)
        expires_at = (now + duration).isoformat()

        conn = _db()
        conn.execute(
            "INSERT INTO invite_tokens (token_hash, passphrase_hash, label, created_by, created_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (token_hash, phrase_hash, body.label, current_user["id"], now.isoformat(), expires_at)
        )
        conn.commit()
        row = conn.execute("SELECT last_insert_rowid() as id").fetchone()
        conn.close()

        invite_url = f"/invite/{token}"
        logger.info(f"[invite] created token id={row['id']} by user {current_user['id']}")

        return {
            "id":         row["id"],
            "url":        invite_url,
            "passphrase": passphrase,
            "expires_at": expires_at,
            "label":      body.label,
        }

    # ── Admin: list all invites ──────────────────────────────────────────────

    @app.get("/api/admin/invites")
    def list_invites(current_user: dict = Depends(require_owner)):
        conn = _db()
        rows = conn.execute(
            "SELECT id, label, created_at, expires_at, claimed_at, claimed_ip, "
            "revoked, revoked_at, invalidated, invalidated_at, invalidated_reason "
            "FROM invite_tokens WHERE created_by = ? ORDER BY created_at DESC",
            (current_user["id"],)
        ).fetchall()
        conn.close()

        now = datetime.now(timezone.utc).isoformat()
        return {
            "invites": [
                {
                    **dict(r),
                    "expired": r["expires_at"] < now,
                    "status":  (
                        "revoked"      if r["revoked"] else
                        "invalidated"  if r["invalidated"] else
                        "expired"      if r["expires_at"] < now else
                        "claimed"      if r["claimed_ip"] else
                        "active"
                    ),
                }
                for r in rows
            ]
        }

    # ── Admin: revoke invite (also kills their site access) ─────────────────

    @app.delete("/api/admin/invites/{invite_id}")
    def revoke_invite(invite_id: int, current_user: dict = Depends(require_owner)):
        conn = _db()
        row  = conn.execute(
            "SELECT id FROM invite_tokens WHERE id = ? AND created_by = ?",
            (invite_id, current_user["id"])
        ).fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Invite not found.")

        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE invite_tokens SET revoked = 1, revoked_at = ? WHERE id = ?",
            (now, invite_id)
        )
        # Remove site access for their IP (CASCADE on invite_temp_access via DELETE)
        conn.execute("DELETE FROM invite_temp_access WHERE invite_token_id = ?", (invite_id,))
        conn.commit()
        conn.close()

        logger.info(f"[invite] token {invite_id} revoked by {current_user['id']}")
        return {"revoked": True}
