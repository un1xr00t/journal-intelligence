"""
src/dashboard/app.py
Journal Dashboard — multipage entry point.
Handles: auth, global CSS + mood theme, sidebar, navigation routing.
Tested on Streamlit 1.54.
"""
import streamlit as st
from datetime import date, timedelta
from pathlib import Path

from session_manager import SessionManager

try:
    from mood_theme import get_theme, invalidate_cache, score_to_bucket
    _THEME_OK = True
except ImportError:
    _THEME_OK = False

# ── Page config ───────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Journal",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Inject IMMEDIATELY after page config — before auth check, before any render.
# Hides the auto-discovered sidebar nav so it never flashes on the login screen
# or on the cookie-loading spinner pass. Revealed below once auth passes.
st.markdown("""<style>
[data-testid="stSidebarNav"],
[data-testid="stSidebarNavLink"],
[data-testid="stSidebarNavSeparator"] { display: none !important; }
</style>""", unsafe_allow_html=True)

# ══════════════════════════════════════════════════════════════════════════════
#  GLOBAL CSS
#  All color values use CSS custom properties driven by mood theme.
#  Injected once here; overridden per-theme via :root {} block below.
# ══════════════════════════════════════════════════════════════════════════════

GLOBAL_CSS = """
/* ── Material Icons (self-hosted, Google Fonts CDN blocked on VPS) ────────── */
@font-face {
  font-family: 'Material Icons';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/materialicons/v142/flUhRq6tzZclQEJ-Vdg-IuiaDsNcIhQ8tQ.woff2) format('woff2');
}

/* ── Default token values (overridden by mood theme block) ────────────────── */
:root {
  --bg-base:        #07070f;
  --bg-surface:     #0c0c18;
  --bg-card:        #10101e;
  --bg-sidebar:     #05050c;
  --border:         rgba(255,255,255,0.07);
  --border-strong:  rgba(255,255,255,0.13);
  --accent:         #6366f1;
  --accent-2:       #8b5cf6;
  --accent-soft:    rgba(99,102,241,0.12);
  --accent-glow:    rgba(99,102,241,0.06);
  --text-primary:   #f0eff8;
  --text-secondary: #7a7998;
  --text-muted:     #45445a;
  --status-ok:      #10b981;
  --status-warn:    #f59e0b;
  --status-danger:  #ef4444;
}

/* ── Base reset ───────────────────────────────────────────────────────────── */
html, body,
[data-testid="stApp"],
[data-testid="stAppViewContainer"],
[data-testid="stMain"],
.main {
  background-color: var(--bg-base) !important;
  color: var(--text-primary) !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
}
.block-container {
  padding: 0 24px 40px !important;
  max-width: 100% !important;
}

/* ── Streamlit chrome — hide dev menu ─────────────────────────────────────── */
#MainMenu, footer, [data-testid="stDeployButton"],
[data-testid="stMainMenuPopover"],
[data-testid="stToolbarActions"] button[aria-label="Settings"],
[data-testid="stToolbarActions"] button[title="Settings"] {
  display: none !important;
  visibility: hidden !important;
}
[data-testid="stHeader"],
[data-testid="stDecoration"],
[data-testid="stToolbar"],
header[data-testid="stHeader"] {
  background-color: var(--bg-base) !important;
  border-bottom: 1px solid var(--border) !important;
}

/* ── Sidebar structural reset ─────────────────────────────────────────────── */
[data-testid="stSidebar"],
[data-testid="stSidebar"] > div:first-child {
  background-color: var(--bg-sidebar) !important;
  border-right: 1px solid var(--border) !important;
  width: 248px !important;
  min-width: 248px !important;
  max-width: 248px !important;
}

/* ── CSS ORDER TRICK: brand content (stSidebarContent) floats above nav ─── */
/* Streamlit renders stSidebarNav first, stSidebarContent second in DOM.     */
/* We flip their visual order so brand appears above nav links.              */
[data-testid="stSidebar"] > div:first-child {
  display: flex !important;
  flex-direction: column !important;
}
[data-testid="stSidebarNav"] {
  order: 2 !important;
  flex-shrink: 0 !important;
}
[data-testid="stSidebarContent"] {
  order: 1 !important;
  flex-shrink: 0 !important;
}
/* Separator between brand content and nav */
[data-testid="stSidebarNav"]::before {
  content: '';
  display: block;
  height: 1px;
  background: var(--border);
  margin: 0 16px 8px;
}

/* ── Sidebar nav link styling ─────────────────────────────────────────────── */
[data-testid="stSidebarNavLink"] {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 8px 14px !important;
  border-radius: 8px !important;
  margin: 1px 8px !important;
  color: var(--text-secondary) !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  text-decoration: none !important;
  transition: background 0.12s, color 0.12s !important;
  border: 1px solid transparent !important;
}
[data-testid="stSidebarNavLink"]:hover {
  background: rgba(255,255,255,0.04) !important;
  color: var(--text-primary) !important;
}
[data-testid="stSidebarNavLink"][aria-current="page"] {
  background: var(--accent-soft) !important;
  color: var(--accent) !important;
  border-color: rgba(99,102,241,0.18) !important;
  font-weight: 600 !important;
}
/* Nav section label */
[data-testid="stSidebarNavSeparator"] {
  margin: 8px 16px 4px !important;
  font-size: 9.5px !important;
  color: var(--text-muted) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.1em !important;
  font-weight: 700 !important;
}
/* Nav icon */
[data-testid="stSidebarNavLink"] span:first-child {
  font-size: 15px !important;
  opacity: 0.7 !important;
}
[data-testid="stSidebarNavLink"][aria-current="page"] span:first-child {
  opacity: 1 !important;
}

/* ── Sidebar user content area ────────────────────────────────────────────── */
[data-testid="stSidebarContent"] {
  padding: 0 !important;
  overflow: visible !important;
}
[data-testid="stSidebar"] [data-testid="stVerticalBlock"] {
  gap: 0 !important;
}
[data-testid="stSidebar"] [data-testid="stSlider"],
[data-testid="stSidebar"] [data-testid="stSelectbox"],
[data-testid="stSidebar"] [data-testid="stTextInput"] {
  padding: 0 16px !important;
}
[data-testid="stSidebar"] [data-testid="stButton"] {
  padding: 2px 12px !important;
}
[data-testid="stSidebar"] [data-testid="stButton"] button {
  font-size: 12px !important;
  padding: 6px 12px !important;
}
[data-testid="stSidebar"] hr { margin: 6px 16px !important; }

/* Sidebar label styling */
[data-testid="stSidebar"] .stSlider label,
[data-testid="stSidebar"] .stSelectbox label,
[data-testid="stSidebar"] .stTextInput label {
  color: var(--text-muted) !important;
  font-size: 10px !important;
  text-transform: uppercase !important;
  letter-spacing: 0.1em !important;
  font-weight: 700 !important;
}

/* ── Typography ───────────────────────────────────────────────────────────── */
h1, h2, h3, h4, h5, h6,
.stMarkdown, .stText, p, span, label,
[data-testid="stMarkdownContainer"] p {
  color: var(--text-primary) !important;
}
h1 { font-size: 1.4rem !important; font-weight: 700 !important; letter-spacing: -0.025em !important; }
h2 { font-size: 1.1rem !important; font-weight: 600 !important; letter-spacing: -0.015em !important; }
h3 { font-size: 0.95rem !important; font-weight: 600 !important; }
.stCaption, small { color: var(--text-secondary) !important; font-size: 11.5px !important; }

/* ── Expander cards ───────────────────────────────────────────────────────── */
[data-testid="stExpander"] {
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  border-radius: 10px !important;
  margin-bottom: 8px !important;
  overflow: hidden !important;
  transition: border-color 0.15s !important;
}
[data-testid="stExpander"]:hover { border-color: var(--border-strong) !important; }
[data-testid="stExpander"] summary {
  color: var(--text-primary) !important;
  background: transparent !important;
  padding: 12px 16px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  border-radius: 10px !important;
}
[data-testid="stExpander"] summary:hover { background: rgba(255,255,255,0.02) !important; }
[data-testid="stExpander"] details[open] > summary {
  background: transparent !important;
  border-bottom: 1px solid var(--border) !important;
  border-radius: 10px 10px 0 0 !important;
}
[data-testid="stExpander"] [data-testid="stExpanderDetails"] {
  background: transparent !important;
  padding: 14px 16px !important;
}

/* ── Inputs ───────────────────────────────────────────────────────────────── */
[data-testid="stTextInput"] input,
[data-testid="stDateInput"] input,
[data-testid="stNumberInput"] input {
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-primary) !important;
  border-radius: 8px !important;
  font-size: 13px !important;
}
[data-testid="stTextInput"] input:focus,
[data-testid="stDateInput"] input:focus {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 2px var(--accent-soft) !important;
}

/* ── Select ───────────────────────────────────────────────────────────────── */
[data-testid="stSelectbox"] [data-baseweb="select"],
[data-testid="stSelectbox"] [data-baseweb="select"] > div,
[data-testid="stMultiSelect"] [data-baseweb="select"],
[data-testid="stMultiSelect"] [data-baseweb="select"] > div {
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-primary) !important;
  border-radius: 8px !important;
}
[data-testid="stSelectbox"] [data-baseweb="select"] span,
[data-testid="stSelectbox"] [data-baseweb="select"] [class*="singleValue"],
[data-testid="stSelectbox"] [data-baseweb="select"] [class*="placeholder"] {
  color: var(--text-primary) !important;
  font-size: 13px !important;
}
[data-testid="stSelectbox"] [data-baseweb="popover"],
[data-testid="stSelectbox"] [data-baseweb="menu"],
[data-testid="stSelectbox"] ul,
[data-baseweb="menu"] {
  background: var(--bg-card) !important;
  border: 1px solid var(--border-strong) !important;
  border-radius: 8px !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
}
[data-testid="stSelectbox"] li,
[data-testid="stSelectbox"] [role="option"],
[data-baseweb="menu"] li,
[data-baseweb="menu"] [role="option"] {
  background: transparent !important;
  color: var(--text-primary) !important;
  font-size: 13px !important;
}
[data-testid="stSelectbox"] li:hover,
[data-testid="stSelectbox"] [role="option"]:hover,
[data-baseweb="menu"] li:hover,
[data-baseweb="menu"] [role="option"]:hover,
[data-testid="stSelectbox"] [aria-selected="true"] {
  background: var(--accent-soft) !important;
}

/* ── Calendar popup ───────────────────────────────────────────────────────── */
[data-baseweb="calendar"],
[data-baseweb="datepicker"],
[data-baseweb="popover"],
[data-baseweb="popover"] > div {
  background: var(--bg-card) !important;
  border: 1px solid var(--border-strong) !important;
  border-radius: 10px !important;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6) !important;
}
[data-baseweb="calendar"] *, [data-baseweb="datepicker"] * {
  color: var(--text-primary) !important;
  background: transparent !important;
}
[data-baseweb="calendar"] [aria-selected="true"],
[data-baseweb="calendar"] [data-selected="true"] {
  background: var(--accent) !important;
  border-radius: 50% !important;
}
[data-baseweb="calendar"] [aria-selected="true"] * { color: #fff !important; }
[data-baseweb="calendar"] div[role="button"]:hover { background: var(--accent-soft) !important; }
[data-baseweb="calendar"] button {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: 6px !important;
  color: var(--text-primary) !important;
}
[data-baseweb="calendar"] button:hover { background: var(--accent-soft) !important; }

/* ── Buttons ──────────────────────────────────────────────────────────────── */
[data-testid="stButton"] button,
[data-testid="stFormSubmitButton"] button {
  background: var(--bg-card) !important;
  border: 1px solid var(--border-strong) !important;
  color: var(--text-secondary) !important;
  border-radius: 8px !important;
  font-size: 12.5px !important;
  font-weight: 500 !important;
  transition: all 0.12s !important;
}
[data-testid="stButton"] button:hover { border-color: var(--accent) !important; color: var(--accent) !important; background: var(--accent-soft) !important; }
[data-testid="stButton"] button[kind="primary"],
[data-testid="stFormSubmitButton"] button {
  background: linear-gradient(135deg, var(--accent), var(--accent-2)) !important;
  border-color: transparent !important;
  color: #fff !important;
  font-weight: 600 !important;
}
[data-testid="stButton"] button[kind="primary"]:hover { opacity: 0.9 !important; color: #fff !important; }

/* ── Metrics ──────────────────────────────────────────────────────────────── */
[data-testid="stMetric"] {
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  border-radius: 10px !important;
  padding: 16px 18px !important;
}
[data-testid="stMetricValue"] { color: var(--text-primary) !important; font-size: 1.5rem !important; font-weight: 700 !important; letter-spacing: -0.02em !important; }
[data-testid="stMetricLabel"] { color: var(--text-muted) !important; font-size: 10.5px !important; text-transform: uppercase !important; letter-spacing: 0.09em !important; font-weight: 600 !important; }

/* ── Status / alert boxes ─────────────────────────────────────────────────── */
[data-testid="stSuccess"] { background: rgba(16,185,129,0.07) !important; border: 1px solid rgba(16,185,129,0.18) !important; border-radius: 8px !important; }
[data-testid="stInfo"]    { background: rgba(99,102,241,0.07) !important; border: 1px solid rgba(99,102,241,0.18) !important; border-radius: 8px !important; }
[data-testid="stWarning"] { background: rgba(245,158,11,0.07) !important; border: 1px solid rgba(245,158,11,0.18) !important; border-radius: 8px !important; }
[data-testid="stError"]   { background: rgba(239,68,68,0.07) !important; border: 1px solid rgba(239,68,68,0.18) !important; border-radius: 8px !important; }

/* ── Dividers ─────────────────────────────────────────────────────────────── */
hr { border-color: var(--border) !important; margin: 12px 0 !important; }

/* ── Toast ────────────────────────────────────────────────────────────────── */
[data-testid="stToast"], div[class*="toast"] {
  background: var(--bg-card) !important;
  border: 1px solid var(--border-strong) !important;
  border-left: 2px solid var(--accent) !important;
  color: var(--text-primary) !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
  border-radius: 10px !important;
  font-size: 13px !important;
}
[data-testid="stToast"] p,
[data-testid="stToast"] span,
[data-testid="stToast"] div { color: var(--text-primary) !important; }
[data-testid="stToast"] button { color: var(--text-muted) !important; background: transparent !important; border: none !important; }

/* ── Scrollbar ────────────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent-soft); }

/* ── Toggle, checkbox, radio ──────────────────────────────────────────────── */
[data-testid="stToggle"] [data-baseweb="checkbox"] { background: var(--bg-card) !important; }
[data-testid="stCheckbox"] label,
[data-testid="stRadio"] label { color: var(--text-secondary) !important; font-size: 13px !important; }

/* ── Multiselect tags ─────────────────────────────────────────────────────── */
[data-testid="stMultiSelect"] [data-baseweb="tag"] { background: var(--accent-soft) !important; color: #a5b4fc !important; border-radius: 5px !important; }

/* ── Dataframe ────────────────────────────────────────────────────────────── */
[data-testid="stDataFrame"] { background: var(--bg-card) !important; border: 1px solid var(--border) !important; border-radius: 10px !important; }

/* ── Blockquote ───────────────────────────────────────────────────────────── */
blockquote {
  border-left: 2px solid var(--accent) !important;
  padding: 8px 14px !important;
  background: var(--accent-glow) !important;
  border-radius: 0 6px 6px 0 !important;
  color: var(--text-secondary) !important;
  font-style: italic !important;
  margin: 6px 0 !important;
}

/* ── Badge ────────────────────────────────────────────────────────────────── */
[data-testid="stBadge"] { background: var(--accent-soft) !important; color: #a5b4fc !important; border-radius: 5px !important; font-size: 10.5px !important; font-weight: 500 !important; padding: 2px 7px !important; }

/* ── Slider ───────────────────────────────────────────────────────────────── */
[data-testid="stSlider"] [data-baseweb="slider"] [role="slider"] { background: var(--accent) !important; }

/* ── Layout components ────────────────────────────────────────────────────── */
.jd-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}
.jd-stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  position: relative;
  overflow: hidden;
}
.jd-stat-card::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  opacity: 0.5;
}
.jd-stat-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  margin-bottom: 7px;
}
.jd-stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.025em;
  line-height: 1;
}
.jd-stat-delta {
  font-size: 11px;
  margin-top: 5px;
  font-weight: 500;
}
.jd-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: var(--text-muted);
  margin: 18px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.jd-ai-block {
  background: rgba(99,102,241,0.07);
  border-left: 2px solid var(--accent);
  border-radius: 0 6px 6px 0;
  padding: 10px 14px;
  color: var(--text-primary);
  font-size: 13px;
  margin: 8px 0;
}
"""

st.markdown(f"<style>{GLOBAL_CSS}</style>", unsafe_allow_html=True)

# ── Auth ──────────────────────────────────────────────────────────────────────

_sm = SessionManager()
if not _sm.is_authenticated():
    _sm.show_login_page()
    st.stop()

# Auth passed — reveal the nav now. Also override with styled version from GLOBAL_CSS.
st.markdown("""<style>
[data-testid="stSidebarNav"],
[data-testid="stSidebarNavLink"],
[data-testid="stSidebarNavSeparator"] { display: flex !important; }
</style>""", unsafe_allow_html=True)

user     = st.session_state.get("user", {})
is_owner = user.get("role") == "owner"

# ── Mood theme ────────────────────────────────────────────────────────────────

from api_client import safe_api

def _get_recent_mood():
    if "mood_score_cache" in st.session_state:
        return st.session_state["mood_score_cache"]
    try:
        r = safe_api("GET", "/api/entries", st.session_state, params={"limit": 5})
        for e in r.get("entries", []):
            if e.get("mood_score") is not None:
                result = (float(e["mood_score"]), e.get("mood_label", "neutral") or "neutral")
                st.session_state["mood_score_cache"] = result
                return result
    except Exception:
        pass
    result = (None, "neutral")
    st.session_state["mood_score_cache"] = result
    return result


def _inject_theme():
    if "mood_theme" in st.session_state:
        return st.session_state["mood_theme"]
    if not _THEME_OK:
        return {}
    score, label = _get_recent_mood()
    theme = get_theme(score, label)
    st.session_state["mood_theme"] = theme
    return theme


theme = _inject_theme()

if theme:
    bg_url     = theme.get("bg_url", "")
    bg_opacity = theme.get("bg_img_opacity", "0.12")
    mesh       = theme.get("gradient_mesh", "")

    # Sidebar background = mood photo + dark overlay + gradient mesh
    sidebar_bg_layers = ""
    if bg_url:
        sidebar_bg_layers = f"""
/* ── Mood photo behind sidebar only ───────────────────────────────────────── */
[data-testid="stSidebar"] > div:first-child {{
  background:
    linear-gradient(160deg, rgba(7,7,15,0.78) 0%, rgba(7,7,15,0.88) 100%),
    {mesh.replace("0.12) 0%", "0.3) 0%").replace("0.08) 0%", "0.2) 0%")},
    url('{bg_url}') center/cover !important;
}}"""

    theme_css = f"""
<style>
:root {{
  --bg-base:        {theme.get("bg_base",      "#07070f")};
  --bg-surface:     {theme.get("bg_surface",   "#0c0c18")};
  --bg-card:        {theme.get("bg_card",       "#10101e")};
  --bg-sidebar:     {theme.get("sidebar_bg",    "#05050c")};
  --border:         {theme.get("border",        "rgba(255,255,255,0.07)")};
  --border-strong:  {theme.get("border_strong", "rgba(255,255,255,0.13)")};
  --accent:         {theme.get("accent",        "#6366f1")};
  --accent-2:       {theme.get("accent_2",      "#8b5cf6")};
  --accent-soft:    {theme.get("accent_soft",   "rgba(99,102,241,0.12)")};
  --accent-glow:    {theme.get("accent_glow",   "rgba(99,102,241,0.06)")};
  --text-primary:   {theme.get("text_primary",  "#f0eff8")};
  --text-secondary: {theme.get("text_secondary","#7a7998")};
  --text-muted:     {theme.get("text_muted",    "#45445a")};
  --status-ok:      {theme.get("status_ok",     "#10b981")};
  --status-warn:    {theme.get("status_warn",   "#f59e0b")};
  --status-danger:  {theme.get("status_danger", "#ef4444")};
}}
[data-testid="stApp"],
[data-testid="stAppViewContainer"] {{
  background: var(--bg-base) !important;
}}
{sidebar_bg_layers}
</style>"""
    st.markdown(theme_css, unsafe_allow_html=True)

# ── Sidebar ───────────────────────────────────────────────────────────────────

theme_name = theme.get("name", "Journal") if theme else "Journal"
emotion    = theme.get("emotion", "") if theme else ""
bucket     = theme.get("bucket", "") if theme else ""

with st.sidebar:
    # ── Brand header ──────────────────────────────────────────────────────────
    accent_val = theme.get("accent", "#6366f1") if theme else "#6366f1"
    accent2_val = theme.get("accent_2", "#8b5cf6") if theme else "#8b5cf6"
    st.markdown(f"""
    <div style="padding:18px 16px 14px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="
          width:34px;height:34px;border-radius:9px;flex-shrink:0;
          background:linear-gradient(135deg,{accent_val},{accent2_val});
          display:flex;align-items:center;justify-content:center;
          font-size:16px;
        ">✦</div>
        <div>
          <div style="color:var(--text-primary);font-size:13.5px;font-weight:700;letter-spacing:-0.01em;">Journal</div>
          <div style="color:var(--text-muted);font-size:9.5px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">Intelligence</div>
        </div>
      </div>
      <div style="
        background:rgba(255,255,255,0.04);border:1px solid var(--border);
        border-radius:7px;padding:7px 10px;
        display:flex;align-items:center;gap:7px;
      ">
        <div style="width:6px;height:6px;border-radius:50%;background:var(--status-ok);flex-shrink:0;box-shadow:0 0 5px var(--status-ok);"></div>
        <div>
          <div style="color:var(--text-secondary);font-size:12px;font-weight:500;">{user.get("username","?")}</div>
          <div style="color:var(--text-muted);font-size:9.5px;letter-spacing:0.05em;text-transform:uppercase;">{user.get("role","?")}</div>
        </div>
      </div>
      {f'<div style="margin-top:10px;color:var(--text-muted);font-size:10.5px;font-style:italic;">{emotion}</div>' if emotion else ""}
    </div>
    """, unsafe_allow_html=True)

    # ── Filters ────────────────────────────────────────────────────────────────
    st.markdown('<div style="padding:0 16px;"><div style="font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.12em;font-weight:700;margin-bottom:8px;">Filters</div></div>', unsafe_allow_html=True)

    severity_range = st.slider("Severity", 0.0, 10.0, (0.0, 10.0), step=0.5)
    mood_options   = ["All", "calm", "anxious", "sad", "angry", "mixed"]
    selected_mood  = st.selectbox("Mood", mood_options)
    search_query   = st.text_input("Search", "", placeholder="keywords…")

    from datetime import date as _date, timedelta as _td
    if "global_date_range" not in st.session_state:
        st.session_state["global_date_range"] = (_date.today() - _td(days=90), _date.today())

    date_range = st.date_input(
        "Date range",
        value=st.session_state["global_date_range"],
        key="global_date_range",
        label_visibility="collapsed",
    )
    start_date, end_date = (
        (date_range[0], date_range[1]) if len(date_range) == 2
        else (date_range[0], _date.today())
    )

    # Store filters in session_state for all pages to read
    st.session_state["filters"] = {
        "start_date":   str(start_date),
        "end_date":     str(end_date),
        "severity_min": severity_range[0],
        "severity_max": severity_range[1],
        "mood":         None if selected_mood == "All" else selected_mood,
        "search":       search_query or None,
        "entity":       None,
    }

    st.markdown('<div style="height:1px;background:var(--border);margin:10px 16px;"></div>', unsafe_allow_html=True)

    # ── Alerts summary ─────────────────────────────────────────────────────────
    from shared import load_alerts as _load_alerts
    alerts_sb = _load_alerts()
    high_sb   = [a for a in alerts_sb if a.get("priority_score", 0) >= 7]
    med_sb    = [a for a in alerts_sb if 4 <= a.get("priority_score", 0) < 7]

    st.markdown('<div style="padding:0 16px;"><div style="font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.12em;font-weight:700;margin-bottom:8px;">Alerts</div>', unsafe_allow_html=True)
    if high_sb:
        st.markdown(f"""<div style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.18);border-radius:7px;padding:8px 10px;margin-bottom:5px;">
        <div style="color:#fca5a5;font-size:11.5px;font-weight:600;">● {len(high_sb)} critical</div>
        {''.join(f'<div style="color:var(--text-muted);font-size:10px;margin-top:2px;">· {a["alert_type"].replace("_"," ")}</div>' for a in high_sb[:2])}
        </div>""", unsafe_allow_html=True)
    if med_sb:
        st.markdown(f"""<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.15);border-radius:7px;padding:8px 10px;margin-bottom:5px;">
        <div style="color:#fcd34d;font-size:11.5px;font-weight:600;">◐ {len(med_sb)} active</div></div>""", unsafe_allow_html=True)
    if not high_sb and not med_sb:
        st.markdown('<div style="color:var(--text-muted);font-size:11px;padding:4px 0;">No active alerts</div>', unsafe_allow_html=True)
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown('<div style="height:1px;background:var(--border);margin:10px 16px;"></div>', unsafe_allow_html=True)

    # ── Theme badge ────────────────────────────────────────────────────────────
    if theme_name and _THEME_OK:
        st.markdown(f"""
        <div style="padding:0 16px 10px;">
          <div style="font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.12em;font-weight:700;margin-bottom:6px;">Mood Theme</div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:7px;padding:8px 10px;">
            <div style="color:var(--accent);font-size:11.5px;font-weight:600;">{theme_name}</div>
            <div style="color:var(--text-muted);font-size:10px;margin-top:2px;text-transform:capitalize;">{bucket} · {emotion}</div>
          </div>
        </div>""", unsafe_allow_html=True)

    st.markdown('<div style="height:1px;background:var(--border);margin:0 16px 10px;"></div>', unsafe_allow_html=True)

    # ── Actions ────────────────────────────────────────────────────────────────
    col_r, col_s = st.columns(2)
    with col_r:
        if st.button("Refresh", use_container_width=True):
            st.cache_data.clear()
            st.session_state.pop("mood_theme", None)
            st.session_state.pop("mood_score_cache", None)
            st.rerun()
    with col_s:
        if st.button("Sign out", use_container_width=True):
            _sm.logout()

    if is_owner and _THEME_OK:
        if st.button("↺ Regen theme", use_container_width=True):
            if bucket:
                invalidate_cache(bucket)
            st.session_state.pop("mood_theme", None)
            st.session_state.pop("mood_score_cache", None)
            st.cache_data.clear()
            st.rerun()

# ── Navigation ────────────────────────────────────────────────────────────────

_base_pages = [
    st.Page("pages/timeline.py",      title="Timeline",        icon="📅"),
    st.Page("pages/patterns.py",       title="Patterns",        icon="📊"),
    st.Page("pages/people_topics.py",  title="People & Topics", icon="👥"),
    st.Page("pages/nervous_system.py", title="Nervous System",  icon="🫀"),
    st.Page("pages/evidence.py",       title="Evidence Vault",  icon="🗄"),
    st.Page("pages/contradictions.py", title="Contradictions",  icon="⚡"),
]

_owner_pages = [
    st.Page("pages/exports.py", title="Exports", icon="📤"),
    st.Page("pages/admin.py",   title="Admin",   icon="⚙️"),
]

nav_map = {"": _base_pages}
if is_owner:
    nav_map["Owner"] = _owner_pages

pg = st.navigation(nav_map)
pg.run()
