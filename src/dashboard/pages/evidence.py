"""pages/evidence.py — Evidence Vault page"""
import streamlit as st
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared import (
    require_auth, show_notification, api, json_list,
    get_filters, load_evidence, page_header,
)

user     = require_auth()
is_owner = user.get("role") == "owner"
show_notification()
page_header("Evidence Vault", "bookmarked items & flagged quotes")

filters    = get_filters()
start_date = filters.get("start_date", "")
end_date   = filters.get("end_date",   "")

col_type, col_bm = st.columns([3, 1])
with col_type:
    ev_type_filter = st.selectbox(
        "Filter by type",
        ["All", "statement", "event", "admission", "contradiction", "observation"],
        key="ev_type",
    )
with col_bm:
    bookmarks_only = st.checkbox("Bookmarks only", key="ev_bm")

ev_type_val    = None if ev_type_filter == "All" else ev_type_filter
evidence_items = load_evidence(ev_type=ev_type_val, bookmarked_only=bookmarks_only)

# Date-filter client-side
evidence_items = [
    e for e in evidence_items
    if start_date <= (e.get("source_date") or "") <= end_date
]

if not evidence_items:
    st.info("No evidence items found.")
    st.stop()

st.markdown(f'<div class="jd-section-label">{len(evidence_items)} items</div>', unsafe_allow_html=True)

for ev in evidence_items:
    bm    = "📌 " if ev.get("is_bookmarked") else ""
    label = (
        f"{bm}{ev.get('label', '—')}  ·  "
        f"{ev.get('source_date', '?')}  ·  "
        f"{ev.get('evidence_type', '?')}"
    )
    with st.expander(label):
        if ev.get("quote_text"):
            st.markdown(f"> {ev['quote_text']}")
        if is_owner:
            if st.button("Remove", key=f"del_ev_{ev['id']}"):
                api("DELETE", f"/api/evidence/{ev['id']}")
                st.cache_data.clear()
                st.rerun()
