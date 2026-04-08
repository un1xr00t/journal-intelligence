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
