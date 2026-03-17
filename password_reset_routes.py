"""
src/api/password_reset_routes.py
Forgot password flow via Resend email.

Routes:
  POST /auth/forgot-password  → send reset email
  POST /auth/reset-password   → verify token + set new password
"""

from __future__ import annotations
import hashlib
import logging
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger("journal")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _load_email_config() -> dict:
    from pathlib import Path
    import yaml
    with open(Path("/opt/journal-dashboard/config/config.yaml")) as f:
        return yaml.safe_load(f).get("email", {})


def _load_base_url() -> str:
    from pathlib import Path
    import yaml
    with open(Path("/opt/journal-dashboard/config/config.yaml")) as f:
        return yaml.safe_load(f).get("server", {}).get("base_url", "https://journal.williamthomas.name")


def _send_reset_email(to_email: str, reset_link: str, from_address: str, from_name: str, api_key: str):
    import resend
    resend.api_key = api_key
    resend.Emails.send({
        "from": f"{from_name} <{from_address}>",
        "to": to_email,
        "subject": "Reset your Journal Intelligence password",
        "html": f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0d0d1a; color: #e2e8f0; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 28px;">
                <span style="font-size: 28px;">✦</span>
                <h2 style="font-family: sans-serif; font-size: 18px; letter-spacing: 0.1em; text-transform: uppercase; margin: 8px 0 0; color: #6366f1;">Journal Intelligence</h2>
            </div>
            <h3 style="font-size: 16px; margin-bottom: 12px; color: #f1f5f9;">Password Reset Request</h3>
            <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                Someone requested a password reset for your account. Click below to set a new password.
                This link expires in <strong style="color: #e2e8f0;">1 hour</strong> and can only be used once.
            </p>
            <a href="{reset_link}" style="display: inline-block; padding: 12px 28px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Reset Password →
            </a>
            <p style="margin-top: 28px; font-size: 12px; color: #475569; border-top: 1px solid #1e293b; padding-top: 16px;">
                If you didn't request this, you can safely ignore this email. Your password won't change.
            </p>
            <p style="font-size: 11px; color: #334155; margin-top: 8px; word-break: break-all;">
                {reset_link}
            </p>
        </div>
        """,
    })


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


def register_password_reset_routes(app):

    @app.post("/auth/forgot-password")
    async def forgot_password(body: ForgotPasswordRequest, request: Request):
        """Send a password reset email. Always returns 200 to prevent email enumeration."""
        from src.auth.auth_db import get_db

        email_cfg = _load_email_config()
        if not email_cfg.get("api_key"):
            raise HTTPException(status_code=503, detail="Email service not configured.")

        conn = get_db()
        try:
            row = conn.execute(
                "SELECT id FROM users WHERE LOWER(email) = ? AND is_active = 1",
                (body.email.strip().lower(),)
            ).fetchone()

            if row:
                user_id = row["id"]

                # Invalidate any existing unused tokens for this user
                conn.execute(
                    "UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0",
                    (user_id,)
                )

                # Generate new token
                raw_token = secrets.token_hex(32)
                token_hash = _hash_token(raw_token)
                expires_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

                conn.execute(
                    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
                    (user_id, token_hash, expires_at)
                )
                conn.commit()

                base_url = _load_base_url()
                reset_link = f"{base_url}/reset-password?token={raw_token}"

                try:
                    _send_reset_email(
                        to_email=body.email.strip(),
                        reset_link=reset_link,
                        from_address=email_cfg.get("from_address", "noreply@williamthomas.name"),
                        from_name=email_cfg.get("from_name", "Journal Intelligence"),
                        api_key=email_cfg["api_key"],
                    )
                    logger.info(f"Password reset email sent for user_id={user_id}")
                except Exception as e:
                    logger.error(f"Failed to send reset email for user_id={user_id}: {e}")
        finally:
            conn.close()

        # Always same response — don't reveal if email exists
        return {"message": "If that email is registered, a reset link has been sent."}

    @app.post("/auth/reset-password")
    async def reset_password(body: ResetPasswordRequest):
        """Verify reset token and set a new password."""
        from src.auth.auth_db import get_db
        from src.auth.auth_service import hash_password

        if len(body.new_password) < 12:
            raise HTTPException(status_code=400, detail="Password must be at least 12 characters.")

        token_hash = _hash_token(body.token)

        conn = get_db()
        try:
            row = conn.execute(
                "SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token_hash = ?",
                (token_hash,)
            ).fetchone()

            if not row:
                raise HTTPException(status_code=400, detail="Invalid or expired reset link.")
            if row["used"]:
                raise HTTPException(status_code=400, detail="This reset link has already been used.")

            expires_at = datetime.fromisoformat(row["expires_at"])
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expires_at:
                raise HTTPException(status_code=400, detail="This reset link has expired. Please request a new one.")

            new_hash = hash_password(body.new_password)

            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, row["user_id"]))
            conn.execute("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", (row["id"],))
            # Revoke all sessions for security after password reset
            conn.execute(
                "UPDATE refresh_tokens SET revoked = 1, revoked_at = datetime('now') WHERE user_id = ? AND revoked = 0",
                (row["user_id"],)
            )
            conn.commit()

            logger.info(f"Password reset completed for user_id={row['user_id']}")
            return {"message": "Password reset successfully. You can now log in."}
        finally:
            conn.close()
