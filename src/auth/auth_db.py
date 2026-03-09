"""
src/auth/auth_db.py
Database operations for authentication.
"""

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
import json

import yaml

# ── Load Config ───────────────────────────────────────────────

from src.config import CONFIG_PATH, DB_PATH, load_config

def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)

config = load_config()
DB_PATH = Path(config["database"]["path"])


# ── Database Connection ───────────────────────────────────────

def get_db() -> sqlite3.Connection:
    """Get database connection with row factory."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


# ── User Operations ───────────────────────────────────────────

def get_user_by_username(username: str) -> Optional[dict]:
    """Fetch user by username."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, email, username, password_hash, role, is_active, created_at, last_login
        FROM users
        WHERE username = ?
    """, (username,))

    row = cursor.fetchone()
    conn.close()

    if row:
        return dict(row)
    return None


def get_user_by_email(email: str) -> Optional[dict]:
    """Fetch user by email."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, email, username, password_hash, role, is_active, created_at, last_login
        FROM users
        WHERE email = ?
    """, (email,))

    row = cursor.fetchone()
    conn.close()

    if row:
        return dict(row)
    return None


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Fetch user by ID."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, email, username, password_hash, role, is_active, created_at, last_login
        FROM users
        WHERE id = ?
    """, (user_id,))

    row = cursor.fetchone()
    conn.close()

    if row:
        return dict(row)
    return None


def update_last_login(user_id: int) -> None:
    """Update user's last_login timestamp."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE users SET last_login = ? WHERE id = ?
    """, (datetime.now(timezone.utc).isoformat(), user_id))

    conn.commit()
    conn.close()


# ── Per-User API Key Operations ───────────────────────────────

def store_user_api_key(user_id: int, key_hash: str, key_prefix: str) -> None:
    """
    Store a user's API key hash and display prefix.
    The raw key is never stored — only shown once at generation.
    """
    conn = get_db()
    conn.execute(
        "UPDATE users SET api_key_hash = ?, api_key_prefix = ? WHERE id = ?",
        (key_hash, key_prefix, user_id)
    )
    conn.commit()
    conn.close()


def get_user_by_api_key_hash(key_hash: str) -> Optional[dict]:
    """
    Look up a user by their API key hash.
    Returns user dict or None.
    """
    conn = get_db()
    row = conn.execute(
        """SELECT id, email, username, role, is_active
           FROM users
           WHERE api_key_hash = ?""",
        (key_hash,)
    ).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def get_api_key_info(user_id: int) -> Optional[dict]:
    """
    Return the display info (prefix only) for a user's API key.
    Returns {"prefix": "jd_a1b2c3", "has_key": True} or {"has_key": False}.
    """
    conn = get_db()
    row = conn.execute(
        "SELECT api_key_prefix FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    conn.close()
    if row and row["api_key_prefix"]:
        return {"has_key": True, "prefix": row["api_key_prefix"]}
    return {"has_key": False, "prefix": None}


# ── Refresh Token Operations ──────────────────────────────────

def store_refresh_token(
    user_id: int,
    token_hash: str,
    expires_at: datetime,
    device_hint: Optional[str] = None,
    ip_address: Optional[str] = None
) -> int:
    """Store a refresh token hash in the database."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO refresh_tokens (user_id, token_hash, device_hint, ip_address, expires_at)
        VALUES (?, ?, ?, ?, ?)
    """, (
        user_id,
        token_hash,
        device_hint,
        ip_address,
        expires_at.isoformat()
    ))

    conn.commit()
    token_id = cursor.lastrowid
    conn.close()

    return token_id


def get_refresh_token(token_hash: str) -> Optional[dict]:
    """Fetch refresh token record by hash."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT rt.id, rt.user_id, rt.token_hash, rt.device_hint, rt.ip_address,
               rt.issued_at, rt.expires_at, rt.last_used_at, rt.revoked,
               u.username, u.role, u.is_active
        FROM refresh_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token_hash = ?
    """, (token_hash,))

    row = cursor.fetchone()
    conn.close()

    if row:
        return dict(row)
    return None


def update_refresh_token_used(token_hash: str) -> None:
    """Update last_used_at timestamp for a refresh token."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE refresh_tokens SET last_used_at = ? WHERE token_hash = ?
    """, (datetime.now(timezone.utc).isoformat(), token_hash))

    conn.commit()
    conn.close()


def revoke_refresh_token(token_hash: str) -> bool:
    """Revoke a single refresh token."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE refresh_tokens
        SET revoked = 1, revoked_at = ?
        WHERE token_hash = ? AND revoked = 0
    """, (datetime.now(timezone.utc).isoformat(), token_hash))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def revoke_all_user_tokens(user_id: int) -> int:
    """Revoke all refresh tokens for a user."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE refresh_tokens
        SET revoked = 1, revoked_at = ?
        WHERE user_id = ? AND revoked = 0
    """, (datetime.now(timezone.utc).isoformat(), user_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected


# ── Auth Audit Logging ────────────────────────────────────────

def log_auth_event(
    event: str,
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[dict] = None
) -> None:
    """
    Log an authentication event.

    Events: login, logout, refresh, failed, revoke, password_change, api_key_generated
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO auth_audit (user_id, event, ip_address, user_agent, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        event,
        ip_address,
        user_agent,
        json.dumps(details) if details else None,
        datetime.now(timezone.utc).isoformat()
    ))

    conn.commit()
    conn.close()


# ── Rate Limiting ─────────────────────────────────────────────

def check_rate_limit(ip_address: str, endpoint: str, max_attempts: int = 10, window_minutes: int = 1) -> bool:
    """
    Check if IP is rate limited.
    Returns True if allowed, False if blocked.
    """
    conn = get_db()
    cursor = conn.cursor()

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=window_minutes)

    cursor.execute("""
        SELECT blocked_until FROM rate_limits
        WHERE ip_address = ? AND endpoint = ?
    """, (ip_address, endpoint))

    row = cursor.fetchone()
    if row and row['blocked_until']:
        blocked_until = datetime.fromisoformat(row['blocked_until'])
        if blocked_until > now:
            conn.close()
            return False

    cursor.execute("""
        SELECT attempt_count, window_start FROM rate_limits
        WHERE ip_address = ? AND endpoint = ?
    """, (ip_address, endpoint))

    row = cursor.fetchone()

    if row:
        row_window_start = datetime.fromisoformat(row['window_start'])
        if row_window_start < window_start:
            cursor.execute("""
                UPDATE rate_limits
                SET attempt_count = 1, window_start = ?, blocked_until = NULL
                WHERE ip_address = ? AND endpoint = ?
            """, (now.isoformat(), ip_address, endpoint))
        else:
            new_count = row['attempt_count'] + 1
            if new_count > max_attempts:
                blocked_until = now + timedelta(minutes=15)
                cursor.execute("""
                    UPDATE rate_limits
                    SET attempt_count = ?, blocked_until = ?
                    WHERE ip_address = ? AND endpoint = ?
                """, (new_count, blocked_until.isoformat(), ip_address, endpoint))
                conn.commit()
                conn.close()
                return False
            else:
                cursor.execute("""
                    UPDATE rate_limits SET attempt_count = ?
                    WHERE ip_address = ? AND endpoint = ?
                """, (new_count, ip_address, endpoint))
    else:
        cursor.execute("""
            INSERT INTO rate_limits (ip_address, endpoint, attempt_count, window_start)
            VALUES (?, ?, 1, ?)
        """, (ip_address, endpoint, now.isoformat()))

    conn.commit()
    conn.close()
    return True


def reset_rate_limit(ip_address: str, endpoint: str) -> None:
    """Reset rate limit counter after successful login."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        DELETE FROM rate_limits WHERE ip_address = ? AND endpoint = ?
    """, (ip_address, endpoint))

    conn.commit()
    conn.close()
