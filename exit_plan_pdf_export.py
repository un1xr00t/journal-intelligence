"""
src/nlp/exit_plan_pdf_export.py

Exit plan PDF/HTML export.
Generates a structured, printable document of:
  - Plan overview (type, phases, completion %)
  - Phase-by-phase task list with status, priority, notes
  - Support network contacts
  - AI narrative summary (optional, uses per-user key via ai_client)

Usage:
    from src.nlp.exit_plan_pdf_export import generate_exit_plan_pdf
    result = generate_exit_plan_pdf(user_id=1, fmt="pdf", include_notes=True, include_contacts=True)
    # returns { filename, file_path, format }

Route added to exit_plan_routes.py:
    POST /api/exit-plan/export-pdf
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

log = logging.getLogger("journal.exit_plan_pdf")

BASE_DIR   = Path("/opt/journal-dashboard")
DB_PATH    = BASE_DIR / "db" / "journal.db"
EXPORT_DIR = BASE_DIR / "data" / "derived" / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)


# ── PDF backend detection ─────────────────────────────────────────────────────

def _pdf_backend():
    try:
        import weasyprint  # noqa
        return "weasyprint"
    except Exception:
        pass
    try:
        from reportlab.pdfgen import canvas  # noqa
        return "reportlab"
    except Exception:
        pass
    return None

PDF_BACKEND = _pdf_backend()


# ── DB helpers ────────────────────────────────────────────────────────────────

def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _fetch_plan_data(user_id: int) -> dict:
    """Pull exit plan, phases, tasks, notes, and contacts for a user."""
    conn = _db()
    try:
        plan = conn.execute(
            "SELECT * FROM exit_plans WHERE user_id = ? AND status != 'deleted'",
            (user_id,)
        ).fetchone()
        if not plan:
            return {}

        plan = dict(plan)
        plan_id = plan["id"]

        phases = [dict(r) for r in conn.execute(
            "SELECT * FROM exit_plan_phases WHERE plan_id = ? ORDER BY phase_order",
            (plan_id,)
        ).fetchall()]

        for ph in phases:
            ph["tasks"] = [dict(r) for r in conn.execute(
                "SELECT * FROM exit_plan_tasks WHERE phase_id = ? ORDER BY priority DESC, created_at",
                (ph["id"],)
            ).fetchall()]
            for t in ph["tasks"]:
                t["notes"] = [dict(r) for r in conn.execute(
                    "SELECT note_text, created_at FROM exit_plan_notes WHERE task_id = ? ORDER BY created_at ASC",
                    (t["id"],)
                ).fetchall()]
                t["attachment_count"] = conn.execute(
                    "SELECT COUNT(*) FROM exit_plan_attachments WHERE task_id = ?",
                    (t["id"],)
                ).fetchone()[0]

        plan_notes = [dict(r) for r in conn.execute(
            "SELECT note_text, created_at FROM exit_plan_notes WHERE plan_id = ? AND task_id IS NULL ORDER BY created_at ASC",
            (plan_id,)
        ).fetchall()]

        contacts = []
        try:
            contacts = [dict(r) for r in conn.execute(
                "SELECT * FROM exit_plan_contacts WHERE user_id = ? ORDER BY name",
                (user_id,)
            ).fetchall()]
        except Exception:
            pass

        # Completion stats
        all_tasks = [t for ph in phases for t in ph["tasks"]]
        total = len([t for t in all_tasks if t["status"] != "skipped"])
        done  = len([t for t in all_tasks if t["status"] == "done"])
        pct   = round((done / total * 100) if total > 0 else 0)

        return {
            "plan":       plan,
            "phases":     phases,
            "plan_notes": plan_notes,
            "contacts":   contacts,
            "stats":      {"total": total, "done": done, "pct": pct},
        }
    finally:
        conn.close()


# ── AI narrative ──────────────────────────────────────────────────────────────

def _ai_narrative(data: dict, user_id: int) -> str:
    """Generate a brief AI narrative for the export. Uses per-user API key."""
    try:
        from src.api.ai_client import create_message
        from src.api.onboarding_routes import load_user_memory

        stats  = data["stats"]
        phases = data["phases"]

        phase_lines = []
        for ph in phases:
            done_tasks = [t for t in ph["tasks"] if t["status"] == "done"]
            phase_lines.append(
                f"  Phase {ph['phase_order']}: {ph['title']} ({ph['status']}) — "
                f"{len(done_tasks)}/{len(ph['tasks'])} tasks done"
            )

        prompt = (
            "You are writing a brief, compassionate 2-3 paragraph narrative for an exit plan progress export. "
            "Do not reference journal entries or personal details. "
            "Summarize the person's progress, acknowledge their effort, and encourage continued momentum. "
            "Keep it under 200 words. Plain prose only.\n\n"
            f"Plan type: {data['plan']['plan_type']}\n"
            f"Overall: {stats['done']}/{stats['total']} tasks complete ({stats['pct']}%)\n"
            f"Phase progress:\n" + "\n".join(phase_lines)
        )

        response = create_message(
            user_id=user_id,
            system="You are a supportive, plain-spoken assistant writing export narratives. Be warm but concise.",
            user=prompt,
            max_tokens=400,
        )
        return response.strip()
    except Exception as exc:
        log.warning("AI narrative failed for exit plan export: %s", exc)
        return ""


# ── CSS ───────────────────────────────────────────────────────────────────────

_CSS = """
body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #1a1a2e;
    margin: 48px;
    line-height: 1.7;
    font-size: 13px;
}
h1 { color: #2c2c54; border-bottom: 3px solid #6366f1; padding-bottom: 8px; font-size: 22px; }
h2 { color: #40407a; margin-top: 2em; font-size: 15px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
h3 { color: #444; font-size: 12px; margin: 1.2em 0 0.4em; text-transform: uppercase; letter-spacing: 0.08em; }
.meta { color: #777; font-size: 11px; margin-bottom: 1.6em; }
.badge {
    display: inline-block;
    background: #f0f0ff;
    color: #5558aa;
    padding: 2px 9px;
    border-radius: 12px;
    font-size: 11px;
    margin-right: 4px;
}
.badge-green  { background: #f0fff4; color: #27ae60; }
.badge-orange { background: #fff8f0; color: #e67e22; }
.badge-red    { background: #fff0f0; color: #c0392b; }
.badge-gray   { background: #f5f5f5; color: #888; }
.ai-narrative {
    background: #f8f8ff;
    border-left: 4px solid #6366f1;
    padding: 14px 18px;
    margin: 18px 0;
    border-radius: 0 6px 6px 0;
    font-size: 13px;
}
.phase-block {
    border: 1px solid #e0e0f0;
    border-radius: 8px;
    margin-bottom: 20px;
    page-break-inside: avoid;
}
.phase-header {
    background: #f4f4ff;
    padding: 10px 16px;
    border-radius: 8px 8px 0 0;
    border-bottom: 1px solid #e0e0f0;
}
.phase-title  { font-weight: bold; font-size: 14px; color: #2c2c54; }
.phase-status { font-size: 11px; color: #888; margin-top: 2px; }
.phase-body   { padding: 12px 16px; }
.task-row {
    display: grid;
    grid-template-columns: 20px 1fr 80px 80px;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid #f4f4f8;
    font-size: 12px;
    align-items: start;
}
.task-row:last-child { border-bottom: none; }
.task-title   { color: #333; line-height: 1.5; }
.task-done    { text-decoration: line-through; color: #aaa; }
.task-skipped { color: #bbb; font-style: italic; }
.task-note {
    font-size: 11px;
    color: #666;
    padding: 4px 8px;
    background: #f9f9ff;
    border-left: 2px solid #c7c7f5;
    margin: 4px 0 4px 28px;
    font-style: italic;
}
.progress-bar-wrap {
    background: #eee;
    border-radius: 4px;
    height: 8px;
    margin: 6px 0;
    width: 200px;
    display: inline-block;
    vertical-align: middle;
}
.progress-bar-fill {
    background: #6366f1;
    height: 8px;
    border-radius: 4px;
}
.contacts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-top: 10px;
}
.contacts-table th {
    background: #f4f4ff;
    color: #5558aa;
    padding: 6px 10px;
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 2px solid #ddd;
}
.contacts-table td {
    padding: 6px 10px;
    border-bottom: 1px solid #f0f0f0;
    color: #333;
}
footer {
    margin-top: 3em;
    padding-top: 1em;
    font-size: 10px;
    color: #aaa;
    border-top: 1px solid #ddd;
}
@media print { .phase-block { page-break-inside: avoid; } }
"""

PRIORITY_BADGE = {
    "critical": "badge-red",
    "high":     "badge-orange",
    "normal":   "badge",
    "low":      "badge-gray",
}

STATUS_ICON = {
    "done":     "✓",
    "doing":    "→",
    "next":     "◎",
    "backlog":  "○",
    "skipped":  "⊘",
}


def _phase_pct(phase: dict) -> int:
    tasks = [t for t in phase["tasks"] if t["status"] != "skipped"]
    if not tasks:
        return 0
    done = len([t for t in tasks if t["status"] == "done"])
    return round(done / len(tasks) * 100)


def _build_html(data: dict, narrative: str, include_notes: bool, include_contacts: bool) -> str:
    plan     = data["plan"]
    phases   = data["phases"]
    contacts = data["contacts"]
    stats    = data["stats"]
    now      = datetime.now().strftime("%Y-%m-%d %H:%M")

    plan_type_label = plan["plan_type"].replace("_", " ").title()
    generated_at    = plan.get("generated_at", "")[:10]
    branches_raw    = plan.get("branches", "[]")
    try:
        branches = json.loads(branches_raw)
    except Exception:
        branches = []

    branches_html = " ".join(
        f'<span class="badge">{b}</span>' for b in branches
    ) if branches else ""

    pct_fill = f'<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:{stats["pct"]}%"></div></div>'

    header = f"""
<h1>🗺 Exit Plan</h1>
<div class="meta">
  <span class="badge">{plan_type_label}</span>
  <span class="badge">Created {generated_at}</span>
  <span class="badge">Exported {now}</span>
</div>
<p>
  <strong>Overall progress:</strong> {stats["done"]}/{stats["total"]} tasks complete &nbsp;
  {pct_fill} &nbsp; <strong>{stats["pct"]}%</strong>
</p>
{f'<p><strong>Focus areas:</strong> {branches_html}</p>' if branches_html else ''}
"""

    narrative_html = ""
    if narrative:
        narrative_html = f'<h2>Progress Summary</h2><div class="ai-narrative">{narrative}</div>'

    # Phases + tasks
    phases_html_parts = ["<h2>Plan Details</h2>"]
    for ph in phases:
        ph_pct  = _phase_pct(ph)
        ph_icon = {"active": "▶", "locked": "🔒", "complete": "✓"}.get(ph["status"], "○")
        ph_fill = f'<div class="progress-bar-wrap" style="width:120px"><div class="progress-bar-fill" style="width:{ph_pct}%"></div></div>'
        status_label = ph["status"].title()

        tasks_html = []
        for t in ph["tasks"]:
            title_cls = ""
            if t["status"] == "done":     title_cls = "task-done"
            elif t["status"] == "skipped": title_cls = "task-skipped"

            icon  = STATUS_ICON.get(t["status"], "○")
            pbadge = PRIORITY_BADGE.get(t["priority"], "badge")
            due_html = f'<span class="badge-gray badge">{t["due_date"][:10]}</span>' if t.get("due_date") else ""

            notes_html = ""
            if include_notes and t.get("notes"):
                notes_html = "".join(
                    f'<div class="task-note">{n["note_text"]}</div>'
                    for n in t["notes"]
                )

            attach_badge = ""
            if t.get("attachment_count", 0) > 0:
                attach_badge = f' <span class="badge-gray badge">📎 {t["attachment_count"]}</span>'

            tasks_html.append(f"""
<div>
  <div class="task-row">
    <span>{icon}</span>
    <span class="task-title {title_cls}">{t["title"]}{attach_badge}</span>
    <span><span class="{pbadge} badge">{t["priority"]}</span></span>
    <span>{due_html}</span>
  </div>
  {notes_html}
</div>""")

        phases_html_parts.append(f"""
<div class="phase-block">
  <div class="phase-header">
    <div class="phase-title">{ph_icon} Phase {ph["phase_order"]}: {ph["title"]}</div>
    <div class="phase-status">{status_label} · {ph_pct}% complete &nbsp; {ph_fill}</div>
  </div>
  <div class="phase-body">
    {''.join(tasks_html) if tasks_html else '<p style="color:#aaa;font-size:11px">No tasks in this phase.</p>'}
  </div>
</div>""")

    phases_section = "\n".join(phases_html_parts)

    # Plan-level notes
    plan_notes_html = ""
    if include_notes and data.get("plan_notes"):
        notes_rows = "".join(
            f'<div class="task-note">{n["note_text"]}</div>'
            for n in data["plan_notes"]
        )
        plan_notes_html = f"<h2>Plan Notes</h2>{notes_rows}"

    # Contacts
    contacts_html = ""
    if include_contacts and contacts:
        rows = "".join(
            f"""<tr>
              <td>{c.get("name","")}</td>
              <td>{c.get("role","")}</td>
              <td>{c.get("phone","")}</td>
              <td>{c.get("email","")}</td>
              <td>{c.get("notes","")}</td>
            </tr>"""
            for c in contacts
        )
        contacts_html = f"""
<h2>Support Network</h2>
<table class="contacts-table">
  <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Notes</th></tr></thead>
  <tbody>{rows}</tbody>
</table>"""

    body = header + narrative_html + phases_section + plan_notes_html + contacts_html

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Exit Plan Export</title>
<style>{_CSS}</style>
</head>
<body>
{body}
<footer>Journal Intelligence · journal.williamthomas.name · CONFIDENTIAL — This document is private.</footer>
</body>
</html>"""


def _to_pdf_weasyprint(html: str) -> bytes:
    import weasyprint
    return weasyprint.HTML(string=html).write_pdf()


def _to_pdf_reportlab(data: dict, narrative: str) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
    )

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
                             leftMargin=0.8*inch, rightMargin=0.8*inch,
                             topMargin=0.8*inch, bottomMargin=0.8*inch)

    styles = getSampleStyleSheet()
    accent = HexColor("#6366f1")
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=HexColor("#2c2c54"), fontSize=18)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=HexColor("#40407a"), fontSize=13)
    h3 = ParagraphStyle("h3", parent=styles["Heading3"], textColor=HexColor("#444"), fontSize=11)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=11, leading=16)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=9, textColor=HexColor("#777"))

    plan     = data["plan"]
    stats    = data["stats"]
    phases   = data["phases"]
    contacts = data["contacts"]

    story = []
    story.append(Paragraph("Exit Plan Export", h1))
    story.append(Paragraph(
        f"Type: {plan['plan_type'].replace('_',' ').title()} · "
        f"Progress: {stats['done']}/{stats['total']} tasks ({stats['pct']}%) · "
        f"Generated: {datetime.now().strftime('%Y-%m-%d')}",
        small
    ))
    story.append(Spacer(1, 0.15*inch))
    story.append(HRFlowable(width="100%", thickness=2, color=accent))
    story.append(Spacer(1, 0.1*inch))

    if narrative:
        story.append(Paragraph("Progress Summary", h2))
        for para in narrative.split("\n\n"):
            if para.strip():
                story.append(Paragraph(para.strip(), body))
                story.append(Spacer(1, 0.06*inch))
        story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph("Plan Details", h2))
    for ph in phases:
        ph_pct = _phase_pct(ph)
        story.append(Spacer(1, 0.1*inch))
        story.append(Paragraph(
            f"<b>Phase {ph['phase_order']}: {ph['title']}</b> — {ph['status'].title()} · {ph_pct}% complete",
            h3
        ))
        for t in ph["tasks"]:
            icon = STATUS_ICON.get(t["status"], "○")
            line = f"{icon} [{t['priority'].upper()}] {t['title']}"
            if t.get("due_date"):
                line += f" (due {t['due_date'][:10]})"
            story.append(Paragraph(line, body))
            for n in t.get("notes", []):
                story.append(Paragraph(f"   ↳ {n['note_text']}", small))

    if contacts:
        story.append(Spacer(1, 0.2*inch))
        story.append(Paragraph("Support Network", h2))
        table_data = [["Name", "Role", "Phone", "Email"]]
        for c in contacts:
            table_data.append([c.get("name",""), c.get("role",""), c.get("phone",""), c.get("email","")])
        t = Table(table_data, colWidths=[1.5*inch, 1.5*inch, 1.3*inch, 2.2*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), accent),
            ("TEXTCOLOR",  (0,0), (-1,0), HexColor("#ffffff")),
            ("FONTSIZE",   (0,0), (-1,-1), 9),
            ("GRID",       (0,0), (-1,-1), 0.5, HexColor("#cccccc")),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [HexColor("#f8f8ff"), HexColor("#ffffff")]),
        ]))
        story.append(t)

    story.append(Spacer(1, 0.3*inch))
    story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#dddddd")))
    story.append(Paragraph("Journal Intelligence · journal.williamthomas.name · CONFIDENTIAL", small))

    doc.build(story)
    return buf.getvalue()


# ── Public entry point ────────────────────────────────────────────────────────

def generate_exit_plan_pdf(
    user_id:          int,
    fmt:              str  = "pdf",
    include_notes:    bool = True,
    include_contacts: bool = True,
    include_narrative: bool = True,
) -> dict:
    """
    Generate an exit plan export document.

    Returns { filename, file_path, format }
    Raises RuntimeError if no plan found or no PDF backend.
    """
    data = _fetch_plan_data(user_id)
    if not data:
        raise RuntimeError("No active exit plan found for this user.")

    narrative = ""
    if include_narrative and fmt in ("pdf", "html"):
        narrative = _ai_narrative(data, user_id)

    html = _build_html(data, narrative, include_notes, include_contacts)

    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"exit_plan_export_{ts}.{fmt}"
    file_path = EXPORT_DIR / filename

    if fmt == "pdf":
        if PDF_BACKEND == "weasyprint":
            file_path.write_bytes(_to_pdf_weasyprint(html))
        elif PDF_BACKEND == "reportlab":
            file_path.write_bytes(_to_pdf_reportlab(data, narrative))
        else:
            raise RuntimeError(
                "No PDF backend available. "
                "Run: pip install weasyprint --break-system-packages"
            )
    elif fmt == "html":
        file_path.write_text(html, encoding="utf-8")
    else:
        raise ValueError(f"Unsupported format: {fmt}")

    log.info("Exit plan export written to %s", file_path)
    return {
        "filename":  filename,
        "file_path": str(file_path),
        "format":    fmt,
    }
