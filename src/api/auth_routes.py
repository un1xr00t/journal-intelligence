"""
src/api/auth_routes.py
User-facing auth management routes.

Routes:
  POST   /auth/change-password          → verify current pw, set new pw
  GET    /auth/sessions                 → list user's active sessions
  DELETE /auth/sessions/{session_id}    → revoke a specific session
  DELETE /auth/sessions                 → revoke all sessions (except current)

Wire up in main.py:
  from src.api.auth_routes import register_auth_routes
  register_auth_routes(app, require_any_user)
"""

from __future__ import annotations
import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger("journal")


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def register_auth_routes(app, require_any_user):

    @app.post("/auth/change-password")
    async def change_password(
        body: ChangePasswordRequest,
        current_user: dict = Depends(require_any_user),
    ):
        """Verify current password and update to new password."""
        from src.auth.auth_db import get_db
        from src.auth.auth_service import verify_password, hash_password

        if len(body.new_password) < 8:
            raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

        conn = get_db()
        try:
            row = conn.execute(
                "SELECT password_hash FROM users WHERE id = ?",
                (current_user["id"],)
            ).fetchone()

            if not row or not row["password_hash"]:
                raise HTTPException(status_code=400, detail="Password change not available for this account.")

            if not verify_password(body.current_password, row["password_hash"]):
                raise HTTPException(status_code=400, detail="Current password is incorrect.")

            new_hash = hash_password(body.new_password)
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (new_hash, current_user["id"])
            )
            conn.commit()

            logger.info(f"Password changed for user_id={current_user['id']}")
            return {"message": "Password updated successfully."}
        finally:
            conn.close()

    @app.get("/auth/sessions")
    async def list_sessions(
        request: Request,
        current_user: dict = Depends(require_any_user),
    ):
        """Return all active (non-revoked, non-expired) sessions for the current user."""
        from src.auth.auth_db import get_db

        conn = get_db()
        try:
            rows = conn.execute(
                """
                SELECT id, device_hint, ip_address, issued_at, last_used_at, expires_at
                FROM refresh_tokens
                WHERE user_id = ?
                  AND revoked = 0
                  AND expires_at > datetime('now')
                ORDER BY last_used_at DESC, issued_at DESC
                """,
                (current_user["id"],)
            ).fetchall()

            sessions = [
                {
                    "id": r["id"],
                    "device_hint": r["device_hint"] or "Unknown device",
                    "ip_address": r["ip_address"] or "Unknown",
                    "issued_at": r["issued_at"],
                    "last_used_at": r["last_used_at"],
                    "expires_at": r["expires_at"],
                }
                for r in rows
            ]

            return {"sessions": sessions}
        finally:
            conn.close()

    @app.delete("/auth/sessions/{session_id}")
    async def revoke_session(
        session_id: int,
        current_user: dict = Depends(require_any_user),
    ):
        """Revoke a specific session by ID (must belong to current user)."""
        from src.auth.auth_db import get_db

        conn = get_db()
        try:
            row = conn.execute(
                "SELECT id FROM refresh_tokens WHERE id = ? AND user_id = ?",
                (session_id, current_user["id"])
            ).fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Session not found.")

            conn.execute(
                "UPDATE refresh_tokens SET revoked = 1, revoked_at = datetime('now') WHERE id = ?",
                (session_id,)
            )
            conn.commit()

            logger.info(f"Session {session_id} revoked by user_id={current_user['id']}")
            return {"message": "Session revoked."}
        finally:
            conn.close()

    @app.delete("/auth/sessions")
    async def revoke_all_sessions(
        current_user: dict = Depends(require_any_user),
    ):
        """Revoke all active sessions for the current user."""
        from src.auth.auth_db import get_db

        conn = get_db()
        try:
            result = conn.execute(
                """
                UPDATE refresh_tokens
                SET revoked = 1, revoked_at = datetime('now')
                WHERE user_id = ? AND revoked = 0
                """,
                (current_user["id"],)
            )
            conn.commit()

            count = result.rowcount
            logger.info(f"Revoked {count} sessions for user_id={current_user['id']}")
            return {"message": f"Revoked {count} session(s)."}
        finally:
            conn.close()
