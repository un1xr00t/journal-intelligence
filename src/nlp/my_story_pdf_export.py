"""
src/nlp/my_story_pdf_export.py

Generates a rich, print-quality PDF for My Story narratives.

Structure:
  - Cover page  (title, purpose badge, style, generated timestamp)
  - Section 1:  The Narrative  (full story text, formatted)
  - Section 2:  Source Summary (data sources used)

PDF via WeasyPrint (HTML->PDF). Falls back to plain stub if unavailable.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

log = logging.getLogger("journal")

BASE_DIR   = Path("/opt/journal-dashboard")
EXPORT_DIR = BASE_DIR / "data" / "derived" / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

_EST = timezone(timedelta(hours=-5))


# ── Helpers ────────────────────────────────────────────────────────────────────

def _esc(text: str) -> str:
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
    return "\n".join(
        f'<p style="margin:0 0 14px 0; font-size:12px; line-height:1.9; color:rgba(232,234,246,0.9);">'
        f'{_esc(p).replace(chr(10), "<br>")}</p>'
        for p in paras
    )


PURPOSE_META = {
    "general":   {"label": "GENERAL",   "color": "#6366f1", "bg": "rgba(99,102,241,0.15)",   "border": "rgba(99,102,241,0.35)",  "desc": "For anyone who needs to understand"},
    "therapist": {"label": "THERAPIST", "color": "#22c55e", "bg": "rgba(34,197,94,0.12)",    "border": "rgba(34,197,94,0.3)",    "desc": "Clinical context, patterns & impact"},
    "lawyer":    {"label": "LAWYER",    "color": "#f59e0b", "bg": "rgba(245,158,11,0.12)",   "border": "rgba(245,158,11,0.3)",   "desc": "Evidence-grounded, factual brief"},
    "family":    {"label": "FAMILY",    "color": "#ec4899", "bg": "rgba(236,72,153,0.12)",   "border": "rgba(236,72,153,0.3)",   "desc": "Warm, accessible, honest"},
    "friend":    {"label": "FRIEND",    "color": "#06b6d4", "bg": "rgba(6,182,212,0.12)",    "border": "rgba(6,182,212,0.3)",    "desc": "Real and direct, no softening"},
    "court":     {"label": "COURT",     "color": "#ef4444", "bg": "rgba(239,68,68,0.15)",    "border": "rgba(239,68,68,0.35)",   "desc": "Documented facts & conduct patterns"},
}

STYLE_META = {
    "advocate": "Third person — someone in your corner explaining everything",
    "personal": "First person — written as if you finally found the words yourself",
    "clinical": "Clinical — structured sections, precise language",
    "timeline": "Timeline — chronological arc showing how things progressed",
}


# ── CSS ────────────────────────────────────────────────────────────────────────

_CSS = """
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; }

:root {
  --bg:         #080a14;
  --bg-card:    #0e1122;
  --border:     rgba(255,255,255,0.07);
  --text:       #e8eaf6;
  --text-muted: #7b82a6;
  --accent:     #6366f1;
}

@page { size: A4; margin: 0; }

body {
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 11px;
  line-height: 1.55;
  margin: 0;
  padding: 0;
}

/* ── COVER ──────────────────────────────────────────────────────────── */
.cover {
  page-break-after: always;
  height: 297mm;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #05050f 0%, #0a0820 40%, #050518 100%);
  position: relative;
  overflow: hidden;
}

.cover-glow {
  position: absolute;
  top: -120px;
  left: -120px;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(99,102,241,0.13) 0%, transparent 70%);
  pointer-events: none;
}

.cover-glow-2 {
  position: absolute;
  bottom: -80px;
  right: -80px;
  width: 380px;
  height: 380px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(168,85,247,0.09) 0%, transparent 70%);
  pointer-events: none;
}

.cover-top {
  padding: 40px 56px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cover-eyebrow {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #7b82a6;
}

.cover-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 56px;
}

.cover-star {
  font-size: 28px;
  color: var(--accent);
  margin-bottom: 18px;
  line-height: 1;
}

.cover-title {
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: 36px;
  color: #fff;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin-bottom: 14px;
}

.cover-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: rgba(232,234,246,0.55);
  line-height: 1.5;
  max-width: 480px;
  margin-bottom: 32px;
}

.cover-divider {
  width: 56px;
  height: 2px;
  background: linear-gradient(90deg, var(--accent) 0%, transparent 100%);
  margin-bottom: 28px;
}

.cover-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 24px;
}

.cover-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 14px;
  border-radius: 20px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.cover-style-pill {
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  color: #7b82a6;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cover-stats {
  display: flex;
  gap: 32px;
  margin-bottom: 20px;
}

.cover-stat-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 8px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #7b82a6;
  margin-bottom: 4px;
}

.cover-stat-value {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 22px;
  color: #fff;
  line-height: 1;
}

.cover-bottom {
  padding: 20px 56px 32px;
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cover-bottom-left {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  color: #7b82a6;
  letter-spacing: 0.08em;
}

.cover-bottom-right {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  color: #7b82a6;
  text-align: right;
}

/* ── SECTIONS ───────────────────────────────────────────────────────── */
.section {
  padding: 36px 56px 28px;
  background: var(--bg);
  page-break-inside: avoid;
}

.section-header {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(99,102,241,0.18);
}

.section-number {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.15em;
  color: #6366f1;
  background: rgba(99,102,241,0.12);
  border: 1px solid rgba(99,102,241,0.25);
  border-radius: 4px;
  padding: 4px 8px;
  margin-top: 2px;
  flex-shrink: 0;
}

.section-title {
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: 19px;
  color: #fff;
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}

.section-subtitle {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #7b82a6;
}

/* ── NARRATIVE BODY ─────────────────────────────────────────────────── */
.narrative-block {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.07);
  border-left: 3px solid #6366f1;
  border-radius: 0 10px 10px 0;
  padding: 22px 26px;
  margin-bottom: 12px;
}

/* ── SOURCE PILLS ───────────────────────────────────────────────────── */
.source-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.source-pill {
  padding: 8px 16px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #a0a8c8;
  letter-spacing: 0.06em;
}

/* ── FOOTER ─────────────────────────────────────────────────────────── */
.page-footer {
  position: running(footer);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 8px;
  color: #4a5070;
  padding: 0 56px;
  display: flex;
  justify-content: space-between;
  border-top: 1px solid rgba(255,255,255,0.05);
  padding-top: 8px;
}

@page {
  @bottom-center { content: element(footer); }
}
"""


# ── Cover page ─────────────────────────────────────────────────────────────────

PURPOSE_INTROS = {
    "general": (
        "What follows is a personal account — honest, grounded, and written entirely "
        "from the inside. These are not summaries or interpretations from the outside. "
        "This is one person's lived experience, put into words so that others can finally understand."
    ),
    "therapist": (
        "This document has been prepared to give you the full picture before our first conversation. "
        "What follows is not a list of complaints or a curated impression — it is a raw, honest account "
        "of what I have been carrying. I hope it gives you the context to help me make sense of it."
    ),
    "lawyer": (
        "This is a first-person account of events as I have lived and documented them. "
        "It is intended to give you the clearest possible picture of what has happened, "
        "what I have witnessed, and what I believe needs to be understood before we proceed."
    ),
    "family": (
        "I have spent a long time trying to find the right words. This is my attempt. "
        "I am not asking you to take sides — I am asking you to understand. "
        "What follows is the truth of what I have been going through, written as clearly as I know how."
    ),
    "friend": (
        "You asked me how I was really doing. This is the honest answer. "
        "I have tried to say this out loud a hundred times and never quite got it right. "
        "So I wrote it down. Read it, and then you'll know."
    ),
    "court": (
        "This document presents a factual account of documented events and patterns of conduct "
        "as experienced and recorded by the author. The contents are drawn directly from personal "
        "journal records and case documentation maintained over time. Nothing here is fabricated or embellished."
    ),
}


def _cover(display_name: str, purpose: str, style: str, word_count: int, sources: dict, generated: str) -> str:
    pm    = PURPOSE_META.get(purpose, PURPOSE_META["general"])
    intro = PURPOSE_INTROS.get(purpose, PURPOSE_INTROS["general"])

    # Derive a short date string for the cover (e.g. "March 2026")
    try:
        from datetime import datetime
        date_label = datetime.now(_EST).strftime("%B %Y")
    except Exception:
        date_label = generated[:7]

    return f"""
<div class="cover">
  <div class="cover-glow"></div>
  <div class="cover-glow-2"></div>

  <!-- Top bar -->
  <div class="cover-top">
    <div class="cover-eyebrow">A Personal Document</div>
    <div class="cover-eyebrow">Private &amp; Confidential</div>
  </div>

  <!-- Main body — vertically centered -->
  <div class="cover-body">

    <!-- Accent rule -->
    <div style="width:40px; height:3px; background:linear-gradient(90deg,{pm['color']} 0%,transparent 100%); margin-bottom:40px; border-radius:2px;"></div>

    <!-- Name — the hero element -->
    <div style="font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:{pm['color']}; margin-bottom:14px;">Written by</div>
    <div style="font-family:'Syne',sans-serif; font-weight:800; font-size:52px; color:#ffffff; letter-spacing:-0.03em; line-height:1; margin-bottom:8px;">{_esc(display_name)}</div>

    <!-- Title -->
    <div style="font-family:'Syne',sans-serif; font-weight:700; font-size:20px; color:rgba(232,234,246,0.45); letter-spacing:-0.01em; margin-bottom:48px;">My Story</div>

    <!-- Long rule -->
    <div style="width:100%; height:1px; background:linear-gradient(90deg, rgba(255,255,255,0.12) 0%, transparent 100%); margin-bottom:40px;"></div>

    <!-- Intro paragraph — the premium element -->
    <div style="font-family:'Georgia','Times New Roman',serif; font-size:14px; line-height:1.85; color:rgba(232,234,246,0.72); max-width:520px; font-style:italic;">
      {_esc(intro)}
    </div>

  </div>

  <!-- Bottom bar -->
  <div class="cover-bottom">
    <div class="cover-bottom-left">
      {_esc(date_label)}
    </div>
    <div class="cover-bottom-right">
      Personal document. Handle with care.
    </div>
  </div>
</div>"""


# ── Narrative section ──────────────────────────────────────────────────────────

def _section_narrative(narrative: str, purpose: str) -> str:
    import re
    pm     = PURPOSE_META.get(purpose, PURPOSE_META["general"])
    accent = pm["color"]

    # Try to detect ## headings for structured styles
    parts = re.split(r'^##\s+(.+)$', narrative, flags=re.MULTILINE)

    if len(parts) >= 3:
        blocks_html = ""
        i = 1
        while i < len(parts) - 1:
            heading = parts[i].strip()
            body    = parts[i + 1].strip() if i + 1 < len(parts) else ""
            paras   = [p.strip() for p in body.split("\n\n") if p.strip()]
            para_html = "".join(
                f'<p style="margin:0 0 12px 0; font-size:12px; line-height:1.9; color:rgba(232,234,246,0.9);">'
                f'{_esc(p).replace(chr(10), "<br>")}</p>'
                for p in paras
            )
            blocks_html += f"""
    <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.07); border-left:3px solid {accent}; border-radius:0 10px 10px 0; padding:18px 22px; margin-bottom:14px; page-break-inside:avoid;">
      <div style="font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:0.15em; text-transform:uppercase; color:{accent}; margin-bottom:12px;">{_esc(heading)}</div>
      {para_html}
    </div>"""
            i += 2
    else:
        # No headings — single flowing narrative block
        paras = [p.strip() for p in narrative.split("\n\n") if p.strip()]
        para_html = "".join(
            f'<p style="margin:0 0 14px 0; font-size:12px; line-height:1.9; color:rgba(232,234,246,0.9);">'
            f'{_esc(p).replace(chr(10), "<br>")}</p>'
            for p in paras
        )
        blocks_html = f"""
    <div class="narrative-block" style="border-left-color:{accent};">
      {para_html}
    </div>"""

    return f"""
<div class="section" style="page-break-before: always;">
  <div class="section-header">
    <span class="section-number">01</span>
    <div>
      <div class="section-title">The Narrative</div>
      <div class="section-subtitle">AI-synthesized personal account</div>
    </div>
  </div>
  {blocks_html}
</div>"""


# ── Closing page ───────────────────────────────────────────────────────────────

CLOSING_NOTES = {
    "general": (
        "This is not a complaint. It is not an accusation. It is a record — "
        "of what was experienced, what was felt, and what was real. "
        "These words were not written to convince anyone of anything. "
        "They were written because the truth deserves to exist somewhere, "
        "in writing, in full, without apology."
    ),
    "therapist": (
        "Everything in this document came from my own private journals — "
        "thoughts I wrote in real time, as things were happening. "
        "I did not edit them to sound better or more coherent. "
        "I am sharing them because I want you to understand what I was actually living through, "
        "not a cleaned-up version of it. I trust you with this."
    ),
    "lawyer": (
        "The account contained in this document is based entirely on contemporaneous "
        "personal records maintained over time. "
        "Dates, details, and descriptions reflect what was documented as events occurred. "
        "I have not embellished or omitted anything material. "
        "I am prepared to speak to any part of this in greater detail."
    ),
    "family": (
        "I know this may be hard to read. I know it might raise questions, "
        "or change the way you see things. That is okay. "
        "I am not sharing this to hurt anyone or to make you choose sides. "
        "I am sharing it because I needed someone who loves me to finally understand "
        "what I have been carrying — and because I believe you can handle the truth."
    ),
    "friend": (
        "You have known me for a long time. You know I do not exaggerate "
        "and I do not ask for help easily. "
        "The fact that I am putting this in writing should tell you how serious it is. "
        "I just needed someone who actually knows me to have the full picture. "
        "That is you. Thank you for reading this."
    ),
    "court": (
        "The author of this document has maintained detailed personal records "
        "throughout the events described herein. "
        "The narrative presented is a faithful account derived directly from those records. "
        "The author is available to provide sworn testimony consistent with "
        "everything contained in this document and to produce the underlying source materials upon request."
    ),
}


def _section_closing(display_name: str, purpose: str, generated: str) -> str:
    pm      = PURPOSE_META.get(purpose, PURPOSE_META["general"])
    closing = CLOSING_NOTES.get(purpose, CLOSING_NOTES["general"])

    try:
        from datetime import datetime
        date_label = datetime.now(_EST).strftime("%B %Y")
    except Exception:
        date_label = generated[:7]

    return f"""
<div style="background:#080a14; padding:48px 56px 56px; position:relative; overflow:hidden; margin-top:0;">

  <!-- Full-width rule to separate from narrative -->
  <div style="width:100%; height:1px; background:linear-gradient(90deg, rgba(99,102,241,0.3) 0%, transparent 80%); margin-bottom:44px;"></div>

  <!-- Accent line + label -->
  <div style="width:32px; height:2px; background:linear-gradient(90deg,{pm['color']} 0%,transparent 100%); margin-bottom:14px; border-radius:2px;"></div>
  <div style="font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:0.2em; text-transform:uppercase; color:#4a5070; margin-bottom:20px;">A note from the author</div>

  <!-- Closing paragraph -->
  <div style="font-family:'Georgia','Times New Roman',serif; font-size:12px; line-height:1.9; color:rgba(232,234,246,0.7); font-style:italic; max-width:520px; margin-bottom:36px;">
    {_esc(closing)}
  </div>

  <!-- What this document is -->
  <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:18px 22px; margin-bottom:32px; max-width:560px;">
    <div style="font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:0.14em; text-transform:uppercase; color:#4a5070; margin-bottom:12px;">What this document is</div>
    <div style="font-size:11px; line-height:1.75; color:rgba(232,234,246,0.6);">
      This narrative was generated by Journal Intelligence — a private, self-hosted journaling application.
      It was built from {_esc(display_name)}'s own journal entries and personal records, written in real time as events unfolded.
      Nothing in this document was invented, embellished, or added after the fact.
      The words and events are real. The record exists. This is what it says.
    </div>
  </div>

  <!-- Signature -->
  <div style="display:flex; align-items:baseline; gap:16px;">
    <div style="font-family:'Syne',sans-serif; font-weight:800; font-size:26px; color:#ffffff; letter-spacing:-0.02em; line-height:1;">{_esc(display_name)}</div>
    <div style="font-family:'IBM Plex Mono',monospace; font-size:9px; color:#4a5070; letter-spacing:0.1em;">{_esc(date_label)}</div>
  </div>

</div>"""


# ── HTML builder ───────────────────────────────────────────────────────────────

def _build_html(narrative: str, display_name: str, purpose: str, style: str, sources: dict) -> str:
    generated  = datetime.now(_EST).strftime("%Y-%m-%d %H:%M EST")
    word_count = len(narrative.split())

    cover     = _cover(display_name, purpose, style, word_count, sources, generated)
    sec_nar   = _section_narrative(narrative, purpose)
    sec_close = _section_closing(display_name, purpose, generated)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>My Story — {_esc(display_name)}</title>
<style>{_CSS}</style>
</head>
<body>
{cover}
{sec_nar}
{sec_close}
<div class="page-footer">
  <span>Journal Intelligence  ·  My Story</span>
  <span>Personal document — handle with care</span>
  <span>{_esc(display_name)}  ·  {generated}</span>
</div>
</body>
</html>"""


# ── PDF render ─────────────────────────────────────────────────────────────────

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
        c.drawString(72, 750, "My Story — PDF backend not fully available.")
        c.setFont("Helvetica", 11)
        c.drawString(72, 728, "Install weasyprint for rich PDF output:")
        c.drawString(72, 712, "  pip install weasyprint --break-system-packages")
        c.save()
        return buf.getvalue()
    except Exception:
        raise RuntimeError(
            "No PDF backend available. Install: pip install weasyprint --break-system-packages"
        )


# ── Public API ─────────────────────────────────────────────────────────────────

def generate_story_pdf(
    narrative: str,
    display_name: str,
    user_id: int,
    purpose: str = "general",
    style: str = "advocate",
    sources: dict = None,
) -> dict:
    """
    Generate a My Story PDF.

    Returns:
      {"path": str, "filename": str, "html": str}
    """
    if sources is None:
        sources = {}

    html      = _build_html(narrative, display_name, purpose, style, sources)
    pdf_bytes = _render_pdf(html)

    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in display_name)[:30]
    filename  = f"my_story_{safe_name}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    out_dir   = EXPORT_DIR / f"user_{user_id}" / "my_story"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path  = out_dir / filename

    with open(str(out_path), "wb") as f:
        f.write(pdf_bytes)

    log.info(f"[my_story_export] generated {out_path} ({len(pdf_bytes):,} bytes)")

    return {
        "path":     str(out_path),
        "filename": filename,
        "html":     html,
    }
