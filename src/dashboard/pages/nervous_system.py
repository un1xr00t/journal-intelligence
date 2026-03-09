"""pages/nervous_system.py — Nervous System Tracker page"""
import statistics
import altair as alt
import pandas as pd
import streamlit as st
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared import (
    require_auth, show_notification, get_filters,
    load_entries, mood_chart, severity_chart, page_header, AXIS_STYLE,
)

require_auth()
show_notification()
page_header("Nervous System", "mood trajectory & stability")

entries = load_entries(get_filters())

if not entries:
    st.info("No entries in this date range.")
    st.stop()

rows = [
    {"date": e["entry_date"], "mood": e.get("mood_score"), "severity": e.get("severity")}
    for e in entries if e.get("entry_date")
]
df = pd.DataFrame(rows).sort_values("date")
df["mood"]     = pd.to_numeric(df["mood"],     errors="coerce")
df["severity"] = pd.to_numeric(df["severity"], errors="coerce")

# ── Summary metrics ───────────────────────────────────────────────────────────
m1, m2, m3, m4 = st.columns(4)
with m1:
    avg_m = df["mood"].dropna().mean()
    st.metric("Avg Mood", f"{avg_m:.1f}" if not pd.isna(avg_m) else "—")
with m2:
    avg_s = df["severity"].dropna().mean()
    st.metric("Avg Severity", f"{avg_s:.1f}" if not pd.isna(avg_s) else "—")
with m3:
    recent_m = df["mood"].dropna().tail(7).tolist()
    if len(recent_m) >= 3:
        stdev = statistics.stdev(recent_m)
        label = "High" if stdev > 2.5 else "Moderate" if stdev > 1.2 else "Stable"
        st.metric("7-day Stability", label, delta=f"σ {stdev:.2f}")
    else:
        st.metric("7-day Stability", "—")
with m4:
    st.metric("Entries", len(entries))

st.markdown('<div style="height:1px;background:var(--border);margin:16px 0;"></div>', unsafe_allow_html=True)

# ── Mood chart ────────────────────────────────────────────────────────────────
st.markdown('<div class="jd-section-label">Mood Over Time</div>', unsafe_allow_html=True)
df_mood = df.dropna(subset=["mood"])
if not df_mood.empty:
    st.altair_chart(mood_chart(df_mood, height=160), use_container_width=True, theme=None)

# ── Severity chart ────────────────────────────────────────────────────────────
st.markdown('<div class="jd-section-label">Severity Over Time</div>', unsafe_allow_html=True)
df_sev = df.dropna(subset=["severity"])
if not df_sev.empty:
    st.altair_chart(severity_chart(df_sev, height=120), use_container_width=True, theme=None)

# ── Combo overlay ─────────────────────────────────────────────────────────────
st.markdown('<div class="jd-section-label">Mood vs Severity</div>', unsafe_allow_html=True)
if not df_mood.empty and not df_sev.empty:
    accent = st.session_state.get("mood_theme", {}).get("accent", "#6366f1")
    danger = st.session_state.get("mood_theme", {}).get("status_danger", "#ef4444")
    base   = alt.Chart(df.dropna(subset=["mood"])).encode(
        x=alt.X("date:O", axis=alt.Axis(title=None, labelAngle=-45, **AXIS_STYLE))
    )
    line_mood = base.mark_line(color=accent, strokeWidth=2).encode(
        y=alt.Y("mood:Q", scale=alt.Scale(domain=[0,10]),
                axis=alt.Axis(title="Score 0→10", titleColor="#7a7998", titleFontSize=9, **AXIS_STYLE))
    )
    line_sev = base.mark_line(color=danger, strokeWidth=1.5, strokeDash=[4,2]).encode(
        y=alt.Y("severity:Q", scale=alt.Scale(domain=[0,10]))
    )
    combo = (line_mood + line_sev).properties(height=180, background="transparent")
    st.altair_chart(combo, use_container_width=True, theme=None)
    st.caption(f"Mood (solid)  —  Severity (dashed)")
