"""pages/patterns.py — Patterns & Alerts page"""
import json
import streamlit as st
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared import (
    require_auth, show_notification, api, json_list,
    get_filters, load_alerts, load_rollups, page_header,
)

user     = require_auth()
is_owner = user.get("role") == "owner"
show_notification()
page_header("Patterns", "alerts & weekly rollups")

filters = get_filters()
start_date = filters.get("start_date", "")
end_date   = filters.get("end_date",   "")

alerts  = load_alerts()
rollups = load_rollups()

def _in_range(a):
    s = a.get("date_range_start", "")
    return start_date <= s <= end_date if s else True

alerts_filtered = [a for a in alerts if _in_range(a)]

if "ai_queued_ids" not in st.session_state:
    st.session_state["ai_queued_ids"] = set()

# ── Active alerts ─────────────────────────────────────────────────────────────
st.markdown('<div class="jd-section-label">Active Alerts</div>', unsafe_allow_html=True)

if not alerts_filtered:
    st.success("No active alerts in this date range.")
else:
    for alert in alerts_filtered:
        p        = alert.get("priority_score", 0)
        alert_id = alert["id"]
        dot      = "🔴" if p >= 7 else "🟡" if p >= 4 else "🔵"
        label    = (
            f"{dot} {alert['alert_type'].replace('_', ' ').title()}  ·  "
            f"{alert.get('date_range_start','?')} → {alert.get('date_range_end','?')}  ·  "
            f"priority {p:.1f}"
        )
        with st.expander(label):
            st.write(alert.get("description", ""))

            raw_analysis   = alert.get("ai_analysis")
            already_queued = alert_id in st.session_state["ai_queued_ids"]

            if raw_analysis:
                try:
                    analysis = json.loads(raw_analysis)
                    st.markdown('<div class="jd-ai-block">', unsafe_allow_html=True)
                    st.markdown("**AI Analysis**")
                    if analysis.get("analysis"):
                        st.write(analysis["analysis"])
                    c1, c2 = st.columns(2)
                    with c1:
                        sev = analysis.get("severity_assessment", "")
                        if sev:
                            col = "🔴" if sev in ("high","critical") else "🟡" if sev == "moderate" else "🟢"
                            st.caption(f"Severity: {col} {sev}")
                    with c2:
                        if analysis.get("recommendation"):
                            st.caption(f"Rec: {analysis['recommendation']}")
                    if analysis.get("key_pattern"):
                        st.caption(f"Pattern: {analysis['key_pattern']}")
                    st.markdown('</div>', unsafe_allow_html=True)
                except (json.JSONDecodeError, TypeError):
                    st.markdown(f'<div class="jd-ai-block">{raw_analysis}</div>', unsafe_allow_html=True)

            elif already_queued:
                st.caption("⏳ AI analysis queued — results appear after refresh")

            elif is_owner:
                if p < 6.0:
                    st.caption(f"⚠ Priority {p:.1f} is below AI threshold (6.0). Can still run manually.")
                if st.button("Run AI analysis", key=f"ai_{alert_id}"):
                    r = api("POST", f"/api/patterns/alerts/{alert_id}/analyze")
                    status = r.get("status", "")
                    from shared import notify
                    if status == "queued":
                        st.session_state["ai_queued_ids"].add(alert_id)
                        notify("AI analysis queued — refresh in a moment.", "info")
                    elif status == "already_analyzed":
                        notify("Analysis already cached.", "info")
                        st.cache_data.clear()
                    else:
                        notify(f"Unexpected response: {status or r.get('error','?')}", "warning")
                    st.rerun()

            dates = json_list(alert.get("supporting_dates"))
            if dates:
                st.caption("Supporting dates: " + ", ".join(dates))

            c_ack, c_pkt = st.columns(2)
            with c_ack:
                if st.button("✓ Acknowledge", key=f"ack_{alert_id}"):
                    api("POST", f"/api/patterns/alerts/{alert_id}/acknowledge")
                    st.session_state["ai_queued_ids"].discard(alert_id)
                    st.cache_data.clear()
                    st.rerun()
            with c_pkt:
                if is_owner and st.button("Generate packet", key=f"pkt_{alert_id}"):
                    st.session_state["prefill_alert_id"] = alert_id
                    from shared import notify
                    notify("Alert pre-filled — go to Exports.", "info")
                    st.rerun()

# ── Run detection ─────────────────────────────────────────────────────────────
if is_owner:
    st.markdown('<div style="height:1px;background:var(--border);margin:16px 0;"></div>', unsafe_allow_html=True)
    if st.button("▶ Run pattern detection now"):
        with st.spinner("Running detectors…"):
            r = api("POST", "/api/patterns/run")
        created = r.get("alerts_created", 0)
        from shared import notify
        notify(f"Detection complete — {created} new alert(s)." if created else "Detection complete — no new alerts.",
               "warning" if created else "success")
        st.cache_data.clear()
        st.rerun()

# ── Weekly rollups ────────────────────────────────────────────────────────────
st.markdown('<div class="jd-section-label">Weekly Rollups</div>', unsafe_allow_html=True)

week_rollups = [
    r for r in rollups
    if r.get("period_type") == "week"
    and start_date <= r.get("period_start", "") <= end_date
]

if not week_rollups:
    st.caption("No rollups in this date range.")
for r in week_rollups:
    label = (
        f"Week of {r['period_start']}  ·  "
        f"{r.get('entry_count', 0)} entries  ·  "
        f"avg mood {r.get('avg_mood_score', '—')}"
    )
    with st.expander(label):
        st.write(r.get("summary_text", ""))
        tags = json_list(r.get("dominant_tags"))
        if tags:
            st.caption("Dominant tags: " + ", ".join(tags))
