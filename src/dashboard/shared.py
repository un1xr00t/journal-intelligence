"""
src/dashboard/shared.py
Shared utilities for all dashboard pages.
Imported by every page file — keeps page files lean.
"""
from __future__ import annotations
import json
import statistics
from datetime import date, timedelta

import altair as alt
import pandas as pd
import streamlit as st

from api_client import safe_api

# ── Auth guard ────────────────────────────────────────────────────────────────

def require_auth() -> dict:
    """
    Call at the top of every page. Returns the user dict if authenticated.
    app.py already ran SessionManager and stopped unauthenticated requests
    before pg.run() — so pages must NOT create a second SessionManager
    (that would duplicate the CookieManager key and crash).
    We just verify session_state is populated as a safety net.
    """
    user = st.session_state.get("user")
    if not user or not st.session_state.get("access_token"):
        # Session state was lost (e.g. server restart) — redirect to root
        st.error("Session expired. Please refresh the page to log in again.")
        st.stop()
    return user


# ── Notifications ─────────────────────────────────────────────────────────────

def notify(msg: str, level: str = "info"):
    st.session_state["_notification"] = (msg, level)


def show_notification():
    note = st.session_state.pop("_notification", None)
    if not note:
        return
    msg, level = note
    styles = {
        "success": ("rgba(16,185,129,0.08)",  "rgba(16,185,129,0.28)",  "#6ee7b7"),
        "info":    ("rgba(99,102,241,0.08)",   "rgba(99,102,241,0.28)",  "#a5b4fc"),
        "warning": ("rgba(245,158,11,0.08)",   "rgba(245,158,11,0.28)",  "#fcd34d"),
        "error":   ("rgba(239,68,68,0.08)",    "rgba(239,68,68,0.28)",   "#fca5a5"),
    }
    bg, border, color = styles.get(level, styles["info"])
    icons = {"success": "✓", "info": "ℹ", "warning": "⚠", "error": "✕"}
    st.markdown(
        f"""<div style="background:{bg};border:1px solid {border};border-radius:8px;
        padding:9px 14px;margin-bottom:12px;color:{color};font-size:13px;font-weight:500;">
        {icons.get(level,"ℹ")}&nbsp; {msg}</div>""",
        unsafe_allow_html=True,
    )


# ── API helper ────────────────────────────────────────────────────────────────

def api(method: str, path: str, **kwargs):
    return safe_api(method, path, st.session_state, **kwargs)


def json_list(raw) -> list:
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return []


# ── Filters (stored in session_state by app.py sidebar) ──────────────────────

def get_filters() -> dict:
    return st.session_state.get("filters", {
        "start_date": str(date.today() - timedelta(days=90)),
        "end_date":   str(date.today()),
        "severity_min": 0.0,
        "severity_max": 10.0,
        "mood": None,
        "search": None,
        "entity": None,
    })


# ── Data loaders ──────────────────────────────────────────────────────────────

@st.cache_data(ttl=60, show_spinner=False)
def load_all_entries():
    r = safe_api("GET", "/api/entries", st.session_state, params={"limit": 500})
    return r.get("entries", [])


def load_entries(filters: dict | None = None) -> list:
    f = filters or get_filters()
    params = {
        "limit": 300, "offset": 0,
        "start_date":   f.get("start_date"),
        "end_date":     f.get("end_date"),
        "mood":         f.get("mood"),
        "severity_min": f.get("severity_min") if (f.get("severity_min") or 0) > 0 else None,
        "severity_max": f.get("severity_max") if (f.get("severity_max") or 10) < 10 else None,
        "search":       f.get("search"),
        "entity":       f.get("entity"),
    }
    r = safe_api("GET", "/api/entries", st.session_state, params=params)
    return r.get("entries", [])


@st.cache_data(ttl=120, show_spinner=False)
def load_alerts():
    r = safe_api("GET", "/api/patterns/alerts", st.session_state)
    return r.get("alerts", [])


@st.cache_data(ttl=120, show_spinner=False)
def load_entities():
    r = safe_api("GET", "/api/entities", st.session_state)
    return r.get("entities", [])


@st.cache_data(ttl=300, show_spinner=False)
def load_master_summary():
    r = safe_api("GET", "/api/summary/master", st.session_state)
    return r.get("data")


@st.cache_data(ttl=120, show_spinner=False)
def load_evidence(ev_type=None, bookmarked_only=False):
    params = {}
    if ev_type:
        params["evidence_type"] = ev_type
    if bookmarked_only:
        params["bookmarked_only"] = "true"
    r = safe_api("GET", "/api/evidence", st.session_state, params=params)
    return r.get("evidence", [])


@st.cache_data(ttl=120, show_spinner=False)
def load_contradictions():
    r = safe_api("GET", "/api/patterns/contradictions", st.session_state)
    return r.get("contradictions", [])


@st.cache_data(ttl=300, show_spinner=False)
def load_rollups():
    r = safe_api("GET", "/api/rollups", st.session_state)
    return r.get("rollups", [])


# ── Chart helpers ─────────────────────────────────────────────────────────────

AXIS_STYLE = dict(
    labelColor="#7a7998",
    labelFontSize=9,
    gridColor="rgba(255,255,255,0.04)",
    tickColor="rgba(255,255,255,0.05)",
    domainColor="rgba(255,255,255,0.05)",
)


def mood_chart(df: pd.DataFrame, height: int = 120) -> alt.Chart:
    accent = st.session_state.get("mood_theme", {}).get("accent", "#6366f1")
    accent2 = st.session_state.get("mood_theme", {}).get("accent_2", "#8b5cf6")
    return (
        alt.Chart(df)
        .mark_line(color=accent, strokeWidth=2,
                   point=alt.OverlayMarkDef(color=accent2, size=40))
        .encode(
            x=alt.X("date:O", axis=alt.Axis(title=None, labelAngle=-45, **AXIS_STYLE)),
            y=alt.Y("mood:Q", scale=alt.Scale(domain=[0, 10]),
                    axis=alt.Axis(title="Mood  0→10", titleColor="#7a7998",
                                  titleFontSize=9, **AXIS_STYLE)),
            tooltip=[alt.Tooltip("date:O", title="Date"),
                     alt.Tooltip("mood:Q", title="Mood", format=".1f")],
        )
        .properties(height=height, background="transparent")
    )


def severity_chart(df: pd.DataFrame, height: int = 110) -> alt.Chart:
    danger = st.session_state.get("mood_theme", {}).get("status_danger", "#ef4444")
    return (
        alt.Chart(df)
        .mark_area(color=f"{danger}35", line={"color": danger, "strokeWidth": 1.5})
        .encode(
            x=alt.X("date:O", axis=alt.Axis(title=None, labelAngle=-45, **AXIS_STYLE)),
            y=alt.Y("severity:Q", scale=alt.Scale(domain=[0, 10]),
                    axis=alt.Axis(title="Severity  0→10", titleColor="#7a7998",
                                  titleFontSize=9, **AXIS_STYLE)),
            tooltip=[alt.Tooltip("date:O", title="Date"),
                     alt.Tooltip("severity:Q", title="Severity", format=".1f")],
        )
        .properties(height=height, background="transparent")
    )


# ── Page header ───────────────────────────────────────────────────────────────

def page_header(title: str, subtitle: str = ""):
    theme = st.session_state.get("mood_theme", {})
    theme_name = theme.get("name", "")
    emotion    = theme.get("emotion", "")
    today_str  = date.today().strftime("%b %d, %Y")
    sub_html = f'<span style="color:var(--text-muted);font-size:13px;margin-left:10px;">{subtitle}</span>' if subtitle else ""
    badge_html = f'<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:10px;color:var(--accent);letter-spacing:0.06em;font-weight:600;text-transform:uppercase;">{theme_name}</span><span style="color:var(--text-muted);font-size:10px;">·</span><span style="color:var(--text-muted);font-size:10.5px;font-style:italic;">{emotion}</span></div>' if theme_name else ""
    st.markdown(f"""
    <div style="
      display:flex;align-items:center;justify-content:space-between;
      padding:18px 0 14px;
      border-bottom:1px solid var(--border);
      margin-bottom:20px;
    ">
      <div style="display:flex;align-items:baseline;gap:0;">
        <h1 style="margin:0;font-size:21px;font-weight:700;color:var(--text-primary);letter-spacing:-0.025em;">{title}</h1>
        {sub_html}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
        {badge_html}
        <span style="color:var(--text-muted);font-size:11px;">{today_str}</span>
      </div>
    </div>
    """, unsafe_allow_html=True)


# ── Stats card HTML ───────────────────────────────────────────────────────────

def stats_row(stats: list[dict]) -> str:
    """
    stats: list of {label, value, delta, delta_type}
    delta_type: 'up' | 'down' | 'flat'
    Returns raw HTML to inject via st.markdown unsafe.
    """
    cards = ""
    for s in stats:
        delta_color = {
            "up":   "var(--status-ok)",
            "down": "var(--status-danger)",
            "flat": "var(--text-muted)",
        }.get(s.get("delta_type", "flat"), "var(--text-muted)")
        val_color = s.get("val_color", "var(--text-primary)")
        cards += f"""
        <div class="jd-stat-card">
          <div class="jd-stat-label">{s["label"]}</div>
          <div class="jd-stat-value" style="color:{val_color};">{s["value"]}</div>
          <div class="jd-stat-delta" style="color:{delta_color};">{s.get("delta","")}</div>
        </div>"""
    return f'<div class="jd-stats-grid">{cards}</div>'
