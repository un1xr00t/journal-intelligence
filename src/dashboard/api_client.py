"""
src/dashboard/api_client.py
Thin HTTP client for Streamlit dashboard → FastAPI backend.

Changes from previous version:
- safe_api() rewritten: correct token injection on retry, no builtins hack,
  atomic state clear on refresh failure (no broken intermediate states)
- All callers that mutate session_state must pass st.session_state explicitly
"""

import requests
import streamlit as st
from typing import Optional

BASE_URL = "http://localhost:8000"


# ── Exceptions ────────────────────────────────────────────────────────────────

class TokenExpiredError(Exception):
    pass


class AuthRequiredError(Exception):
    """Refresh token is missing or dead — user must re-login."""
    pass


# ── Auth calls (no auth header) ───────────────────────────────────────────────

def api_login(username: str, password: str) -> dict:
    try:
        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": username, "password": password},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as e:
        try:
            return e.response.json()
        except Exception:
            return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}


def api_refresh(refresh_token: str) -> dict:
    """Exchange a refresh token for a new access token.
    Raises on HTTP error so caller can distinguish failure from bad JSON."""
    resp = requests.post(
        f"{BASE_URL}/auth/refresh",
        json={"refresh_token": refresh_token},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def api_logout(refresh_token: str) -> None:
    try:
        requests.post(
            f"{BASE_URL}/auth/logout",
            json={"refresh_token": refresh_token},
            headers={"Authorization": f"Bearer {st.session_state.get('access_token', '')}"},
            timeout=10,
        )
    except Exception:
        pass  # best-effort — session will be cleared locally regardless


# ── Low-level request helpers ─────────────────────────────────────────────────

def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"} if token else {}


def _make_request(method: str, path: str, token: str, params: dict = None, body: dict = None):
    clean_params = {k: v for k, v in (params or {}).items() if v is not None}
    kwargs = dict(headers=_headers(token), timeout=15)
    if clean_params:
        kwargs["params"] = clean_params
    if body is not None:
        kwargs["json"] = body

    if method == "GET":
        return requests.get(f"{BASE_URL}{path}", **kwargs)
    elif method == "POST":
        return requests.post(f"{BASE_URL}{path}", **{**kwargs, "timeout": 30})
    elif method == "DELETE":
        return requests.delete(f"{BASE_URL}{path}", **kwargs)
    raise ValueError(f"Unsupported method: {method}")


# ── safe_api — authenticated call with silent token refresh ───────────────────

def safe_api(
    method: str,
    path: str,
    session_state: dict,
    params: dict = None,
    body: dict = None,
) -> dict:
    """
    Make an authenticated API call.

    If the access token has expired (401), silently refreshes using the
    stored refresh token and retries *once* with the new token.

    On refresh failure: fully clears session state (atomic) so the auth gate
    at the top of app.py will catch it on the next rerun and show login.
    Never leaves a partial / broken session state.

    Returns the JSON response dict, or {"error": "..."} on failure.
    """
    token = session_state.get("access_token", "")

    try:
        resp = _make_request(method, path, token, params=params, body=body)

        if resp.status_code == 401:
            # Token expired — attempt silent refresh
            refresh_token = session_state.get("refresh_token")
            if not refresh_token:
                _clear_session(session_state)
                return {"error": "session_expired"}

            try:
                refresh_result = api_refresh(refresh_token)
            except Exception:
                _clear_session(session_state)
                return {"error": "session_expired"}

            new_access = refresh_result.get("access_token")
            new_refresh = refresh_result.get("refresh_token")
            if not new_access:
                _clear_session(session_state)
                return {"error": "session_expired"}

            # Update session state with new tokens
            session_state["access_token"] = new_access
            if new_refresh:
                session_state["refresh_token"] = new_refresh

            # Retry with the new token directly (not session lookup — avoids race)
            resp = _make_request(method, path, new_access, params=params, body=body)

        resp.raise_for_status()
        return resp.json()

    except requests.HTTPError as e:
        try:
            return e.response.json()
        except Exception:
            return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}


def _clear_session(session_state: dict):
    """Atomically clear all auth state. Called on unrecoverable auth failure."""
    for key in ["authenticated", "access_token", "refresh_token",
                "user", "access_token_expiry"]:
        session_state.pop(key, None)


# ── Convenience wrappers ──────────────────────────────────────────────────────

def api_get(path: str, params: dict = None) -> dict:
    return safe_api("GET", path, st.session_state, params=params)


def api_post(path: str, body: dict = None) -> dict:
    return safe_api("POST", path, st.session_state, body=body)


def api_delete(path: str) -> dict:
    return safe_api("DELETE", path, st.session_state)


def get_entries(limit: int = 200, offset: int = 0) -> list:
    data = api_get("/api/entries", params={"limit": limit, "offset": offset})
    return data.get("entries", [])


def get_entry(date: str) -> dict:
    data = api_get(f"/api/entries/{date}")
    return data.get("data", {})


def get_alerts() -> list:
    data = api_get("/api/patterns/alerts")
    return data.get("alerts", [])


def get_entities() -> list:
    data = api_get("/api/entities")
    return data.get("entities", [])


def get_mood_trend(days: int = 90) -> list:
    data = api_get("/api/mood/trend", params={"days": days})
    return data.get("data", [])


def get_master_summary() -> Optional[dict]:
    data = api_get("/api/summary/master")
    return data.get("data")


def get_admin_users() -> list:
    data = api_get("/api/admin/users")
    return data.get("users", [])


def revoke_user_sessions(user_id: int) -> dict:
    return api_delete(f"/api/admin/sessions/{user_id}")


def trigger_export() -> dict:
    return api_post("/api/export/generate")
