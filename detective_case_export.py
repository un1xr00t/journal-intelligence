"""
src/nlp/detective_case_export.py

Generates a rich, print-quality PDF case report for Detective Mode.

Structure:
  - Cover page (case title, status, stats, generated timestamp)
  - Section 1: Case Intelligence Brief
  - Section 2: Investigation Log (all entries, severity/type badges, attachment analyses)
  - Section 3: Wire Briefings (chronological, full text)
  - Section 4: Photo Evidence (embedded base64 images + AI analyses)

PDF via WeasyPrint (HTML→PDF). Falls back to a plain-text PDF stub if unavailable.
"""

from __future__ import annotations

import base64
import logging
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

log = logging.getLogger("journal")

BASE_DIR   = Path("/opt/journal-dashboard")
DB_PATH    = BASE_DIR / "db" / "journal.db"
EXPORT_DIR = BASE_DIR / "data" / "derived" / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

DETECTIVE_STORAGE = BASE_DIR / "data" / "detective"


# ── DB helpers ─────────────────────────────────────────────────────────────────

def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ── Image helpers ──────────────────────────────────────────────────────────────

def _img_to_b64(path: str) -> Optional[str]:
    """Read image file and return base64 data URI, or None on failure."""
    try:
        if not path or not os.path.exists(path):
            return None
        ext = os.path.splitext(path)[1].lower().lstrip(".")
        mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg",
                    "png": "image/png", "gif": "image/gif", "webp": "image/webp"}
        mime = mime_map.get(ext, "image/jpeg")
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        return f"data:{mime};base64,{data}"
    except Exception as ex:
        log.warning(f"[detective_export] failed to embed image {path}: {ex}")
        return None


def _severity_color(severity: str) -> str:
    return {
        "critical": "#ef4444",
        "high":     "#f97316",
        "medium":   "#f59e0b",
        "low":      "#22c55e",
    }.get((severity or "medium").lower(), "#f59e0b")


def _type_color(entry_type: str) -> str:
    return {
        "note":        "#6366f1",
        "observation": "#38bdf8",
        "evidence":    "#22c55e",
        "incident":    "#ef4444",
        "confrontation": "#f97316",
        "conversation": "#a855f7",
        "pattern":     "#ec4899",
    }.get((entry_type or "note").lower(), "#6366f1")


def _esc(text: str) -> str:
    """Basic HTML escape."""
    if not text:
        return ""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


def _nl2p(text: str) -> str:
    if not text:
        return ""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    return "\n".join(f"<p>{_esc(p).replace(chr(10), '<br>')}</p>" for p in paras)


def _nl2div(text: str) -> str:
    if not text:
        return ""
    return "<br>".join(_esc(line) for line in text.splitlines())


# ── CSS ────────────────────────────────────────────────────────────────────────

_CSS = """
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; }

:root {
  --bg:           #080a14;
  --bg-card:      #0e1122;
  --bg-card2:     #12152a;
  --border:       rgba(255,255,255,0.07);
  --text:         #e8eaf6;
  --text-muted:   #7b82a6;
  --accent:       #6366f1;
  --accent2:      #a855f7;
  --accent3:      #38bdf8;
  --green:        #22c55e;
  --red:          #ef4444;
  --orange:       #f97316;
  --amber:        #f59e0b;
}

@page {
  size: A4;
  margin: 0;
}

body {
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  line-height: 1.65;
  margin: 0;
  padding: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── COVER PAGE ─────────────────────────────────────────────────── */
.cover {
  page-break-after: always;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #05050f 0%, #0a0820 40%, #050518 100%);
  padding: 0;
  position: relative;
  overflow: hidden;
}

.cover-glow {
  position: absolute;
  top: -120px; left: -120px;
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%);
  pointer-events: none;
}

.cover-glow2 {
  position: absolute;
  bottom: -80px; right: -80px;
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(168,85,247,0.09) 0%, transparent 70%);
  pointer-events: none;
}

.cover-accent-bar {
  height: 5px;
  background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899, #38bdf8);
  flex-shrink: 0;
}

.cover-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 72px 80px;
  position: relative;
  z-index: 1;
}

.cover-eyebrow {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 28px;
  opacity: 0.85;
}

.cover-tag {
  display: inline-block;
  background: rgba(239,68,68,0.15);
  border: 1px solid rgba(239,68,68,0.35);
  color: #ef4444;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 4px 12px;
  border-radius: 4px;
  margin-bottom: 24px;
}

.cover-title {
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: 44px;
  line-height: 1.1;
  color: #fff;
  letter-spacing: -0.02em;
  margin: 0 0 20px 0;
  max-width: 700px;
}

.cover-desc {
  font-size: 16px;
  color: rgba(232,234,246,0.65);
  max-width: 600px;
  line-height: 1.7;
  margin-bottom: 48px;
}

.cover-stats {
  display: flex;
  gap: 32px;
  margin-bottom: 48px;
}

.cover-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cover-stat-value {
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: 28px;
  color: var(--accent);
  line-height: 1;
}

.cover-stat-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.cover-divider {
  border: none;
  border-top: 1px solid rgba(99,102,241,0.2);
  margin: 0 0 36px 0;
}

.cover-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cover-meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

.cover-meta-label {
  color: rgba(99,102,241,0.7);
  min-width: 110px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 10px;
}

.cover-meta-val {
  color: rgba(232,234,246,0.8);
}

.cover-footer {
  padding: 24px 80px;
  border-top: 1px solid rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}

.cover-footer-left {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(123,130,166,0.5);
}

.cover-footer-right {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  color: rgba(123,130,166,0.5);
}

/* ── SECTIONS ───────────────────────────────────────────────────── */
.section {
  page-break-before: always;
  padding: 60px 72px 40px;
  background: var(--bg);
  min-height: 100vh;
}

.section:first-child { page-break-before: auto; }

.section-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 36px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(99,102,241,0.18);
}

.section-number {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--accent);
  opacity: 0.6;
  padding-top: 6px;
}

.section-title {
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: 24px;
  color: #fff;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.section-subtitle {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-top: 4px;
}

/* ── INTELLIGENCE BRIEF ─────────────────────────────────────────── */
.intel-card {
  background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(168,85,247,0.04));
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 20px;
}

.intel-card-bar {
  height: 3px;
  background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899);
}

.intel-card-body {
  padding: 28px 32px;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.85;
  color: var(--text);
}

.intel-section-block {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px 24px;
  margin-bottom: 12px;
}

.intel-section-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 10px;
}

.intel-section-text {
  font-size: 13px;
  color: var(--text);
  line-height: 1.75;
}

/* ── INVESTIGATION LOG ──────────────────────────────────────────── */
.entry-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
  page-break-inside: avoid;
}

.entry-card-bar {
  height: 3px;
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--border);
  background: rgba(0,0,0,0.2);
}

.entry-date {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
  min-width: 86px;
}

.badge {
  display: inline-block;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 4px;
  font-weight: 600;
}

.entry-body {
  padding: 14px 18px;
  font-size: 13px;
  color: var(--text);
  line-height: 1.75;
}

.entry-attachment {
  margin: 12px 18px 14px;
  background: rgba(34,197,94,0.04);
  border: 1px solid rgba(34,197,94,0.15);
  border-radius: 8px;
  padding: 14px 16px;
}

.entry-attachment-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #22c55e;
  margin-bottom: 6px;
}

.entry-attachment-filename {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.entry-attachment-analysis {
  font-size: 12px;
  color: var(--text);
  line-height: 1.65;
}

.entry-photo {
  margin: 4px 18px 14px;
  text-align: center;
}

.entry-photo img {
  max-width: 100%;
  max-height: 220px;
  border-radius: 8px;
  border: 1px solid var(--border);
  object-fit: contain;
}

/* ── WIRE BRIEFINGS ─────────────────────────────────────────────── */
.wire-card {
  background: linear-gradient(135deg, rgba(99,102,241,0.04), rgba(168,85,247,0.02));
  border: 1px solid rgba(99,102,241,0.15);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 16px;
  page-break-inside: avoid;
}

.wire-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(99,102,241,0.12);
  background: rgba(99,102,241,0.06);
}

.wire-drop-num {
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: 13px;
  color: var(--accent);
}

.wire-date {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--text-muted);
}

.wire-body {
  padding: 18px 20px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text);
  white-space: pre-wrap;
}

/* ── PHOTO EVIDENCE ─────────────────────────────────────────────── */
.photo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.photo-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  page-break-inside: avoid;
}

.photo-img-wrap {
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  overflow: hidden;
}

.photo-img-wrap img {
  max-width: 100%;
  max-height: 200px;
  object-fit: contain;
  display: block;
}

.photo-no-img {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  font-size: 36px;
  background: rgba(0,0,0,0.3);
  color: rgba(123,130,166,0.4);
}

.photo-meta {
  padding: 12px 14px 0;
  border-top: 1px solid var(--border);
}

.photo-filename {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--accent);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photo-date {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.photo-analysis {
  padding: 0 14px 14px;
  font-size: 11px;
  color: rgba(232,234,246,0.75);
  line-height: 1.65;
}

/* ── APPENDIX: FULL PHOTOS ──────────────────────────────────────── */
.appendix-photo-block {
  page-break-before: always;
  padding: 48px 72px 40px;
  background: var(--bg);
}

.appendix-photo-title {
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: 18px;
  color: var(--text-muted);
  margin-bottom: 24px;
  letter-spacing: -0.01em;
}

.appendix-photo-img {
  width: 100%;
  max-height: 520px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid var(--border);
  margin-bottom: 12px;
  display: block;
}

.appendix-caption {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.appendix-analysis {
  font-size: 12px;
  line-height: 1.7;
  color: rgba(232,234,246,0.7);
  margin-bottom: 32px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
}

/* ── EMPTY STATES ───────────────────────────────────────────────── */
.empty-state {
  padding: 36px 24px;
  text-align: center;
  color: var(--text-muted);
  font-style: italic;
  font-size: 13px;
  background: rgba(0,0,0,0.2);
  border: 1px dashed var(--border);
  border-radius: 8px;
}

p { margin: 0 0 10px 0; }
p:last-child { margin-bottom: 0; }
"""


# ── HTML builder ───────────────────────────────────────────────────────────────

def _cover_page(case: dict, stats: dict, generated: str) -> str:
    status = case.get("status") or "active"
    desc   = _esc(case.get("description") or "No description provided.")
    title  = _esc(case.get("title") or "Untitled Case")
    created = (case.get("created_at") or "")[:10]
    updated = (case.get("updated_at") or "")[:10]

    return f"""
<div class="cover">
  <div class="cover-glow"></div>
  <div class="cover-glow2"></div>
  <div class="cover-accent-bar"></div>
  <div class="cover-inner">
    <div class="cover-eyebrow">Journal Intelligence &nbsp;·&nbsp; Detective Mode &nbsp;·&nbsp; Case Report</div>
    <div class="cover-tag">CONFIDENTIAL</div>
    <h1 class="cover-title">{title}</h1>
    <p class="cover-desc">{desc}</p>

    <div class="cover-stats">
      <div class="cover-stat">
        <span class="cover-stat-value">{stats['entry_count']}</span>
        <span class="cover-stat-label">Log Entries</span>
      </div>
      <div class="cover-stat">
        <span class="cover-stat-value">{stats['photo_count']}</span>
        <span class="cover-stat-label">Evidence Photos</span>
      </div>
      <div class="cover-stat">
        <span class="cover-stat-value">{stats['wire_count']}</span>
        <span class="cover-stat-label">Wire Drops</span>
      </div>
      <div class="cover-stat">
        <span class="cover-stat-value" style="color: {'var(--green)' if status=='active' else 'var(--text-muted)'}">{status.upper()}</span>
        <span class="cover-stat-label">Case Status</span>
      </div>
    </div>

    <hr class="cover-divider">

    <div class="cover-meta">
      <div class="cover-meta-row">
        <span class="cover-meta-label">Case ID</span>
        <span class="cover-meta-val">#{case['id']}</span>
      </div>
      <div class="cover-meta-row">
        <span class="cover-meta-label">Opened</span>
        <span class="cover-meta-val">{created}</span>
      </div>
      <div class="cover-meta-row">
        <span class="cover-meta-label">Last Updated</span>
        <span class="cover-meta-val">{updated}</span>
      </div>
      <div class="cover-meta-row">
        <span class="cover-meta-label">Generated</span>
        <span class="cover-meta-val">{generated}</span>
      </div>
    </div>
  </div>
  <div class="cover-footer">
    <span class="cover-footer-left">Journal Intelligence &mdash; Detective Mode</span>
    <span class="cover-footer-right">This document contains sensitive investigative information. Handle accordingly.</span>
  </div>
</div>"""


def _section_intelligence(intel: dict) -> str:
    if not intel or not intel.get("summary"):
        return """
<div class="section">
  <div class="section-header">
    <span class="section-number">01</span>
    <div>
      <div class="section-title">Case Intelligence Brief</div>
      <div class="section-subtitle">AI-synthesized case summary</div>
    </div>
  </div>
  <div class="empty-state">No intelligence brief generated yet. Drop a Wire from the workspace to generate one.</div>
</div>"""

    summary = intel["summary"]
    ec   = intel.get("entry_count", 0)
    wc   = intel.get("wire_count", 0)
    upd  = (intel.get("last_updated") or "")[:16].replace("T", " ")

    # Try to parse structured sections
    def _parse(text, header):
        import re
        m = re.search(rf'{re.escape(header)}:\s*([\s\S]*?)(?=\n[A-Z ]+/[A-Z ]+:|(?=\n[A-Z][A-Z ]+:)|$)', text)
        return m.group(1).strip() if m else None

    sections_raw = [
        ("CORE PICTURE",         "🔍", "Core Picture",         "rgba(99,102,241,0.15)",  "#6366f1"),
        ("KEY SUBJECTS",         "👤", "Key Subjects",          "rgba(168,85,247,0.1)",   "#a855f7"),
        ("BEHAVIORAL PATTERNS",  "📈", "Behavioral Patterns",   "rgba(245,158,11,0.1)",   "#f59e0b"),
        ("CRITICAL EVIDENCE",    "🗂",  "Critical Evidence",     "rgba(34,197,94,0.1)",    "#22c55e"),
        ("ANOMALIES/RED FLAGS",  "⚠️",  "Anomalies / Red Flags", "rgba(239,68,68,0.1)",    "#ef4444"),
        ("RECOMMENDED ACTION",   "→",  "Recommended Action",    "rgba(56,189,248,0.1)",   "#38bdf8"),
    ]

    parsed_any = False
    blocks_html = ""
    for header_key, icon, label, bg, color in sections_raw:
        val = _parse(summary, header_key)
        if val:
            parsed_any = True
            blocks_html += f"""
    <div class="intel-section-block" style="background: {bg}; border-color: {color}22;">
      <div class="intel-section-label" style="color: {color};">{icon}&nbsp; {label}</div>
      <div class="intel-section-text">{_nl2div(val)}</div>
    </div>"""

    # If we couldn't parse sections, just show raw
    if not parsed_any:
        blocks_html = f"""
    <div class="intel-card">
      <div class="intel-card-bar"></div>
      <div class="intel-card-body">{_esc(summary)}</div>
    </div>"""

    return f"""
<div class="section">
  <div class="section-header">
    <span class="section-number">01</span>
    <div>
      <div class="section-title">Case Intelligence Brief</div>
      <div class="section-subtitle">{ec} entries &nbsp;·&nbsp; {wc} wire drop{'s' if wc != 1 else ''} incorporated &nbsp;·&nbsp; last updated {upd}</div>
    </div>
  </div>
  {blocks_html}
</div>"""


def _section_log(entries: list) -> str:
    if not entries:
        return """
<div class="section">
  <div class="section-header">
    <span class="section-number">02</span>
    <div>
      <div class="section-title">Investigation Log</div>
      <div class="section-subtitle">Chronological entry record</div>
    </div>
  </div>
  <div class="empty-state">No investigation log entries recorded for this case.</div>
</div>"""

    cards = ""
    for e in entries:
        etype    = (e.get("entry_type") or "note").lower()
        sev      = (e.get("severity")   or "medium").lower()
        tc       = _type_color(etype)
        sc       = _severity_color(sev)
        content  = _esc(e.get("content") or "")
        date_str = (e.get("created_at") or "")[:16].replace("T", " ")

        attachment_html = ""
        if e.get("attachment_status") == "done" and e.get("attachment_analysis"):
            fname = _esc(e.get("attachment_filename") or "attachment")
            analysis = _esc(e.get("attachment_analysis") or "")
            attachment_html = f"""
      <div class="entry-attachment">
        <div class="entry-attachment-label">📎 Attached Evidence Photo</div>
        <div class="entry-attachment-filename">{fname}</div>
        <div class="entry-attachment-analysis">{analysis}</div>
      </div>"""

            # Try to embed the actual photo
            apath = e.get("attachment_path")
            if apath:
                b64 = _img_to_b64(apath)
                if b64:
                    attachment_html += f"""
      <div class="entry-photo">
        <img src="{b64}" alt="{fname}">
      </div>"""

        cards += f"""
    <div class="entry-card">
      <div class="entry-card-bar" style="background: linear-gradient(90deg, {tc}, {sc});"></div>
      <div class="entry-header">
        <span class="entry-date">{date_str}</span>
        <span class="badge" style="background: {tc}22; border: 1px solid {tc}44; color: {tc};">{etype.upper()}</span>
        <span class="badge" style="background: {sc}22; border: 1px solid {sc}44; color: {sc};">{sev.upper()}</span>
      </div>
      <div class="entry-body">{content}</div>
      {attachment_html}
    </div>"""

    return f"""
<div class="section">
  <div class="section-header">
    <span class="section-number">02</span>
    <div>
      <div class="section-title">Investigation Log</div>
      <div class="section-subtitle">{len(entries)} entr{'ies' if len(entries) != 1 else 'y'} · oldest first</div>
    </div>
  </div>
  {cards}
</div>"""


def _section_wires(wires: list) -> str:
    if not wires:
        return """
<div class="section">
  <div class="section-header">
    <span class="section-number">03</span>
    <div>
      <div class="section-title">Wire Briefings</div>
      <div class="section-subtitle">Full intelligence briefing history</div>
    </div>
  </div>
  <div class="empty-state">No wire briefings on record for this case.</div>
</div>"""

    cards = ""
    for i, w in enumerate(reversed(wires)):
        num      = i + 1
        date_str = (w.get("created_at") or "")[:16].replace("T", " ")
        briefing = _esc(w.get("briefing") or "")
        cards += f"""
    <div class="wire-card">
      <div class="wire-header">
        <span style="font-size:15px;">📡</span>
        <span class="wire-drop-num">Wire Drop #{num}</span>
        <span class="wire-date">{date_str}</span>
      </div>
      <div class="wire-body">{briefing}</div>
    </div>"""

    return f"""
<div class="section">
  <div class="section-header">
    <span class="section-number">03</span>
    <div>
      <div class="section-title">Wire Briefings</div>
      <div class="section-subtitle">{len(wires)} briefing{'s' if len(wires) != 1 else ''} on record</div>
    </div>
  </div>
  {cards}
</div>"""


def _section_photos(uploads: list) -> str:
    if not uploads:
        return """
<div class="section">
  <div class="section-header">
    <span class="section-number">04</span>
    <div>
      <div class="section-title">Photo Evidence</div>
      <div class="section-subtitle">Gallery uploads with AI analysis</div>
    </div>
  </div>
  <div class="empty-state">No evidence photos uploaded for this case.</div>
</div>"""

    cards = ""
    for u in uploads:
        fname    = _esc(u.get("original_filename") or "photo")
        date_str = (u.get("created_at") or "")[:10]
        analysis = _esc(u.get("ai_analysis") or "No analysis available.")
        fpath    = u.get("file_path") or u.get("stored_path")

        img_html = '<div class="photo-no-img">📷</div>'
        if fpath:
            b64 = _img_to_b64(fpath)
            if b64:
                img_html = f'<div class="photo-img-wrap"><img src="{b64}" alt="{fname}"></div>'

        cards += f"""
      <div class="photo-card">
        {img_html}
        <div class="photo-meta">
          <div class="photo-filename">{fname}</div>
          <div class="photo-date">{date_str}</div>
        </div>
        <div class="photo-analysis">{analysis}</div>
      </div>"""

    return f"""
<div class="section">
  <div class="section-header">
    <span class="section-number">04</span>
    <div>
      <div class="section-title">Photo Evidence</div>
      <div class="section-subtitle">{len(uploads)} photo{'s' if len(uploads) != 1 else ''} on record</div>
    </div>
  </div>
  <div class="photo-grid">
    {cards}
  </div>
</div>"""


def _appendix_photos(uploads: list) -> str:
    """Full-size photos appendix — one per page-block."""
    if not uploads:
        return ""

    blocks = ""
    for u in uploads:
        fname    = _esc(u.get("original_filename") or "photo")
        date_str = (u.get("created_at") or "")[:16].replace("T", " ")
        analysis = _esc(u.get("ai_analysis") or "")
        fpath    = u.get("file_path") or u.get("stored_path")

        b64 = _img_to_b64(fpath) if fpath else None
        if not b64:
            continue

        blocks += f"""
  <div class="appendix-photo-block">
    <div class="appendix-photo-title">Appendix: {fname}</div>
    <img class="appendix-photo-img" src="{b64}" alt="{fname}">
    <div class="appendix-caption">FILE: {fname} &nbsp;·&nbsp; CAPTURED: {date_str}</div>
    {'<div class="appendix-analysis">' + analysis + '</div>' if analysis else ''}
  </div>"""

    if not blocks:
        return ""

    return f"""
<div style="page-break-before: always; padding: 60px 72px 20px; background: var(--bg);">
  <div style="font-family: 'Syne', sans-serif; font-weight: 800; font-size: 24px; color: #fff; margin-bottom: 8px;">Appendix: Full Evidence Photos</div>
  <div style="font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 36px; border-bottom: 1px solid rgba(99,102,241,0.18); padding-bottom: 18px;">Full resolution images</div>
</div>
{blocks}"""


def _build_html(case: dict, entries: list, uploads: list, wires: list, intel: Optional[dict]) -> str:
    generated = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    stats = {
        "entry_count": len(entries),
        "photo_count": len(uploads),
        "wire_count":  len(wires),
    }

    cover       = _cover_page(case, stats, generated)
    sec_intel   = _section_intelligence(intel)
    sec_log     = _section_log(entries)
    sec_wires   = _section_wires(wires)
    sec_photos  = _section_photos(uploads)
    appendix    = _appendix_photos(uploads)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Case Report — {_esc(case.get('title', 'Case'))}</title>
<style>{_CSS}</style>
</head>
<body>
{cover}
{sec_intel}
{sec_log}
{sec_wires}
{sec_photos}
{appendix}
</body>
</html>"""


# ── PDF rendering ──────────────────────────────────────────────────────────────

def _render_pdf(html: str) -> bytes:
    try:
        from weasyprint import HTML as WP
        return WP(string=html).write_pdf()
    except ImportError:
        pass
    try:
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.lib.pagesizes import A4
        from io import BytesIO
        buf = BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=A4)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(72, 750, "Case Report — PDF backend not fully available.")
        c.setFont("Helvetica", 11)
        c.drawString(72, 728, "Install weasyprint for rich PDF output:")
        c.drawString(72, 712, "  pip install weasyprint --break-system-packages")
        c.save()
        return buf.getvalue()
    except Exception:
        raise RuntimeError(
            "No PDF backend available. Install weasyprint: "
            "pip install weasyprint --break-system-packages"
        )


# ── Public API ─────────────────────────────────────────────────────────────────

def generate_case_pdf(case_id: int, user_id: int) -> dict:
    """
    Generate a full case PDF report.

    Returns:
      {
        "path":     str  — absolute path to the PDF file,
        "filename": str  — suggested download filename,
        "html":     str  — the rendered HTML (for debugging / HTML export),
      }
    """
    conn = _db()
    try:
        # Fetch case
        case = conn.execute(
            "SELECT id, title, description, status, created_at, updated_at "
            "FROM detective_cases WHERE id = ? AND user_id = ?",
            (case_id, user_id)
        ).fetchone()
        if not case:
            raise ValueError(f"Case {case_id} not found for user {user_id}")
        case = dict(case)

        # Fetch entries (oldest first for the log)
        entries = conn.execute(
            "SELECT id, content, entry_type, severity, created_at, "
            "attachment_path, attachment_filename, attachment_analysis, attachment_status "
            "FROM detective_entries WHERE case_id = ? ORDER BY created_at ASC",
            (case_id,)
        ).fetchall()
        entries = [dict(e) for e in entries]

        # Fetch gallery uploads
        uploads = conn.execute(
            "SELECT id, original_filename, file_path, ai_analysis, analysis_status, created_at "
            "FROM detective_uploads WHERE case_id = ? ORDER BY created_at ASC",
            (case_id,)
        ).fetchall()
        uploads = [dict(u) for u in uploads]

        # Fetch wire history (oldest first)
        wires = conn.execute(
            "SELECT id, briefing, created_at "
            "FROM detective_wire_history WHERE case_id = ? ORDER BY created_at ASC",
            (case_id,)
        ).fetchall()
        wires = [dict(w) for w in wires]

        # Fetch intelligence brief
        intel = conn.execute(
            "SELECT summary, entry_count, wire_count, last_updated "
            "FROM case_intelligence WHERE case_id = ? AND user_id = ?",
            (case_id, user_id)
        ).fetchone()
        intel = dict(intel) if intel else None

    finally:
        conn.close()

    # Build HTML
    html = _build_html(case, entries, uploads, wires, intel)

    # Render PDF
    pdf_bytes = _render_pdf(html)

    # Persist
    safe_title = "".join(c if c.isalnum() or c in "-_" else "_" for c in (case["title"] or "case"))[:40]
    filename   = f"case_report_{case_id}_{safe_title}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    out_dir    = EXPORT_DIR / f"user_{user_id}" / "detective"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path   = out_dir / filename

    with open(str(out_path), "wb") as f:
        f.write(pdf_bytes)

    log.info(f"[detective_export] generated {out_path} ({len(pdf_bytes):,} bytes)")

    return {
        "path":     str(out_path),
        "filename": filename,
        "html":     html,
    }
