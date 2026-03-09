"""pages/admin.py — Admin page (owner only)"""
import json as _json
import streamlit as st
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared import (
    require_auth, show_notification, api, notify,
    load_master_summary, json_list, page_header,
)

try:
    from mood_theme import get_all_cached, invalidate_cache
    _THEME_OK = True
except ImportError:
    _THEME_OK = False

user     = require_auth()
is_owner = user.get("role") == "owner"
show_notification()
page_header("Admin", "system controls & user management")

if not is_owner:
    st.warning("Admin is restricted to the owner account.")
    st.stop()

# ── Master Summary ────────────────────────────────────────────────────────────
st.markdown('<div class="jd-section-label">Master Summary</div>', unsafe_allow_html=True)
ms = load_master_summary()
if ms:
    st.caption(f"Version {ms.get('version','?')} · Last entry: {ms.get('last_entry_date','?')}")
    with st.expander("View full master summary"):
        sections = [
            ("overall_arc",      "Overall Arc"),
            ("current_state",    "Current State"),
            ("key_themes",       "Key Themes"),
            ("key_people",       "Key People"),
            ("active_threads",   "Active Threads"),
            ("notable_patterns", "Notable Patterns"),
        ]
        for key, label in sections:
            val = ms.get(key)
            if not val:
                continue
            st.markdown(f"**{label}**")
            if isinstance(val, str):
                try:
                    val = _json.loads(val)
                except Exception:
                    pass
            if isinstance(val, list):
                if key == "key_people":
                    for p in val:
                        if isinstance(p, dict):
                            st.markdown(f"**{p.get('name','')}** — {p.get('role','')}. {p.get('recent','')}")
                        else:
                            st.markdown(f"• {p}")
                else:
                    for item in val:
                        st.markdown(f"• {item}")
            else:
                st.write(val)
else:
    st.info("No master summary yet — upload a journal entry to generate one.")

st.markdown('<div style="height:1px;background:var(--border);margin:16px 0;"></div>', unsafe_allow_html=True)

# ── Users ─────────────────────────────────────────────────────────────────────
st.markdown('<div class="jd-section-label">Users</div>', unsafe_allow_html=True)
users_data = api("GET", "/api/admin/users")
users_list = users_data.get("users", [])

for u in users_list:
    col_u, col_rev = st.columns([4, 1])
    with col_u:
        active = "✅" if u.get("is_active") else "❌"
        st.markdown(
            f"{active} **{u['username']}** — {u['email']} — "
            f"`{u['role']}` — last login: {u.get('last_login') or 'never'}"
        )
    with col_rev:
        if u["id"] != user.get("id"):
            if st.button("Revoke sessions", key=f"rev_{u['id']}"):
                r = api("DELETE", f"/api/admin/sessions/{u['id']}")
                notify(r.get("message", "Sessions revoked."), "success")
                st.rerun()

st.markdown('<div style="height:1px;background:var(--border);margin:16px 0;"></div>', unsafe_allow_html=True)

# ── Add user ──────────────────────────────────────────────────────────────────
st.markdown('<div class="jd-section-label">Add User</div>', unsafe_allow_html=True)
with st.expander("New user form"):
    new_username = st.text_input("Username", key="new_uname")
    new_email    = st.text_input("Email",    key="new_email")
    new_password = st.text_input("Password (min 12 chars)", type="password", key="new_pw")
    new_role     = st.selectbox("Role", ["viewer", "owner"], key="new_role")
    if st.button("Create user", key="create_user_btn"):
        if new_username and new_email and new_password:
            r = api("POST", "/api/admin/users", json={
                "username": new_username, "email": new_email,
                "password": new_password, "role":  new_role,
            })
            if r.get("id"):
                notify(f"Created user {new_username}", "success")
                st.rerun()
            else:
                notify(str(r), "error")
        else:
            notify("Fill in all fields.", "warning")

st.markdown('<div style="height:1px;background:var(--border);margin:16px 0;"></div>', unsafe_allow_html=True)

# ── Actions ───────────────────────────────────────────────────────────────────
st.markdown('<div class="jd-section-label">Actions</div>', unsafe_allow_html=True)
col_a1, col_a2, col_a3 = st.columns(3)
with col_a1:
    if st.button("▶ Run pattern detection"):
        with st.spinner("Running…"):
            r = api("POST", "/api/patterns/run")
        notify(f"Detection complete. {r.get('alerts_created',0)} new alerts.", "success")
        st.cache_data.clear()
        st.rerun()
with col_a2:
    if st.button("Clear dashboard cache"):
        st.cache_data.clear()
        notify("Cache cleared.", "success")
        st.rerun()
with col_a3:
    if _THEME_OK:
        if st.button("Clear ALL theme cache"):
            invalidate_cache()
            st.session_state.pop("mood_theme", None)
            st.session_state.pop("mood_score_cache", None)
            notify("All theme buckets cleared — will regenerate on next load.", "info")
            st.rerun()

# ── Theme cache status ────────────────────────────────────────────────────────
if _THEME_OK:
    st.markdown('<div class="jd-section-label">Theme Cache</div>', unsafe_allow_html=True)
    cached = get_all_cached()
    if cached:
        for bucket, theme in cached.items():
            with st.expander(f"Bucket: {bucket} — {theme.get('name','?')}"):
                st.caption(f"Emotion: {theme.get('emotion','')}")
                st.caption(f"Accent: {theme.get('accent','')} → {theme.get('accent_2','')}")
                st.caption(f"Background keywords: {theme.get('unsplash_keywords','')}")
                if st.button(f"Regenerate {bucket}", key=f"regen_{bucket}"):
                    invalidate_cache(bucket)
                    st.session_state.pop("mood_theme", None)
                    notify(f"Theme bucket '{bucket}' cleared.", "info")
                    st.rerun()
    else:
        st.caption("No themes cached yet — they generate automatically on first load per mood bucket.")
