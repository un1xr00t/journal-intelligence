"""
src/auth/auth_service.py
Core authentication logic: JWT, bcrypt, refresh tokens, per-user API keys.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
import yaml
from pathlib import Path

# ── Load Config ───────────────────────────────────────────────

from src.config import CONFIG_PATH, load_config

def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)

config = load_config()
auth_config = config["auth"]

JWT_SECRET = auth_config["jwt_secret"]
JWT_ALGORITHM = auth_config["jwt_algorithm"]
ACCESS_TOKEN_EXPIRE_MINUTES = auth_config["access_token_expire_minutes"]
REFRESH_TOKEN_EXPIRE_DAYS = auth_config["refresh_token_expire_days"]
BCRYPT_COST = auth_config["bcrypt_cost_factor"]


# ── Password Hashing ──────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt(rounds=BCRYPT_COST)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode(),
            hashed_password.encode()
        )
    except Exception:
        return False


# ── JWT Access Tokens ─────────────────────────────────────────

def create_access_token(
    user_id: int,
    username: str,
    role: str,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }

    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT access token. Returns payload or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

        if payload.get("type") != "access":
            return None

        return payload

    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ── Refresh Tokens ────────────────────────────────────────────

def generate_refresh_token() -> str:
    """Generate a cryptographically secure refresh token."""
    return secrets.token_urlsafe(64)


def hash_refresh_token(token: str) -> str:
    """
    Hash refresh token using SHA-256 for storage.
    We use SHA-256 (not bcrypt) because:
    - Refresh tokens are high-entropy random strings
    - We need fast lookups
    - bcrypt is for low-entropy passwords
    """
    return hashlib.sha256(token.encode()).hexdigest()


def get_refresh_token_expiry() -> datetime:
    """Get expiration datetime for a new refresh token."""
    return datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)


# ── Token Response Builder ────────────────────────────────────

def create_token_pair(
    user_id: int,
    username: str,
    role: str
) -> dict:
    """
    Create both access and refresh tokens.

    Returns:
        {
            "access_token": "...",
            "refresh_token": "...",  # Raw token for client
            "refresh_token_hash": "...",  # Hash for DB storage
            "token_type": "bearer",
            "expires_in": 900,  # seconds
            "refresh_expires_at": datetime
        }
    """
    access_token = create_access_token(user_id, username, role)
    refresh_token = generate_refresh_token()
    refresh_hash = hash_refresh_token(refresh_token)
    refresh_expires = get_refresh_token_expiry()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "refresh_token_hash": refresh_hash,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "refresh_expires_at": refresh_expires
    }


# ── Per-User API Keys ─────────────────────────────────────────
# Format: jd_<32 random url-safe chars>
# Storage: SHA-256 hash in DB. Prefix (first 10 chars) stored plaintext for display.
# Shown ONCE at generation — not recoverable after that.

API_KEY_PREFIX = "jd_"
API_KEY_RANDOM_BYTES = 32  # generates ~43 base64url chars


def generate_user_api_key() -> dict:
    """
    Generate a new per-user API key.

    Returns:
        {
            "raw":    "jd_xxxx..."  — shown to user ONCE, never stored
            "hash":   "sha256..."  — stored in DB
            "prefix": "jd_a1b2c3" — first 10 chars, stored in DB for display
        }
    """
    random_part = secrets.token_urlsafe(API_KEY_RANDOM_BYTES)
    raw = f"{API_KEY_PREFIX}{random_part}"
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    prefix = raw[:10]  # "jd_" + 7 chars — enough to identify, not enough to brute-force
    return {"raw": raw, "hash": key_hash, "prefix": prefix}


def hash_api_key(raw_key: str) -> str:
    """Hash a raw API key for DB lookup."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


# ── Legacy static API key (kept for backwards compat during transition) ───────

def verify_upload_api_key(api_key: str) -> bool:
    """Verify the legacy static API key used by iPhone Shortcut."""
    legacy_key = auth_config.get("upload_api_key", "")
    if legacy_key and secrets.compare_digest(api_key, legacy_key):
        return True
    return False
