"""
src/api/budget_routes.py

GET  /api/budget/plan  — load saved budget for current user
POST /api/budget/plan  — save/upsert budget plan
POST /api/budget/ai    — proxy prompt to Claude via create_message
"""

from __future__ import annotations
import json
import logging
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from typing import List

logger = logging.getLogger("journal")


# ── Pydantic models ───────────────────────────────────────────────────────────

class ExpenseItem(BaseModel):
    name: str
    amount: float

class BudgetPlan(BaseModel):
    income: float
    rent: float
    utilities: float
    expenses: List[ExpenseItem]


class ScenarioData(BaseModel):
    income:    float
    rent:      float
    utilities: float
    expenses:  List[ExpenseItem]

class BudgetComparison(BaseModel):
    name:       str
    label_a:    str
    label_b:    str
    scenario_a: ScenarioData
    scenario_b: ScenarioData

class BudgetAIRequest(BaseModel):
    prompt: str
    max_tokens: int = 400


# ── Route registration ────────────────────────────────────────────────────────

def register_budget_routes(app, require_any_user):

    def _ensure_table():
        from src.auth.auth_db import get_db
        conn = get_db()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS budget_plans (
                user_id    INTEGER PRIMARY KEY,
                plan_json  TEXT    NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        conn.close()

    _ensure_table()

    @app.get("/api/budget/plan")
    async def get_budget_plan(current_user: dict = Depends(require_any_user)):
        from src.auth.auth_db import get_db
        user_id = current_user["id"]
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT plan_json FROM budget_plans WHERE user_id = ?",
                (user_id,)
            ).fetchone()
            if not row:
                return {"exists": False}
            return {"exists": True, "plan": json.loads(row["plan_json"])}
        finally:
            conn.close()

    @app.post("/api/budget/plan")
    async def save_budget_plan(
        plan: BudgetPlan,
        current_user: dict = Depends(require_any_user),
    ):
        from src.auth.auth_db import get_db
        user_id = current_user["id"]
        plan_json = json.dumps(plan.dict())
        conn = get_db()
        try:
            conn.execute("""
                INSERT INTO budget_plans (user_id, plan_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    plan_json  = excluded.plan_json,
                    updated_at = CURRENT_TIMESTAMP
            """, (user_id, plan_json))
            conn.commit()
            return {"saved": True}
        finally:
            conn.close()


    # ── Create comparisons table ──────────────────────────────────────────────
    def _ensure_comparisons_table():
        from src.auth.auth_db import get_db
        conn = get_db()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS budget_comparisons (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id        INTEGER NOT NULL,
                name           TEXT    NOT NULL,
                label_a        TEXT    NOT NULL,
                label_b        TEXT    NOT NULL,
                scenario_a_json TEXT   NOT NULL,
                scenario_b_json TEXT   NOT NULL,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        conn.close()

    _ensure_comparisons_table()

    @app.post("/api/budget/comparisons")
    async def save_comparison(
        comp: BudgetComparison,
        current_user: dict = Depends(require_any_user),
    ):
        from src.auth.auth_db import get_db
        user_id = current_user["id"]
        conn = get_db()
        try:
            conn.execute("""
                INSERT INTO budget_comparisons
                    (user_id, name, label_a, label_b, scenario_a_json, scenario_b_json)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                user_id, comp.name, comp.label_a, comp.label_b,
                json.dumps(comp.scenario_a.dict()),
                json.dumps(comp.scenario_b.dict()),
            ))
            conn.commit()
            row_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            return {"saved": True, "id": row_id}
        finally:
            conn.close()

    @app.get("/api/budget/comparisons")
    async def list_comparisons(current_user: dict = Depends(require_any_user)):
        from src.auth.auth_db import get_db
        user_id = current_user["id"]
        conn = get_db()
        try:
            rows = conn.execute("""
                SELECT id, name, label_a, label_b,
                       scenario_a_json, scenario_b_json, created_at
                FROM budget_comparisons
                WHERE user_id = ?
                ORDER BY created_at DESC
            """, (user_id,)).fetchall()
            return {"comparisons": [
                {
                    "id":         r["id"],
                    "name":       r["name"],
                    "label_a":    r["label_a"],
                    "label_b":    r["label_b"],
                    "scenario_a": json.loads(r["scenario_a_json"]),
                    "scenario_b": json.loads(r["scenario_b_json"]),
                    "created_at": r["created_at"],
                }
                for r in rows
            ]}
        finally:
            conn.close()

    @app.get("/api/budget/comparisons/{comp_id}")
    async def get_comparison(
        comp_id: int,
        current_user: dict = Depends(require_any_user),
    ):
        from src.auth.auth_db import get_db
        user_id = current_user["id"]
        conn = get_db()
        try:
            row = conn.execute("""
                SELECT id, name, label_a, label_b,
                       scenario_a_json, scenario_b_json, created_at
                FROM budget_comparisons
                WHERE id = ? AND user_id = ?
            """, (comp_id, user_id)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Comparison not found")
            return {
                "id":         row["id"],
                "name":       row["name"],
                "label_a":    row["label_a"],
                "label_b":    row["label_b"],
                "scenario_a": json.loads(row["scenario_a_json"]),
                "scenario_b": json.loads(row["scenario_b_json"]),
                "created_at": row["created_at"],
            }
        finally:
            conn.close()

    @app.delete("/api/budget/comparisons/{comp_id}")
    async def delete_comparison(
        comp_id: int,
        current_user: dict = Depends(require_any_user),
    ):
        from src.auth.auth_db import get_db
        user_id = current_user["id"]
        conn = get_db()
        try:
            conn.execute(
                "DELETE FROM budget_comparisons WHERE id = ? AND user_id = ?",
                (comp_id, user_id)
            )
            conn.commit()
            return {"deleted": True}
        finally:
            conn.close()

    @app.post("/api/budget/comparisons/pdf")
    async def export_comparison_pdf(
        comp: BudgetComparison,
        current_user: dict = Depends(require_any_user),
    ):
        import io
        from fastapi.responses import StreamingResponse
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.lib import colors
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
            )
        except ImportError:
            raise HTTPException(status_code=500, detail="reportlab not installed")

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter,
                                leftMargin=0.75*inch, rightMargin=0.75*inch,
                                topMargin=0.75*inch, bottomMargin=0.75*inch)

        styles = getSampleStyleSheet()
        BG      = colors.HexColor("#0d0f14")
        ACCENT  = colors.HexColor("#6366f1")
        AMBER   = colors.HexColor("#f59e0b")
        WHITE   = colors.HexColor("#f1f5f9")
        MUTED   = colors.HexColor("#64748b")
        GREEN   = colors.HexColor("#22c55e")
        RED     = colors.HexColor("#ef4444")

        title_style = ParagraphStyle("T", parent=styles["Title"],
            fontSize=22, textColor=WHITE, spaceAfter=4, fontName="Helvetica-Bold")
        sub_style   = ParagraphStyle("S", parent=styles["Normal"],
            fontSize=10, textColor=MUTED, spaceAfter=18, fontName="Helvetica")
        head_style  = ParagraphStyle("H", parent=styles["Normal"],
            fontSize=13, textColor=ACCENT, fontName="Helvetica-Bold", spaceAfter=8)
        head2_style = ParagraphStyle("H2", parent=styles["Normal"],
            fontSize=13, textColor=AMBER, fontName="Helvetica-Bold", spaceAfter=8)
        body_style  = ParagraphStyle("B", parent=styles["Normal"],
            fontSize=10, textColor=WHITE, fontName="Helvetica", spaceAfter=4)
        mono_style  = ParagraphStyle("M", parent=styles["Normal"],
            fontSize=10, textColor=WHITE, fontName="Courier", spaceAfter=4)

        def scenario_block(s: ScenarioData, label: str, hs):
            housing    = s.rent + s.utilities
            exp_total  = sum(e.amount for e in s.expenses)
            total      = housing + exp_total
            leftover   = s.income - total
            lo_color   = GREEN if leftover > 300 else (AMBER if leftover > 0 else RED)

            rows = [
                [Paragraph(label, hs), ""],
                [Paragraph("Monthly Income", body_style),
                 Paragraph(f"${s.income:,.0f}", mono_style)],
                [Paragraph("Rent / Mortgage", body_style),
                 Paragraph(f"${s.rent:,.0f}", mono_style)],
                [Paragraph("Utilities", body_style),
                 Paragraph(f"${s.utilities:,.0f}", mono_style)],
            ]
            for e in s.expenses:
                rows.append([
                    Paragraph(e.name, body_style),
                    Paragraph(f"${e.amount:,.0f}", mono_style),
                ])
            rows += [
                ["", ""],
                [Paragraph("Total Spending", ParagraphStyle("X", parent=body_style, textColor=MUTED)),
                 Paragraph(f"${total:,.0f}", mono_style)],
                [Paragraph("Left Over", ParagraphStyle("X2", parent=body_style, fontName="Helvetica-Bold")),
                 Paragraph(f"${leftover:,.0f}",
                           ParagraphStyle("LO", parent=mono_style,
                                          textColor=lo_color, fontName="Courier-Bold"))],
            ]
            return rows

        from datetime import datetime
        story = [
            Paragraph("Budget Scenario Comparison", title_style),
            Paragraph(f"{comp.name}  ·  {datetime.now().strftime('%B %d, %Y')}", sub_style),
            HRFlowable(width="100%", thickness=1, color=ACCENT, spaceAfter=18),
        ]

        rows_a = scenario_block(comp.scenario_a, comp.label_a, head_style)
        rows_b = scenario_block(comp.scenario_b, comp.label_b, head2_style)

        max_rows = max(len(rows_a), len(rows_b))
        empty    = [Paragraph("", body_style), ""]
        rows_a  += [empty] * (max_rows - len(rows_a))
        rows_b  += [empty] * (max_rows - len(rows_b))

        divider = [Paragraph("", body_style), ""]
        table_data = [
            [rows_a[i][0], rows_a[i][1], Paragraph("", body_style), rows_b[i][0], rows_b[i][1]]
            for i in range(max_rows)
        ]

        col_w = [2.4*inch, 1.0*inch, 0.2*inch, 2.4*inch, 1.0*inch]
        tbl = Table(table_data, colWidths=col_w, repeatRows=0)
        tbl.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, -1), BG),
            ("TEXTCOLOR",    (0, 0), (-1, -1), WHITE),
            ("FONTNAME",     (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE",     (0, 0), (-1, -1), 10),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#0d0f14"), colors.HexColor("#111318")]),
            ("LINEAFTER",    (1, 0), (1, -1), 0.5, MUTED),
            ("TOPPADDING",   (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
            ("LEFTPADDING",  (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(tbl)

        doc.build(story)
        buf.seek(0)
        fname = comp.name.replace(" ", "_").lower()
        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}_comparison.pdf"'},
        )


    @app.post("/api/budget/ai")
    async def budget_ai(
        req: BudgetAIRequest,
        current_user: dict = Depends(require_any_user),
    ):
        user_id = current_user["id"]
        try:
            from src.api.ai_client import create_message
            text = create_message(
                user_id,
                system="You are a helpful financial advisor. Be specific, direct, and use the actual numbers given.",
                user_prompt=req.prompt,
                max_tokens=req.max_tokens,
            )
            return {"text": text}
        except Exception as e:
            logger.error(f"Budget AI error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))
