"""pages/contradictions.py — Contradictions & Admissions page"""
import json
import streamlit as st
from datetime import date
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared import (
    require_auth, show_notification, api, notify,
    get_filters, load_contradictions, page_header,
)

user     = require_auth()
is_owner = user.get("role") == "owner"
show_notification()
page_header("Contradictions", "flagged statement conflicts")

st.caption("Statement pairs where earlier positions conflict with later entries.")

filters    = get_filters()
start_date = filters.get("start_date", "")
end_date   = filters.get("end_date",   "")

contradictions = load_contradictions()
contradictions = [
    c for c in contradictions
    if start_date <= (c.get("date_a") or "") <= end_date
    or start_date <= (c.get("date_b") or "") <= end_date
]

if not contradictions:
    st.success("No contradictions detected in this date range.")
    st.stop()

st.markdown(f'<div class="jd-section-label">{len(contradictions)} flagged</div>', unsafe_allow_html=True)

for c in contradictions:
    label = (
        f"⚡ {c.get('date_a','?')} → {c.get('date_b','?')}  ·  "
        f"priority {c.get('priority_score', 0):.1f}"
    )
    with st.expander(label):
        col_a, col_b = st.columns(2)
        with col_a:
            st.caption(f"Statement — {c.get('date_a','?')}")
            st.write(c.get("statement_a") or "_—_")
        with col_b:
            st.caption(f"Conflicting — {c.get('date_b','?')}")
            st.write(c.get("statement_b") or "_—_")

        if c.get("description"):
            st.caption(c["description"])

        col_ev, col_ai = st.columns(2)
        with col_ev:
            if st.button("Add to evidence", key=f"ctr_ev_{c['id']}"):
                api("POST", "/api/evidence", json={
                    "entry_id":      c.get("entry_id_a") or c.get("entry_id_b"),
                    "alert_id":      c["id"],
                    "label":         f"Contradiction {c.get('date_a')} → {c.get('date_b')}",
                    "quote_text":    f"A: {c.get('statement_a','')} | B: {c.get('statement_b','')}",
                    "evidence_type": "contradiction",
                    "source_date":   c.get("date_a") or str(date.today()),
                })
                notify("Added to Evidence Vault", "success")
                st.rerun()

        with col_ai:
            if is_owner and not c.get("ai_analysis"):
                already_q = c["id"] in st.session_state.get("ai_queued_ids", set())
                if already_q:
                    st.caption("⏳ AI analysis queued")
                elif st.button("Run AI analysis", key=f"ctr_ai_{c['id']}"):
                    r = api("POST", f"/api/patterns/alerts/{c['id']}/analyze")
                    if r.get("status") == "queued":
                        st.session_state.setdefault("ai_queued_ids", set()).add(c["id"])
                        notify("AI analysis queued — refresh in a moment.", "info")
                    st.rerun()
            elif c.get("ai_analysis"):
                try:
                    analysis = json.loads(c["ai_analysis"])
                    st.markdown(
                        f'<div class="jd-ai-block">{analysis.get("analysis", c["ai_analysis"])}</div>',
                        unsafe_allow_html=True,
                    )
                except (json.JSONDecodeError, TypeError):
                    st.markdown(f'<div class="jd-ai-block">{c["ai_analysis"]}</div>', unsafe_allow_html=True)
