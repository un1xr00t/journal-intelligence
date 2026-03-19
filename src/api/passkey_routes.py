"""
src/api/passkey_routes.py
WebAuthn passkey (biometric / hardware key) authentication.

Routes:
  POST   /auth/passkey/register-begin       (auth)   — generate registration options
  POST   /auth/passkey/register-complete    (auth)   — verify + store passkey
  GET    /auth/passkey/list                 (auth)   — list enrolled passkeys
  POST   /auth/passkey/delete              (auth)   — remove a passkey
  POST   /auth/passkey/authenticate-begin   (public) — generate auth challenge
  POST   /auth/passkey/authenticate-complete (public) — verify assertion -> token pair

Wire up in main.py:
  from src.api.passkey_routes import register_passkey_routes
  register_passkey_routes(app, require_any_user)
"""
from __future__ import annotations
import base64 as _base64

import json
import logging
import os
import secrets
import threading
import time
from typing import Optional, Tuple, Dict

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger("journal")

# ── RP config (read from env with prod defaults) ───────────────────────────────

RP_ID     = os.environ.get("WEBAUTHN_RP_ID",     "journal.williamthomas.name")
RP_NAME   = os.environ.get("WEBAUTHN_RP_NAME",   "Journal Intelligence")
RP_ORIGIN = os.environ.get("WEBAUTHN_ORIGIN",    "https://journal.williamthomas.name")

# ── Short-lived challenge store (in-memory, TTL 5 min) ────────────────────────

_challenges: Dict[str, Tuple[bytes, float]] = {}
_challenges_lock = threading.Lock()


def _store_challenge(challenge: bytes) -> str:
    """Persist a challenge temporarily; return an opaque challenge_id."""
    cid = secrets.token_hex(20)
    with _challenges_lock:
        _challenges[cid] = (challenge, time.time())
    return cid


def _pop_challenge(cid: str) -> Optional[bytes]:
    """Consume and return challenge bytes, or None if expired / missing."""
    with _challenges_lock:
        item = _challenges.pop(cid, None)
    if not item:
        return None
    challenge_bytes, ts = item
    if time.time() - ts > 300:   # 5-minute TTL
        return None
    return challenge_bytes


# ── Request models ─────────────────────────────────────────────────────────────

class RegisterBeginRequest(BaseModel):
    pass   # no body needed — user comes from JWT


class RegisterCompleteRequest(BaseModel):
    challenge_id: str
    credential: dict           # raw WebAuthn JSON from browser
    device_name: Optional[str] = None


class DeletePasskeyRequest(BaseModel):
    credential_id: str


class AuthBeginRequest(BaseModel):
    username: Optional[str] = None  # optional — empty = discoverable cred picker


class AuthCompleteRequest(BaseModel):
    challenge_id: str
    credential: dict           # raw WebAuthn JSON from browser


# ── Route registration ─────────────────────────────────────────────────────────

def register_passkey_routes(app, require_any_user):

    # ── List passkeys ────────────────────────────────────────────────────────

    @app.get("/auth/passkey/list")
    async def passkey_list(current_user: dict = Depends(require_any_user)):
        from src.auth.auth_db import get_db
        conn = get_db()
        try:
            rows = conn.execute(
                """SELECT credential_id, device_name, created_at, last_used_at
                   FROM passkey_credentials WHERE user_id = ?
                   ORDER BY created_at DESC""",
                (current_user["id"],),
            ).fetchall()
            return {
                "passkeys": [
                    {
                        "credential_id": r["credential_id"],
                        "device_name":   r["device_name"] or "Unknown device",
                        "created_at":    r["created_at"],
                        "last_used_at":  r["last_used_at"],
                    }
                    for r in rows
                ]
            }
        finally:
            conn.close()

    # ── Register begin ────────────────────────────────────────────────────────

    @app.post("/auth/passkey/register-begin")
    async def passkey_register_begin(
        current_user: dict = Depends(require_any_user),
    ):
        try:
            from webauthn import generate_registration_options, options_to_json
            from webauthn.helpers.structs import (
                AuthenticatorSelectionCriteria,
                UserVerificationRequirement,
                ResidentKeyRequirement,
            )
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="WebAuthn library not installed. Run install_passkey_deps.py on the server.",
            )

        from src.auth.auth_db import get_db
        conn = get_db()
        try:
            # Collect already-registered credentials to exclude from re-registration
            rows = conn.execute(
                "SELECT credential_id FROM passkey_credentials WHERE user_id = ?",
                (current_user["id"],),
            ).fetchall()
        finally:
            conn.close()

        from webauthn.helpers.structs import PublicKeyCredentialDescriptor
        from webauthn import base64url_to_bytes

        exclude = [
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(r["credential_id"]))
            for r in rows
        ]

        options = generate_registration_options(
            rp_id=RP_ID,
            rp_name=RP_NAME,
            user_id=str(current_user["id"]).encode(),
            user_name=current_user["username"],
            user_display_name=current_user["username"],
            exclude_credentials=exclude,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
        )

        challenge_id = _store_challenge(options.challenge)
        options_dict = json.loads(options_to_json(options))
        options_dict["challenge_id"] = challenge_id

        return options_dict

    # ── Register complete ─────────────────────────────────────────────────────

    @app.post("/auth/passkey/register-complete")
    async def passkey_register_complete(
        body: RegisterCompleteRequest,
        current_user: dict = Depends(require_any_user),
    ):
        try:
            from webauthn import verify_registration_response
            from webauthn.helpers.structs import RegistrationCredential
        except ImportError:
            raise HTTPException(status_code=503, detail="WebAuthn library not installed.")

        challenge = _pop_challenge(body.challenge_id)
        if not challenge:
            raise HTTPException(
                status_code=400,
                detail="Challenge expired or invalid. Please try again.",
            )

        try:
            from webauthn.helpers.structs import AuthenticatorAttestationResponse
            from webauthn.helpers import base64url_to_bytes as _b64dec
            _resp = body.credential.get("response", {})
            cred = RegistrationCredential(
                id=body.credential["id"],
                raw_id=_b64dec(body.credential.get("rawId", body.credential["id"])),
                response=AuthenticatorAttestationResponse(
                    client_data_json=_b64dec(_resp["clientDataJSON"]),
                    attestation_object=_b64dec(_resp["attestationObject"]),
                    transports=_resp.get("transports") or [],
                ),
                type=body.credential.get("type", "public-key"),
            )
            verified = verify_registration_response(
                credential=cred,
                expected_challenge=challenge,
                expected_rp_id=RP_ID,
                expected_origin=RP_ORIGIN,
                require_user_verification=False,
            )
        except Exception as exc:
            logger.warning(f"Passkey registration failed for user {current_user['id']}: {exc}")
            raise HTTPException(status_code=400, detail=f"Registration failed: {str(exc)}")

        cred_id    = _base64.urlsafe_b64encode(verified.credential_id).rstrip(b'=').decode()
        pub_key    = verified.credential_public_key
        sign_count = verified.sign_count
        aaguid     = str(verified.aaguid) if verified.aaguid else None
        transports = json.dumps(body.credential.get("response", {}).get("transports") or [])
        device_name = (body.device_name or "").strip() or None

        from src.auth.auth_db import get_db
        conn = get_db()
        try:
            conn.execute(
                """INSERT INTO passkey_credentials
                   (user_id, credential_id, public_key, sign_count, aaguid, transports, device_name)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (current_user["id"], cred_id, pub_key, sign_count, aaguid, transports, device_name),
            )
            conn.commit()
        finally:
            conn.close()

        logger.info(f"Passkey registered for user_id={current_user['id']} cred={cred_id[:16]}…")
        return {"message": "Passkey registered successfully.", "credential_id": cred_id}

    # ── Delete passkey ────────────────────────────────────────────────────────

    @app.post("/auth/passkey/delete")
    async def passkey_delete(
        body: DeletePasskeyRequest,
        current_user: dict = Depends(require_any_user),
    ):
        from src.auth.auth_db import get_db
        conn = get_db()
        try:
            result = conn.execute(
                "DELETE FROM passkey_credentials WHERE user_id = ? AND credential_id = ?",
                (current_user["id"], body.credential_id),
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Passkey not found.")
            conn.commit()
        finally:
            conn.close()

        logger.info(f"Passkey deleted for user_id={current_user['id']}")
        return {"message": "Passkey removed."}

    # ── Authenticate begin ────────────────────────────────────────────────────

    @app.post("/auth/passkey/authenticate-begin")
    async def passkey_authenticate_begin(body: AuthBeginRequest):
        try:
            from webauthn import generate_authentication_options, options_to_json
            from webauthn.helpers.structs import (
                PublicKeyCredentialDescriptor,
                UserVerificationRequirement,
            )
            from webauthn import base64url_to_bytes
        except ImportError:
            raise HTTPException(status_code=503, detail="WebAuthn library not installed.")

        allow_credentials = []

        if body.username:
            from src.auth.auth_db import get_db
            from src.auth.auth_db import get_user_by_username
            user = get_user_by_username(body.username)
            if user:
                conn = get_db()
                try:
                    rows = conn.execute(
                        "SELECT credential_id FROM passkey_credentials WHERE user_id = ?",
                        (user["id"],),
                    ).fetchall()
                    allow_credentials = [
                        PublicKeyCredentialDescriptor(
                            id=base64url_to_bytes(r["credential_id"])
                        )
                        for r in rows
                    ]
                finally:
                    conn.close()

        options = generate_authentication_options(
            rp_id=RP_ID,
            allow_credentials=allow_credentials,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        challenge_id = _store_challenge(options.challenge)
        options_dict = json.loads(options_to_json(options))
        options_dict["challenge_id"] = challenge_id

        return options_dict

    # ── Authenticate complete ─────────────────────────────────────────────────

    @app.post("/auth/passkey/authenticate-complete")
    async def passkey_authenticate_complete(
        request: Request,
        body: AuthCompleteRequest,
    ):
        try:
            from webauthn import verify_authentication_response
            from webauthn.helpers.structs import AuthenticationCredential
        except ImportError:
            raise HTTPException(status_code=503, detail="WebAuthn library not installed.")

        from src.auth.middleware import get_client_ip, get_user_agent, get_device_hint
        from src.auth.auth_db import (
            get_db, get_user_by_id,
            store_refresh_token, update_last_login,
            log_auth_event, reset_rate_limit,
        )
        from src.auth.auth_service import create_token_pair

        ip = get_client_ip(request)

        challenge = _pop_challenge(body.challenge_id)
        if not challenge:
            raise HTTPException(
                status_code=400,
                detail="Challenge expired or invalid. Please try again.",
            )

        # Extract credential_id from the assertion to look up the stored key
        cred_dict  = body.credential
        cred_id_b64 = cred_dict.get("id") or cred_dict.get("rawId")
        if not cred_id_b64:
            raise HTTPException(status_code=400, detail="Missing credential id.")

        conn = get_db()
        try:
            row = conn.execute(
                """SELECT user_id, public_key, sign_count
                   FROM passkey_credentials WHERE credential_id = ?""",
                (cred_id_b64,),
            ).fetchone()
        finally:
            conn.close()

        if not row:
            log_auth_event("failed", ip_address=ip, details={"reason": "unknown_passkey"})
            raise HTTPException(
                status_code=401,
                detail="Passkey not recognised. You may need to register it first.",
            )

        try:
            from webauthn.helpers.structs import AuthenticatorAssertionResponse
            from webauthn.helpers import base64url_to_bytes as _b64dec
            _resp2 = cred_dict.get("response", {})
            cred = AuthenticationCredential(
                id=cred_dict["id"],
                raw_id=_b64dec(cred_dict.get("rawId", cred_dict["id"])),
                response=AuthenticatorAssertionResponse(
                    client_data_json=_b64dec(_resp2["clientDataJSON"]),
                    authenticator_data=_b64dec(_resp2["authenticatorData"]),
                    signature=_b64dec(_resp2["signature"]),
                    user_handle=_b64dec(_resp2["userHandle"]) if _resp2.get("userHandle") else None,
                ),
                type=cred_dict.get("type", "public-key"),
            )
            verified = verify_authentication_response(
                credential=cred,
                expected_challenge=challenge,
                expected_rp_id=RP_ID,
                expected_origin=RP_ORIGIN,
                credential_public_key=row["public_key"],
                credential_current_sign_count=row["sign_count"],
                require_user_verification=False,
            )
        except Exception as exc:
            log_auth_event("failed", user_id=row["user_id"], ip_address=ip,
                           details={"reason": "passkey_verify_failed", "detail": str(exc)})
            raise HTTPException(status_code=401, detail="Passkey verification failed.")

        # Update sign count
        conn = get_db()
        try:
            conn.execute(
                "UPDATE passkey_credentials SET sign_count = ?, last_used_at = datetime('now') WHERE credential_id = ?",
                (verified.new_sign_count, cred_id_b64),
            )
            conn.commit()
        finally:
            conn.close()

        user = get_user_by_id(row["user_id"])
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
            details={"method": "passkey"},
        )

        logger.info(f"Passkey login success user_id={user['id']}")
        return {
            "access_token":  tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "token_type":    "bearer",
            "expires_in":    tokens["expires_in"],
            "user": {
                "id":       user["id"],
                "username": user["username"],
                "email":    user["email"],
                "role":     user["role"],
            },
        }
