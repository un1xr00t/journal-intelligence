"""
src/api/export_engine.py

Export packet generation for all 5 packet types.
Generates styled PDF files via WeasyPrint (HTML → PDF).
Redaction: regex patterns + automatic entity name extraction from DB.
"""

import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml

# ── Paths ─────────────────────────────────────────────────────────────────────

from src.config import APP_ROOT as BASE_DIR, CONFIG_PATH, EXPORTS_DIR, load_config
DB_PATH        = BASE_DIR / "db" / "journal.db"
EXPORTS_DIR    = BASE_DIR / "data" / "derived" / "exports"
REDACTED_DIR   = EXPORTS_DIR / "redacted"
CONFIG_PATH    = BASE_DIR / "config" / "config.yaml"
PROMPTS_PATH   = BASE_DIR / "config" / "prompts.yaml"
REDACTION_PATH = BASE_DIR / "config" / "redaction.yaml"

EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
REDACTED_DIR.mkdir(parents=True, exist_ok=True)


# ── DB helpers ─────────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def fetch_entries_in_range(start_date: str, end_date: str) -> list:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT e.id, e.entry_date, e.word_count,
               ds.summary_text, ds.key_events, ds.mood_label, ds.mood_score,
               ds.severity, ds.tags, ds.entities, ds.notable_quotes
        FROM entries e
        LEFT JOIN derived_summaries ds ON ds.entry_id = e.id
        WHERE e.is_current = 1
          AND e.entry_date >= ? AND e.entry_date <= ?
        ORDER BY e.entry_date ASC
    """, (start_date, end_date))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def fetch_alerts_in_range(start_date: str, end_date: str) -> list:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, alert_type, priority_score, date_range_start, date_range_end,
               description, ai_analysis, acknowledged
        FROM alerts
        WHERE (date_range_start <= ? AND date_range_end >= ?)
           OR (date_range_start >= ? AND date_range_start <= ?)
        ORDER BY priority_score DESC
    """, (end_date, start_date, start_date, end_date))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def fetch_evidence_in_range(start_date: str, end_date: str) -> list:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT ev.label, ev.quote_text, ev.evidence_type, ev.source_date
        FROM evidence ev
        WHERE ev.source_date >= ? AND ev.source_date <= ?
        ORDER BY ev.source_date ASC
    """, (start_date, end_date))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def collect_all_person_names(entries: list) -> list:
    """Extract every unique person name from entities across all entries in range."""
    seen = set()
    names = []
    for e in entries:
        entities = _safe_json(e.get("entities"))
        for en in entities:
            t = str(en.get("type", "")).lower()
            name = (en.get("name") or "").strip()
            if t in ("person", "human", "individual") and name and name.lower() not in seen:
                seen.add(name.lower())
                names.append(name)
    # Sort longest first so "John Smith" is replaced before "John"
    return sorted(names, key=len, reverse=True)


def save_export_record(packet_type, start_date, end_date, file_path, redacted, entry_ids, alert_ids) -> int:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO exports
            (packet_type, date_range_start, date_range_end, format,
             redacted, file_path, alert_ids, entry_ids)
        VALUES (?, ?, ?, 'pdf', ?, ?, ?, ?)
    """, (
        packet_type, start_date, end_date,
        1 if redacted else 0,
        file_path,
        json.dumps(alert_ids),
        json.dumps(entry_ids),
    ))
    export_id = cur.lastrowid
    conn.commit()
    conn.close()
    return export_id


# ── Redaction ──────────────────────────────────────────────────────────────────

def load_redaction_rules() -> dict:
    with open(REDACTION_PATH) as f:
        return yaml.safe_load(f)


def build_redaction_map(rules: dict, person_names: list) -> list:
    """
    Returns ordered list of (pattern, replacement) tuples.
    Combines: DB entity names → config names/locations/orgs → regex patterns.
    """
    replacements = []

    # Auto-redact every person name extracted from the journal entries
    for i, name in enumerate(person_names):
        label = f"[PERSON {chr(65 + i)}]" if i < 26 else f"[PERSON {i+1}]"
        replacements.append((re.compile(re.escape(name), re.IGNORECASE), label))

    # Manual name/location/org overrides from redaction.yaml
    for category in ("names", "locations", "organizations"):
        for entry in rules.get(category) or []:
            if not entry:
                continue
            replacements.append((
                re.compile(re.escape(entry["find"]), re.IGNORECASE),
                entry["replace"],
            ))

    return replacements


def apply_text_redaction(text: str, replacements: list, regex_rules: list) -> str:
    if not text:
        return text
    for pattern, repl in replacements:
        text = pattern.sub(repl, text)
    for rule in regex_rules or []:
        if rule:
            text = re.sub(rule["regex"], rule["replace"], text, flags=re.IGNORECASE)
    return text


def redact_entry(entry: dict, replacements: list, regex_rules: list) -> dict:
    e = dict(entry)
    for field in ("summary_text", "key_events", "tags", "entities", "notable_quotes"):
        if e.get(field) and isinstance(e[field], str):
            e[field] = apply_text_redaction(e[field], replacements, regex_rules)
    return e


# ── AI helper ──────────────────────────────────────────────────────────────────

def call_ai(system: str, user: str) -> str:
    with open(CONFIG_PATH) as f:
        config = yaml.safe_load(f)
    import anthropic
    client = anthropic.Anthropic(api_key=config.get("anthropic_api_key", ""))
    msg = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2000,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text


def load_prompts() -> dict:
    with open(PROMPTS_PATH) as f:
        return yaml.safe_load(f)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_json(val, default=None):
    if not val:
        return default or []
    if isinstance(val, (list, dict)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default or []


def _mood_color(label: Optional[str]) -> str:
    return {
        "calm":    "#10b981",
        "anxious": "#f59e0b",
        "sad":     "#6366f1",
        "angry":   "#ef4444",
        "mixed":   "#8b5cf6",
    }.get((label or "").lower(), "#94a3b8")


def _score_bar_html(score: Optional[float], color: str = "#6366f1", max_val: int = 10) -> str:
    if score is None:
        return "<span style='color:#64748b'>—</span>"
    pct = (score / max_val) * 100
    return f"""
        <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;background:#1e293b;border-radius:4px;height:8px;overflow:hidden;">
                <div style="width:{pct:.0f}%;background:{color};height:100%;border-radius:4px;"></div>
            </div>
            <span style="font-size:12px;color:#94a3b8;min-width:32px;">{score:.1f}</span>
        </div>"""


def _mood_badge(label: Optional[str]) -> str:
    if not label:
        return ""
    color = _mood_color(label)
    return f'<span style="background:{color}22;color:{color};border:1px solid {color}44;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">{label}</span>'


def _alert_priority_color(score: float) -> str:
    if score >= 8:
        return "#ef4444"
    if score >= 6:
        return "#f59e0b"
    return "#6366f1"


# ── PDF CSS ────────────────────────────────────────────────────────────────────

PDF_CSS = """
@page {
    margin: 2cm 2.5cm;
    size: A4;
    @bottom-center {
        content: counter(page) " / " counter(pages);
        font-size: 10px;
        color: #475569;
        font-family: 'IBM Plex Mono', monospace;
    }
}

* { box-sizing: border-box; }

body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    font-size: 13px;
    line-height: 1.6;
    margin: 0;
    padding: 0;
}

.cover {
    min-height: 200px;
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border-bottom: 2px solid #6366f1;
    padding: 40px 0 30px;
    margin-bottom: 32px;
}

.cover h1 {
    font-size: 32px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 8px;
    letter-spacing: -0.02em;
}

.cover .subtitle {
    font-size: 14px;
    color: #94a3b8;
    font-family: 'Courier New', monospace;
}

.cover .meta {
    margin-top: 16px;
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
}

.cover .meta-item {
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.cover .meta-item span {
    color: #94a3b8;
    font-weight: 600;
}

.redact-banner {
    background: #7c2d12;
    border: 1px solid #ea580c;
    border-radius: 6px;
    padding: 8px 14px;
    margin-top: 16px;
    font-size: 11px;
    color: #fed7aa;
    letter-spacing: 0.04em;
}

h2 {
    font-size: 16px;
    font-weight: 700;
    color: #f1f5f9;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 6px;
    margin: 28px 0 14px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

h3 {
    font-size: 14px;
    font-weight: 600;
    color: #cbd5e1;
    margin: 18px 0 8px;
}

.entry-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 14px;
    page-break-inside: avoid;
}

.entry-date {
    font-size: 13px;
    font-weight: 700;
    color: #f1f5f9;
    margin-bottom: 6px;
    font-family: 'Courier New', monospace;
}

.entry-meta {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 10px;
    flex-wrap: wrap;
}

.entry-summary {
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.65;
    margin: 8px 0;
}

.key-events {
    margin: 10px 0 0;
}

.key-events-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #475569;
    margin-bottom: 4px;
}

.key-events ul {
    margin: 0;
    padding-left: 16px;
}

.key-events li {
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 2px;
}

.tags {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.tag {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 10px;
    color: #64748b;
}

blockquote {
    border-left: 3px solid #6366f1;
    margin: 8px 0;
    padding: 4px 12px;
    color: #94a3b8;
    font-style: italic;
    font-size: 12px;
}

.alert-card {
    background: #1e293b;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 12px;
    page-break-inside: avoid;
}

.alert-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
}

.alert-type {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.priority-badge {
    font-size: 11px;
    font-family: 'Courier New', monospace;
    padding: 2px 8px;
    border-radius: 4px;
}

.alert-desc {
    font-size: 12px;
    color: #94a3b8;
    margin: 4px 0;
}

.alert-analysis {
    font-size: 11px;
    color: #64748b;
    margin-top: 6px;
    padding: 8px;
    background: #0f172a;
    border-radius: 4px;
    line-height: 1.5;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 16px 0 24px;
}

.stat-box {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 14px;
    text-align: center;
}

.stat-value {
    font-size: 24px;
    font-weight: 700;
    color: #6366f1;
    margin-bottom: 4px;
}

.stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #475569;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin: 12px 0;
}

th {
    background: #1e293b;
    color: #64748b;
    padding: 8px 10px;
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #334155;
}

td {
    padding: 8px 10px;
    border-bottom: 1px solid #1e293b;
    color: #94a3b8;
}

tr:last-child td {
    border-bottom: none;
}

.section-divider {
    border: none;
    border-top: 1px solid #1e293b;
    margin: 24px 0;
}

.narrative-box {
    background: #1e293b;
    border-left: 3px solid #6366f1;
    border-radius: 0 8px 8px 0;
    padding: 16px 20px;
    margin: 16px 0;
    font-size: 13px;
    line-height: 1.7;
    color: #cbd5e1;
}

.evidence-item {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 8px;
}

.evidence-meta {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #475569;
    margin-bottom: 4px;
}

.evidence-label {
    font-size: 12px;
    color: #e2e8f0;
    font-weight: 600;
}

.empty {
    color: #475569;
    font-style: italic;
    text-align: center;
    padding: 24px;
}
"""


# ── HTML wrapper ───────────────────────────────────────────────────────────────

def wrap_html(title: str, start_date: str, end_date: str, redacted: bool, body: str, packet_type: str) -> str:
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    redact_banner = """
        <div class="redact-banner">
            ⚠ REDACTED VERSION — Sensitive names, contacts, and identifiers have been replaced.
        </div>""" if redacted else ""

    type_labels = {
        "weekly_digest":    "Weekly Digest",
        "incident_packet":  "Incident Packet",
        "pattern_report":   "Pattern Report",
        "therapy_summary":  "Therapy Summary",
        "facts_chronology": "Facts Chronology",
    }
    label = type_labels.get(packet_type, title)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{label}</title>
    <style>{PDF_CSS}</style>
</head>
<body>
    <div class="cover">
        <h1>{label}</h1>
        <div class="subtitle">Journal Intelligence System — Export</div>
        <div class="meta">
            <div class="meta-item">Date Range: <span>{start_date} → {end_date}</span></div>
            <div class="meta-item">Generated: <span>{generated}</span></div>
        </div>
        {redact_banner}
    </div>
    {body}
</body>
</html>"""


# ── Packet builders ────────────────────────────────────────────────────────────

def build_weekly_digest_html(entries: list, alerts: list) -> str:
    if not entries:
        return '<p class="empty">No entries found in this date range.</p>'

    moods = [e["mood_score"] for e in entries if e.get("mood_score") is not None]
    sevs  = [e["severity"]   for e in entries if e.get("severity")   is not None]
    avg_mood = sum(moods) / len(moods) if moods else None
    avg_sev  = sum(sevs)  / len(sevs)  if sevs  else None

    stats = f"""
    <div class="stats-grid">
        <div class="stat-box">
            <div class="stat-value">{len(entries)}</div>
            <div class="stat-label">Entries</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">{f"{avg_mood:.1f}" if avg_mood is not None else "—"}</div>
            <div class="stat-label">Avg Mood</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">{f"{avg_sev:.1f}" if avg_sev is not None else "—"}</div>
            <div class="stat-label">Avg Severity</div>
        </div>
    </div>"""

    html = [stats, "<h2>Daily Entries</h2>"]
    for e in entries:
        key_events = _safe_json(e.get("key_events"))
        tags = _safe_json(e.get("tags"))
        quotes = _safe_json(e.get("notable_quotes"))
        mood_label = e.get("mood_label")
        summary = e.get("summary_text") or "<em>No summary available.</em>"

        events_html = ""
        if key_events:
            items = "".join(f"<li>{ev}</li>" for ev in key_events)
            events_html = f'<div class="key-events"><div class="key-events-label">Key Events</div><ul>{items}</ul></div>'

        tags_html = ""
        if tags:
            tag_spans = "".join(f'<span class="tag">{t}</span>' for t in tags)
            tags_html = f'<div class="tags">{tag_spans}</div>'

        quotes_html = ""
        if quotes:
            quotes_html = "".join(f"<blockquote>{q}</blockquote>" for q in quotes)

        html.append(f"""
        <div class="entry-card">
            <div class="entry-date">{e['entry_date']}</div>
            <div class="entry-meta">
                {_mood_badge(mood_label)}
                <span style="font-size:11px;color:#475569;">Mood</span>
                {_score_bar_html(e.get("mood_score"), "#6366f1")}
                <span style="font-size:11px;color:#475569;">Severity</span>
                {_score_bar_html(e.get("severity"), "#ef4444")}
            </div>
            <div class="entry-summary">{summary}</div>
            {events_html}
            {quotes_html}
            {tags_html}
        </div>""")

    if alerts:
        html.append("<h2>Alerts in This Period</h2>")
        html.extend(_render_alerts_html(alerts))

    return "\n".join(html)


def build_incident_packet_html(entries: list, alerts: list, evidence: list) -> str:
    if not entries:
        return '<p class="empty">No entries found in this date range.</p>'

    html = ["<h2>Incident Timeline</h2>"]
    for e in entries:
        key_events = _safe_json(e.get("key_events"))
        quotes = _safe_json(e.get("notable_quotes"))
        summary = e.get("summary_text") or "<em>No summary available.</em>"

        events_html = ""
        if key_events:
            items = "".join(f"<li>{ev}</li>" for ev in key_events)
            events_html = f'<div class="key-events"><div class="key-events-label">Events</div><ul>{items}</ul></div>'

        quotes_html = "".join(f"<blockquote>{q}</blockquote>" for q in quotes) if quotes else ""

        html.append(f"""
        <div class="entry-card">
            <div class="entry-date">{e['entry_date']}</div>
            <div class="entry-meta">
                {_mood_badge(e.get("mood_label"))}
                {_score_bar_html(e.get("mood_score"), "#6366f1")}
                <span style="font-size:11px;color:#475569;">Severity</span>
                {_score_bar_html(e.get("severity"), "#ef4444")}
            </div>
            <div class="entry-summary">{summary}</div>
            {events_html}
            {quotes_html}
        </div>""")

    if evidence:
        html.append("<h2>Evidence Vault Items</h2>")
        for ev in evidence:
            quote_html = f"<blockquote>{ev['quote_text']}</blockquote>" if ev.get("quote_text") else ""
            html.append(f"""
            <div class="evidence-item">
                <div class="evidence-meta">{ev.get('source_date')} · {ev.get('evidence_type', '').title()}</div>
                <div class="evidence-label">{ev.get('label', '')}</div>
                {quote_html}
            </div>""")

    if alerts:
        html.append("<h2>Related Alerts</h2>")
        html.extend(_render_alerts_html(alerts))

    return "\n".join(html)


def build_pattern_report_html(entries: list, alerts: list, evidence: list) -> str:
    html = ["<h2>Pattern Analysis</h2>"]

    if not alerts:
        html.append('<p class="empty">No alerts detected in this date range.</p>')
    else:
        html.extend(_render_alerts_html(alerts))

    if evidence:
        by_type: dict = {}
        for ev in evidence:
            by_type.setdefault(ev.get("evidence_type", "other"), []).append(ev)

        html.append("<h2>Supporting Evidence</h2>")
        for etype, items in by_type.items():
            html.append(f"<h3>{etype.title()}</h3>")
            for ev in items:
                quote_html = f"<blockquote>{ev['quote_text']}</blockquote>" if ev.get("quote_text") else ""
                html.append(f"""
                <div class="evidence-item">
                    <div class="evidence-meta">{ev.get('source_date')}</div>
                    <div class="evidence-label">{ev.get('label', '')}</div>
                    {quote_html}
                </div>""")

    if entries:
        html.append("<h2>Mood & Severity Trend</h2>")
        rows = "".join(f"""
            <tr>
                <td style="font-family:monospace">{e['entry_date']}</td>
                <td>{_mood_badge(e.get('mood_label'))}</td>
                <td>{e.get('mood_score') or '—'}</td>
                <td>{e.get('severity') or '—'}</td>
            </tr>""" for e in entries)
        html.append(f"""
        <table>
            <thead><tr><th>Date</th><th>Mood</th><th>Score</th><th>Severity</th></tr></thead>
            <tbody>{rows}</tbody>
        </table>""")

    return "\n".join(html)


def build_therapy_summary_html(entries: list, alerts: list, ai_narrative: str) -> str:
    html = []

    if ai_narrative:
        html.append("<h2>Clinical Narrative</h2>")
        # Preserve paragraph breaks from AI output
        paragraphs = [p.strip() for p in ai_narrative.split("\n\n") if p.strip()]
        narrative_body = "".join(f"<p>{p}</p>" for p in paragraphs)
        html.append(f'<div class="narrative-box">{narrative_body}</div>')

    html.append("<h2>Entry Summaries</h2>")
    if not entries:
        html.append('<p class="empty">No entries found in this date range.</p>')
    else:
        for e in entries:
            summary = e.get("summary_text") or "<em>No summary available.</em>"
            html.append(f"""
            <div class="entry-card">
                <div class="entry-date">{e['entry_date']}</div>
                <div class="entry-meta">
                    {_mood_badge(e.get("mood_label"))}
                    {_score_bar_html(e.get("mood_score"), "#6366f1")}
                    <span style="font-size:11px;color:#475569;">Severity</span>
                    {_score_bar_html(e.get("severity"), "#ef4444")}
                </div>
                <div class="entry-summary">{summary}</div>
            </div>""")

    if alerts:
        html.append("<h2>Flagged Patterns</h2>")
        html.extend(_render_alerts_html(alerts))

    return "\n".join(html)


def build_facts_chronology_html(entries: list) -> str:
    if not entries:
        return '<p class="empty">No entries found in this date range.</p>'

    html = [
        "<h2>Chronological Record</h2>",
        '<p style="color:#475569;font-size:11px;font-style:italic;">Factual record only. No analysis or editorial content.</p>',
    ]

    for e in entries:
        key_events = _safe_json(e.get("key_events"))
        entities   = _safe_json(e.get("entities"))
        quotes     = _safe_json(e.get("notable_quotes"))

        people = [en.get("name") for en in entities
                  if str(en.get("type", "")).lower() in ("person", "human", "individual") and en.get("name")]

        events_html = ""
        if key_events:
            items = "".join(f"<li>{ev}</li>" for ev in key_events)
            events_html = f'<div class="key-events"><div class="key-events-label">Events</div><ul>{items}</ul></div>'

        people_html = ""
        if people:
            people_html = f'<p style="font-size:12px;color:#64748b;margin:6px 0 0;"><strong>People:</strong> {", ".join(people)}</p>'

        quotes_html = "".join(f"<blockquote>{q}</blockquote>" for q in quotes) if quotes else ""

        html.append(f"""
        <div class="entry-card">
            <div class="entry-date">{e['entry_date']}</div>
            <div style="font-size:11px;color:#475569;margin-bottom:6px;">
                Mood: {e.get('mood_label') or '—'} ·
                Severity: {e.get('severity') or '—'}/10 ·
                Words: {e.get('word_count') or '—'}
            </div>
            {events_html}
            {people_html}
            {quotes_html}
        </div>""")

    return "\n".join(html)


def _render_alerts_html(alerts: list) -> list:
    html = []
    for a in alerts:
        color = _alert_priority_color(a.get("priority_score") or 0)
        ack_badge = '<span style="color:#10b981;font-size:10px;">✓ Acknowledged</span>' if a.get("acknowledged") else '<span style="color:#f59e0b;font-size:10px;">⚠ Active</span>'
        analysis_html = f'<div class="alert-analysis">{a["ai_analysis"]}</div>' if a.get("ai_analysis") else ""
        html.append(f"""
        <div class="alert-card" style="border-left:3px solid {color};">
            <div class="alert-header">
                <span class="alert-type" style="color:{color};">{a['alert_type'].replace('_', ' ').title()}</span>
                <div style="display:flex;align-items:center;gap:8px;">
                    {ack_badge}
                    <span class="priority-badge" style="background:{color}22;color:{color};">P {a.get('priority_score', 0):.1f}</span>
                </div>
            </div>
            <div style="font-size:11px;color:#475569;margin-bottom:4px;">{a.get('date_range_start')} → {a.get('date_range_end')}</div>
            <div class="alert-desc">{a.get('description') or '—'}</div>
            {analysis_html}
        </div>""")
    return html


# ── PDF generation ─────────────────────────────────────────────────────────────

def html_to_pdf(html_content: str, output_path: Path) -> None:
    from weasyprint import HTML, CSS
    HTML(string=html_content).write_pdf(
        target=str(output_path),
        stylesheets=[],
        presentational_hints=True,
    )


# ── Main entry point ───────────────────────────────────────────────────────────

def generate_export(
    packet_type: str,
    start_date: str,
    end_date: str,
    redacted: bool,
) -> dict:
    entries  = fetch_entries_in_range(start_date, end_date)
    alerts   = fetch_alerts_in_range(start_date, end_date)
    evidence = fetch_evidence_in_range(start_date, end_date)

    if not entries:
        return {
            "status": "empty",
            "message": f"No entries found between {start_date} and {end_date}.",
        }

    # ── Redaction ──────────────────────────────────────────────────────────────
    if redacted:
        rules        = load_redaction_rules()
        person_names = collect_all_person_names(entries)
        replacements = build_redaction_map(rules, person_names)
        regex_rules  = rules.get("patterns") or []

        entries  = [redact_entry(e, replacements, regex_rules) for e in entries]
        evidence = [
            {**ev,
             "quote_text": apply_text_redaction(ev.get("quote_text") or "", replacements, regex_rules),
             "label":      apply_text_redaction(ev.get("label") or "", replacements, regex_rules)}
            for ev in evidence
        ]
        alerts = [
            {**a,
             "description": apply_text_redaction(a.get("description") or "", replacements, regex_rules),
             "ai_analysis": apply_text_redaction(a.get("ai_analysis") or "", replacements, regex_rules)}
            for a in alerts
        ]

    # ── AI narrative for therapy summary ──────────────────────────────────────
    ai_narrative = ""
    if packet_type == "therapy_summary":
        try:
            prompts = load_prompts()
            p = prompts["case_file_narrative"]
            summaries_text = "\n\n".join(
                f"{e['entry_date']}: {e.get('summary_text') or '(no summary)'}"
                for e in entries
            )
            alerts_text = "\n".join(
                f"- {a['alert_type']}: {a.get('description') or '—'}" for a in alerts
            ) or "No alerts."
            user_prompt = (p["user"]
                .replace("{packet_type}", "Therapy Summary")
                .replace("{date_range_start}", start_date)
                .replace("{date_range_end}", end_date)
                .replace("{selected_summaries}", summaries_text)
                .replace("{alerts_summary}", alerts_text))
            ai_narrative = call_ai(p["system"], user_prompt)
        except Exception as exc:
            ai_narrative = f"AI narrative unavailable: {exc}"

    # ── Build HTML body ────────────────────────────────────────────────────────
    if packet_type == "weekly_digest":
        body = build_weekly_digest_html(entries, alerts)
    elif packet_type == "incident_packet":
        body = build_incident_packet_html(entries, alerts, evidence)
    elif packet_type == "pattern_report":
        body = build_pattern_report_html(entries, alerts, evidence)
    elif packet_type == "therapy_summary":
        body = build_therapy_summary_html(entries, alerts, ai_narrative)
    elif packet_type == "facts_chronology":
        body = build_facts_chronology_html(entries)
    else:
        body = build_weekly_digest_html(entries, alerts)

    html_content = wrap_html(
        title=packet_type,
        start_date=start_date,
        end_date=end_date,
        redacted=redacted,
        body=body,
        packet_type=packet_type,
    )

    # ── Write PDF ──────────────────────────────────────────────────────────────
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    suffix    = "_REDACTED" if redacted else ""
    filename  = f"{packet_type}_{start_date}_{end_date}{suffix}_{timestamp}.pdf"
    folder    = REDACTED_DIR if redacted else EXPORTS_DIR
    file_path = folder / filename

    html_to_pdf(html_content, file_path)

    entry_ids = [e["id"] for e in entries]
    alert_ids = [a["id"] for a in alerts]

    export_id = save_export_record(
        packet_type=packet_type,
        start_date=start_date,
        end_date=end_date,
        file_path=str(file_path),
        redacted=redacted,
        entry_ids=entry_ids,
        alert_ids=alert_ids,
    )

    return {
        "status": "success",
        "export_id": export_id,
        "file_path": str(file_path),
        "entry_count": len(entries),
        "packet_type": packet_type,
        "start_date": start_date,
        "end_date": end_date,
        "redacted": redacted,
        "message": f"Generated {len(entries)} entries, {len(alerts)} alerts.",
    }
