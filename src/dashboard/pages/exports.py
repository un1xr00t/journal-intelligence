"""pages/exports.py — Export Packets page (owner only)"""
import streamlit as st
from datetime import date
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared import (
    require_auth, show_notification, api,
    get_filters, load_alerts, page_header,
)

user     = require_auth()
is_owner = user.get("role") == "owner"
show_notification()
page_header("Exports", "generate & download case file packets")

if not is_owner:
    st.warning("Export generation is restricted to the owner account.")
    st.stop()

filters    = get_filters()
start_date = filters.get("start_date")
end_date   = filters.get("end_date")

# ── Options ───────────────────────────────────────────────────────────────────
col_redact, col_fmt = st.columns([1, 2])
with col_redact:
    redaction_on = st.toggle("Redaction ON", value=False)
    if redaction_on:
        st.warning("Sensitive values will be replaced with placeholders.")
with col_fmt:
    export_format = st.radio("Format", ["PDF", "HTML", "CSV", "JSON", "Markdown"], horizontal=True)

packet_type = st.selectbox("Packet type", [
    "weekly_digest", "incident_packet", "pattern_report",
    "therapy_summary", "chronology",
])

prefill_alert  = st.session_state.get("prefill_alert_id")
all_alerts     = load_alerts()
alert_options  = {f"{a['alert_type']} ({a.get('date_range_start','?')})": a["id"] for a in all_alerts}
selected_labels = st.multiselect(
    "Include alerts",
    options=list(alert_options.keys()),
    default=[k for k, v in alert_options.items() if v == prefill_alert] if prefill_alert else [],
)
selected_alert_ids = [alert_options[k] for k in selected_labels]

date_range_export = st.date_input(
    "Export date range",
    value=(date.fromisoformat(start_date) if start_date else date.today(),
           date.fromisoformat(end_date)   if end_date   else date.today()),
    key="export_date_range",
)

st.markdown('<div style="height:1px;background:var(--border);margin:16px 0;"></div>', unsafe_allow_html=True)

if st.button("Generate Packet", type="primary"):
    st.info("Export engine coming soon — API endpoint ready at POST /api/export/generate.")
