"""
sms_routes.py  —  src/api/sms_routes.py
SMS phone verification and inbound journal-via-text feature.

Requires config.yaml additions:
  sms:
    account_sid: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    auth_token:  your_auth_token_here
    from_number: +1XXXXXXXXXX

Install dep: pip install twilio --break-system-packages
"""

import logging
import os
import random
import string
import urllib.parse
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel

log = logging.getLogger("journal")
router = APIRouter()


# ── Config helpers ─────────────────────────────────────────────────────────────

def _sms_cfg():
    from src.shared import config
    cfg = config.get("sms", {})
    if not cfg.get("account_sid") or not cfg.get("auth_token") or not cfg.get("from_number"):
        raise HTTPException(
            status_code=503,
            detail="SMS not configured. Add sms: block to config.yaml and install twilio."
        )
    return cfg


def _twilio_client(cfg: dict):
    try:
        from twilio.rest import Client
        return Client(cfg["account_sid"], cfg["auth_token"])
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Twilio library not installed. Run: pip install twilio --break-system-packages"
        )


def _validate_twilio_signature(request: Request, raw_body: bytes, auth_token: str) -> bool:
    """Validate inbound Twilio webhook signature to reject spoofed requests."""
    signature = request.headers.get("X-Twilio-Signature", "")
    url = str(request.url)
    params = dict(urllib.parse.parse_qsl(raw_body.decode("utf-8")))
    try:
        from twilio.request_validator import RequestValidator
        return RequestValidator(auth_token).validate(url, params, signature)
    except Exception as e:
        log.warning(f"[sms] Signature validation error: {e}")
        return False


def _gen_code() -> str:
    return "".join(random.choices(string.digits, k=6))


def _normalize_phone(phone: str) -> str:
    """Normalize to E.164 format. Assumes US if no country code."""
    digits = "".join(c for c in phone if c.isdigit() or c == "+")
    if not digits.startswith("+"):
        if len(digits) == 10:
            digits = "+1" + digits
        elif len(digits) == 11 and digits.startswith("1"):
            digits = "+" + digits
    return digits


# ── Pydantic models ────────────────────────────────────────────────────────────

class PhoneRequest(BaseModel):
    phone_number: str

class VerifyRequest(BaseModel):
    phone_number: str
    code: str


# ── Route registration ─────────────────────────────────────────────────────────

def register_sms_routes(app, require_any_user):
    from src.auth.auth_db import get_db

    # ── Request a verification code ──────────────────────────────────────────

    @app.post("/api/sms/request-verification")
    async def request_verification(
        body: PhoneRequest,
        current_user: dict = Depends(require_any_user),
    ):
        phone = _normalize_phone(body.phone_number)
        if len(phone) < 10 or not phone.startswith("+"):
            raise HTTPException(status_code=400, detail="Invalid phone number format")

        conn = get_db()
        try:
            # Block if number is already verified on a DIFFERENT account
            row = conn.execute(
                "SELECT user_id, verified FROM user_phone_numbers WHERE phone_number = ?",
                (phone,)
            ).fetchone()
            if row and row["user_id"] != current_user["id"] and row["verified"] == 1:
                raise HTTPException(
                    status_code=409,
                    detail="This number is already registered to another account"
                )

            code = _gen_code()
            expires = (datetime.utcnow() + timedelta(minutes=10)).isoformat()

            conn.execute("""
                INSERT INTO user_phone_numbers
                    (user_id, phone_number, verified, verification_code, code_expires_at, verify_attempts)
                VALUES (?, ?, 0, ?, ?, 0)
                ON CONFLICT(phone_number) DO UPDATE SET
                    user_id            = excluded.user_id,
                    verified           = 0,
                    verification_code  = excluded.verification_code,
                    code_expires_at    = excluded.code_expires_at,
                    verify_attempts    = 0,
                    updated_at         = datetime('now')
            """, (current_user["id"], phone, code, expires))
            conn.commit()
        finally:
            conn.close()

        cfg = _sms_cfg()
        client = _twilio_client(cfg)
        try:
            client.messages.create(
                body=(
                    f"Journal Intelligence verification code: {code}\n\n"
                    "Valid for 10 minutes. Do not share this code."
                ),
                from_=cfg["from_number"],
                to=phone,
            )
        except Exception as e:
            log.error(f"[sms] Twilio send error: {e}")
            raise HTTPException(status_code=502, detail=f"Failed to send SMS: {e}")

        return {"status": "sent", "phone_number": phone}

    # ── Submit verification code ─────────────────────────────────────────────

    @app.post("/api/sms/verify")
    async def verify_code(
        body: VerifyRequest,
        current_user: dict = Depends(require_any_user),
    ):
        phone = _normalize_phone(body.phone_number)

        conn = get_db()
        try:
            row = conn.execute(
                "SELECT * FROM user_phone_numbers WHERE phone_number = ? AND user_id = ?",
                (phone, current_user["id"])
            ).fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="No verification pending for this number")
            if row["verify_attempts"] >= 3:
                raise HTTPException(status_code=429, detail="Too many attempts — request a new code")
            if datetime.utcnow().isoformat() > row["code_expires_at"]:
                raise HTTPException(status_code=410, detail="Code expired — request a new one")
            if row["verification_code"] != body.code.strip():
                conn.execute(
                    "UPDATE user_phone_numbers SET verify_attempts = verify_attempts + 1, updated_at = datetime('now') WHERE phone_number = ? AND user_id = ?",
                    (phone, current_user["id"])
                )
                conn.commit()
                attempts_left = max(0, 2 - row["verify_attempts"])
                raise HTTPException(
                    status_code=400,
                    detail=f"Incorrect code. {attempts_left} attempt(s) remaining."
                )

            conn.execute("""
                UPDATE user_phone_numbers
                SET verified = 1, verification_code = NULL, code_expires_at = NULL,
                    verify_attempts = 0, updated_at = datetime('now')
                WHERE phone_number = ? AND user_id = ?
            """, (phone, current_user["id"]))
            conn.commit()
        finally:
            conn.close()

        return {"status": "verified", "phone_number": phone}

    # ── Get current SMS status ───────────────────────────────────────────────

    @app.get("/api/sms/status")
    async def get_sms_status(current_user: dict = Depends(require_any_user)):
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT phone_number, verified, created_at FROM user_phone_numbers WHERE user_id = ? AND verified = 1",
                (current_user["id"],)
            ).fetchone()
        finally:
            conn.close()

        if row:
            return {
                "phone_number": row["phone_number"],
                "verified": True,
                "created_at": row["created_at"],
            }
        return {"phone_number": None, "verified": False}

    # ── Remove phone number ──────────────────────────────────────────────────

    @app.delete("/api/sms/phone")
    async def remove_phone(current_user: dict = Depends(require_any_user)):
        conn = get_db()
        try:
            conn.execute(
                "DELETE FROM user_phone_numbers WHERE user_id = ?",
                (current_user["id"],)
            )
            conn.commit()
        finally:
            conn.close()
        return {"status": "removed"}

    # ── Inbound Twilio webhook ───────────────────────────────────────────────

    @app.post("/api/sms/inbound")
    async def sms_inbound(request: Request, background_tasks: BackgroundTasks):
        """
        Twilio POSTs here when a text comes in.
        1. Validate Twilio signature.
        2. Look up user by From number (must be verified).
        3. Ingest the text as today's journal entry.
        4. Fire background task: AI extraction → summary → reply SMS.
        5. Respond with immediate TwiML acknowledgment.
        """
        raw_body = await request.body()

        # Signature validation — skip only when explicitly disabled (local dev)
        if os.environ.get("SKIP_TWILIO_VALIDATION") != "1":
            try:
                cfg_for_sig = _sms_cfg()
                if not _validate_twilio_signature(request, raw_body, cfg_for_sig["auth_token"]):
                    log.warning("[sms] Rejected inbound — invalid Twilio signature")
                    return Response(
                        content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
                        media_type="application/xml",
                    )
            except HTTPException:
                # SMS not configured — silently drop
                return Response(
                    content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
                    media_type="application/xml",
                )

        params = dict(urllib.parse.parse_qsl(raw_body.decode("utf-8")))
        from_number = params.get("From", "").strip()
        body_text   = params.get("Body", "").strip()

        if not from_number or not body_text:
            return Response(
                content='<?xml version="1.0" encoding="UTF-8"?><Response><Message>Empty message — nothing was saved.</Message></Response>',
                media_type="application/xml",
            )

        # Look up verified user
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT user_id FROM user_phone_numbers WHERE phone_number = ? AND verified = 1",
                (from_number,)
            ).fetchone()
        finally:
            conn.close()

        if not row:
            log.info(f"[sms] Unregistered number: {from_number}")
            return Response(
                content=(
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    '<Response><Message>This number is not linked to a Journal Intelligence account. '
                    'Visit the app to verify your number first.</Message></Response>'
                ),
                media_type="application/xml",
            )

        user_id = row["user_id"]

        # Ingest the entry immediately (synchronous — fast)
        import datetime as dt
        from src.ingest.service import ingest_file

        entry_date    = dt.date.today().isoformat()
        ingest_result = ingest_file(f"{entry_date}.txt", body_text.encode("utf-8"), user_id=user_id)

        if ingest_result["status"] == "error":
            log.error(f"[sms] Ingest error user {user_id}: {ingest_result['message']}")
            return Response(
                content='<?xml version="1.0" encoding="UTF-8"?><Response><Message>Could not save your entry. Please try again.</Message></Response>',
                media_type="application/xml",
            )

        entry_id      = ingest_result.get("entry_id")
        confirmed_date = ingest_result.get("entry_date", entry_date)
        word_count    = ingest_result.get("word_count", len(body_text.split()))

        # Background: extract + AI summary + send reply
        background_tasks.add_task(
            _process_and_reply,
            user_id=user_id,
            entry_id=entry_id,
            entry_date=confirmed_date,
            text=body_text,
            word_count=word_count,
            to_number=from_number,
        )

        return Response(
            content=(
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<Response><Message>Entry received \u2713 Generating your AI summary\u2026</Message></Response>'
            ),
            media_type="application/xml",
        )


# ── Background: extract → summarize → reply ────────────────────────────────────

async def _process_and_reply(
    user_id: int, entry_id: int, entry_date: str,
    text: str, word_count: int, to_number: str
):
    """Run AI extraction, generate a brief reflective summary, send back via SMS."""
    try:
        from src.nlp.extractor import process_entry
        from src.nlp.master_summary import process_master_summary
        from src.api.ai_client import create_message
        from src.shared import config

        # AI extraction
        extraction_result = process_entry(entry_id, entry_date, text, user_id=user_id)
        mood_label, severity = "", ""

        if extraction_result.get("status") != "error":
            ext = extraction_result.get("extraction", {})
            mood_label = ext.get("mood_label", "")
            severity   = str(ext.get("severity", ""))
            daily_summary = extraction_result.get("summary", {}).get("summary_text", "")
            process_master_summary(entry_date, daily_summary, user_id=user_id)

        # Generate AI reply (2 warm sentences max — SMS-friendly)
        system = (
            "You are a supportive journaling companion. "
            "Write exactly 2 short sentences that warmly acknowledge this journal entry "
            "and reflect the emotional tone back to the writer. "
            "Be concise — this is an SMS reply, so keep it under 160 characters total."
        )
        try:
            ai_text = create_message(
                user_id, system,
                f"Journal entry ({word_count} words):\n\n{text[:1200]}",
                max_tokens=80
            ).strip()
        except Exception as ai_err:
            log.warning(f"[sms] AI reply failed for user {user_id}: {ai_err}")
            ai_text = None

        # Build the reply
        meta_parts = [f"Saved {entry_date} \u00b7 {word_count}w"]
        if mood_label:
            meta_parts.append(f"mood: {mood_label}")
        if severity:
            meta_parts.append(f"severity: {severity}/10")
        meta_line = " \u00b7 ".join(meta_parts)

        reply = meta_line
        if ai_text:
            reply = f"{meta_line}\n\n{ai_text}"

        # Send via Twilio REST
        cfg = config.get("sms", {})
        from twilio.rest import Client
        Client(cfg["account_sid"], cfg["auth_token"]).messages.create(
            body=reply,
            from_=cfg["from_number"],
            to=to_number,
        )
        log.info(f"[sms] Reply sent to {to_number} (user {user_id})")

    except Exception as e:
        log.error(f"[sms] Background reply error user {user_id}: {e}", exc_info=True)
