"""
src/api/security_questions_routes.py
Offline password recovery via security questions.

Routes:
  POST  /auth/security-questions/setup    (auth required) — save / update questions + answers
  GET   /auth/security-questions/fetch    (public)        — return question text only for a username
  POST  /auth/security-questions/verify   (public)        — verify answers, mint a password reset token
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger("journal")

# ---------------------------------------------------------------------------
# Preset question bank — displayed in the frontend dropdowns
# ---------------------------------------------------------------------------
QUESTION_BANK = [
    "What was the name of your first pet?",
    "What city were you born in?",
    "What is your mother's maiden name?",
    "What was the name of your first school?",
    "What was the make and model of your first car?",
    "What is the middle name of your oldest sibling?",
    "What street did you grow up on?",
    "What was the name of your childhood best friend?",
    "What is the name of the town where your nearest relative lives?",
    "What was your childhood nickname?",
    "What is the name of the hospital where you were born?",
    "What was the first concert you attended?",
]


def _hash_answer(answer: str) -> str:
    """Normalise and SHA-256 hash a security question answer."""
    normalised = answer.strip().lower()
    return hashlib.sha256(normalised.encode()).hexdigest()


def _mint_reset_token(user_id: int) -> str:
    """
    Generate a single-use password reset token, store its hash, return the raw token.
    Mirrors exactly what password_reset_routes.py does so /auth/reset-password
    can consume the token without any changes.
    """
    from src.auth.auth_db import get_db

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    conn = get_db()
    try:
        # Invalidate any existing unused reset tokens for this user first
        conn.execute(
            "UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0",
            (user_id,),
        )
        conn.execute(
            """
            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used)
            VALUES (?, ?, ?, 0)
            """,
            (user_id, token_hash, expires_at),
        )
        conn.commit()
    finally:
        conn.close()

    return raw_token


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class SetupRequest(BaseModel):
    question_1: str
    answer_1:   str
    question_2: str
    answer_2:   str
    question_3: str
    answer_3:   str


class VerifyRequest(BaseModel):
    username: str
    answer_1: str
    answer_2: str
    answer_3: str


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------

def register_security_questions_routes(app, require_any_user):

    @app.post("/auth/verify-password")
    async def verify_password_check(
        body: dict,
        current_user: dict = Depends(require_any_user),
    ):
        """
        Read-only password verification for sensitive settings gates.
        Returns 200 if correct, 401 if wrong. No state changes.
        """
        from src.auth.auth_db import get_db
        from src.auth.auth_service import verify_password

        password = (body.get("password") or "").strip()
        if not password:
            raise HTTPException(status_code=400, detail="Password required.")

        conn = get_db()
        try:
            row = conn.execute(
                "SELECT password_hash FROM users WHERE id = ?",
                (current_user["id"],),
            ).fetchone()
        finally:
            conn.close()

        if not row or not verify_password(password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect password.")

        return {"verified": True}



    @app.post("/auth/verify-password")
    async def verify_password_check(body: dict, current_user: dict = Depends(require_any_user)):
        from src.auth.auth_db import get_db
        from src.auth.auth_service import verify_password
        password = (body.get("password") or "").strip()
        if not password:
            raise HTTPException(status_code=400, detail="Password required.")
        conn = get_db()
        try:
            row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (current_user["id"],)).fetchone()
        finally:
            conn.close()
        if not row or not verify_password(password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect password.")
        return {"verified": True}
    @app.get("/auth/security-questions/bank")
    async def get_question_bank():
        """Return the full list of available questions for the frontend dropdowns."""
        return {"questions": QUESTION_BANK}

    @app.post("/auth/security-questions/setup")
    async def setup_security_questions(
        body: SetupRequest,
        current_user: dict = Depends(require_any_user),
    ):
        """Save or replace security questions and hashed answers for the current user."""
        from src.auth.auth_db import get_db

        # Validate all three questions are distinct
        qs = [body.question_1, body.question_2, body.question_3]
        if len(set(qs)) < 3:
            raise HTTPException(status_code=400, detail="All three questions must be different.")

        # Validate answers are non-empty
        for i, a in enumerate([body.answer_1, body.answer_2, body.answer_3], 1):
            if not a.strip():
                raise HTTPException(status_code=400, detail=f"Answer {i} cannot be blank.")

        conn = get_db()
        try:
            conn.execute(
                """
                INSERT INTO security_questions
                    (user_id, question_1, answer_1_hash, question_2, answer_2_hash,
                     question_3, answer_3_hash, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(user_id) DO UPDATE SET
                    question_1    = excluded.question_1,
                    answer_1_hash = excluded.answer_1_hash,
                    question_2    = excluded.question_2,
                    answer_2_hash = excluded.answer_2_hash,
                    question_3    = excluded.question_3,
                    answer_3_hash = excluded.answer_3_hash,
                    updated_at    = excluded.updated_at
                """,
                (
                    current_user["id"],
                    body.question_1, _hash_answer(body.answer_1),
                    body.question_2, _hash_answer(body.answer_2),
                    body.question_3, _hash_answer(body.answer_3),
                ),
            )
            conn.commit()
        finally:
            conn.close()

        logger.info(f"Security questions saved for user_id={current_user['id']}")
        return {"message": "Security questions saved."}

    @app.get("/auth/security-questions/has-questions")
    async def has_security_questions(
        current_user: dict = Depends(require_any_user),
    ):
        """Return whether the current user has security questions set up."""
        from src.auth.auth_db import get_db

        conn = get_db()
        try:
            row = conn.execute(
                "SELECT id FROM security_questions WHERE user_id = ?",
                (current_user["id"],),
            ).fetchone()
        finally:
            conn.close()

        return {"has_questions": row is not None}

    @app.get("/auth/security-questions/fetch")
    async def fetch_questions(username: str):
        """
        Public endpoint — return the question text (not answers) for a username.
        Returns 404 with a generic message to avoid username enumeration.
        """
        from src.auth.auth_db import get_db, get_user_by_username

        user = get_user_by_username(username)
        if not user:
            # Don't reveal whether username exists
            raise HTTPException(
                status_code=404,
                detail="No security questions found for this account.",
            )

        conn = get_db()
        try:
            row = conn.execute(
                "SELECT question_1, question_2, question_3 FROM security_questions WHERE user_id = ?",
                (user["id"],),
            ).fetchone()
        finally:
            conn.close()

        if not row:
            raise HTTPException(
                status_code=404,
                detail="No security questions found for this account.",
            )

        return {
            "question_1": row["question_1"],
            "question_2": row["question_2"],
            "question_3": row["question_3"],
        }

    @app.post("/auth/security-questions/verify")
    async def verify_security_questions(
        body: VerifyRequest,
        request: Request,
    ):
        """
        Public endpoint — verify answers for a username.
        Rate-limited: 5 attempts per 15 minutes per IP.
        On success returns a one-time reset token (valid 1 hour).
        Frontend should redirect to /reset-password?token=<token>.
        """
        from src.auth.auth_db import get_db, get_user_by_username, check_rate_limit

        ip = request.client.host if request.client else "unknown"

        if not check_rate_limit(ip, "security_questions_verify", max_attempts=5, window_minutes=15):
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please wait 15 minutes before trying again.",
            )

        # Generic error for all failures — avoids leaking which field was wrong
        GENERIC_ERR = HTTPException(
            status_code=400,
            detail="One or more answers are incorrect. Please try again.",
        )

        user = get_user_by_username(body.username)
        if not user:
            raise GENERIC_ERR

        conn = get_db()
        try:
            row = conn.execute(
                """
                SELECT answer_1_hash, answer_2_hash, answer_3_hash
                FROM security_questions
                WHERE user_id = ?
                """,
                (user["id"],),
            ).fetchone()
        finally:
            conn.close()

        if not row:
            raise GENERIC_ERR

        h1 = _hash_answer(body.answer_1)
        h2 = _hash_answer(body.answer_2)
        h3 = _hash_answer(body.answer_3)

        # Use constant-time comparison to prevent timing attacks
        ok1 = secrets.compare_digest(h1, row["answer_1_hash"])
        ok2 = secrets.compare_digest(h2, row["answer_2_hash"])
        ok3 = secrets.compare_digest(h3, row["answer_3_hash"])

        if not (ok1 and ok2 and ok3):
            raise GENERIC_ERR

        raw_token = _mint_reset_token(user["id"])
        logger.info(f"Security question recovery used for user_id={user['id']} from IP {ip}")

        return {"reset_token": raw_token}
