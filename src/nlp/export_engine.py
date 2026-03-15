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


def _fetch_data(date_start: str, date_end: str, user_id: int = None) -> dict:
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
              AND (? IS NULL OR e.user_id = ?)
            ORDER BY e.entry_date ASC
        """, (date_start, date_end, user_id, user_id)).fetchall()

        # Alerts overlapping range — scoped to user_id directly
        alerts = conn.execute("""
            SELECT id, alert_type, priority_score, date_range_start, date_range_end,
                   description, ai_analysis, acknowledged
            FROM alerts
            WHERE date_range_end >= ? AND date_range_start <= ?
              AND (? IS NULL OR user_id = ?)
            ORDER BY priority_score DESC
        """, (date_start, date_end, user_id, user_id)).fetchall()

        # Evidence in range — scoped to user via entry_id join
        evidence = conn.execute("""
            SELECT ev.id, ev.label, ev.quote_text, ev.evidence_type,
                   ev.source_date, ev.is_bookmarked
            FROM evidence ev
            JOIN entries e ON e.id = ev.entry_id
            WHERE ev.source_date BETWEEN ? AND ?
              AND e.is_current = 1
              AND (? IS NULL OR e.user_id = ?)
            ORDER BY ev.source_date ASC
        """, (date_start, date_end, user_id, user_id)).fetchall()

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
                        date_start: str, date_end: str,
                        user_id: int = None) -> str:
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

    try:
        from src.api.ai_client import create_message
        result = create_message(user_id=user_id, system=system_prompt, user_prompt=user_prompt, max_tokens=3000, call_type="export_narrative")
        return result.strip()
    except Exception as ai_err:
        log.warning(f"ai_client failed ({ai_err}), trying direct client")
        client = _anthropic_client()
        response = client.messages.create(model="claude-sonnet-4-6", max_tokens=3000, system=system_prompt, messages=[{"role": "user", "content": user_prompt}])
        return response.content[0].text.strip()


# ── HTML Templates ─────────────────────────────────────────────────────────────

_BASE_CSS = """
/* ── Page Setup ─────────────────────────────────────────── */
@page {
    size: letter;
    margin: 0.9in 0.85in 1in 0.85in;
    @top-center {
        content: string(doc-title);
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 8px;
        color: #8892a4;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 4px;
    }
    @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 8px;
        color: #8892a4;
    }
    @bottom-left {
        content: "CONFIDENTIAL — Journal Intelligence System";
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 8px;
        color: #c4310a;
        letter-spacing: 0.04em;
    }
}
@page cover { margin: 0; }
body {
    font-family: 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif;
    color: #1e2535;
    font-size: 10.5px;
    line-height: 1.75;
    background: #ffffff;
}
.cover {
    page: cover;
    width: 100%;
    height: 100vh;
    background: #0f1623;
    display: flex;
    flex-direction: column;
    padding: 0;
    margin: 0;
    page-break-after: always;
}
.cover-accent { height: 6px; background: linear-gradient(90deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%); }
.cover-body { padding: 72px 80px; flex: 1; }
.cover-label { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #d97706; font-weight: 700; margin-bottom: 8px; }
.cover-title { font-size: 32px; font-weight: 800; color: #f8fafc; line-height: 1.15; margin: 0 0 8px 0; string-set: doc-title content(); }
.cover-subtitle { font-size: 13px; color: #94a3b8; margin: 0 0 48px 0; font-weight: 400; }
.cover-divider { width: 48px; height: 3px; background: #d97706; margin-bottom: 48px; }
.cover-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 480px; }
.cover-meta-item label { display: block; font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
.cover-meta-item span { font-size: 12px; color: #e2e8f0; font-weight: 600; }
.cover-footer { padding: 24px 80px; border-top: 1px solid #1e2d40; display: flex; justify-content: space-between; align-items: center; }
.cover-footer-brand { font-size: 9px; color: #475569; letter-spacing: 0.08em; text-transform: uppercase; }
.cover-confidential { font-size: 8px; color: #c4310a; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; border: 1px solid #c4310a; padding: 3px 8px; border-radius: 2px; }
h1 { string-set: doc-title content(); font-size: 18px; font-weight: 800; color: #0f1623; border-bottom: 3px solid #d97706; padding-bottom: 8px; margin: 0 0 4px 0; display: none; }
h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #d97706; margin: 2.4em 0 0.8em; padding-bottom: 5px; border-bottom: 1px solid #f1e4c8; }
h3 { font-size: 10px; font-weight: 700; color: #334155; margin: 1.4em 0 0.4em; }
p { margin: 0.5em 0; }
.ai-narrative { background: #faf7f0; border-left: 4px solid #d97706; border-radius: 0 6px 6px 0; padding: 18px 22px; margin: 16px 0 24px; page-break-inside: avoid; }
.ai-narrative-label { font-size: 8px; letter-spacing: 0.14em; text-transform: uppercase; color: #d97706; font-weight: 700; margin-bottom: 10px; }
.ai-narrative p { font-size: 10.5px; line-height: 1.8; color: #2d3748; margin: 0.5em 0; }
.entry-block { border: 1px solid #e8edf4; border-left: 4px solid #94a3b8; border-radius: 0 6px 6px 0; padding: 11px 15px; margin-bottom: 10px; page-break-inside: avoid; background: #fafbfc; }
.entry-block.mood-high { border-left-color: #22c55e; background: #f8fff9; }
.entry-block.mood-mid  { border-left-color: #f59e0b; background: #fffdf5; }
.entry-block.mood-low  { border-left-color: #ef4444; background: #fff8f8; }
.entry-date { font-weight: 700; font-size: 10px; color: #334155; margin-bottom: 5px; }
.entry-summary { font-size: 10px; color: #475569; line-height: 1.65; margin: 4px 0; }
.mood-row { margin-top: 5px; display: flex; gap: 6px; flex-wrap: wrap; }
.mood-chart { margin: 12px 0 20px; }
.mood-bar-row { display: flex; align-items: center; margin-bottom: 5px; gap: 8px; font-size: 9px; }
.mood-bar-date { width: 78px; color: #64748b; flex-shrink: 0; }
.mood-bar-track { flex: 1; height: 10px; background: #f1f5f9; border-radius: 5px; overflow: hidden; }
.mood-bar-fill { height: 100%; border-radius: 5px; background: #22c55e; }
.mood-bar-fill.mid { background: #f59e0b; }
.mood-bar-fill.low { background: #ef4444; }
.mood-bar-val { width: 28px; text-align: right; color: #64748b; flex-shrink: 0; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; background: #f1f5f9; color: #475569; }
.badge-green  { background: #dcfce7; color: #166534; }
.badge-amber  { background: #fef3c7; color: #92400e; }
.badge-red    { background: #fee2e2; color: #991b1b; }
.badge-purple { background: #ede9fe; color: #6d28d9; }
.quote { border-left: 3px solid #d97706; padding: 6px 12px; font-style: italic; color: #334155; margin: 8px 0; font-size: 10px; background: #fdfaf4; border-radius: 0 4px 4px 0; }
.alert-card { border: 1px solid #fca5a5; border-left: 5px solid #ef4444; background: #fff8f8; border-radius: 0 6px 6px 0; padding: 12px 16px; margin-bottom: 10px; page-break-inside: avoid; }
.alert-card.medium { border-color: #fcd34d; border-left-color: #f59e0b; background: #fffdf0; }
.alert-card.low    { border-color: #cbd5e1; border-left-color: #94a3b8; background: #f8fafc; }
.alert-type { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #991b1b; margin-bottom: 4px; }
.alert-card.medium .alert-type { color: #92400e; }
.alert-card.low    .alert-type { color: #475569; }
.alert-desc { font-size: 10px; color: #334155; margin: 4px 0; }
.alert-ai { font-size: 9.5px; color: #475569; font-style: italic; margin-top: 6px; padding-top: 6px; border-top: 1px solid #f1f5f9; }
.evidence-table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin: 12px 0; }
.evidence-table th { background: #0f1623; color: #f8fafc; font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; padding: 7px 10px; text-align: left; font-weight: 700; }
.evidence-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; color: #334155; }
.evidence-table tr:nth-child(even) td { background: #f8fafc; }
.evidence-table .ev-quote { font-style: italic; color: #64748b; font-size: 9px; margin-top: 3px; }
.ev-bookmarked { color: #d97706; font-weight: 700; }
.chron-table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin: 12px 0; }
.chron-table th { background: #1e2535; color: #94a3b8; font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; padding: 7px 10px; text-align: left; }
.chron-table td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; color: #334155; }
.chron-table tr:nth-child(even) td { background: #fafbfd; }
.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0 24px; }
.stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-top: 3px solid #d97706; border-radius: 0 0 6px 6px; padding: 12px 14px; text-align: center; }
.stat-value { font-size: 22px; font-weight: 800; color: #0f1623; line-height: 1; margin-bottom: 4px; }
.stat-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; }
.section-break { page-break-before: always; }
ul { padding-left: 18px; margin: 4px 0; }
li { margin-bottom: 2px; font-size: 10px; color: #475569; }
footer { margin-top: 3em; padding-top: 10px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; text-align: center; display: none; }
"""


def _html_wrap(title: str, date_start: str, date_end: str,
               packet_type: str, redacted: bool, body: str) -> str:
    generated = datetime.now().strftime("%B %d, %Y at %H:%M")
    type_label = packet_type.replace("_", " ").title()
    redact_banner = (
        '<div style="background:#c4310a;color:#fff;text-align:center;font-size:9px;'
        'letter-spacing:0.12em;text-transform:uppercase;padding:5px;font-weight:700;">'
        '&#9888; REDACTED VERSION &#8212; Names and identifying information have been replaced'
        '</div>'
    ) if redacted else ""
    confidential_label = "REDACTED" if redacted else "Confidential"
    return (
        f"<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n"
        f"<title>{title}</title>\n<style>{_BASE_CSS}</style>\n</head>\n<body>\n"
        f'<div class="cover">'
        f'<div class="cover-accent"></div>'
        f'<div class="cover-body">'
        f'<div class="cover-label">{type_label}</div>'
        f'<div class="cover-title">{title}</div>'
        f'<div class="cover-subtitle">Journal Intelligence &#8212; Personal Record</div>'
        f'<div class="cover-divider"></div>'
        f'<div class="cover-meta-grid">'
        f'<div class="cover-meta-item"><label>Period Start</label><span>{date_start}</span></div>'
        f'<div class="cover-meta-item"><label>Period End</label><span>{date_end}</span></div>'
        f'<div class="cover-meta-item"><label>Report Type</label><span>{type_label}</span></div>'
        f'<div class="cover-meta-item"><label>Generated</label><span>{generated}</span></div>'
        f'</div>'
        f'</div>'
        f'<div class="cover-footer">'
        f'<div class="cover-footer-brand">journal.williamthomas.name</div>'
        f'<div class="cover-confidential">{confidential_label}</div>'
        f'</div>'
        f'</div>'
        f'{redact_banner}'
        f'{body}'
        f'\n</body>\n</html>'
    )


def _mood_color_class(score) -> str:
    try:
        s = float(score)
        if s >= 7:   return "badge-green"
        if s >= 4:   return "badge-amber"
        return "badge-red"
    except Exception:
        return "badge"


def _entry_mood_class(score) -> str:
    try:
        s = float(score)
        if s >= 7: return "mood-high"
        if s >= 4: return "mood-mid"
        return "mood-low"
    except Exception:
        return ""


def _bar_class(score) -> str:
    try:
        s = float(score)
        if s >= 7: return ""
        if s >= 4: return "mid"
        return "low"
    except Exception:
        return ""




def _notable_entries(entries: list, max_count: int = 8) -> list:
    """
    Return only the most notable entries for report display.
    Priority: high severity > has quotes > has key events > most recent.
    Caps at max_count to keep reports concise.
    """
    import json as _json

    def score(e):
        s = 0
        try: s += float(e.get("severity") or 0) * 2
        except Exception: pass
        try:
            if _json.loads(e.get("notable_quotes") or "[]"): s += 3
        except Exception: pass
        try:
            if _json.loads(e.get("key_events") or "[]"): s += 2
        except Exception: pass
        try: s += float(e.get("mood_score") or 5) * 0.1
        except Exception: pass
        return s

    ranked = sorted(entries, key=score, reverse=True)
    # Always include chronological order in final output
    top = sorted(ranked[:max_count], key=lambda e: e.get("entry_date", ""))
    return top


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
    entries  = data["entries"]
    alerts   = data["alerts"]
    evidence = data["evidence"]
    parts    = []
    notable  = _notable_entries(entries, max_count=6)

    # Stats row
    scores      = [float(e["mood_score"]) for e in entries if e.get("mood_score") not in (None, "")]
    avg_mood    = f"{sum(scores)/len(scores):.1f}" if scores else "—"
    high_alerts = sum(1 for a in alerts if float(a.get("priority_score") or 0) >= 7)
    parts.append(
        '<div class="stats-row">'
        f'<div class="stat-box"><div class="stat-value">{len(entries)}</div><div class="stat-label">Entries Analyzed</div></div>'
        f'<div class="stat-box"><div class="stat-value">{avg_mood}</div><div class="stat-label">Avg Mood Score</div></div>'
        f'<div class="stat-box"><div class="stat-value">{high_alerts}</div><div class="stat-label">High Priority Alerts</div></div>'
        f'<div class="stat-box"><div class="stat-value">{len(evidence)}</div><div class="stat-label">Evidence Items</div></div>'
        '</div>'
    )

    # AI Narrative — the actual report
    if narrative:
        parts.append(
            '<h2>Clinical Narrative</h2>'
            '<div class="ai-narrative">'
            '<div class="ai-narrative-label">&#10022; AI-Generated Analysis</div>'
            + _nl2p(narrative) +
            '</div>'
        )

    # Mood bar chart
    parts.append('<h2>Mood Arc</h2><div class="mood-chart">')
    for e in entries:
        score = e.get("mood_score", "")
        try:
            pct  = int(float(score) * 10)
            bcls = _bar_class(score)
        except Exception:
            pct, bcls = 0, ""
        score_str = f"{float(score):.1f}" if score != "" else "—"
        parts.append(
            '<div class="mood-bar-row">'
            f'<div class="mood-bar-date">{e["entry_date"]}</div>'
            f'<div class="mood-bar-track"><div class="mood-bar-fill {bcls}" style="width:{pct}%"></div></div>'
            f'<div class="mood-bar-val">{score_str}</div>'
            '</div>'
        )
    parts.append("</div>")

    # Notable entries only
    if notable:
        parts.append(f'<h2>Notable Entries <span style="font-size:9px;color:#94a3b8;font-weight:400;text-transform:none;">({len(notable)} of {len(entries)} shown)</span></h2>')
        for e in notable:
            import json as _j
            mood      = e.get("mood_label", "—")
            score     = e.get("mood_score", "")
            sev       = e.get("severity", "")
            summ      = e.get("summary_text") or ""
            mcls      = _mood_color_class(score)
            ecls      = _entry_mood_class(score)
            score_str = f"{float(score):.1f}" if score != "" else "—"
            sev_str   = f"{float(sev):.1f}"   if sev   != "" else "—"
            quotes = []
            try: quotes = _j.loads(e.get("notable_quotes") or "[]")
            except Exception: pass
            qt_html = "".join(f'<div class="quote">{q}</div>' for q in quotes[:1])
            parts.append(
                f'<div class="entry-block {ecls}">'
                f'<div class="entry-date">{e["entry_date"]}</div>'
                f'<div class="mood-row">'
                f'<span class="badge {mcls}">{mood} {score_str}</span>'
                f'<span class="badge badge-purple">sev {sev_str}</span>'
                f'</div>'
                f'<div class="entry-summary">{summ}</div>'
                f'{qt_html}'
                f'</div>'
            )

    # Alerts
    if alerts:
        parts.append("<h2>Patterns &amp; Alerts</h2>")
        for a in alerts:
            cls      = _alert_severity_class(a.get("priority_score", 0))
            ai       = _render_ai_analysis(a.get("ai_analysis", ""))
            ai_block = f'<div class="alert-ai">{ai}</div>' if ai else ""
            parts.append(
                f'<div class="alert-card {cls}">'
                f'<div class="alert-type">{a["alert_type"].replace("_"," ").upper()} &middot; Priority {a.get("priority_score","—")}</div>'
                f'<div class="alert-desc">{a.get("description","")}</div>'
                f'<div style="font-size:9px;color:#94a3b8;">{a.get("date_range_start","")} – {a.get("date_range_end","")}</div>'
                f'{ai_block}'
                f'</div>'
            )

    # Evidence table
    if evidence:
        rows = ""
        for ev in evidence:
            bm      = '<span class="ev-bookmarked">&#9733;</span> ' if ev.get("is_bookmarked") else ""
            qt      = ev.get("quote_text") or ""
            qt_html = f'<div class="ev-quote">"{qt}"</div>' if qt else ""
            rows   += (
                f'<tr><td>{ev["source_date"]}</td>'
                f'<td><span class="badge">{ev["evidence_type"]}</span></td>'
                f'<td>{bm}{ev["label"]}{qt_html}</td></tr>'
            )
        parts.append(
            '<h2>Evidence Vault</h2>'
            '<table class="evidence-table">'
            '<thead><tr><th>Date</th><th>Type</th><th>Item</th></tr></thead>'
            f'<tbody>{rows}</tbody></table>'
        )

    return "\n".join(parts)


def _body_incident_packet(data: dict, narrative: str) -> str:
    entries  = data["entries"]
    alerts   = data["alerts"]
    evidence = data["evidence"]
    parts    = []
    notable  = _notable_entries(entries, max_count=10)

    high_sev = sum(1 for e in entries if float(e.get("severity") or 0) >= 7)
    parts.append(
        '<div class="stats-row">'
        f'<div class="stat-box"><div class="stat-value">{len(entries)}</div><div class="stat-label">Entries</div></div>'
        f'<div class="stat-box"><div class="stat-value">{high_sev}</div><div class="stat-label">High Severity Days</div></div>'
        f'<div class="stat-box"><div class="stat-value">{len(alerts)}</div><div class="stat-label">Pattern Alerts</div></div>'
        f'<div class="stat-box"><div class="stat-value">{len(evidence)}</div><div class="stat-label">Evidence Items</div></div>'
        '</div>'
    )

    if narrative:
        parts.append(
            '<h2>Incident Narrative</h2>'
            '<div class="ai-narrative">'
            '<div class="ai-narrative-label">&#10022; AI-Generated Analysis</div>'
            + _nl2p(narrative) +
            '</div>'
        )

    if notable:
        parts.append(f'<h2>Key Entries <span style="font-size:9px;color:#94a3b8;font-weight:400;text-transform:none;">({len(notable)} of {len(entries)} shown)</span></h2>')
        for e in notable:
            import json as _j
            summ      = e.get("summary_text") or ""
            mood      = e.get("mood_label", "—")
            score     = e.get("mood_score", "")
            sev       = e.get("severity", "")
            mcls      = _mood_color_class(score)
            ecls      = _entry_mood_class(score)
            score_str = f"{float(score):.1f}" if score != "" else "—"
            sev_str   = f"{float(sev):.1f}"   if sev   != "" else "—"
            events, quotes = [], []
            try: events = _j.loads(e.get("key_events") or "[]")
            except Exception: pass
            try: quotes = _j.loads(e.get("notable_quotes") or "[]")
            except Exception: pass
            ev_html  = "".join(f"<li>{x}</li>" for x in events[:4])
            qt_html  = "".join(f'<div class="quote">{q}</div>' for q in quotes[:1])
            ul_block = f"<ul>{ev_html}</ul>" if ev_html else ""
            parts.append(
                f'<div class="entry-block {ecls}">'
                f'<div class="entry-date">{e["entry_date"]}</div>'
                f'<div class="mood-row">'
                f'<span class="badge {mcls}">{mood} {score_str}</span>'
                f'<span class="badge badge-purple">sev {sev_str}</span>'
                f'</div>'
                f'<p class="entry-summary">{summ}</p>'
                f'{ul_block}{qt_html}'
                f'</div>'
            )

    if alerts:
        parts.append("<h2>Active Pattern Alerts</h2>")
        for a in alerts:
            cls = _alert_severity_class(a.get("priority_score", 0))
            parts.append(
                f'<div class="alert-card {cls}">'
                f'<div class="alert-type">{a["alert_type"].replace("_"," ").upper()} &middot; Priority {a.get("priority_score","—")}</div>'
                f'<div class="alert-desc">{a.get("description","")}</div>'
                f'<div style="font-size:9px;color:#94a3b8;">{a.get("date_range_start","")} – {a.get("date_range_end","")}</div>'
                f'</div>'
            )

    if evidence:
        rows = ""
        for ev in evidence:
            bm      = '<span class="ev-bookmarked">&#9733;</span> ' if ev.get("is_bookmarked") else ""
            qt      = ev.get("quote_text") or ""
            qt_html = f'<div class="ev-quote">"{qt}"</div>' if qt else ""
            rows   += (
                f'<tr><td>{ev["source_date"]}</td>'
                f'<td><span class="badge">{ev["evidence_type"]}</span></td>'
                f'<td>{bm}{ev["label"]}{qt_html}</td></tr>'
            )
        parts.append(
            '<h2>Supporting Evidence</h2>'
            '<table class="evidence-table">'
            '<thead><tr><th>Date</th><th>Type</th><th>Item</th></tr></thead>'
            f'<tbody>{rows}</tbody></table>'
        )

    return "\n".join(parts)


def _body_pattern_report(data: dict, narrative: str) -> str:
    alerts  = data["alerts"]
    entries = data["entries"]
    parts   = []

    high = sum(1 for a in alerts if float(a.get("priority_score") or 0) >= 7)
    mid  = sum(1 for a in alerts if 4 <= float(a.get("priority_score") or 0) < 7)
    parts.append(
        '<div class="stats-row">'
        f'<div class="stat-box"><div class="stat-value">{len(alerts)}</div><div class="stat-label">Total Alerts</div></div>'
        f'<div class="stat-box"><div class="stat-value">{high}</div><div class="stat-label">High Priority</div></div>'
        f'<div class="stat-box"><div class="stat-value">{mid}</div><div class="stat-label">Medium Priority</div></div>'
        f'<div class="stat-box"><div class="stat-value">{len(entries)}</div><div class="stat-label">Entries Analyzed</div></div>'
        '</div>'
    )

    if narrative:
        parts.append(
            '<h2>Pattern Analysis</h2>'
            '<div class="ai-narrative">'
            '<div class="ai-narrative-label">&#10022; AI-Generated Analysis</div>'
            + _nl2p(narrative) +
            '</div>'
        )

    parts.append("<h2>Detected Alerts</h2>")
    if not alerts:
        parts.append("<p>No alerts detected in this date range.</p>")
    for a in alerts:
        cls      = _alert_severity_class(a.get("priority_score", 0))
        ai       = _render_ai_analysis(a.get("ai_analysis", ""))
        ai_block = f'<div class="alert-ai">{ai}</div>' if ai else ""
        parts.append(
            f'<div class="alert-card {cls}">'
            f'<div class="alert-type">{a["alert_type"].replace("_"," ").upper()} &middot; Priority {a.get("priority_score","—")}</div>'
            f'<div class="alert-desc">{a.get("description","")}</div>'
            f'<div style="font-size:9px;color:#94a3b8;">{a.get("date_range_start","")} – {a.get("date_range_end","")}</div>'
            f'{ai_block}'
            f'</div>'
        )

    parts.append('<h2>Mood Arc</h2><div class="mood-chart">')
    for e in entries:
        score = e.get("mood_score", "")
        try:
            pct  = int(float(score) * 10)
            bcls = _bar_class(score)
        except Exception:
            pct, bcls = 0, ""
        score_str = f"{float(score):.1f}" if score != "" else "—"
        parts.append(
            '<div class="mood-bar-row">'
            f'<div class="mood-bar-date">{e["entry_date"]}</div>'
            f'<div class="mood-bar-track"><div class="mood-bar-fill {bcls}" style="width:{pct}%"></div></div>'
            f'<div class="mood-bar-val">{score_str}</div>'
            '</div>'
        )
    parts.append("</div>")

    return "\n".join(parts)


def _body_weekly_digest(data: dict, narrative: str) -> str:
    entries  = data["entries"]
    alerts   = data["alerts"]
    parts    = []
    notable  = _notable_entries(entries, max_count=7)

    scores     = [float(e["mood_score"]) for e in entries if e.get("mood_score") not in (None, "")]
    avg_mood   = f"{sum(scores)/len(scores):.1f}" if scores else "—"
    best_day   = max(entries, key=lambda e: float(e.get("mood_score") or 0), default={})
    best_label = best_day.get("entry_date", "—") if best_day else "—"

    parts.append(
        '<div class="stats-row">'
        f'<div class="stat-box"><div class="stat-value">{len(entries)}</div><div class="stat-label">Days Journaled</div></div>'
        f'<div class="stat-box"><div class="stat-value">{avg_mood}</div><div class="stat-label">Avg Mood</div></div>'
        f'<div class="stat-box"><div class="stat-value">{len(alerts)}</div><div class="stat-label">Alerts</div></div>'
        f'<div class="stat-box"><div class="stat-value">{best_label}</div><div class="stat-label">Best Day</div></div>'
        '</div>'
    )

    if narrative:
        parts.append(
            '<h2>Week in Review</h2>'
            '<div class="ai-narrative">'
            '<div class="ai-narrative-label">&#10022; AI-Generated Analysis</div>'
            + _nl2p(narrative) +
            '</div>'
        )

    parts.append('<h2>Mood Overview</h2><div class="mood-chart">')
    for e in entries:
        score = e.get("mood_score", "")
        try:
            pct  = int(float(score) * 10)
            bcls = _bar_class(score)
        except Exception:
            pct, bcls = 0, ""
        score_str = f"{float(score):.1f}" if score != "" else "—"
        parts.append(
            '<div class="mood-bar-row">'
            f'<div class="mood-bar-date">{e["entry_date"]}</div>'
            f'<div class="mood-bar-track"><div class="mood-bar-fill {bcls}" style="width:{pct}%"></div></div>'
            f'<div class="mood-bar-val">{score_str}</div>'
            '</div>'
        )
    parts.append("</div>")

    if notable:
        parts.append(f'<h2>Highlights <span style="font-size:9px;color:#94a3b8;font-weight:400;text-transform:none;">({len(notable)} of {len(entries)} shown)</span></h2>')
        for e in notable:
            import json as _j
            summ      = e.get("summary_text") or "(no summary)"
            mood      = e.get("mood_label", "—")
            score     = e.get("mood_score", "")
            sev       = e.get("severity", "")
            mcls      = _mood_color_class(score)
            ecls      = _entry_mood_class(score)
            score_str = f"{float(score):.1f}" if score != "" else "—"
            sev_str   = f"{float(sev):.1f}"   if sev   != "" else "—"
            events = []
            try: events = _j.loads(e.get("key_events") or "[]")
            except Exception: pass
            ev_html  = "".join(f"<li>{x}</li>" for x in events[:3])
            ul_block = f"<ul>{ev_html}</ul>" if ev_html else ""
            parts.append(
                f'<div class="entry-block {ecls}">'
                f'<div class="entry-date">{e["entry_date"]}</div>'
                f'<div class="mood-row">'
                f'<span class="badge {mcls}">{mood} {score_str}</span>'
                f'<span class="badge badge-purple">sev {sev_str}</span>'
                f'</div>'
                f'<p class="entry-summary">{summ}</p>'
                f'{ul_block}'
                f'</div>'
            )

    if alerts:
        parts.append("<h2>Alerts This Period</h2>")
        for a in alerts:
            cls = _alert_severity_class(a.get("priority_score", 0))
            parts.append(
                f'<div class="alert-card {cls}">'
                f'<div class="alert-type">{a["alert_type"].replace("_"," ").upper()} &middot; Priority {a.get("priority_score","—")}</div>'
                f'<div class="alert-desc">{a.get("description","")}</div>'
                f'</div>'
            )

    return "\n".join(parts)


def _body_chronology(data: dict) -> str:
    entries = data["entries"]
    rows    = ""

    for e in entries:
        import json as _j
        events = []
        try: events = _j.loads(e.get("key_events") or "[]")
        except Exception: pass
        mood      = e.get("mood_label", "—")
        score     = e.get("mood_score", "")
        sev       = e.get("severity", "")
        mcls      = _mood_color_class(score)
        score_str = f"{float(score):.1f}" if score != "" else "—"
        sev_str   = f"{float(sev):.1f}"   if sev   != "" else "—"
        ev_str    = "; ".join(events[:3]) or "—"
        rows += (
            f'<tr>'
            f'<td>{e["entry_date"]}</td>'
            f'<td><span class="badge {mcls}">{mood} {score_str}</span></td>'
            f'<td>{sev_str}</td>'
            f'<td>{ev_str}</td>'
            f'</tr>'
        )

    return (
        '<h2>Chronological Record</h2>'
        '<table class="chron-table">'
        '<thead><tr><th>Date</th><th>Mood</th><th>Severity</th><th>Key Events</th></tr></thead>'
        f'<tbody>{rows}</tbody>'
        '</table>'
    )


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
        "Journal Intelligence System", meta_style))

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
              "*Journal Intelligence System*"]
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
    data = _fetch_data(date_start, date_end, user_id=user_id)

    # 2. Apply redaction if requested
    if redact:
        redact_cfg = _load_redaction()
        data = _redact_data(data, redact_cfg)

    # 3. Generate AI narrative (if applicable)
    narrative = ""
    if packet_type in PACKET_TYPES_WITH_AI:
        try:
            narrative = _call_ai_narrative(packet_type, data, date_start, date_end, user_id=user_id)
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
