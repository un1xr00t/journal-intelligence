"""pages/timeline.py — Timeline page"""
import pandas as pd
import streamlit as st
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared import (
    require_auth, show_notification, api, json_list,
    get_filters, load_entries, load_alerts,
    mood_chart, severity_chart, page_header, stats_row,
)

user = require_auth()
show_notification()
page_header("Timeline", "daily entries")

filters  = get_filters()
entries  = load_entries(filters)
start_date = filters.get("start_date", "")
end_date   = filters.get("end_date", "")

if not entries:
    st.info("No entries found for current filters.")
    st.stop()

# ── Stats bar ────────────────────────────────────────────────────────────────
mood_vals = [float(e["mood_score"]) for e in entries if e.get("mood_score") is not None]
sev_vals  = [float(e["severity"])   for e in entries if e.get("severity")   is not None]
avg_mood  = sum(mood_vals) / len(mood_vals) if mood_vals else None
avg_sev   = sum(sev_vals)  / len(sev_vals)  if sev_vals  else None
bookmarked = sum(1 for e in entries if e.get("is_bookmarked"))

mood_recent = mood_vals[-7:]   if len(mood_vals) >= 7  else mood_vals
mood_prior  = mood_vals[-14:-7] if len(mood_vals) >= 14 else []
if mood_recent and mood_prior:
    delta = sum(mood_recent)/len(mood_recent) - sum(mood_prior)/len(mood_prior)
    trend_txt = f"{'↑' if delta > 0 else '↓'} {delta:+.1f} vs prev 7d"
    trend_cls = "up" if delta > 0 else "down"
else:
    trend_txt, trend_cls = "— no comparison", "flat"

alerts_all    = load_alerts()
active_alerts = len(alerts_all)
alert_color   = "var(--status-danger)" if active_alerts >= 3 else "var(--status-warn)" if active_alerts > 0 else "var(--status-ok)"

st.markdown(f"""
<div style="
  background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;
  padding:18px 22px 14px;margin-bottom:20px;position:relative;overflow:hidden;
">
  <div style="position:absolute;top:0;left:0;right:0;height:2px;
    background:linear-gradient(90deg,var(--accent),var(--accent-2),transparent);"></div>
  <div style="font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.12em;font-weight:700;margin-bottom:14px;">
    Period Summary · {start_date} — {end_date}
  </div>
  {stats_row([
    {"label": "Entries",       "value": str(len(entries)),
     "delta": "in date range",       "delta_type": "flat"},
    {"label": "Avg Mood",      "value": f"{avg_mood:.1f}" if avg_mood is not None else "—",
     "delta": trend_txt,             "delta_type": trend_cls},
    {"label": "Avg Severity",  "value": f"{avg_sev:.1f}"  if avg_sev  is not None else "—",
     "delta": "0 calm → 10 crisis",  "delta_type": "flat"},
    {"label": "Active Alerts", "value": str(active_alerts),
     "delta": "requires attention" if active_alerts > 0 else "all clear",
     "delta_type": "down" if active_alerts >= 3 else "flat",
     "val_color": alert_color},
    {"label": "Bookmarked",    "value": str(bookmarked),
     "delta": "entries saved",       "delta_type": "flat"},
  ])}
</div>
""", unsafe_allow_html=True)

# ── Mood sparkline ────────────────────────────────────────────────────────────
mood_rows = [
    {"date": e["entry_date"], "mood": e["mood_score"]}
    for e in entries if e.get("mood_score") is not None
]
if mood_rows:
    df_m = pd.DataFrame(mood_rows)
    df_m["mood"] = pd.to_numeric(df_m["mood"], errors="coerce")
    df_m = df_m.dropna(subset=["mood"]).sort_values("date")
    if not df_m.empty:
        st.altair_chart(mood_chart(df_m, height=110), use_container_width=True, theme=None)

# ── Entry list ────────────────────────────────────────────────────────────────
st.markdown(f'<div class="jd-section-label">{len(entries)} entries</div>', unsafe_allow_html=True)

for entry in entries:
    tags       = json_list(entry.get("tags"))
    key_events = json_list(entry.get("key_events"))
    mood_score = entry.get("mood_score") or 0
    severity   = entry.get("severity")   or 0
    label = (
        f"{entry['entry_date']}  ·  "
        f"{entry.get('mood_label') or '—'}  ·  "
        f"sev {entry.get('severity') or '—'}"
    )
    with st.expander(label):
        col1, col2 = st.columns([3, 1])
        with col1:
            st.write(entry.get("summary_text") or "_No summary yet._")
            if key_events:
                st.caption("Key events: " + "  ·  ".join(key_events))
            for q in json_list(entry.get("notable_quotes"))[:2]:
                st.markdown(f"> {q}")
        with col2:
            for tag in tags[:8]:
                st.badge(tag)
            if st.button("Bookmark", key=f"bm_{entry['id']}"):
                r = api("POST", f"/api/entries/{entry['id']}/bookmark")
                from shared import notify
                notify("Bookmarked" if r.get("bookmarked") else "Bookmark removed", "success")
                st.rerun()
