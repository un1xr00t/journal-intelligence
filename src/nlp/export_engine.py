import json
"""
src/nlp/export_engine.py

Full export packet generation engine.
Supports: therapy_summary, incident_packet, pattern_report, weekly_digest, chronology
Formats:  pdf, html, md, json, csv

PDF via WeasyPrint (HTML→PDF). Falls back to ReportLab if WeasyPrint unavailable.
AI narrative uses daily summaries only — never raw journal text.
"""

import os
import json
import logging
import sqlite3
import textwrap
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import anthropic
import yaml

log = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────

from src.config import APP_ROOT as BASE_DIR, CONFIG_PATH, EXPORTS_DIR, load_config
DB_PATH    = BASE_DIR / "db" / "journal.db"
EXPORT_DIR = BASE_DIR / "data" / "derived" / "exports"
PROMPTS_PATH = BASE_DIR / "config" / "prompts.yaml"
CONFIG_PATH  = BASE_DIR / "config" / "config.yaml"
REDACTION_PATH = BASE_DIR / "config" / "redaction.yaml"

EXPORT_DIR.mkdir(parents=True, exist_ok=True)

# ── PDF Backend Detection ─────────────────────────────────────────────────────

def _pdf_backend():
    try:
        import weasyprint  # noqa: F401
        return "weasyprint"
    except Exception:
        pass
    try:
        from reportlab.pdfgen import canvas  # noqa: F401
        return "reportlab"
    except Exception:
        pass
    return None

PDF_BACKEND = _pdf_backend()
log.info(f"PDF backend: {PDF_BACKEND or 'NONE — PDF generation unavailable'}")


# ── Config helpers ─────────────────────────────────────────────────────────────

def _load_prompts() -> dict:
    with open(PROMPTS_PATH) as f:
        return yaml.safe_load(f)


def _load_redaction() -> dict:
    if REDACTION_PATH.exists():
        with open(REDACTION_PATH) as f:
            return yaml.safe_load(f) or {}
    return {}


def _anthropic_client() -> anthropic.Anthropic:
    with open(CONFIG_PATH) as f:
        cfg = yaml.safe_load(f)
    api_key = cfg.get("anthropic", {}).get("api_key") or os.environ.get("ANTHROPIC_API_KEY")
    return anthropic.Anthropic(api_key=api_key)


# ── DB helpers ─────────────────────────────────────────────────────────────────

def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _fetch_data(date_start: str, date_end: str) -> dict:
    """Pull entries, summaries, alerts, and evidence for a date range."""
    conn = _db()
    try:
        # Entries + summaries (JOIN)
        entries = conn.execute("""
            SELECT
                e.id, e.entry_date, e.normalized_text,
                ds.summary_text, ds.mood_label, ds.mood_score, ds.severity,
                ds.key_events, ds.entities, ds.tags, ds.notable_quotes,
                ds.contradiction_flags
            FROM entries e
            LEFT JOIN derived_summaries ds ON ds.entry_id = e.id
            WHERE e.entry_date BETWEEN ? AND ?
              AND e.is_current = 1
            ORDER BY e.entry_date ASC
        """, (date_start, date_end)).fetchall()

        # Alerts overlapping range
        alerts = conn.execute("""
            SELECT id, alert_type, priority_score, date_range_start, date_range_end,
                   description, ai_analysis, acknowledged
            FROM alerts
            WHERE date_range_end >= ? AND date_range_start <= ?
            ORDER BY priority_score DESC
        """, (date_start, date_end)).fetchall()

        # Evidence in range
        evidence = conn.execute("""
            SELECT ev.id, ev.label, ev.quote_text, ev.evidence_type,
                   ev.source_date, ev.is_bookmarked
            FROM evidence ev
            WHERE ev.source_date BETWEEN ? AND ?
            ORDER BY ev.source_date ASC
        """, (date_start, date_end)).fetchall()

        # Master summary (latest)
        master_row = conn.execute("""
            SELECT ms.content, ms.entry_date
            FROM (
                SELECT normalized_text AS content, entry_date
                FROM entries WHERE is_current=1
                ORDER BY entry_date DESC LIMIT 1
            ) ms
        """).fetchone()

        # Try dedicated master_summaries table first
        try:
            ms_row = conn.execute("""
                SELECT content, updated_at FROM master_summaries
                ORDER BY updated_at DESC LIMIT 1
            """).fetchone()
            master_summary = ms_row["content"] if ms_row else None
        except Exception:
            master_summary = None

        return {
            "entries":        [dict(r) for r in entries],
            "alerts":         [dict(r) for r in alerts],
            "evidence":       [dict(r) for r in evidence],
            "master_summary": master_summary,
        }
    finally:
        conn.close()


def _save_export_record(
    packet_type: str, date_start: str, date_end: str,
    fmt: str, redacted: bool, file_path: str,
    alert_ids: list, entry_ids: list
) -> int:
    conn = _db()
    try:
        cur = conn.execute("""
            INSERT INTO exports
              (packet_type, date_range_start, date_range_end, format, redacted,
               file_path, alert_ids, entry_ids, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (
            packet_type, date_start, date_end, fmt,
            1 if redacted else 0,
            str(file_path),
            json.dumps(alert_ids),
            json.dumps(entry_ids),
        ))
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


# ── Redaction ──────────────────────────────────────────────────────────────────

def _apply_redaction(text: str, cfg: dict) -> str:
    if not text:
        return text
    import re
    names = cfg.get("names", [])
    patterns = cfg.get("patterns", [])
    for name in names:
        text = re.sub(re.escape(name), "[REDACTED]", text, flags=re.IGNORECASE)
    for pat in patterns:
        text = re.sub(pat, "[REDACTED]", text)
    return text


def _redact_data(data: dict, cfg: dict) -> dict:
    """Deep-copy data with redaction applied to text fields."""
    import copy, re
    d = copy.deepcopy(data)
    for entry in d["entries"]:
        for field in ("normalized_text", "summary_text", "key_events",
                      "entities", "notable_quotes"):
            if entry.get(field):
                entry[field] = _apply_redaction(str(entry[field]), cfg)
    for ev in d["evidence"]:
        for field in ("quote_text", "label"):
            if ev.get(field):
                ev[field] = _apply_redaction(str(ev[field]), cfg)
    return d


# ── AI Narrative ───────────────────────────────────────────────────────────────

PACKET_TYPES_WITH_AI = {"therapy_summary", "incident_packet", "pattern_report", "weekly_digest"}


def _call_ai_narrative(packet_type: str, data: dict,
                        date_start: str, date_end: str) -> str:
    prompts = _load_prompts()
    prompt_key = f"export_{packet_type}"

    if prompt_key not in prompts:
        log.warning(f"No prompt found for {prompt_key}, using case_file_narrative fallback")
        prompt_key = "case_file_narrative"

    prompt_cfg = prompts[prompt_key]
    system_prompt = prompt_cfg.get("system", "")
    user_template = prompt_cfg.get("user", "")

    # Build daily summaries text
    daily_parts = []
    for e in data["entries"]:
        summary = e.get("summary_text") or "(no summary)"
        mood = e.get("mood_label", "")
        score = e.get("mood_score", "")
        sev = e.get("severity", "")
        daily_parts.append(
            f"[{e['entry_date']}] mood={mood}({score}) severity={sev}\n{summary}"
        )
    daily_summaries = "\n\n".join(daily_parts) if daily_parts else "(no entries)"

    # Alerts text
    alert_parts = []
    for a in data["alerts"]:
        analysis = a.get("ai_analysis") or "(rule-based detection only)"
        alert_parts.append(
            f"• [{a['alert_type'].upper()}] score={a['priority_score']} "
            f"({a['date_range_start']} – {a['date_range_end']})\n"
            f"  {a['description']}\n  Analysis: {analysis}"
        )
    alerts_text = "\n\n".join(alert_parts) if alert_parts else "(no alerts in range)"

    # Evidence text
    ev_parts = []
    for ev in data["evidence"]:
        bm = "★ " if ev.get("is_bookmarked") else ""
        ev_parts.append(
            f"• {bm}[{ev['source_date']}] {ev['evidence_type']}: {ev['label']}\n"
            f"  \"{ev.get('quote_text', '')}\""
        )
    evidence_text = "\n".join(ev_parts) if ev_parts else "(no evidence items)"

    # Master summary excerpt (first 500 chars)
    ms = data.get("master_summary") or "(not available)"
    master_excerpt = ms[:1500] + "…" if len(ms) > 1500 else ms

    user_prompt = user_template.format(
        start_date=date_start,
        end_date=date_end,
        daily_summaries=daily_summaries,
        alerts=alerts_text,
        evidence=evidence_text,
        master_summary_excerpt=master_excerpt,
        # Legacy placeholders for case_file_narrative prompt
        packet_type=packet_type,
        date_range_start=date_start,
        date_range_end=date_end,
        selected_summaries=daily_summaries,
        alerts_summary=alerts_text,
    )

    client = _anthropic_client()
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=3000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return response.content[0].text.strip()


# ── HTML Templates ─────────────────────────────────────────────────────────────

_BASE_CSS = """
body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #1a1a2e;
    margin: 48px;
    line-height: 1.7;
    font-size: 13px;
}
h1 { color: #2c2c54; border-bottom: 3px solid #6366f1; padding-bottom: 8px; font-size: 22px; }
h2 { color: #40407a; margin-top: 2.2em; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
h3 { color: #555; font-size: 13px; margin-top: 1.5em; text-transform: uppercase; letter-spacing: 0.08em; }
p  { margin: 0.6em 0; }
.meta { color: #777; font-size: 11px; margin-bottom: 1.6em; }
.badge {
    display: inline-block;
    background: #f0f0ff;
    color: #5558aa;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    margin-right: 4px;
}
.badge-red   { background: #fff0f0; color: #c0392b; }
.badge-green { background: #f0fff4; color: #27ae60; }
.badge-orange{ background: #fff8f0; color: #e67e22; }
.ai-narrative {
    background: #f8f8ff;
    border-left: 4px solid #6366f1;
    padding: 16px 20px;
    margin: 20px 0;
    border-radius: 0 6px 6px 0;
}
.entry-block {
    border: 1px solid #e8e8f0;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 12px;
    page-break-inside: avoid;
}
.entry-date { font-weight: bold; color: #2c2c54; font-size: 12px; }
.entry-summary { color: #333; margin: 6px 0; }
.mood-row { font-size: 11px; color: #777; margin-top: 4px; }
.quote {
    border-left: 3px solid #a5b4fc;
    padding: 6px 12px;
    font-style: italic;
    color: #555;
    margin: 8px 0;
    font-size: 12px;
}
.alert-box {
    background: #fff3f3;
    border: 1px solid #ffaaaa;
    padding: 12px;
    border-radius: 4px;
    margin-bottom: 10px;
}
.alert-box.medium { background: #fff9f0; border-color: #ffc88a; }
.alert-box.low    { background: #f9f9f9; border-color: #ccc; }
.evidence-item {
    border-bottom: 1px solid #eee;
    padding: 8px 0;
}
.evidence-label { font-weight: bold; font-size: 12px; color: #2c2c54; }
.chronology-row {
    display: grid;
    grid-template-columns: 120px 80px 80px 1fr;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 12px;
}
.chronology-header {
    font-weight: bold;
    font-size: 11px;
    text-transform: uppercase;
    color: #999;
    letter-spacing: 0.06em;
}
footer {
    margin-top: 3em;
    padding-top: 1em;
    font-size: 10px;
    color: #aaa;
    border-top: 1px solid #ddd;
}
"""


def _html_wrap(title: str, date_start: str, date_end: str,
               packet_type: str, redacted: bool, body: str) -> str:
    generated = datetime.now().strftime("%Y-%m-%d %H:%M")
    redact_badge = '<span class="badge badge-orange">REDACTED</span>' if redacted else ''
    type_label = packet_type.replace("_", " ").title()
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>{_BASE_CSS}</style>
</head>
<body>
<h1>{title}</h1>
<div class="meta">
  <span class="badge">{type_label}</span>
  <span class="badge">Period: {date_start} – {date_end}</span>
  {redact_badge}
  &nbsp;Generated: {generated}
</div>
{body}
<footer>Journal Intelligence System · journal.williamthomas.name · CONFIDENTIAL</footer>
</body>
</html>"""


def _mood_color_class(score) -> str:
    try:
        s = float(score)
        if s >= 7:   return "badge-green"
        if s >= 4:   return "badge"
        return "badge-red"
    except Exception:
        return "badge"


def _alert_severity_class(score) -> str:
    try:
        s = float(score)
        if s >= 7:  return ""       # red (default)
        if s >= 4:  return "medium"
        return "low"
    except Exception:
        return ""

def _render_ai_analysis(ai_json: str) -> str:
    """Parse stored ai_analysis JSON and render as readable HTML."""
    if not ai_json:
        return ""
    try:
        data = json.loads(ai_json)
        parts = []
        if data.get("analysis"):
            parts.append(f"<p><strong>Analysis:</strong> {data['analysis']}</p>")
        if data.get("severity_assessment"):
            parts.append(f"<p><strong>Severity:</strong> {data['severity_assessment'].upper()}</p>")
        if data.get("evidence"):
            items = "".join(f"<li>{e}</li>" for e in data["evidence"][:5])
            parts.append(f"<p><strong>Evidence:</strong></p><ul>{items}</ul>")
        if data.get("recommended_actions"):
            items = "".join(f"<li>{a}</li>" for a in data["recommended_actions"][:4])
            parts.append(f"<p><strong>Recommended:</strong></p><ul>{items}</ul>")
        return "".join(parts)
    except Exception:
        # If not JSON, return as plain text (truncated)
        return f"<p><em>{ai_json[:300]}{'…' if len(ai_json) > 300 else ''}</em></p>"




# ── Per-Packet Body Builders ──────────────────────────────────────────────────

def _body_therapy_summary(data: dict, narrative: str) -> str:
    entries = data["entries"]
    alerts  = data["alerts"]
    evidence = data["evidence"]

    # Narrative section
    parts = [f'<h2>AI-Generated Narrative</h2><div class="ai-narrative">{_nl2p(narrative)}</div>']

    # Mood arc table
    parts.append("<h2>Daily Mood Arc</h2>")
    parts.append('<div>')
    for e in entries:
        mood  = e.get("mood_label", "—")
        score = e.get("mood_score", "")
        sev   = e.get("severity", "")
        summ  = e.get("summary_text") or ""
        cls   = _mood_color_class(score)
        score_str = f"{float(score):.1f}" if score != "" else "—"
        sev_str   = f"{float(sev):.1f}"   if sev   != "" else "—"
        parts.append(f"""
        <div class="entry-block">
          <div class="entry-date">{e['entry_date']}</div>
          <div class="mood-row">
            <span class="badge {cls}">{mood} {score_str}</span>
            <span class="badge">severity {sev_str}</span>
          </div>
          <div class="entry-summary">{summ}</div>
        </div>""")
    parts.append("</div>")

    # Alerts
    if alerts:
        parts.append("<h2>Patterns & Alerts</h2>")
        for a in alerts:
            cls  = _alert_severity_class(a.get("priority_score", 0))
            desc = a.get("description") or ""
            ai   = a.get("ai_analysis") or ""
            parts.append(f"""
            <div class="alert-box {cls}">
              <strong>[{a['alert_type'].upper()}]</strong>
              {a.get('date_range_start','')} – {a.get('date_range_end','')}
              · priority {a.get('priority_score','—')}<br>
              {desc}
              {_render_ai_analysis(a.get('ai_analysis',''))}
            </div>""")

    # Evidence
    if evidence:
        parts.append("<h2>Evidence Vault</h2>")
        for ev in evidence:
            bm   = "★ " if ev.get("is_bookmarked") else ""
            qt   = ev.get("quote_text") or ""
            qt_html = f'<div class="quote">{qt}</div>' if qt else ""
            parts.append(f"""
            <div class="evidence-item">
              <div class="evidence-label">{bm}{ev['label']}</div>
              <div class="mood-row">{ev['evidence_type']} · {ev['source_date']}</div>
              {qt_html}
            </div>""")

    return "\n".join(parts)


def _body_incident_packet(data: dict, narrative: str) -> str:
    entries  = data["entries"]
    alerts   = data["alerts"]
    evidence = data["evidence"]
    parts    = []

    parts.append(f'<h2>Incident Narrative</h2><div class="ai-narrative">{_nl2p(narrative)}</div>')

    # Chronological entries with full context
    parts.append("<h2>Entry Timeline</h2>")
    for e in entries:
        summ   = e.get("summary_text") or ""
        events = []
        try:
            events = json.loads(e.get("key_events") or "[]")
        except Exception:
            pass
        quotes = []
        try:
            quotes = json.loads(e.get("notable_quotes") or "[]")
        except Exception:
            pass
        mood  = e.get("mood_label", "—")
        score = e.get("mood_score", "")
        sev   = e.get("severity", "")
        score_str = f"{float(score):.1f}" if score != "" else "—"
        sev_str   = f"{float(sev):.1f}"   if sev   != "" else "—"
        cls   = _mood_color_class(score)

        events_html = "".join(f"<li>{ev}</li>" for ev in events[:6])
        quotes_html = "".join(f'<div class="quote">{q}</div>' for q in quotes[:3])

        parts.append(f"""
        <div class="entry-block">
          <div class="entry-date">{e['entry_date']}</div>
          <div class="mood-row">
            <span class="badge {cls}">{mood} {score_str}</span>
            <span class="badge">severity {sev_str}</span>
          </div>
          <p class="entry-summary">{summ}</p>
          {'<ul>' + events_html + '</ul>' if events_html else ''}
          {quotes_html}
        </div>""")

    if alerts:
        parts.append("<h2>Active Alerts in Range</h2>")
        for a in alerts:
            cls = _alert_severity_class(a.get("priority_score", 0))
            parts.append(f"""
            <div class="alert-box {cls}">
              <strong>[{a['alert_type'].upper()}]</strong>
              {a.get('date_range_start','')} – {a.get('date_range_end','')}
              · priority {a.get('priority_score','—')}<br>
              {a.get('description','')}
            </div>""")

    if evidence:
        parts.append("<h2>Supporting Evidence</h2>")
        for ev in evidence:
            qt = ev.get("quote_text") or ""
            parts.append(f"""
            <div class="evidence-item">
              <div class="evidence-label">{ev['label']}</div>
              <div class="mood-row">{ev['evidence_type']} · {ev['source_date']}</div>
              {'<div class="quote">' + qt + '</div>' if qt else ''}
            </div>""")

    return "\n".join(parts)


def _body_pattern_report(data: dict, narrative: str) -> str:
    alerts  = data["alerts"]
    entries = data["entries"]
    parts   = []

    parts.append(f'<h2>Pattern Analysis</h2><div class="ai-narrative">{_nl2p(narrative)}</div>')

    parts.append("<h2>Detected Alerts</h2>")
    if not alerts:
        parts.append("<p>No alerts detected in this date range.</p>")
    for a in alerts:
        cls  = _alert_severity_class(a.get("priority_score", 0))
        ai   = a.get("ai_analysis") or ""
        parts.append(f"""
        <div class="alert-box {cls}">
          <strong>[{a['alert_type'].upper()}]</strong>
          {a.get('date_range_start','')} – {a.get('date_range_end','')}
          · priority score {a.get('priority_score','—')}<br>
          <strong>Description:</strong> {a.get('description','')}<br>
          {_render_ai_analysis(a.get('ai_analysis',''))}
        </div>""")

    parts.append("<h2>Mood & Severity Data</h2>")
    for e in entries:
        mood  = e.get("mood_label", "—")
        score = e.get("mood_score", "")
        sev   = e.get("severity", "")
        score_str = f"{float(score):.1f}" if score != "" else "—"
        sev_str   = f"{float(sev):.1f}"   if sev   != "" else "—"
        cls   = _mood_color_class(score)
        summ  = e.get("summary_text") or ""
        parts.append(f"""
        <div class="entry-block">
          <div class="entry-date">{e['entry_date']}</div>
          <span class="badge {cls}">{mood} {score_str}</span>
          <span class="badge">severity {sev_str}</span>
          <p class="entry-summary">{summ}</p>
        </div>""")

    return "\n".join(parts)


def _body_weekly_digest(data: dict, narrative: str) -> str:
    entries  = data["entries"]
    alerts   = data["alerts"]
    parts    = []

    if narrative:
        parts.append(f'<h2>Week in Review</h2><div class="ai-narrative">{_nl2p(narrative)}</div>')

    # Per-day bullet list
    parts.append("<h2>Daily Summary</h2>")
    for e in entries:
        summ   = e.get("summary_text") or "(no summary)"
        events = []
        try:
            events = json.loads(e.get("key_events") or "[]")
        except Exception:
            pass
        mood  = e.get("mood_label", "—")
        score = e.get("mood_score", "")
        sev   = e.get("severity", "")
        score_str = f"{float(score):.1f}" if score != "" else "—"
        sev_str   = f"{float(sev):.1f}"   if sev   != "" else "—"
        cls   = _mood_color_class(score)

        events_html = "".join(f"<li>{ev}</li>" for ev in events[:4])
        parts.append(f"""
        <div class="entry-block">
          <div class="entry-date">{e['entry_date']}</div>
          <span class="badge {cls}">{mood} {score_str}</span>
          <span class="badge">severity {sev_str}</span>
          <p class="entry-summary">{summ}</p>
          {'<ul>' + events_html + '</ul>' if events_html else ''}
        </div>""")

    if alerts:
        parts.append("<h2>Alerts This Week</h2>")
        for a in alerts:
            cls = _alert_severity_class(a.get("priority_score", 0))
            parts.append(f"""
            <div class="alert-box {cls}">
              <strong>[{a['alert_type'].upper()}]</strong>
              · priority {a.get('priority_score','—')}<br>
              {a.get('description','')}
            </div>""")

    return "\n".join(parts)


def _body_chronology(data: dict) -> str:
    entries = data["entries"]
    parts   = []
    parts.append("""
    <h2>Chronological Record</h2>
    <div class="chronology-row chronology-header">
      <div>Date</div><div>Mood</div><div>Severity</div><div>Key Events</div>
    </div>""")

    for e in entries:
        events = []
        try:
            events = json.loads(e.get("key_events") or "[]")
        except Exception:
            pass
        mood  = e.get("mood_label", "—")
        score = e.get("mood_score", "")
        sev   = e.get("severity", "")
        score_str = f"{float(score):.1f}" if score != "" else "—"
        sev_str   = f"{float(sev):.1f}"   if sev   != "" else "—"
        events_str = "; ".join(events[:3]) or "—"
        parts.append(f"""
        <div class="chronology-row">
          <div>{e['entry_date']}</div>
          <div>{mood} {score_str}</div>
          <div>{sev_str}</div>
          <div>{events_str}</div>
        </div>""")

    return "\n".join(parts)


def _nl2p(text: str) -> str:
    """Convert newlines to <p> tags for HTML display."""
    if not text:
        return ""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    return "\n".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paragraphs)


# ── Format Renderers ──────────────────────────────────────────────────────────

def _render_pdf_weasyprint(html: str) -> bytes:
    from weasyprint import HTML as WP_HTML
    return WP_HTML(string=html).write_pdf()


def _render_pdf_reportlab(data: dict, packet_type: str,
                           date_start: str, date_end: str,
                           narrative: str) -> bytes:
    """Fallback PDF using ReportLab — plain text layout."""
    from io import BytesIO
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.colors import HexColor

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
                             leftMargin=inch, rightMargin=inch,
                             topMargin=inch, bottomMargin=inch)
    styles = getSampleStyleSheet()
    accent = HexColor("#6366f1")

    title_style = ParagraphStyle("Title2", parent=styles["Title"],
                                  textColor=accent, fontSize=20)
    h2_style    = ParagraphStyle("H2", parent=styles["Heading2"],
                                  textColor=HexColor("#40407a"))
    body_style  = styles["BodyText"]
    meta_style  = ParagraphStyle("Meta", parent=styles["Normal"],
                                  fontSize=9, textColor=HexColor("#777777"))

    story = []
    title = f"{packet_type.replace('_',' ').title()} — {date_start} to {date_end}"
    story.append(Paragraph(title, title_style))
    story.append(Paragraph(
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')} · CONFIDENTIAL",
        meta_style))
    story.append(Spacer(1, 0.2*inch))

    if narrative:
        story.append(Paragraph("Analysis", h2_style))
        story.append(HRFlowable(width="100%", thickness=1, color=accent))
        for para in narrative.split("\n\n"):
            if para.strip():
                story.append(Paragraph(para.strip(), body_style))
                story.append(Spacer(1, 0.08*inch))

    story.append(Paragraph("Daily Entries", h2_style))
    story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#cccccc")))
    for e in data["entries"]:
        summ  = e.get("summary_text") or ""
        mood  = e.get("mood_label", "—")
        score = e.get("mood_score", "")
        score_str = f"{float(score):.1f}" if score != "" else "—"
        story.append(Spacer(1, 0.1*inch))
        story.append(Paragraph(f"<b>{e['entry_date']}</b> · {mood} {score_str}", body_style))
        if summ:
            story.append(Paragraph(summ, body_style))

    if data["alerts"]:
        story.append(Spacer(1, 0.15*inch))
        story.append(Paragraph("Alerts", h2_style))
        for a in data["alerts"]:
            story.append(Paragraph(
                f"<b>[{a['alert_type'].upper()}]</b> priority {a.get('priority_score','—')}: "
                f"{a.get('description','')}",
                body_style))

    story.append(Spacer(1, 0.3*inch))
    story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#dddddd")))
    story.append(Paragraph(
        "Journal Intelligence System · journal.williamthomas.name", meta_style))

    doc.build(story)
    return buf.getvalue()


def _render_markdown(data: dict, packet_type: str,
                      date_start: str, date_end: str, narrative: str) -> str:
    lines = []
    title = f"{packet_type.replace('_',' ').title()} — {date_start} to {date_end}"
    lines += [f"# {title}", "",
              f"*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')} · CONFIDENTIAL*", ""]

    if narrative:
        lines += ["## Analysis", "", narrative, ""]

    lines += ["## Daily Entries", ""]
    for e in data["entries"]:
        summ  = e.get("summary_text") or "(no summary)"
        mood  = e.get("mood_label", "—")
        score = e.get("mood_score", "")
        sev   = e.get("severity", "")
        score_str = f"{float(score):.1f}" if score != "" else "—"
        sev_str   = f"{float(sev):.1f}"   if sev   != "" else "—"
        events = []
        try:
            events = json.loads(e.get("key_events") or "[]")
        except Exception:
            pass
        lines += [f"### {e['entry_date']}",
                  f"*mood: {mood} ({score_str}) · severity: {sev_str}*", "",
                  summ, ""]
        if events:
            lines += ["**Key events:**"] + [f"- {ev}" for ev in events[:5]] + [""]

    if data["alerts"]:
        lines += ["## Alerts", ""]
        for a in data["alerts"]:
            lines += [
                f"### [{a['alert_type'].upper()}] priority {a.get('priority_score','—')}",
                f"*{a.get('date_range_start','')} – {a.get('date_range_end','')}*",
                a.get("description", ""), ""
            ]
            if a.get("ai_analysis"):
                lines += [f"**Analysis:** {a['ai_analysis']}", ""]

    if data["evidence"]:
        lines += ["## Evidence", ""]
        for ev in data["evidence"]:
            bm = "★ " if ev.get("is_bookmarked") else ""
            lines += [
                f"- **{bm}{ev['label']}** ({ev['evidence_type']} · {ev['source_date']})",
            ]
            if ev.get("quote_text"):
                lines += [f"  > {ev['quote_text']}"]
        lines.append("")

    lines += ["---",
              "*Journal Intelligence System · journal.williamthomas.name*"]
    return "\n".join(lines)


def _render_json(data: dict, packet_type: str,
                  date_start: str, date_end: str, narrative: str) -> str:
    payload = {
        "packet_type":  packet_type,
        "date_start":   date_start,
        "date_end":     date_end,
        "generated_at": datetime.now().isoformat(),
        "narrative":    narrative,
        "entry_count":  len(data["entries"]),
        "entries":      data["entries"],
        "alerts":       data["alerts"],
        "evidence":     data["evidence"],
    }
    return json.dumps(payload, indent=2, default=str)


def _render_csv(data: dict) -> str:
    import csv
    from io import StringIO
    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "mood_label", "mood_score", "severity", "summary"])
    for e in data["entries"]:
        writer.writerow([
            e.get("entry_date", ""),
            e.get("mood_label", ""),
            e.get("mood_score", ""),
            e.get("severity", ""),
            (e.get("summary_text") or "").replace("\n", " "),
        ])
    return buf.getvalue()


# ── Public Entry Point ─────────────────────────────────────────────────────────

def generate_packet(
    packet_type:  str,
    date_start:   str,
    date_end:     str,
    fmt:          str  = "pdf",
    redact:       bool = False,
    user_id:      int  = None,
    alert_ids:    list = None,
) -> dict:
    """
    Generate an export packet.

    Returns: {
        export_id: int,
        filename:  str,
        file_path: str,
        format:    str,
        entry_count: int,
        alert_count: int,
    }
    """
    alert_ids = alert_ids or []
    log.info(f"Generating {packet_type} export {date_start}→{date_end} fmt={fmt} redact={redact}")

    # 1. Fetch all data
    data = _fetch_data(date_start, date_end)

    # 2. Apply redaction if requested
    if redact:
        redact_cfg = _load_redaction()
        data = _redact_data(data, redact_cfg)

    # 3. Generate AI narrative (if applicable)
    narrative = ""
    if packet_type in PACKET_TYPES_WITH_AI:
        try:
            narrative = _call_ai_narrative(packet_type, data, date_start, date_end)
        except Exception as e:
            log.error(f"AI narrative generation failed: {e}")
            narrative = f"(AI narrative unavailable: {e})"

    # 4. Build HTML body based on packet type
    if packet_type == "therapy_summary":
        html_body  = _body_therapy_summary(data, narrative)
    elif packet_type == "incident_packet":
        html_body  = _body_incident_packet(data, narrative)
    elif packet_type == "pattern_report":
        html_body  = _body_pattern_report(data, narrative)
    elif packet_type == "weekly_digest":
        html_body  = _body_weekly_digest(data, narrative)
    elif packet_type == "chronology":
        html_body  = _body_chronology(data)
        narrative  = ""
    else:
        # Fallback: treat as therapy_summary layout
        html_body  = _body_therapy_summary(data, narrative)

    title = f"{packet_type.replace('_', ' ').title()} — {date_start} to {date_end}"
    full_html = _html_wrap(title, date_start, date_end, packet_type, redact, html_body)

    # 5. Render to requested format
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    redact_s = "_redacted" if redact else ""
    filename = f"{packet_type}_{date_start}_{date_end}_{ts}{redact_s}.{fmt}"
    file_path = EXPORT_DIR / filename

    if fmt == "pdf":
        if PDF_BACKEND == "weasyprint":
            pdf_bytes = _render_pdf_weasyprint(full_html)
        elif PDF_BACKEND == "reportlab":
            pdf_bytes = _render_pdf_reportlab(data, packet_type, date_start, date_end, narrative)
        else:
            raise RuntimeError(
                "No PDF backend available. "
                "Run: pip install weasyprint --break-system-packages  "
                "or: pip install reportlab --break-system-packages"
            )
        file_path.write_bytes(pdf_bytes)

    elif fmt == "html":
        file_path.write_text(full_html, encoding="utf-8")

    elif fmt == "md":
        md_text = _render_markdown(data, packet_type, date_start, date_end, narrative)
        file_path.write_text(md_text, encoding="utf-8")

    elif fmt == "json":
        json_text = _render_json(data, packet_type, date_start, date_end, narrative)
        file_path.write_text(json_text, encoding="utf-8")

    elif fmt == "csv":
        csv_text = _render_csv(data)
        file_path.write_text(csv_text, encoding="utf-8")

    else:
        raise ValueError(f"Unsupported format: {fmt}")

    # 6. Save export record to DB
    entry_ids  = [e["id"] for e in data["entries"]]
    export_id  = _save_export_record(
        packet_type, date_start, date_end, fmt, redact,
        str(file_path), alert_ids, entry_ids
    )

    log.info(f"Export {export_id} written to {file_path}")
    return {
        "export_id":   export_id,
        "filename":    filename,
        "file_path":   str(file_path),
        "format":      fmt,
        "entry_count": len(data["entries"]),
        "alert_count": len(data["alerts"]),
    }
