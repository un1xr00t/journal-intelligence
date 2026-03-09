"""
src/dashboard/session_manager.py

Handles all Streamlit session persistence logic.

Solves two problems:
  1. Login screen blip on page refresh — cookie bridge + spinner on first render
  2. Broken session states — clean state machine with atomic transitions

Requires:
  pip install extra-streamlit-components

Usage in app.py (very top, before ANY rendering):

    from src.dashboard.session_manager import SessionManager
    sm = SessionManager()
    if not sm.is_authenticated():
        sm.show_login_page()
        st.stop()
    # rest of app renders here
"""

import streamlit as st
from datetime import datetime, timedelta, timezone
from typing import Optional
import extra_streamlit_components as stx

from src.dashboard.api_client import api_login, api_refresh, api_logout

# ── Constants ─────────────────────────────────────────────────────────────────

COOKIE_KEY   = "journal_rt"          # cookie name stored in browser
COOKIE_DAYS  = 30                    # matches server refresh token TTL
# Access token is 15 min — refresh proactively at 12 min to avoid mid-render expiry
REFRESH_BEFORE_SECS = 180            # 3 min before expiry


# ── SessionManager ────────────────────────────────────────────────────────────

class SessionManager:
    """
    Central auth state manager. Instantiate once at the top of app.py.

    State machine:
      INIT  → cookies loading      → show spinner, st.stop()
      INIT  → cookie found         → silent refresh → AUTHED or NEEDS_LOGIN
      INIT  → no cookie            → NEEDS_LOGIN
      AUTHED                       → app renders, proactive token refresh
      NEEDS_LOGIN → credentials OK → AUTHED + cookie written
      NEEDS_LOGIN → bad creds      → show error, stay NEEDS_LOGIN
      AUTHED → logout              → clear all state + cookie → NEEDS_LOGIN
      AUTHED → refresh fails       → clear all state + cookie → NEEDS_LOGIN
    """

    def __init__(self):
        # CookieManager must be instantiated with a unique key.
        # extra-streamlit-components needs this called early so cookies are
        # available on the *same* run (not just the next rerun).
        self._cm = stx.CookieManager(key="__jd_cookie_mgr__")

    # ── Public API ─────────────────────────────────────────────────────────────

    def is_authenticated(self) -> bool:
        """
        Main auth check. Call at top of app.py.

        Returns True immediately if already authenticated this session.
        On page refresh: checks cookie, attempts silent re-auth.
        Returns False if login is required (caller should show login + st.stop()).
        """

        # Fast path — already authenticated in this Streamlit session
        if st.session_state.get("authenticated") and st.session_state.get("access_token"):
            self._maybe_proactive_refresh()
            return True

        # CookieManager works via a JS bridge that needs one render to initialise.
        # On the very first render after a page refresh, cookies aren't readable yet.
        # We show a spinner, set a flag, and st.stop(). The CookieManager component
        # renders, JS fires, triggers a rerun. On the second render the flag is set
        # and cookies are actually readable.
        if not st.session_state.get("_cookie_check_done"):
            st.session_state["_cookie_check_done"] = True
            self._show_loading()
            st.stop()

        # Second render — cookies are available now
        stored_rt = self._cm.get(COOKIE_KEY)
        if stored_rt:
            if self._silent_refresh(stored_rt):
                return True
            # Cookie was invalid / server-side revoked — clean it up
            self._clear_cookie()

        return False

    def show_login_page(self):
        """Render the login form. Call after is_authenticated() returns False."""
        self._render_login()

    def logout(self):
        """Full logout — revokes server token, clears state and cookie."""
        rt = st.session_state.get("refresh_token")
        if rt:
            try:
                api_logout(rt)
            except Exception:
                pass  # best-effort — clear locally regardless
        self._clear_all()
        st.rerun()

    def get_user(self) -> dict:
        return st.session_state.get("user", {})

    def get_access_token(self) -> Optional[str]:
        return st.session_state.get("access_token")

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _silent_refresh(self, refresh_token: str) -> bool:
        """Exchange a refresh token for a new access token. Atomic — either fully
        succeeds (session set) or fully fails (nothing changed)."""
        try:
            result = api_refresh(refresh_token)
            if "access_token" in result and "refresh_token" in result:
                self._set_session(result)
                return True
        except Exception:
            pass
        return False

    def _maybe_proactive_refresh(self):
        """If the access token is about to expire, refresh now — before any API
        call fails mid-render. Avoids the reactive 401 path entirely."""
        expiry = st.session_state.get("access_token_expiry")
        if not expiry:
            return
        now = datetime.now(timezone.utc)
        if expiry - now < timedelta(seconds=REFRESH_BEFORE_SECS):
            rt = st.session_state.get("refresh_token")
            if rt:
                if not self._silent_refresh(rt):
                    # Refresh token is dead — force re-login cleanly
                    self._clear_all()
                    st.rerun()

    def _set_session(self, auth_result: dict):
        """Atomically write all session state. Either all keys are set or none."""
        access_token  = auth_result.get("access_token")
        refresh_token = auth_result.get("refresh_token")
        user          = auth_result.get("user", {})
        expires_in    = auth_result.get("expires_in", 900)  # seconds

        if not access_token or not refresh_token:
            return  # malformed response — don't touch state

        expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        # Write all state atomically
        st.session_state["authenticated"]        = True
        st.session_state["access_token"]         = access_token
        st.session_state["refresh_token"]        = refresh_token
        st.session_state["user"]                 = user
        st.session_state["access_token_expiry"]  = expiry

        # Persist refresh token in browser cookie
        self._set_cookie(refresh_token)

    def _clear_all(self):
        """Clear all session state and cookie. Safe to call from any state."""
        for key in ["authenticated", "access_token", "refresh_token",
                    "user", "access_token_expiry"]:
            st.session_state.pop(key, None)
        self._clear_cookie()

    def _set_cookie(self, value: str):
        try:
            expires = datetime.now() + timedelta(days=COOKIE_DAYS)
            self._cm.set(COOKIE_KEY, value, expires_at=expires)
        except Exception:
            pass  # cookie write failure is non-fatal

    def _clear_cookie(self):
        try:
            self._cm.delete(COOKIE_KEY)
        except Exception:
            pass

    # ── UI helpers ─────────────────────────────────────────────────────────────

    def _show_loading(self):
        """Shown on first render while cookies load — prevents login blip."""
        st.markdown("""
        <style>
        #MainMenu, footer, header { visibility: hidden; }
        .stApp { background: #07070f; }
        </style>
        <div style="
          display:flex; align-items:center; justify-content:center;
          height:100vh; flex-direction:column; gap:16px;
        ">
          <div style="
            width:36px; height:36px; border-radius:50%;
            border:2px solid rgba(99,102,241,0.15); border-top-color:#6366f1;
            animation:spin 0.7s linear infinite;
          "></div>
          <p style="color:#45445a; font-size:12px; font-family:system-ui,sans-serif;
                    letter-spacing:0.05em; text-transform:uppercase; font-weight:500;">
            Restoring session
          </p>
        </div>
        <style>
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
        """, unsafe_allow_html=True)

    def _render_login(self):
        """Full login form. Matches dashboard dark theme."""
        st.markdown("""
        <style>
        #MainMenu, footer, header { visibility: hidden; }
        .stApp { background: #07070f; }
        section[data-testid="stSidebar"] { display: none; }
        [data-testid="stTextInput"] input {
          background: #10101e !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          color: #f0eff8 !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          padding: 10px 14px !important;
        }
        [data-testid="stTextInput"] input:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 2px rgba(99,102,241,0.15) !important;
        }
        [data-testid="stTextInput"] label {
          color: #45445a !important;
          font-size: 11px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.08em !important;
          font-weight: 600 !important;
        }
        [data-testid="stFormSubmitButton"] button {
          background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
          border: none !important;
          color: #fff !important;
          font-weight: 600 !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          padding: 10px !important;
          letter-spacing: 0.02em !important;
        }
        [data-testid="stForm"] {
          background: transparent !important;
          border: none !important;
        }
        </style>
        """, unsafe_allow_html=True)

        _, col, _ = st.columns([1, 1.1, 1])
        with col:
            st.markdown("""
            <div style="text-align:center; padding: 56px 0 36px;">
              <div style="
                width:52px; height:52px; margin:0 auto 16px;
                border-radius:14px;
                background: linear-gradient(135deg, #6366f1, #8b5cf6);
                display:flex; align-items:center; justify-content:center;
                font-size:22px; box-shadow: 0 0 32px rgba(99,102,241,0.25);
              ">✦</div>
              <h2 style="color:#f0eff8; font-weight:600; margin:0; font-size:22px; letter-spacing:-0.02em;">
                Journal Dashboard
              </h2>
              <p style="color:#45445a; margin-top:8px; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; font-weight:500;">
                Sign in to continue
              </p>
            </div>
            """, unsafe_allow_html=True)

            if st.session_state.get("login_error"):
                err = st.session_state.pop("login_error")
                st.markdown(
                    f'<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);'
                    f'border-radius:8px;padding:10px 14px;color:#fca5a5;font-size:13px;margin-bottom:12px;">'
                    f'✕&nbsp; {err}</div>',
                    unsafe_allow_html=True
                )

            with st.form("login_form", clear_on_submit=False):
                username = st.text_input("Username", placeholder="username")
                password = st.text_input("Password", type="password", placeholder="••••••••••••")
                submitted = st.form_submit_button(
                    "Sign in",
                    use_container_width=True,
                    type="primary",
                )

            if submitted:
                if not username or not password:
                    st.session_state["login_error"] = "Enter both username and password."
                    st.rerun()
                else:
                    with st.spinner(""):
                        result = api_login(username, password)
                    if "access_token" in result and "refresh_token" in result:
                        self._set_session(result)
                        st.rerun()
                    else:
                        msg = result.get("detail") or result.get("error") or "Invalid credentials."
                        st.session_state["login_error"] = msg
                        st.rerun()
