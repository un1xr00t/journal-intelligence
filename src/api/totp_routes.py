"""
src/api/totp_routes.py
TOTP 2FA authentication.

Routes:
  GET   /auth/2fa/status           (auth)   — is 2FA enabled + backup codes remaining
  POST  /auth/2fa/setup            (auth)   — generate secret + QR + backup codes (pending)
  POST  /auth/2fa/enable           (auth)   — verify TOTP code -> activate
  POST  /auth/2fa/disable          (auth)   — verify TOTP code -> deactivate
  POST  /auth/2fa/verify-login     (public) — partial_token + totp_code -> full token pair
  POST  /auth/2fa/use-backup       (public) — partial_token + backup_code -> full token pair

Wire up in main.py:
  from src.api.totp_routes import register_totp_routes
  register_totp_routes(app, require_any_user)
"""
from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Optional

import jwt
import pyotp
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger("journal")


# ── Partial token (type=2fa_pending, 5-minute TTL) ────────────────────────────

def _jwt_config():
    from src.auth.auth_service import JWT_SECRET, JWT_ALGORITHM
    return JWT_SECRET, JWT_ALGORITHM


def create_partial_token(user_id: int) -> str:
    """Create a short-lived JWT meaning 'password verified, awaiting TOTP'."""
    s, alg = _jwt_config()
    payload = {
        "sub": str(user_id),
        "type": "2fa_pending",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, s, algorithm=alg)


def _decode_partial_token(token: str) -> Optional[dict]:
    s, alg = _jwt_config()
    try:
        p = jwt.decode(token, s, algorithms=[alg])
        return p if p.get("type") == "2fa_pending" else None
    except Exception:
        return None


# ── TOTP helpers ───────────────────────────────────────────────────────────────

def _qr_base64(username: str, secret: str) -> str:
    """Return base64-encoded PNG of the TOTP provisioning QR code."""
    import qrcode
    uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=username,
        issuer_name="Journal Intelligence",
    )
    img = qrcode.make(uri)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _verify_totp(secret: str, code: str) -> bool:
    """Verify 6-digit TOTP code with +/-1 window for clock drift."""
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)


def _gen_backup_codes() -> tuple[list[str], list[str]]:
    """
    Generate 8 single-use backup codes.
    Returns (raw_list, hash_list).  Raw shown once, hashes stored in DB.
    Format: XXXXXXXX-XXXXXXXX  (16 hex chars, upper)
    """
    raw = [
        secrets.token_hex(4).upper() + "-" + secrets.token_hex(4).upper()
        for _ in range(8)
    ]
    hashed = [hashlib.sha256(c.encode()).hexdigest() for c in raw]
    return raw, hashed


def _hash_backup_code(code: str) -> str:
    """Normalise (strip, upper) and SHA-256 hash a backup code."""
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()


# ── Request models ─────────────────────────────────────────────────────────────

class EnableRequest(BaseModel):
    totp_code: str


class DisableRequest(BaseModel):
    totp_code: str


class VerifyLoginRequest(BaseModel):
    partial_token: str
    totp_code: str


class UseBackupRequest(BaseModel):
    partial_token: str
    backup_code: str


# ── Route registration ─────────────────────────────────────────────────────────

def register_totp_routes(app, require_any_user):

    @app.get("/auth/2fa/status")
    async def totp_status(current_user: dict = Depends(require_any_user)):
        from src.auth.auth_db import get_db
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT enabled FROM totp_secrets WHERE user_id = ?",
                (current_user["id"],),
            ).fetchone()
            remaining = 0
            if row and row["enabled"]:
                remaining = conn.execute(
                    "SELECT COUNT(*) FROM totp_backup_codes WHERE user_id = ? AND used = 0",
                    (current_user["id"],),
                ).fetchone()[0]
            return {
                "enabled": bool(row and row["enabled"]),
                "backup_codes_remaining": remaining,
            }
        finally:
            conn.close()

    @app.post("/auth/2fa/setup")
    async def totp_setup(
        request: Request,
        current_user: dict = Depends(require_any_user),
    ):
        """
        Generate a new TOTP secret + QR code + backup codes.
        Stored as pending (enabled=0) until /auth/2fa/enable confirms a valid code.
        Calling setup again regenerates everything — any in-progress setup is discarded.
        """
        from src.auth.auth_db import get_db
        conn = get_db()
        try:
            new_secret = pyotp.random_base32()
            qr = _qr_base64(current_user["username"], new_secret)
            raw_codes, hashed_codes = _gen_backup_codes()

            existing = conn.execute(
                "SELECT id FROM totp_secrets WHERE user_id = ?",
                (current_user["id"],),
            ).fetchone()

            if existing:
                conn.execute(
                    "UPDATE totp_secrets SET secret = ?, enabled = 0, enabled_at = NULL WHERE user_id = ?",
                    (new_secret, current_user["id"]),
                )
            else:
                conn.execute(
                    "INSERT INTO totp_secrets (user_id, secret, enabled) VALUES (?, ?, 0)",
                    (current_user["id"], new_secret),
                )

            # Replace any existing backup codes with fresh pending set
            conn.execute(
                "DELETE FROM totp_backup_codes WHERE user_id = ?",
                (current_user["id"],),
            )
            for h in hashed_codes:
                conn.execute(
                    "INSERT INTO totp_backup_codes (user_id, code_hash) VALUES (?, ?)",
                    (current_user["id"], h),
                )
            conn.commit()

            logger.info(f"TOTP setup initiated for user_id={current_user['id']}")
            return {
                "qr_base64": qr,
                "secret": new_secret,
                "backup_codes": raw_codes,
            }
        finally:
            conn.close()

    @app.post("/auth/2fa/enable")
    async def totp_enable(
        body: EnableRequest,
        current_user: dict = Depends(require_any_user),
    ):
        """
        Verify TOTP code against the pending secret, then activate 2FA.
        Must call /auth/2fa/setup first.
        """
        from src.auth.auth_db import get_db
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT secret FROM totp_secrets WHERE user_id = ? AND enabled = 0",
                (current_user["id"],),
            ).fetchone()
            if not row:
                raise HTTPException(
                    status_code=400,
                    detail="No pending 2FA setup found. Call /auth/2fa/setup first.",
                )
            if not _verify_totp(row["secret"], body.totp_code):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid code. Check your authenticator app and try again.",
                )
            conn.execute(
                "UPDATE totp_secrets SET enabled = 1, enabled_at = datetime('now') WHERE user_id = ?",
                (current_user["id"],),
            )
            conn.commit()
            logger.info(f"TOTP enabled for user_id={current_user['id']}")
            return {"message": "Two-factor authentication enabled."}
        finally:
            conn.close()

    @app.post("/auth/2fa/disable")
    async def totp_disable(
        body: DisableRequest,
        current_user: dict = Depends(require_any_user),
    ):
        """
        Verify current TOTP code then disable 2FA.
        Deletes all backup codes.
        """
        from src.auth.auth_db import get_db
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT secret FROM totp_secrets WHERE user_id = ? AND enabled = 1",
                (current_user["id"],),
            ).fetchone()
            if not row:
                raise HTTPException(status_code=400, detail="2FA is not enabled on this account.")
            if not _verify_totp(row["secret"], body.totp_code):
                raise HTTPException(status_code=400, detail="Invalid code.")
            conn.execute(
                "UPDATE totp_secrets SET enabled = 0 WHERE user_id = ?",
                (current_user["id"],),
            )
            conn.execute(
                "DELETE FROM totp_backup_codes WHERE user_id = ?",
                (current_user["id"],),
            )
            conn.commit()
            logger.info(f"TOTP disabled for user_id={current_user['id']}")
            return {"message": "Two-factor authentication disabled."}
        finally:
            conn.close()

    @app.post("/auth/2fa/verify-login")
    async def totp_verify_login(
        request: Request,
        body: VerifyLoginRequest,
    ):
        """
        Complete 2FA login step.
        Accepts: partial_token (from /auth/login) + 6-digit TOTP code.
        Returns: full token pair (same shape as /auth/login).
        """
        from src.auth.auth_db import get_db
        from src.auth.auth_db import (
            get_user_by_id,
            store_refresh_token,
            update_last_login,
            log_auth_event,
            reset_rate_limit,
        )
        from src.auth.auth_service import create_token_pair
        from src.auth.middleware import get_client_ip, get_user_agent, get_device_hint

        ip = get_client_ip(request)

        payload = _decode_partial_token(body.partial_token)
        if not payload:
            raise HTTPException(
                status_code=401,
                detail="Session expired or invalid. Please log in again.",
            )

        user_id = int(payload["sub"])
        conn = get_db()
        try:
            totp_row = conn.execute(
                "SELECT secret FROM totp_secrets WHERE user_id = ? AND enabled = 1",
                (user_id,),
            ).fetchone()
            if not totp_row:
                raise HTTPException(status_code=400, detail="2FA not configured.")

            if not _verify_totp(totp_row["secret"], body.totp_code):
                log_auth_event(
                    "failed", user_id=user_id, ip_address=ip,
                    details={"reason": "invalid_totp"},
                )
                raise HTTPException(status_code=401, detail="Invalid code.")

            user = get_user_by_id(user_id)
            if not user:
                raise HTTPException(status_code=401, detail="User not found.")

            tokens = create_token_pair(user["id"], user["username"], user["role"])
            store_refresh_token(
                user_id=user["id"],
                token_hash=tokens["refresh_token_hash"],
                expires_at=tokens["refresh_expires_at"],
                device_hint=get_device_hint(request),
                ip_address=ip,
            )
            update_last_login(user["id"])
            reset_rate_limit(ip, "login")
            log_auth_event(
                "login", user_id=user["id"], ip_address=ip,
                user_agent=get_user_agent(request),
                details={"method": "totp"},
            )

            from fastapi.responses import JSONResponse
            _resp = JSONResponse(content={
                "access_token": tokens["access_token"],
                "token_type": "bearer",
                "expires_in": tokens["expires_in"],
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "role": user["role"],
                },
            })
            _resp.set_cookie(key="refresh_token", value=tokens["refresh_token"],
                httponly=True, secure=True, samesite="strict",
                max_age=30*24*3600, path="/")
            return _resp
        finally:
            conn.close()

    @app.post("/auth/2fa/use-backup")
    async def totp_use_backup(
        request: Request,
        body: UseBackupRequest,
    ):
        """
        Complete 2FA login using a single-use backup code.
        Marks the code used on success.  Alerts user how many remain.
        """
        from src.auth.auth_db import get_db
        from src.auth.auth_db import (
            get_user_by_id,
            store_refresh_token,
            update_last_login,
            log_auth_event,
            reset_rate_limit,
        )
        from src.auth.auth_service import create_token_pair
        from src.auth.middleware import get_client_ip, get_user_agent, get_device_hint

        ip = get_client_ip(request)

        payload = _decode_partial_token(body.partial_token)
        if not payload:
            raise HTTPException(
                status_code=401,
                detail="Session expired. Please log in again.",
            )

        user_id = int(payload["sub"])
        code_hash = _hash_backup_code(body.backup_code)

        conn = get_db()
        try:
            code_row = conn.execute(
                """SELECT id FROM totp_backup_codes
                   WHERE user_id = ? AND code_hash = ? AND used = 0""",
                (user_id, code_hash),
            ).fetchone()

            if not code_row:
                log_auth_event(
                    "failed", user_id=user_id, ip_address=ip,
                    details={"reason": "invalid_backup_code"},
                )
                raise HTTPException(
                    status_code=401,
                    detail="Invalid or already-used backup code.",
                )

            conn.execute(
                "UPDATE totp_backup_codes SET used = 1, used_at = datetime('now') WHERE id = ?",
                (code_row["id"],),
            )
            conn.commit()

            user = get_user_by_id(user_id)
            if not user:
                raise HTTPException(status_code=401, detail="User not found.")

            tokens = create_token_pair(user["id"], user["username"], user["role"])
            store_refresh_token(
                user_id=user["id"],
                token_hash=tokens["refresh_token_hash"],
                expires_at=tokens["refresh_expires_at"],
                device_hint=get_device_hint(request),
                ip_address=ip,
            )
            update_last_login(user["id"])
            log_auth_event(
                "login", user_id=user["id"], ip_address=ip,
                user_agent=get_user_agent(request),
                details={"method": "backup_code"},
            )

            remaining = conn.execute(
                "SELECT COUNT(*) FROM totp_backup_codes WHERE user_id = ? AND used = 0",
                (user_id,),
            ).fetchone()[0]

            from fastapi.responses import JSONResponse
            _resp2 = JSONResponse(content={
                "access_token": tokens["access_token"],
                "token_type": "bearer",
                "expires_in": tokens["expires_in"],
                "backup_codes_remaining": remaining,
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "role": user["role"],
                },
            })
            _resp2.set_cookie(key="refresh_token", value=tokens["refresh_token"],
                httponly=True, secure=True, samesite="strict",
                max_age=30*24*3600, path="/")
            return _resp2
        finally:
            conn.close()
