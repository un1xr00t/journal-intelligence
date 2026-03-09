"""
src/auth/middleware.py
FastAPI dependencies for authentication and authorization.
"""

from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from src.auth.auth_service import decode_access_token, hash_api_key, verify_upload_api_key
from src.auth.auth_db import get_user_by_id, get_user_by_api_key_hash

# ── Security Schemes ──────────────────────────────────────────

bearer_scheme = HTTPBearer(auto_error=False)


# ── Current User Dependencies ─────────────────────────────────

async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> dict:
    """
    Dependency that extracts and validates the current user from JWT.
    Raises 401 if not authenticated.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = int(payload["sub"])
    user = get_user_by_id(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated",
        )

    return {
        "id": user_id,
        "username": payload["username"],
        "role": user["role"],
        "email": user["email"]
    }


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> Optional[dict]:
    """
    Like get_current_user but returns None instead of raising 401.
    """
    if not credentials:
        return None

    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        return None

    user_id = int(payload["sub"])
    user = get_user_by_id(user_id)

    if not user or not user["is_active"]:
        return None

    return {
        "id": user_id,
        "username": payload["username"],
        "role": user["role"],
        "email": user["email"]
    }


# ── Role-Based Access ─────────────────────────────────────────

def require_role(allowed_roles: list[str]):
    """Factory for role-checking dependencies."""
    async def role_checker(
        current_user: dict = Depends(get_current_user)
    ) -> dict:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {allowed_roles}"
            )
        return current_user

    return role_checker


# Convenience dependencies
require_owner    = require_role(["owner"])
require_any_user = require_role(["owner", "viewer"])


# ── API Key Auth (for iPhone Shortcut uploads) ────────────────

async def verify_api_key(request: Request) -> dict:
    """
    Verify the API key from X-API-Key header.

    Tries per-user key first (new system), then falls back to legacy static key.
    Returns the user dict on success.
    Raises 401 on failure.
    """
    raw_key = request.headers.get("X-API-Key")

    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
        )

    # ── Per-user key lookup (new system) ──────────────────────
    key_hash = hash_api_key(raw_key)
    user = get_user_by_api_key_hash(key_hash)

    if user:
        if not user["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is deactivated",
            )
        return {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "email": user.get("email", ""),
        }

    # ── Legacy static key fallback ────────────────────────────
    # Supports the old single upload_api_key from config.yaml.
    # On a legacy match we return the first active owner account.
    if verify_upload_api_key(raw_key):
        from src.auth.auth_db import get_db
        conn = get_db()
        row = conn.execute(
            "SELECT id, username, email, role FROM users WHERE role='owner' AND is_active=1 ORDER BY id ASC LIMIT 1"
        ).fetchone()
        conn.close()
        if row:
            return dict(row)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key",
    )


# ── Request Helpers ───────────────────────────────────────────

def get_client_ip(request: Request) -> str:
    """Extract client IP, handling proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def get_user_agent(request: Request) -> str:
    """Extract User-Agent header."""
    return request.headers.get("User-Agent", "unknown")


def get_device_hint(request: Request) -> str:
    """Generate a device hint from User-Agent."""
    ua = get_user_agent(request)

    if "iPhone" in ua:
        return "iPhone"
    elif "iPad" in ua:
        return "iPad"
    elif "Android" in ua:
        return "Android"
    elif "Mac OS" in ua:
        if "Chrome" in ua:
            return "Chrome/macOS"
        elif "Safari" in ua:
            return "Safari/macOS"
        elif "Firefox" in ua:
            return "Firefox/macOS"
    elif "Windows" in ua:
        if "Chrome" in ua:
            return "Chrome/Windows"
        elif "Firefox" in ua:
            return "Firefox/Windows"
        elif "Edge" in ua:
            return "Edge/Windows"
    elif "Linux" in ua:
        return "Linux"

    return ua[:50] if len(ua) > 50 else ua
