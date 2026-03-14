"""
exit_plan_routes.py  —  src/api/exit_plan_routes.py
Personalized, task-based exit plan engine.

Wire up in main.py (after register_resources_routes):
    from src.api.exit_plan_routes import register_exit_plan_routes
    register_exit_plan_routes(app, require_any_user)
"""

import json
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import anthropic
import yaml
from fastapi import Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

logger = logging.getLogger("journal")

from src.config import CONFIG_PATH, EXIT_PLAN_DIR as ATTACHMENT_BASE, load_config
# ATTACHMENT_BASE imported from src.config as EXIT_PLAN_DIR


def _load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


# ── Pydantic models ────────────────────────────────────────────────────────────

class GeneratePlanRequest(BaseModel):
    force: bool = False
    confirmed_branches: list = []


class UpdateTaskRequest(BaseModel):
    status:         Optional[str] = None   # backlog | next | doing | done | skipped
    priority:       Optional[str] = None   # critical | high | normal | low
    due_date:       Optional[str] = None
    skipped_reason: Optional[str] = None


class AddNoteRequest(BaseModel):
    note_text: str
    task_id:   Optional[int] = None


class CheckUpdatesRequest(BaseModel):
    apply: bool = False


class AddCustomTaskRequest(BaseModel):
    phase_id: int
    title: str
    priority: Optional[str] = "normal"


class EnrichTaskRequest(BaseModel):
    pass  # task_id is in the URL


# ── DB schema ──────────────────────────────────────────────────────────────────

def _ensure_tables(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS exit_plans (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL UNIQUE,
            plan_type     TEXT NOT NULL,
            branches      TEXT NOT NULL DEFAULT '[]',
            status        TEXT NOT NULL DEFAULT 'active',
            signal_hash   TEXT,
            generated_at  TEXT NOT NULL,
            updated_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exit_plan_phases (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id           INTEGER NOT NULL,
            phase_order       INTEGER NOT NULL,
            title             TEXT NOT NULL,
            description       TEXT,
            status            TEXT NOT NULL DEFAULT 'locked',
            unlock_threshold  REAL DEFAULT 0.5,
            FOREIGN KEY (plan_id) REFERENCES exit_plans(id)
        );

        CREATE TABLE IF NOT EXISTS exit_plan_tasks (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            phase_id        INTEGER NOT NULL,
            plan_id         INTEGER NOT NULL,
            title           TEXT NOT NULL,
            description     TEXT,
            why_it_matters  TEXT,
            status          TEXT NOT NULL DEFAULT 'backlog',
            priority        TEXT NOT NULL DEFAULT 'normal',
            due_date        TEXT,
            completed_at    TEXT,
            skipped_reason  TEXT,
            ai_generated    INTEGER DEFAULT 1,
            resource_keys   TEXT DEFAULT '[]',
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL,
            FOREIGN KEY (phase_id) REFERENCES exit_plan_phases(id),
            FOREIGN KEY (plan_id)  REFERENCES exit_plans(id)
        );

        CREATE TABLE IF NOT EXISTS exit_plan_notes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id     INTEGER,
            plan_id     INTEGER NOT NULL,
            note_text   TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES exit_plan_tasks(id),
            FOREIGN KEY (plan_id) REFERENCES exit_plans(id)
        );

        CREATE TABLE IF NOT EXISTS exit_plan_attachments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id     INTEGER,
            plan_id     INTEGER NOT NULL,
            filename    TEXT NOT NULL,
            file_path   TEXT NOT NULL,
            file_size   INTEGER,
            uploaded_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES exit_plan_tasks(id),
            FOREIGN KEY (plan_id) REFERENCES exit_plans(id)
        );

        CREATE TABLE IF NOT EXISTS exit_plan_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id     INTEGER NOT NULL,
            event_type  TEXT NOT NULL,
            event_data  TEXT,
            occurred_at TEXT NOT NULL,
            FOREIGN KEY (plan_id) REFERENCES exit_plans(id)
        );

        CREATE TABLE IF NOT EXISTS exit_plan_signal_snapshots (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id        INTEGER NOT NULL,
            snapshot_json  TEXT NOT NULL,
            snapshot_hash  TEXT NOT NULL,
            created_at     TEXT NOT NULL,
            FOREIGN KEY (plan_id) REFERENCES exit_plans(id)
        );
    """)
    conn.commit()


# ── Signal scoring ─────────────────────────────────────────────────────────────

def _score_branches(memory: dict, alerts: list, entities_text: str, tags_text: str) -> dict:
    """
    Score each branch 0.0–1.0 based on weighted signals.
    Returns dict of branch_name -> confidence score.
    """
    alert_cats = [a.get("alert_type", "").lower() for a in alerts]
    all_text   = (entities_text + " " + tags_text + " " +
                  (memory.get("situation_story") or "") + " " +
                  " ".join(memory.get("topics") or [])).lower()

    def _has(keywords): return any(k in all_text for k in keywords)
    def _alert(cats):   return any(any(c in a for c in cats) for a in alert_cats)

    # Safety branch
    safety_signals = []
    if _alert(["safety", "danger", "abuse", "dv", "violence"]): safety_signals.append(0.9)
    if _has(["safe", "scared", "afraid", "hurt me", "threatening", "abuse", "escape"]): safety_signals.append(0.8)
    if memory.get("situation_type") == "safety":               safety_signals.append(0.7)

    # Children branch
    child_signals = []
    if _has(["my son", "my daughter", "my kid", "my child", "my children", "custody",
             "co-parent", "school pickup", "daycare", "her kids", "his kids"]):  child_signals.append(0.85)
    if _alert(["child", "custody", "parenting"]):               child_signals.append(0.7)
    if memory.get("situation_type") == "coparenting":           child_signals.append(0.6)
    if "children" in (memory.get("topics") or []):              child_signals.append(0.5)

    # Financial branch
    financial_signals = []
    if _alert(["financial", "money", "debt", "income"]):        financial_signals.append(0.8)
    if _has(["bank account", "joint account", "credit card", "debt", "mortgage",
             "financially dependent", "can't afford", "no money", "no income"]): financial_signals.append(0.75)
    if memory.get("situation_type") == "financial":             financial_signals.append(0.6)
    if "finances" in (memory.get("topics") or []):              financial_signals.append(0.5)

    # Housing branch
    housing_signals = []
    if _alert(["housing", "homeless", "lease", "eviction"]):    housing_signals.append(0.8)
    if _has(["where will i live", "find a place", "lease", "landlord", "can't afford rent",
             "moving out", "kicked out", "apartment"]):          housing_signals.append(0.7)
    if "housing" in (memory.get("topics") or []):               housing_signals.append(0.5)

    # Pets branch
    pet_signals = []
    if _has(["my dog", "my cat", "my pet", "my animals", "pet dog", "family dog", "dog", "cat", "pomsky", "puppy", "kitten"]):      pet_signals.append(0.8)
    if "pets" in (memory.get("topics") or []):                  pet_signals.append(0.6)

    def _avg(lst): return min(sum(lst) / len(lst), 1.0) if lst else 0.0

    return {
        "safety":    _avg(safety_signals),
        "children":  _avg(child_signals),
        "financial": _avg(financial_signals),
        "housing":   _avg(housing_signals),
        "pets":      _avg(pet_signals),
    }


def _determine_plan_type(branch_scores: dict) -> str:
    if branch_scores.get("safety", 0) >= 0.75:
        return "safety_first"
    if branch_scores.get("children", 0) >= 0.75:
        return "coparenting_transition"
    if branch_scores.get("financial", 0) >= 0.75:
        return "financial_stabilization"
    if branch_scores.get("housing", 0) >= 0.75:
        return "housing_logistics"
    return "separation_planning"


def _active_branches(branch_scores: dict, confirmed: list) -> list:
    """Return branches with confidence >= 0.40 OR explicitly confirmed by user."""
    branches = []
    for branch, score in branch_scores.items():
        if score >= 0.40 or branch in confirmed:
            branches.append(branch)
    return branches


def _confirm_toggles(branch_scores: dict) -> list:
    """Branches in the 0.40–0.74 range to show as optional confirm toggles."""
    return [b for b, s in branch_scores.items() if 0.40 <= s < 0.75]


def _signal_hash(plan_type: str, branches: list, avg_sev: float) -> str:
    key = json.dumps({
        "plan_type": plan_type,
        "branches":  sorted(branches),
        "avg_sev":   round(avg_sev, 1),
    }, sort_keys=True)
    return hashlib.sha256(key.encode()).hexdigest()[:16]


# ── LLM system prompt ──────────────────────────────────────────────────────────

_PLAN_SYSTEM = """You are a clinical-grade exit plan generator for a personal journal app.
Your job is to produce a structured, task-based exit plan for someone navigating a major life transition.

RULES:
- Return ONLY valid JSON. No preamble, no markdown, no explanation outside the JSON.
- Tailor phases and tasks EXACTLY to the branches provided. If children is NOT in active_branches, never mention custody, school, or co-parenting anywhere.
- If "safety_first" plan type, front-load safety tasks and use protective language (not reconciliatory).
- Tasks must be concrete, actionable, and specific — not vague advice.
- "why_it_matters" must be 1–2 sentences max, plain language, no jargon.
- resource_keys must be from this set: ["grounding", "emotional_support", "mental_health", "relationship", "parenting", "legal", "housing", "financial", "crisis"]
- Each phase has 4–8 tasks. No more.
- Exactly 5 phases total.
- unlock_threshold: MUST be null for Phase 1, and exactly 0.5 for Phases 2-5. It is a decimal between 0.0 and 1.0 ONLY — NEVER an integer like 4 or 50.
- Phase 1 MUST include a task titled "Build your support network" with concrete steps to identify 2-3 trusted people (friend, family member, therapist, or advocate) who can provide emotional, practical, or logistical support during this transition.
- Phase 1 status is "active", all others are "locked".
- Priority values: "critical" | "high" | "normal" | "low"

Return this exact JSON structure:
{
  "plan_type": "separation_planning",
  "phases": [
    {
      "phase_order": 1,
      "title": "Phase Title",
      "description": "One sentence describing this phase.",
      "status": "active",
      "unlock_threshold": null,
      "tasks": [
        {
          "title": "Task title",
          "description": "2–4 sentence concrete description of what to do.",
          "why_it_matters": "1–2 sentences on why this matters now.",
          "priority": "high",
          "resource_keys": ["legal"],
          "due_offset_days": null
        }
      ]
    }
  ]
}

due_offset_days: null for no due date, or an integer (days from today) if time-sensitive."""


_ENRICH_SYSTEM = """You are an assistant helping someone navigate a major life transition.
Given a task title the user wrote themselves, generate a helpful description, a short "why it matters"
explanation, and a list of resource keys.

RULES:
- Return ONLY valid JSON. No preamble, no markdown, no explanation outside the JSON.
- description: 2-4 sentences of concrete, actionable steps they should take for this task.
- why_it_matters: 1-2 sentences explaining why this matters right now, in plain empathetic language.
- resource_keys: choose 0-3 from this set ONLY: ["grounding", "emotional_support", "mental_health",
  "relationship", "parenting", "legal", "housing", "financial", "crisis"]

Return EXACTLY this structure:
{
  "description": "...",
  "why_it_matters": "...",
  "resource_keys": ["legal"]
}"""


def _normalize_threshold(value, phase_order: int):
    """
    Normalize AI-generated unlock_threshold values.
    AI sometimes returns integers (4, 50) instead of decimals (0.04, 0.5).
    Phase 1 always gets None (it is auto-active). All others default to 0.5.
    """
    if phase_order == 1:
        return None
    if value is None:
        return 0.5
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.5
    if v > 1.0:
        v = round(v / 100.0, 2)
    # Snap suspiciously tiny values (e.g. 0.04) to 0.5
    if 0.0 < v < 0.05:
        v = 0.5
    return round(min(max(v, 0.0), 1.0), 2)


def _build_plan_prompt(memory: dict, branch_scores: dict, plan_type: str, active_branches: list,
                       avg_sev: float, avg_mood: float, alerts: list) -> str:
    sit_map = {
        "leaving":      "planning to leave a relationship or situation",
        "separation":   "going through a separation or divorce",
        "divorce":      "going through a divorce",
        "coparenting":  "navigating co-parenting after separation",
        "financial":    "dealing with financial crisis or dependence",
        "housing":      "facing housing instability",
        "safety":       "leaving an unsafe situation",
        "transition":   "going through a major life transition",
    }
    parts = [
        f"User name: {memory.get('preferred_name') or 'the user'}",
        f"Pronouns: {memory.get('pronouns') or 'they/them'}",
        f"Primary situation: {sit_map.get(memory.get('situation_type', ''), 'major life transition')}",
    ]
    if memory.get("situation_story"):
        parts.append(f"Their story: \"{memory['situation_story'][:500]}\"")
    if memory.get("goals"):
        parts.append(f"Their goals: {', '.join(memory['goals'][:6])}")
    if memory.get("ai_summary"):
        parts.append(f"AI memory profile: {memory['ai_summary'][:400]}")

    parts.append(f"\nPlan type to generate: {plan_type}")
    parts.append(f"Active branches (MUST be included): {', '.join(active_branches) if active_branches else 'none'}")
    parts.append(f"Recent mood: avg score {avg_mood:.1f}/10, avg severity {avg_sev:.1f}/10")

    branch_details = []
    for branch, score in branch_scores.items():
        if score >= 0.40:
            branch_details.append(f"  {branch}: confidence {score:.2f}")
    if branch_details:
        parts.append("Branch confidence scores:\n" + "\n".join(branch_details))

    if alerts:
        alert_lines = [f"  - {a.get('alert_type','?').replace('_',' ')}: {a.get('description','')[:100]}"
                       for a in alerts[:8]]
        parts.append("Active alerts:\n" + "\n".join(alert_lines))

    parts.append("\nGenerate the full 5-phase exit plan JSON now.")
    return "\n".join(parts)


# ── Progress helpers ───────────────────────────────────────────────────────────

def _calc_phase_progress(tasks: list) -> float:
    countable = [t for t in tasks if t["status"] != "skipped"]
    if not countable:
        return 0.0
    done = sum(1 for t in countable if t["status"] == "done")
    return round(done / len(countable), 2)


def _calc_overall_progress(phases: list) -> float:
    all_tasks = [t for p in phases for t in p.get("tasks", []) if t["status"] != "skipped"]
    if not all_tasks:
        return 0.0
    done = sum(1 for t in all_tasks if t["status"] == "done")
    return round(done / len(all_tasks), 2)


def _select_today_tasks(phases: list, limit: int = 3) -> list:
    """Pure Python: pick the best next 1–3 tasks for the Today view."""
    today = datetime.now(timezone.utc).date().isoformat()
    candidates = []

    for phase in phases:
        if phase["status"] not in ("active",):
            continue
        for task in phase.get("tasks", []):
            if task["status"] in ("done", "skipped"):
                continue
            score = 0
            if task["status"] == "doing":    score += 100
            if task["priority"] == "critical": score += 40
            if task["priority"] == "high":     score += 20
            if task["priority"] == "normal":   score += 5
            if task.get("due_date"):
                try:
                    days_left = (datetime.fromisoformat(task["due_date"]).date() -
                                 datetime.fromisoformat(today)).days
                    if days_left <= 0:   score += 50
                    elif days_left <= 3: score += 30
                    elif days_left <= 7: score += 15
                except Exception:
                    pass
            candidates.append((score, task))

    candidates.sort(key=lambda x: x[0], reverse=True)
    return [t for _, t in candidates[:limit]]


def _maybe_unlock_phases(conn, plan_id: int):
    """Check if any locked phases should unlock based on prior phase progress."""
    phases = conn.execute(
        "SELECT id, phase_order, status, unlock_threshold FROM exit_plan_phases WHERE plan_id = ? ORDER BY phase_order",
        (plan_id,)
    ).fetchall()

    for i, phase in enumerate(phases):
        if phase["status"] != "locked":
            continue
        if i == 0:
            continue  # Phase 1 is always active
        prior = phases[i - 1]
        tasks = conn.execute(
            "SELECT status FROM exit_plan_tasks WHERE phase_id = ?", (prior["id"],)
        ).fetchall()
        countable = [t for t in tasks if t["status"] != "skipped"]
        if not countable:
            continue
        done = sum(1 for t in countable if t["status"] == "done")
        progress = done / len(countable)
        threshold = phase["unlock_threshold"] or 0.5
        if progress >= threshold:
            conn.execute(
                "UPDATE exit_plan_phases SET status = 'active' WHERE id = ?",
                (phase["id"],)
            )
    conn.commit()


# ── Route registration ─────────────────────────────────────────────────────────

def register_exit_plan_routes(app, require_any_user):
    from src.auth.auth_db import get_db
    from src.api.onboarding_routes import load_user_memory

    # ── GET /api/exit-plan ──────────────────────────────────────────────────────
    @app.get("/api/exit-plan")
    async def get_exit_plan(current_user: dict = Depends(require_any_user)):
        conn = get_db()
        try:
            _ensure_tables(conn)
            plan_row = conn.execute(
                "SELECT * FROM exit_plans WHERE user_id = ? AND status != 'deleted'",
                (current_user["id"],)
            ).fetchone()

            if not plan_row:
                return {"plan": None, "has_plan": False}

            plan = dict(plan_row)
            plan["branches"] = json.loads(plan.get("branches") or "[]")

            phases_rows = conn.execute(
                "SELECT * FROM exit_plan_phases WHERE plan_id = ? ORDER BY phase_order",
                (plan["id"],)
            ).fetchall()

            phases = []
            for pr in phases_rows:
                phase = dict(pr)
                tasks_rows = conn.execute(
                    "SELECT * FROM exit_plan_tasks WHERE phase_id = ? ORDER BY id",
                    (phase["id"],)
                ).fetchall()
                tasks = []
                for tr in tasks_rows:
                    t = dict(tr)
                    t["resource_keys"] = json.loads(t.get("resource_keys") or "[]")

                    # note count
                    t["note_count"] = conn.execute(
                        "SELECT COUNT(*) FROM exit_plan_notes WHERE task_id = ?", (t["id"],)
                    ).fetchone()[0]
                    # attachment count
                    t["attachment_count"] = conn.execute(
                        "SELECT COUNT(*) FROM exit_plan_attachments WHERE task_id = ?", (t["id"],)
                    ).fetchone()[0]
                    tasks.append(t)
                phase["tasks"]    = tasks
                phase["progress"] = _calc_phase_progress(tasks)
                phases.append(phase)

            # Check if signals changed since last generation
            memory = load_user_memory(current_user["id"]) or {}
            alerts = [dict(r) for r in conn.execute(
                "SELECT alert_type, description FROM alerts WHERE user_id = ? AND acknowledged = 0 LIMIT 15",
                (current_user["id"],)
            ).fetchall()]
            stats = conn.execute(
                """SELECT AVG(ds.severity) as avg_sev FROM entries e
                   JOIN derived_summaries ds ON e.id = ds.entry_id
                   WHERE e.user_id = ? AND e.is_current = 1
                   AND e.entry_date >= date('now','-30 days')""",
                (current_user["id"],)
            ).fetchone()
            avg_sev    = float(stats["avg_sev"] or 3.0)

            ent_rows      = conn.execute(
                """SELECT ds.entities, ds.tags FROM entries e
                   JOIN derived_summaries ds ON e.id = ds.entry_id
                   WHERE e.user_id = ? AND e.is_current = 1
                   ORDER BY e.entry_date DESC LIMIT 30""",
                (current_user["id"],)
            ).fetchall()
            entities_text = " ".join((r["entities"] or "") for r in ent_rows)
            tags_text     = " ".join((r["tags"] or "") for r in ent_rows)

            branch_scores = _score_branches(memory, alerts, entities_text, tags_text)
            new_active    = _active_branches(branch_scores, [])
            new_branches  = set(new_active) - set(plan["branches"])

            # Only flag update_available for new branches that have a mapped task
            # and don't already have a task in the plan covering it
            BRANCH_KEYWORDS = {"pets": "pet", "housing": "housing", "financial": "bank"}
            update_avail = False
            for branch in new_branches:
                if branch not in BRANCH_KEYWORDS:
                    continue
                keyword = BRANCH_KEYWORDS[branch]
                existing = conn.execute(
                    "SELECT id FROM exit_plan_tasks WHERE plan_id = ? AND title LIKE ?",
                    (plan["id"], f"%{keyword}%")
                ).fetchone()
                if not existing:
                    update_avail = True
                    break

            # Always silently sync branches so drift doesn't re-trigger the button
            if set(new_active) != set(plan["branches"]):
                now_iso = datetime.now(timezone.utc).isoformat()
                conn.execute(
                    "UPDATE exit_plans SET branches = ?, updated_at = ? WHERE id = ?",
                    (json.dumps(new_active), now_iso, plan["id"])
                )
                conn.commit()
                plan["branches"] = new_active

            overall_progress = _calc_overall_progress(phases)
            today_tasks = _select_today_tasks(phases)

            return {
                "has_plan":         True,
                "update_available": update_avail,
                "plan": {
                    **{k: v for k, v in plan.items()},
                    "overall_progress": overall_progress,
                    "phases":           phases,
                    "today_tasks":      [t["id"] for t in today_tasks],
                },
            }
        finally:
            conn.close()

    # ── POST /api/exit-plan/generate ────────────────────────────────────────────
    @app.post("/api/exit-plan/generate")
    async def generate_exit_plan(
        body: GeneratePlanRequest,
        current_user: dict = Depends(require_any_user),
    ):
        conn = get_db()
        try:
            _ensure_tables(conn)

            memory = load_user_memory(current_user["id"]) or {}
            alerts = [dict(r) for r in conn.execute(
                """SELECT alert_type, description, priority_score
                   FROM alerts WHERE user_id = ? AND acknowledged = 0
                   ORDER BY priority_score DESC LIMIT 15""",
                (current_user["id"],)
            ).fetchall()]

            # Pull entity + tag text from last 30 entries for branch scoring
            rows = conn.execute(
                """SELECT ds.entities, ds.tags FROM entries e
                   JOIN derived_summaries ds ON e.id = ds.entry_id
                   WHERE e.user_id = ? AND e.is_current = 1
                   ORDER BY e.entry_date DESC LIMIT 30""",
                (current_user["id"],)
            ).fetchall()
            entities_text = " ".join((r["entities"] or "") for r in rows)
            tags_text     = " ".join((r["tags"] or "") for r in rows)

            stats = conn.execute(
                """SELECT AVG(ds.mood_score) as avg_mood, AVG(ds.severity) as avg_sev
                   FROM entries e JOIN derived_summaries ds ON e.id = ds.entry_id
                   WHERE e.user_id = ? AND e.is_current = 1
                   AND e.entry_date >= date('now','-30 days')""",
                (current_user["id"],)
            ).fetchone()
            avg_mood = float(stats["avg_mood"] or 5.0)
            avg_sev  = float(stats["avg_sev"]  or 3.0)

            branch_scores = _score_branches(memory, alerts, entities_text, tags_text)
            plan_type     = _determine_plan_type(branch_scores)
            active        = _active_branches(branch_scores, body.confirmed_branches)
            sig_hash      = _signal_hash(plan_type, active, avg_sev)

            # Check if plan already exists + signal unchanged + not forced
            existing = conn.execute(
                "SELECT id, signal_hash FROM exit_plans WHERE user_id = ? AND status != 'deleted'",
                (current_user["id"],)
            ).fetchone()
            if existing and existing["signal_hash"] == sig_hash and not body.force:
                return {"plan_id": existing["id"], "cached": True, "plan_type": plan_type}

        finally:
            conn.close()

        # ── Call Claude ───────────────────────────────────────────────────────
        cfg    = _load_config()
        from src.api.anthropic_helper import get_anthropic_client as _get_ac
        client = _get_ac(current_user["id"])
        prompt = _build_plan_prompt(memory, branch_scores, plan_type, active, avg_sev, avg_mood, alerts)

        try:
            from src.api.ai_client import create_message as _cm
            from src.api.onboarding_routes import load_user_memory as _lum, build_memory_context_string as _bmcs
            _mem_ctx = _bmcs(_lum(current_user["id"]))
            _plan_system = (_mem_ctx + "\n\n" + _PLAN_SYSTEM) if _mem_ctx else _PLAN_SYSTEM
            raw = _cm(
                current_user["id"],
                system=_plan_system,
                user_prompt=prompt,
                max_tokens=4000,
            ).strip()
            if raw.startswith("```"):
                raw = "\n".join(raw.split("\n")[1:])
            if raw.endswith("```"):
                raw = "\n".join(raw.split("\n")[:-1])
            raw = raw.strip()
            plan_data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"[exit_plan] JSON parse error: {e}")
            raise HTTPException(502, "AI returned invalid JSON — try again")
        except Exception as e:
            logger.error(f"[exit_plan] AI error: {e}")
            raise HTTPException(502, f"AI generation failed: {e}")

        now_iso = datetime.now(timezone.utc).isoformat()
        today   = datetime.now(timezone.utc).date().isoformat()

        # ── Persist ───────────────────────────────────────────────────────────
        conn2 = get_db()
        try:
            _ensure_tables(conn2)

            if existing:
                # Delete old phases + tasks (cascade manually since no FK cascade)
                old_plan_id = existing["id"]
                old_phase_ids = [r["id"] for r in conn2.execute(
                    "SELECT id FROM exit_plan_phases WHERE plan_id = ?", (old_plan_id,)
                ).fetchall()]
                for pid in old_phase_ids:
                    conn2.execute("DELETE FROM exit_plan_tasks WHERE phase_id = ?", (pid,))
                conn2.execute("DELETE FROM exit_plan_phases WHERE plan_id = ?", (old_plan_id,))
                conn2.execute(
                    "UPDATE exit_plans SET plan_type=?, branches=?, signal_hash=?, updated_at=? WHERE id=?",
                    (plan_type, json.dumps(active), sig_hash, now_iso, old_plan_id)
                )
                plan_id = old_plan_id
            else:
                cur = conn2.execute(
                    "INSERT INTO exit_plans (user_id, plan_type, branches, signal_hash, generated_at, updated_at) VALUES (?,?,?,?,?,?)",
                    (current_user["id"], plan_type, json.dumps(active), sig_hash, now_iso, now_iso)
                )
                plan_id = cur.lastrowid

            phases_created = []
            for phase_data in plan_data.get("phases", []):
                pc = conn2.execute(
                    """INSERT INTO exit_plan_phases (plan_id, phase_order, title, description, status, unlock_threshold)
                       VALUES (?,?,?,?,?,?)""",
                    (plan_id, phase_data["phase_order"], phase_data["title"],
                     phase_data.get("description", ""), phase_data.get("status", "locked"),
                     _normalize_threshold(phase_data.get("unlock_threshold"), phase_data.get("phase_order", 2)))
                )
                phase_id = pc.lastrowid
                task_count = 0
                for td in phase_data.get("tasks", []):
                    due_date = None
                    if td.get("due_offset_days"):
                        from datetime import timedelta as _td
                        try:
                            due_date = (datetime.now(timezone.utc).date() +
                                        _td(days=int(td["due_offset_days"]))).isoformat()
                        except Exception:
                            pass
                    conn2.execute(
                        """INSERT INTO exit_plan_tasks
                           (phase_id, plan_id, title, description, why_it_matters,
                            priority, due_date, resource_keys, created_at, updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (phase_id, plan_id, td["title"], td.get("description", ""),
                         td.get("why_it_matters", ""), td.get("priority", "normal"),
                         due_date, json.dumps(td.get("resource_keys", [])),
                         now_iso, now_iso)
                    )
                    task_count += 1
                phases_created.append({"phase_id": phase_id, "task_count": task_count})

            # Log event
            conn2.execute(
                "INSERT INTO exit_plan_events (plan_id, event_type, event_data, occurred_at) VALUES (?,?,?,?)",
                (plan_id, "created" if not existing else "regenerated",
                 json.dumps({"plan_type": plan_type, "branches": active}), now_iso)
            )

            # Save signal snapshot
            conn2.execute(
                "INSERT INTO exit_plan_signal_snapshots (plan_id, snapshot_json, snapshot_hash, created_at) VALUES (?,?,?,?)",
                (plan_id, json.dumps({"plan_type": plan_type, "branches": active, "avg_sev": avg_sev}),
                 sig_hash, now_iso)
            )

            conn2.commit()
        finally:
            conn2.close()

        logger.info(f"[exit_plan] generated user={current_user['id']} type={plan_type} branches={active}")

        return {
            "plan_id":    plan_id,
            "plan_type":  plan_type,
            "branches":   active,
            "cached":     False,
            "phases":     phases_created,
        }

    # ── GET /api/exit-plan/detect ───────────────────────────────────────────────
    @app.get("/api/exit-plan/detect")
    async def detect_exit_signals(current_user: dict = Depends(require_any_user)):
        """Lightweight signal check — used by Timeline to decide whether to show offer banner."""
        conn = get_db()
        try:
            _ensure_tables(conn)

            # Already has a plan? No need to offer.
            existing = conn.execute(
                "SELECT id FROM exit_plans WHERE user_id = ? AND status = 'active'",
                (current_user["id"],)
            ).fetchone()
            if existing:
                return {"show_offer": False, "has_plan": True}

            memory = load_user_memory(current_user["id"]) or {}

            # Check dismissal flag
            if memory.get("exit_plan_dismissed"):
                return {"show_offer": False, "has_plan": False, "dismissed": True}

            alerts = [dict(r) for r in conn.execute(
                "SELECT alert_type FROM alerts WHERE user_id = ? AND acknowledged = 0",
                (current_user["id"],)
            ).fetchall()]
            rows = conn.execute(
                """SELECT ds.entities, ds.tags FROM entries e
                   JOIN derived_summaries ds ON e.id = ds.entry_id
                   WHERE e.user_id = ? AND e.is_current = 1
                   ORDER BY e.entry_date DESC LIMIT 20""",
                (current_user["id"],)
            ).fetchall()
            entities_text = " ".join((r["entities"] or "") for r in rows)
            tags_text     = " ".join((r["tags"] or "") for r in rows)
            stats = conn.execute(
                """SELECT AVG(ds.severity) as avg_sev FROM entries e
                   JOIN derived_summaries ds ON e.id = ds.entry_id
                   WHERE e.user_id = ? AND e.is_current = 1
                   AND e.entry_date >= date('now','-14 days')""",
                (current_user["id"],)
            ).fetchone()
            avg_sev = float(stats["avg_sev"] or 0.0)

            branch_scores = _score_branches(memory, alerts, entities_text, tags_text)
            any_signal    = any(s >= 0.40 for s in branch_scores.values())

            sit_keywords  = ["leaving", "separation", "divorce", "escape", "transition",
                             "starting over", "exit", "leave", "coparenting"]
            sit_match     = any(kw in (memory.get("situation_type") or "").lower()
                               for kw in sit_keywords)

            confirm_toggles = _confirm_toggles(branch_scores)

            show = (any_signal or sit_match) and avg_sev >= 4.0

            return {
                "show_offer":        show,
                "has_plan":          False,
                "branch_scores":     branch_scores,
                "confirm_toggles":   confirm_toggles,
                "detected_signals":  [b for b, s in branch_scores.items() if s >= 0.75],
            }
        finally:
            conn.close()

    # ── PATCH /api/exit-plan/tasks/{task_id} ────────────────────────────────────
    @app.patch("/api/exit-plan/tasks/{task_id}")
    async def update_task(
        task_id: int,
        body: UpdateTaskRequest,
        current_user: dict = Depends(require_any_user),
    ):
        conn = get_db()
        try:
            _ensure_tables(conn)

            # Verify ownership
            row = conn.execute(
                """SELECT t.*, ep.user_id as plan_user_id FROM exit_plan_tasks t
                   JOIN exit_plans ep ON t.plan_id = ep.id
                   WHERE t.id = ?""",
                (task_id,)
            ).fetchone()
            if not row or row["plan_user_id"] != current_user["id"]:
                raise HTTPException(404, "Task not found")

            now_iso = datetime.now(timezone.utc).isoformat()
            updates = {}
            if body.status is not None:
                updates["status"] = body.status
                if body.status == "done":
                    updates["completed_at"] = now_iso
                if body.status == "skipped" and body.skipped_reason:
                    updates["skipped_reason"] = body.skipped_reason
            if body.priority is not None:
                updates["priority"] = body.priority
            if body.due_date is not None:
                updates["due_date"] = body.due_date
            updates["updated_at"] = now_iso

            if updates:
                set_clause = ", ".join(f"{k} = ?" for k in updates)
                conn.execute(
                    f"UPDATE exit_plan_tasks SET {set_clause} WHERE id = ?",
                    list(updates.values()) + [task_id]
                )
                conn.commit()

            # Check phase unlock
            _maybe_unlock_phases(conn, row["plan_id"])

            # Recalculate progress
            phases_rows = conn.execute(
                "SELECT id FROM exit_plan_phases WHERE plan_id = ? ORDER BY phase_order",
                (row["plan_id"],)
            ).fetchall()
            phase_progresses = {}
            for pr in phases_rows:
                tasks = [dict(t) for t in conn.execute(
                    "SELECT status FROM exit_plan_tasks WHERE phase_id = ?", (pr["id"],)
                ).fetchall()]
                phase_progresses[pr["id"]] = _calc_phase_progress(tasks)

            all_tasks = conn.execute(
                "SELECT status FROM exit_plan_tasks WHERE plan_id = ?", (row["plan_id"],)
            ).fetchall()
            overall = _calc_overall_progress([{"tasks": [dict(t) for t in all_tasks]}])

            # Log event
            if body.status in ("done", "skipped"):
                conn.execute(
                    "INSERT INTO exit_plan_events (plan_id, event_type, event_data, occurred_at) VALUES (?,?,?,?)",
                    (row["plan_id"], f"task_{body.status}",
                     json.dumps({"task_id": task_id, "title": row["title"]}), now_iso)
                )
                conn.commit()

            return {
                "task_id":          task_id,
                "status":           updates.get("status", row["status"]),
                "completed_at":     updates.get("completed_at"),
                "overall_progress": overall,
                "phase_progresses": phase_progresses,
            }
        finally:
            conn.close()

    # ── POST /api/exit-plan/tasks ─────────────────────────────────────────────────
    @app.post("/api/exit-plan/tasks")
    async def add_custom_task(
        body: AddCustomTaskRequest,
        current_user: dict = Depends(require_any_user),
    ):
        """Add a user-created custom task to an unlocked phase."""
        conn = get_db()
        try:
            _ensure_tables(conn)
            phase = conn.execute(
                """SELECT ep2.id as phase_id, ep2.plan_id, ep2.status
                   FROM exit_plan_phases ep2
                   JOIN exit_plans ep ON ep2.plan_id = ep.id
                   WHERE ep2.id = ? AND ep.user_id = ?""",
                (body.phase_id, current_user["id"])
            ).fetchone()
            if not phase:
                raise HTTPException(404, "Phase not found")
            if phase["status"] == "locked":
                raise HTTPException(400, "Cannot add tasks to a locked phase")

            VALID_PRI = {"critical", "high", "normal", "low"}
            priority = body.priority if body.priority in VALID_PRI else "normal"
            title = body.title.strip()
            if not title:
                raise HTTPException(400, "Task title is required")

            now_iso = datetime.now(timezone.utc).isoformat()
            cur = conn.execute(
                """INSERT INTO exit_plan_tasks
                   (phase_id, plan_id, title, description, why_it_matters,
                    status, priority, due_date, completed_at, skipped_reason,
                    ai_generated, resource_keys, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (body.phase_id, phase["plan_id"], title, None, None,
                 "backlog", priority, None, None, None, 0, "[]", now_iso, now_iso)
            )
            task_id = cur.lastrowid
            conn.commit()
            return {"task_id": task_id, "phase_id": body.phase_id, "title": title,
                    "status": "backlog", "priority": priority, "ai_generated": False}
        finally:
            conn.close()

    # ── POST /api/exit-plan/tasks/{task_id}/enrich ─────────────────────────────
    # ── POST /api/exit-plan/tasks/{task_id}/enrich ─────────────────────────────
    # ── POST /api/exit-plan/tasks/{task_id}/enrich ─────────────────────────────
    @app.post("/api/exit-plan/tasks/{task_id}/enrich")
    async def enrich_task(
        task_id: int,
        current_user: dict = Depends(require_any_user),
    ):
        """AI-generate description, why_it_matters, resource_keys for any task."""
        conn = get_db()
        try:
            _ensure_tables(conn)
            row = conn.execute(
                """SELECT t.*, ep.user_id as plan_user_id FROM exit_plan_tasks t
                   JOIN exit_plans ep ON t.plan_id = ep.id WHERE t.id = ?""",
                (task_id,)
            ).fetchone()
            if not row or row["plan_user_id"] != current_user["id"]:
                raise HTTPException(404, "Task not found")

            try:
                memory = load_user_memory(current_user["id"]) or {}
                ctx = memory.get("situation_story", "")[:200] if memory.get("situation_story") else ""
            except Exception:
                ctx = ""

            prompt_parts = [
                "Task title: \"" + row["title"] + "\"",
            ]
            if ctx:
                prompt_parts.append("User situation: " + ctx)
            prompt_parts.append("Generate the JSON now.")
            user_prompt = ("\n").join(prompt_parts)

            try:
                from src.api.ai_client import create_message as _cm
                raw = _cm(
                    current_user["id"],
                    system=_ENRICH_SYSTEM,
                    user_prompt=user_prompt,
                    max_tokens=600,
                ).strip()
                if raw.startswith("```"):
                    raw = ("\n").join(raw.split("\n")[1:])
                if raw.endswith("```"):
                    raw = ("\n").join(raw.split("\n")[:-1])
                enriched = json.loads(raw.strip())
            except json.JSONDecodeError as e:
                logger.error("[enrich_task] JSON parse error: %s", e)
                raise HTTPException(502, "AI returned invalid JSON")
            except Exception as e:
                logger.error("[enrich_task] AI error: %s", e)
                raise HTTPException(502, "AI enrichment failed: " + str(e))

            desc    = enriched.get("description", "")
            why     = enriched.get("why_it_matters", "")
            rkeys   = json.dumps(enriched.get("resource_keys", []))
            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "UPDATE exit_plan_tasks SET description=?, why_it_matters=?, resource_keys=?, updated_at=? WHERE id=?",
                (desc, why, rkeys, now_iso, task_id)
            )
            conn.commit()
            return {
                "task_id":        task_id,
                "description":    desc,
                "why_it_matters": why,
                "resource_keys":  enriched.get("resource_keys", []),
                "enriched":       True,
            }
        finally:
            conn.close()

    # ── DELETE /api/exit-plan/tasks/{task_id} ──────────────────────────────────
    @app.delete("/api/exit-plan/tasks/{task_id}")
    async def delete_task(
        task_id: int,
        current_user: dict = Depends(require_any_user),
    ):
        """Delete a task (custom or AI-generated). Recalculates phase progress."""
        conn = get_db()
        try:
            _ensure_tables(conn)
            row = conn.execute(
                """SELECT t.phase_id, t.plan_id, ep.user_id as plan_user_id
                   FROM exit_plan_tasks t
                   JOIN exit_plans ep ON t.plan_id = ep.id WHERE t.id = ?""",
                (task_id,)
            ).fetchone()
            if not row or row["plan_user_id"] != current_user["id"]:
                raise HTTPException(404, "Task not found")

            phase_id = row["phase_id"]
            plan_id  = row["plan_id"]

            # Delete notes associated with task first
            conn.execute("DELETE FROM exit_plan_notes WHERE task_id = ?", (task_id,))
            conn.execute("DELETE FROM exit_plan_tasks WHERE id = ?", (task_id,))
            conn.commit()

            # Recalc progress for affected phase
            tasks = [dict(t) for t in conn.execute(
                "SELECT status FROM exit_plan_tasks WHERE phase_id = ?", (phase_id,)
            ).fetchall()]
            phase_progress = _calc_phase_progress(tasks)

            # Check if any phases should unlock after deletion (edge case)
            _maybe_unlock_phases(conn, plan_id)

            return {"deleted": True, "task_id": task_id, "phase_progress": phase_progress}
        finally:
            conn.close()

    # ── POST /api/exit-plan/notes ───────────────────────────────────────────────
    @app.post("/api/exit-plan/notes")
    async def add_note(
        body: AddNoteRequest,
        current_user: dict = Depends(require_any_user),
    ):
        conn = get_db()
        try:
            _ensure_tables(conn)
            plan = conn.execute(
                "SELECT id FROM exit_plans WHERE user_id = ? AND status = 'active'",
                (current_user["id"],)
            ).fetchone()
            if not plan:
                raise HTTPException(404, "No active plan found")

            now_iso = datetime.now(timezone.utc).isoformat()
            cur = conn.execute(
                "INSERT INTO exit_plan_notes (task_id, plan_id, note_text, created_at) VALUES (?,?,?,?)",
                (body.task_id, plan["id"], body.note_text, now_iso)
            )
            conn.commit()
            return {"note_id": cur.lastrowid, "task_id": body.task_id, "created_at": now_iso}
        finally:
            conn.close()

    # ── GET /api/exit-plan/notes ────────────────────────────────────────────────
    @app.get("/api/exit-plan/notes")
    async def get_notes(
        task_id: Optional[int] = None,
        current_user: dict = Depends(require_any_user),
    ):
        conn = get_db()
        try:
            _ensure_tables(conn)
            plan = conn.execute(
                "SELECT id FROM exit_plans WHERE user_id = ? AND status = 'active'",
                (current_user["id"],)
            ).fetchone()
            if not plan:
                return {"notes": []}

            if task_id is not None:
                rows = conn.execute(
                    "SELECT * FROM exit_plan_notes WHERE plan_id = ? AND task_id = ? ORDER BY created_at DESC",
                    (plan["id"], task_id)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM exit_plan_notes WHERE plan_id = ? AND task_id IS NULL ORDER BY created_at DESC",
                    (plan["id"],)
                ).fetchall()
            return {"notes": [dict(r) for r in rows]}
        finally:
            conn.close()

    # ── POST /api/exit-plan/check-updates ──────────────────────────────────────
    @app.post("/api/exit-plan/check-updates")
    async def check_updates(
        body: CheckUpdatesRequest,
        current_user: dict = Depends(require_any_user),
    ):
        conn = get_db()
        try:
            _ensure_tables(conn)
            plan = conn.execute(
                "SELECT * FROM exit_plans WHERE user_id = ? AND status = 'active'",
                (current_user["id"],)
            ).fetchone()
            if not plan:
                raise HTTPException(404, "No active plan found")

            plan_dict = dict(plan)
            plan_dict["branches"] = json.loads(plan_dict.get("branches") or "[]")

            memory = load_user_memory(current_user["id"]) or {}
            alerts = [dict(r) for r in conn.execute(
                "SELECT alert_type, description FROM alerts WHERE user_id = ? AND acknowledged = 0 LIMIT 15",
                (current_user["id"],)
            ).fetchall()]
            rows = conn.execute(
                """SELECT ds.entities, ds.tags FROM entries e
                   JOIN derived_summaries ds ON e.id = ds.entry_id
                   WHERE e.user_id = ? AND e.is_current = 1
                   ORDER BY e.entry_date DESC LIMIT 30""",
                (current_user["id"],)
            ).fetchall()
            entities_text = " ".join((r["entities"] or "") for r in rows)
            tags_text     = " ".join((r["tags"] or "") for r in rows)
            stats = conn.execute(
                """SELECT AVG(ds.severity) as avg_sev FROM entries e
                   JOIN derived_summaries ds ON e.id = ds.entry_id
                   WHERE e.user_id = ? AND e.is_current = 1
                   AND e.entry_date >= date('now','-30 days')""",
                (current_user["id"],)
            ).fetchone()
            avg_sev = float(stats["avg_sev"] or 3.0)

            branch_scores = _score_branches(memory, alerts, entities_text, tags_text)
            new_active    = _active_branches(branch_scores, [])
            new_hash      = _signal_hash(plan_dict["plan_type"], new_active, avg_sev)

            if new_hash == plan_dict.get("signal_hash"):
                return {"update_available": False, "proposed_changes": [], "applied": False}

            # Build lightweight diff prompt
            new_branches = set(new_active) - set(plan_dict["branches"])
            changed_alerts = [a for a in alerts[:5]]

            proposed = []

            # If a new high-confidence branch appeared, suggest adding a task for it
            for branch in new_branches:
                if branch_scores.get(branch, 0) >= 0.60:
                    branch_task_map = {
                        "housing":  "Research housing options and understand your tenant/ownership rights",
                        "financial": "Open a personal bank account separate from any joint accounts",
                        "pets":     "Make a plan for your pets during the transition period",
                        "children": "Connect with your child's school counselor to ensure continuity",
                    }
                    if branch in branch_task_map:
                        proposed.append({
                            "change_type": "add_task",
                            "phase_order": 2,
                            "task": {
                                "title":          branch_task_map[branch],
                                "priority":       "high",
                                "why_it_matters": f"New signals suggest {branch} planning is increasingly relevant.",
                                "resource_keys":  [branch],
                            }
                        })

            # If severity spiked, suggest reprioritizing safety tasks
            if avg_sev >= 7.5:
                safety_tasks = conn.execute(
                    """SELECT t.id, t.title, t.priority FROM exit_plan_tasks t
                       JOIN exit_plan_phases p ON t.phase_id = p.id
                       WHERE t.plan_id = ? AND t.status NOT IN ('done','skipped')
                       AND t.priority IN ('normal','low')
                       AND (t.title LIKE '%safe%' OR t.title LIKE '%document%' OR t.title LIKE '%legal%')
                       LIMIT 2""",
                    (plan_dict["id"],)
                ).fetchall()
                for st in safety_tasks:
                    proposed.append({
                        "change_type":   "reprioritize",
                        "task_id":        st["id"],
                        "task_title":     st["title"],
                        "old_priority":   st["priority"],
                        "new_priority":   "high",
                        "reason":         "Stress signals have increased — this task may be more time-sensitive.",
                    })

            if body.apply and proposed:
                now_iso = datetime.now(timezone.utc).isoformat()
                for change in proposed:
                    if change["change_type"] == "reprioritize":
                        conn.execute(
                            "UPDATE exit_plan_tasks SET priority = ?, updated_at = ? WHERE id = ?",
                            (change["new_priority"], now_iso, change["task_id"])
                        )
                    elif change["change_type"] == "add_task":
                        # Find phase by order
                        phase = conn.execute(
                            "SELECT id FROM exit_plan_phases WHERE plan_id = ? AND status = 'active' ORDER BY phase_order ASC LIMIT 1",
                            (plan_dict["id"],)
                        ).fetchone()
                        if phase:
                            td = change["task"]
                            conn.execute(
                                """INSERT INTO exit_plan_tasks
                                   (phase_id, plan_id, title, why_it_matters, priority, resource_keys, created_at, updated_at)
                                   VALUES (?,?,?,?,?,?,?,?)""",
                                (phase["id"], plan_dict["id"], td["title"], td["why_it_matters"],
                                 td["priority"], json.dumps(td.get("resource_keys", [])), now_iso, now_iso)
                            )
                conn.execute(
                    "UPDATE exit_plans SET signal_hash = ?, updated_at = ?, branches = ? WHERE id = ?",
                    (new_hash, now_iso, json.dumps(new_active), plan_dict["id"])
                )
                conn.commit()

            return {
                "update_available":  True,
                "current_signal_hash": plan_dict.get("signal_hash"),
                "new_signal_hash":   new_hash,
                "proposed_changes":  proposed,
                "applied":           body.apply and bool(proposed),
            }
        finally:
            conn.close()

    # ── DELETE /api/exit-plan ───────────────────────────────────────────────────
    @app.delete("/api/exit-plan")
    async def delete_exit_plan(current_user: dict = Depends(require_any_user)):
        conn = get_db()
        try:
            _ensure_tables(conn)
            plan = conn.execute(
                "SELECT id FROM exit_plans WHERE user_id = ?",
                (current_user["id"],)
            ).fetchone()
            if not plan:
                raise HTTPException(404, "No plan found")

            plan_id = plan["id"]
            # Manual cascade (no FK cascade in SQLite by default)
            phase_ids = [r["id"] for r in conn.execute(
                "SELECT id FROM exit_plan_phases WHERE plan_id = ?", (plan_id,)
            ).fetchall()]
            for pid in phase_ids:
                task_ids = [r["id"] for r in conn.execute(
                    "SELECT id FROM exit_plan_tasks WHERE phase_id = ?", (pid,)
                ).fetchall()]
                for tid in task_ids:
                    conn.execute("DELETE FROM exit_plan_notes WHERE task_id = ?", (tid,))
                    conn.execute("DELETE FROM exit_plan_attachments WHERE task_id = ?", (tid,))
                conn.execute("DELETE FROM exit_plan_tasks WHERE phase_id = ?", (pid,))
            conn.execute("DELETE FROM exit_plan_phases WHERE plan_id = ?", (plan_id,))
            conn.execute("DELETE FROM exit_plan_notes WHERE plan_id = ?", (plan_id,))
            conn.execute("DELETE FROM exit_plan_attachments WHERE plan_id = ?", (plan_id,))
            conn.execute("DELETE FROM exit_plan_events WHERE plan_id = ?", (plan_id,))
            conn.execute("DELETE FROM exit_plan_signal_snapshots WHERE plan_id = ?", (plan_id,))
            conn.execute("DELETE FROM exit_plans WHERE id = ?", (plan_id,))
            conn.commit()

            # Clean up attachment files
            attach_dir = ATTACHMENT_BASE / f"user_{current_user['id']}"
            if attach_dir.exists():
                import shutil
                shutil.rmtree(attach_dir, ignore_errors=True)

            logger.info(f"[exit_plan] deleted plan_id={plan_id} user={current_user['id']}")
            return {"deleted": True}
        finally:
            conn.close()

    # ── POST /api/exit-plan/dismiss ─────────────────────────────────────────────
    @app.post("/api/exit-plan/dismiss")
    async def dismiss_offer(current_user: dict = Depends(require_any_user)):
        """Permanently dismiss the offer banner."""
        memory = load_user_memory(current_user["id"]) or {}
        memory["exit_plan_dismissed"] = True
        from src.api.onboarding_routes import save_user_memory
        save_user_memory(current_user["id"], memory)
        return {"dismissed": True}

    # ── GET /api/exit-plan/export ───────────────────────────────────────────────
    @app.get("/api/exit-plan/export")
    async def export_exit_plan(current_user: dict = Depends(require_any_user)):
        """
        Export the current user's exit plan as a portable JSON file.
        No user IDs, no attachment paths — safe to import into any account.
        """
        conn = get_db()
        try:
            _ensure_tables(conn)
            plan_row = conn.execute(
                "SELECT * FROM exit_plans WHERE user_id = ? AND status != 'deleted'",
                (current_user["id"],)
            ).fetchone()

            if not plan_row:
                raise HTTPException(status_code=404, detail="No active exit plan found.")

            plan = dict(plan_row)
            plan_id = plan["id"]

            phases_rows = conn.execute(
                "SELECT * FROM exit_plan_phases WHERE plan_id = ? ORDER BY phase_order",
                (plan_id,)
            ).fetchall()

            phases_out = []
            for pr in phases_rows:
                phase = dict(pr)
                tasks_rows = conn.execute(
                    "SELECT * FROM exit_plan_tasks WHERE phase_id = ? ORDER BY id",
                    (phase["id"],)
                ).fetchall()

                tasks_out = []
                for tr in tasks_rows:
                    t = dict(tr)
                    notes_rows = conn.execute(
                        "SELECT note_text, created_at FROM exit_plan_notes WHERE task_id = ? ORDER BY id",
                        (t["id"],)
                    ).fetchall()
                    tasks_out.append({
                        "title":          t["title"],
                        "description":    t.get("description"),
                        "why_it_matters": t.get("why_it_matters"),
                        "status":         t.get("status", "backlog"),
                        "priority":       t.get("priority", "normal"),
                        "due_date":       t.get("due_date"),
                        "completed_at":   t.get("completed_at"),
                        "skipped_reason": t.get("skipped_reason"),
                        "ai_generated":   t.get("ai_generated", 1),
                        "resource_keys":  json.loads(t.get("resource_keys") or "[]"),
                        "notes":          [{"text": r["note_text"], "created_at": r["created_at"]} for r in notes_rows],
                    })

                phases_out.append({
                    "phase_order":      phase["phase_order"],
                    "title":            phase["title"],
                    "description":      phase.get("description"),
                    "status":           phase.get("status", "locked"),
                    "unlock_threshold": phase.get("unlock_threshold", 0.5),
                    "tasks":            tasks_out,
                })

            # Plan-level notes (task_id IS NULL)
            plan_notes_rows = conn.execute(
                "SELECT note_text, created_at FROM exit_plan_notes WHERE plan_id = ? AND task_id IS NULL ORDER BY id",
                (plan_id,)
            ).fetchall()

            export_payload = {
                "format_version": "1.0",
                "exported_at":    datetime.now(timezone.utc).isoformat(),
                "plan_type":      plan["plan_type"],
                "branches":       json.loads(plan.get("branches") or "[]"),
                "status":         plan.get("status", "active"),
                "generated_at":   plan.get("generated_at"),
                "phases":         phases_out,
                "plan_notes":     [{"text": r["note_text"], "created_at": r["created_at"]} for r in plan_notes_rows],
            }

            from fastapi.responses import JSONResponse
            filename = f"exit_plan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            return JSONResponse(
                content=export_payload,
                headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
            )
        finally:
            conn.close()


    # ── POST /api/exit-plan/import ──────────────────────────────────────────────
    @app.post("/api/exit-plan/import")
    async def import_exit_plan(
        payload: dict,
        current_user: dict = Depends(require_any_user),
    ):
        """
        Import a previously exported exit plan JSON into the current user's account.
        If the user already has an active plan, it is deleted first.
        Attachments are not restored (file paths are not portable).
        """
        conn = get_db()
        try:
            _ensure_tables(conn)

            fmt_version = payload.get("format_version")
            if fmt_version not in ("1.0",):
                raise HTTPException(status_code=400, detail=f"Unsupported format_version: {fmt_version}")

            plan_type = payload.get("plan_type")
            branches  = payload.get("branches", [])
            phases    = payload.get("phases", [])
            plan_notes = payload.get("plan_notes", [])

            if not plan_type or not phases:
                raise HTTPException(status_code=400, detail="Invalid export file — missing plan_type or phases.")

            now = datetime.now(timezone.utc).isoformat()

            # ── Delete existing plan if present ─────────────────────────────────
            existing = conn.execute(
                "SELECT id FROM exit_plans WHERE user_id = ? AND status != 'deleted'",
                (current_user["id"],)
            ).fetchone()

            if existing:
                old_plan_id = existing["id"]
                phase_ids = [r["id"] for r in conn.execute(
                    "SELECT id FROM exit_plan_phases WHERE plan_id = ?", (old_plan_id,)
                ).fetchall()]
                for pid in phase_ids:
                    task_ids = [r["id"] for r in conn.execute(
                        "SELECT id FROM exit_plan_tasks WHERE phase_id = ?", (pid,)
                    ).fetchall()]
                    for tid in task_ids:
                        conn.execute("DELETE FROM exit_plan_notes WHERE task_id = ?", (tid,))
                        conn.execute("DELETE FROM exit_plan_attachments WHERE task_id = ?", (tid,))
                    conn.execute("DELETE FROM exit_plan_tasks WHERE phase_id = ?", (pid,))
                conn.execute("DELETE FROM exit_plan_phases WHERE plan_id = ?", (old_plan_id,))
                conn.execute("DELETE FROM exit_plan_notes WHERE plan_id = ?", (old_plan_id,))
                conn.execute("DELETE FROM exit_plan_attachments WHERE plan_id = ?", (old_plan_id,))
                conn.execute("DELETE FROM exit_plan_events WHERE plan_id = ?", (old_plan_id,))
                conn.execute("DELETE FROM exit_plan_signal_snapshots WHERE plan_id = ?", (old_plan_id,))
                conn.execute("DELETE FROM exit_plans WHERE id = ?", (old_plan_id,))

            # ── Insert new plan ─────────────────────────────────────────────────
            cur = conn.execute(
                """INSERT INTO exit_plans (user_id, plan_type, branches, status, generated_at, updated_at)
                   VALUES (?, ?, ?, 'active', ?, ?)""",
                (current_user["id"], plan_type, json.dumps(branches), now, now)
            )
            new_plan_id = cur.lastrowid

            # ── Insert phases and tasks ─────────────────────────────────────────
            for phase_data in phases:
                p_cur = conn.execute(
                    """INSERT INTO exit_plan_phases (plan_id, phase_order, title, description, status, unlock_threshold)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        new_plan_id,
                        phase_data.get("phase_order", 1),
                        phase_data.get("title", ""),
                        phase_data.get("description"),
                        phase_data.get("status", "locked"),
                        _normalize_threshold(phase_data.get("unlock_threshold"), phase_data.get("phase_order", 2)),
                    )
                )
                new_phase_id = p_cur.lastrowid

                for task_data in phase_data.get("tasks", []):
                    t_cur = conn.execute(
                        """INSERT INTO exit_plan_tasks
                           (plan_id, phase_id, title, description, why_it_matters,
                            status, priority, due_date, completed_at, skipped_reason,
                            ai_generated, resource_keys, created_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            new_plan_id,
                            new_phase_id,
                            task_data.get("title", ""),
                            task_data.get("description"),
                            task_data.get("why_it_matters"),
                            task_data.get("status", "backlog"),
                            task_data.get("priority", "normal"),
                            task_data.get("due_date"),
                            task_data.get("completed_at"),
                            task_data.get("skipped_reason"),
                            task_data.get("ai_generated", 1),
                            json.dumps(task_data.get("resource_keys", [])),
                            now,
                            now,
                        )
                    )
                    new_task_id = t_cur.lastrowid

                    for note in task_data.get("notes", []):
                        note_text = note.get("text") if isinstance(note, dict) else str(note)
                        conn.execute(
                            "INSERT INTO exit_plan_notes (task_id, plan_id, note_text, created_at) VALUES (?, ?, ?, ?)",
                            (new_task_id, new_plan_id, note_text, note.get("created_at", now) if isinstance(note, dict) else now)
                        )

            # ── Plan-level notes ────────────────────────────────────────────────
            for note in plan_notes:
                note_text = note.get("text") if isinstance(note, dict) else str(note)
                conn.execute(
                    "INSERT INTO exit_plan_notes (task_id, plan_id, note_text, created_at) VALUES (NULL, ?, ?, ?)",
                    (new_plan_id, note_text, note.get("created_at", now) if isinstance(note, dict) else now)
                )

            conn.commit()
            logger.info(f"[exit_plan] imported plan for user={current_user['id']} plan_id={new_plan_id}")

            return {
                "imported": True,
                "plan_id":  new_plan_id,
                "plan_type": plan_type,
                "phases_imported": len(phases),
                "message": "Exit plan imported successfully.",
            }
        finally:
            conn.close()

    # ── Support Network — manual contact CRUD ─────────────────────────────────

    def _ensure_contacts_table(conn):
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exit_plan_contacts (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                name       TEXT    NOT NULL,
                role       TEXT    DEFAULT '',
                phone      TEXT    DEFAULT '',
                email      TEXT    DEFAULT '',
                address    TEXT    DEFAULT '',
                notes      TEXT    DEFAULT '',
                created_at TEXT    NOT NULL,
                updated_at TEXT    NOT NULL
            )
        """)
        conn.commit()

    @app.get("/api/exit-plan/contacts")
    async def get_contacts(current_user: dict = Depends(require_any_user)):
        conn = get_db()
        _ensure_contacts_table(conn)
        rows = conn.execute(
            "SELECT * FROM exit_plan_contacts WHERE user_id = ? ORDER BY created_at ASC",
            (current_user["id"],)
        ).fetchall()
        return {"contacts": [dict(r) for r in rows]}

    class ContactCreateRequest(BaseModel):
        name:    str
        role:    str = ""
        phone:   str = ""
        email:   str = ""
        address: str = ""
        notes:   str = ""

    @app.post("/api/exit-plan/contacts")
    async def create_contact(req: ContactCreateRequest, current_user: dict = Depends(require_any_user)):
        conn = get_db()
        _ensure_contacts_table(conn)
        now = datetime.now(timezone.utc).isoformat()
        cur = conn.execute(
            """INSERT INTO exit_plan_contacts (user_id, name, role, phone, email, address, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (current_user["id"], req.name.strip(), req.role, req.phone, req.email, req.address, req.notes, now, now)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM exit_plan_contacts WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)

    class ContactUpdateRequest(BaseModel):
        name:    str = None
        role:    str = None
        phone:   str = None
        email:   str = None
        address: str = None
        notes:   str = None

    @app.patch("/api/exit-plan/contacts/{contact_id}")
    async def update_contact(contact_id: int, req: ContactUpdateRequest, current_user: dict = Depends(require_any_user)):
        conn = get_db()
        _ensure_contacts_table(conn)
        row = conn.execute(
            "SELECT * FROM exit_plan_contacts WHERE id = ? AND user_id = ?",
            (contact_id, current_user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Contact not found")
        updates = {k: v for k, v in req.dict().items() if v is not None}
        if not updates:
            return dict(row)
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE exit_plan_contacts SET {set_clause} WHERE id = ? AND user_id = ?",
            list(updates.values()) + [contact_id, current_user["id"]]
        )
        conn.commit()
        row = conn.execute("SELECT * FROM exit_plan_contacts WHERE id = ?", (contact_id,)).fetchone()
        return dict(row)

    @app.delete("/api/exit-plan/contacts/{contact_id}")
    async def delete_contact(contact_id: int, current_user: dict = Depends(require_any_user)):
        conn = get_db()
        _ensure_contacts_table(conn)
        row = conn.execute(
            "SELECT id FROM exit_plan_contacts WHERE id = ? AND user_id = ?",
            (contact_id, current_user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Contact not found")
        conn.execute("DELETE FROM exit_plan_contacts WHERE id = ?", (contact_id,))
        conn.commit()
        return {"deleted": True}

# end register_exit_plan_routes
