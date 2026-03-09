"""pages/people_topics.py — People & Topics page"""
import altair as alt
import pandas as pd
import streamlit as st
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared import (
    require_auth, show_notification, json_list,
    load_all_entries, load_entities, page_header, AXIS_STYLE,
)

require_auth()
show_notification()
page_header("People & Topics", "entity frequency")

entities = load_entities()

if not entities:
    st.info("No entities detected yet.")
    st.stop()

people = [e for e in entities if e.get("type") == "PERSON"]
topics = [e for e in entities if e.get("type") == "TOPIC"]

accent  = st.session_state.get("mood_theme", {}).get("accent",   "#6366f1")
accent2 = st.session_state.get("mood_theme", {}).get("accent_2", "#8b5cf6")

col1, col2 = st.columns(2)

with col1:
    st.markdown('<div class="jd-section-label">People</div>', unsafe_allow_html=True)
    if people:
        df_p = pd.DataFrame(people[:20])
        bar = (
            alt.Chart(df_p)
            .mark_bar(color=accent, cornerRadiusEnd=3)
            .encode(
                x=alt.X("count:Q", axis=alt.Axis(title="Mentions", titleColor="#7a7998", titleFontSize=9, **AXIS_STYLE)),
                y=alt.Y("name:N", sort="-x", axis=alt.Axis(title=None, labelColor="#7a7998", labelFontSize=10)),
                tooltip=["name:N", "count:Q"],
            )
            .properties(height=min(40 * len(people[:20]), 400), background="transparent")
        )
        labels = bar.mark_text(align="left", dx=3, color="#7a7998", fontSize=9).encode(text="count:Q")
        st.altair_chart(bar + labels, use_container_width=True, theme=None)

with col2:
    st.markdown('<div class="jd-section-label">Topics</div>', unsafe_allow_html=True)
    if topics:
        df_t = pd.DataFrame(topics[:20])
        bar_t = (
            alt.Chart(df_t)
            .mark_bar(color=accent2, cornerRadiusEnd=3)
            .encode(
                x=alt.X("count:Q", axis=alt.Axis(title="Mentions", titleColor="#7a7998", titleFontSize=9, **AXIS_STYLE)),
                y=alt.Y("name:N", sort="-x", axis=alt.Axis(title=None, labelColor="#7a7998", labelFontSize=10)),
                tooltip=["name:N", "count:Q"],
            )
            .properties(height=min(40 * len(topics[:20]), 400), background="transparent")
        )
        labels_t = bar_t.mark_text(align="left", dx=3, color="#7a7998", fontSize=9).encode(text="count:Q")
        st.altair_chart(bar_t + labels_t, use_container_width=True, theme=None)

# ── Drill-down ────────────────────────────────────────────────────────────────
st.markdown('<div class="jd-section-label">Drill Down</div>', unsafe_allow_html=True)

entity_names    = [e["name"] for e in entities]
selected_entity = st.selectbox("Select entity", ["— none —"] + entity_names)

if selected_entity and selected_entity != "— none —":
    all_entries = load_all_entries()

    def _has_entity(entry, name: str) -> bool:
        for ent in json_list(entry.get("entities")):
            if isinstance(ent, dict):
                if ent.get("name", "").lower() == name.lower():
                    return True
            elif isinstance(ent, str) and ent.lower() == name.lower():
                return True
        return False

    entity_entries = [e for e in all_entries if _has_entity(e, selected_entity)]
    st.caption(f"{len(entity_entries)} entries mention **{selected_entity}**")
    for e in entity_entries:
        with st.expander(f"{e['entry_date']}  ·  {e.get('mood_label','—')}  ·  sev {e.get('severity','—')}"):
            st.write(e.get("summary_text") or "_No summary._")
