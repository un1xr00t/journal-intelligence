"""
src/api/detective_graph_routes.py
Graph / Link Analysis routes for Detective Mode.

Routes:
  GET    /api/detective/cases/{id}/graph                      — entities + relationships
  POST   /api/detective/cases/{id}/graph/entities             — add entity
  PUT    /api/detective/cases/{id}/graph/entities/{eid}       — update entity (label, notes, pos)
  DELETE /api/detective/cases/{id}/graph/entities/{eid}       — delete entity + its relationships
  POST   /api/detective/cases/{id}/graph/relationships        — add relationship
  DELETE /api/detective/cases/{id}/graph/relationships/{rid}  — delete relationship
  POST   /api/detective/cases/{id}/graph/extract              — AI-extract from case log
  DELETE /api/detective/cases/{id}/graph/clear                — wipe all graph data for case
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("journal")

VALID_ENTITY_TYPES = {"person", "location", "org", "event", "evidence"}
VALID_REL_TYPES    = {"related", "contacted", "was_at", "works_for", "knows",
                      "sent", "received", "owns", "witnessed"}


# ── Pydantic models ────────────────────────────────────────────────────────────

class EntityCreate(BaseModel):
    label:       str
    entity_type: str            = "person"
    notes:       Optional[str]  = None
    x_pos:       Optional[float] = None
    y_pos:       Optional[float] = None

class EntityUpdate(BaseModel):
    label:       Optional[str]   = None
    entity_type: Optional[str]   = None
    notes:       Optional[str]   = None
    x_pos:       Optional[float] = None
    y_pos:       Optional[float] = None

class RelationshipCreate(BaseModel):
    source_id: int
    target_id: int
    label:     Optional[str] = None
    rel_type:  str           = "related"


# ── Registration ───────────────────────────────────────────────────────────────

def register_detective_graph_routes(app, require_any_user, require_owner):

    # ── Shared helpers ─────────────────────────────────────────────────────────

    def _db():
        from src.auth.auth_db import get_db
        return get_db()

    def _has_access(user: dict) -> bool:
        if user.get("role") == "owner":
            return True
        conn = _db()
        try:
            row = conn.execute(
                "SELECT id FROM detective_access WHERE user_id = ?",
                (user["id"],)
            ).fetchone()
            return row is not None
        finally:
            conn.close()

    def _require_detective(user: dict = Depends(require_any_user)):
        if not _has_access(user):
            raise HTTPException(status_code=403, detail="Detective Mode access required.")
        return user

    def _get_case(case_id: int, user_id: int, conn):
        row = conn.execute(
            "SELECT id, title, description FROM detective_cases WHERE id = ? AND user_id = ?",
            (case_id, user_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found.")
        return row

    def _ensure_tables(conn):
        conn.execute("""
            CREATE TABLE IF NOT EXISTS case_entities (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id     INTEGER NOT NULL,
                user_id     INTEGER NOT NULL,
                label       TEXT    NOT NULL,
                entity_type TEXT    NOT NULL DEFAULT 'person',
                notes       TEXT,
                x_pos       REAL,
                y_pos       REAL,
                created_at  TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (case_id) REFERENCES detective_cases(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS case_relationships (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id    INTEGER NOT NULL,
                user_id    INTEGER NOT NULL,
                source_id  INTEGER NOT NULL,
                target_id  INTEGER NOT NULL,
                label      TEXT,
                rel_type   TEXT    DEFAULT 'related',
                created_at TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (source_id) REFERENCES case_entities(id) ON DELETE CASCADE,
                FOREIGN KEY (target_id) REFERENCES case_entities(id) ON DELETE CASCADE
            )
        """)
        conn.commit()

    # ── GET graph ─────────────────────────────────────────────────────────────

    @app.get("/api/detective/cases/{case_id}/graph")
    async def get_graph(case_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            _ensure_tables(conn)
            entities = conn.execute(
                "SELECT id, label, entity_type, notes, x_pos, y_pos, created_at "
                "FROM case_entities WHERE case_id = ? AND user_id = ? ORDER BY created_at",
                (case_id, user["id"])
            ).fetchall()
            relationships = conn.execute(
                "SELECT id, source_id, target_id, label, rel_type, created_at "
                "FROM case_relationships WHERE case_id = ? AND user_id = ? ORDER BY created_at",
                (case_id, user["id"])
            ).fetchall()
            return {
                "entities":      [dict(e) for e in entities],
                "relationships": [dict(r) for r in relationships],
            }
        finally:
            conn.close()

    # ── Add entity ────────────────────────────────────────────────────────────

    @app.post("/api/detective/cases/{case_id}/graph/entities")
    async def add_entity(case_id: int, body: EntityCreate, user: dict = Depends(_require_detective)):
        etype = body.entity_type if body.entity_type in VALID_ENTITY_TYPES else "person"
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            _ensure_tables(conn)
            cur = conn.execute(
                "INSERT INTO case_entities (case_id, user_id, label, entity_type, notes, x_pos, y_pos) "
                "VALUES (?,?,?,?,?,?,?)",
                (case_id, user["id"], body.label.strip(), etype,
                 body.notes, body.x_pos, body.y_pos)
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, label, entity_type, notes, x_pos, y_pos, created_at "
                "FROM case_entities WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
            return dict(row)
        finally:
            conn.close()

    # ── Update entity ─────────────────────────────────────────────────────────

    @app.put("/api/detective/cases/{case_id}/graph/entities/{entity_id}")
    async def update_entity(case_id: int, entity_id: int, body: EntityUpdate,
                            user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            _ensure_tables(conn)
            sets, vals = [], []
            if body.label       is not None: sets.append("label = ?");       vals.append(body.label.strip())
            if body.entity_type is not None: sets.append("entity_type = ?"); vals.append(body.entity_type)
            if body.notes       is not None: sets.append("notes = ?");       vals.append(body.notes)
            if body.x_pos       is not None: sets.append("x_pos = ?");       vals.append(body.x_pos)
            if body.y_pos       is not None: sets.append("y_pos = ?");       vals.append(body.y_pos)
            if not sets:
                raise HTTPException(status_code=400, detail="Nothing to update.")
            vals.extend([entity_id, case_id, user["id"]])
            conn.execute(
                f"UPDATE case_entities SET {', '.join(sets)} "
                "WHERE id = ? AND case_id = ? AND user_id = ?", vals
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, label, entity_type, notes, x_pos, y_pos, created_at "
                "FROM case_entities WHERE id = ?", (entity_id,)
            ).fetchone()
            return dict(row)
        finally:
            conn.close()

    # ── Delete entity ─────────────────────────────────────────────────────────

    @app.delete("/api/detective/cases/{case_id}/graph/entities/{entity_id}")
    async def delete_entity(case_id: int, entity_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            conn.execute(
                "DELETE FROM case_relationships WHERE (source_id = ? OR target_id = ?) AND case_id = ?",
                (entity_id, entity_id, case_id)
            )
            conn.execute(
                "DELETE FROM case_entities WHERE id = ? AND case_id = ? AND user_id = ?",
                (entity_id, case_id, user["id"])
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    # ── Add relationship ──────────────────────────────────────────────────────

    @app.post("/api/detective/cases/{case_id}/graph/relationships")
    async def add_relationship(case_id: int, body: RelationshipCreate,
                               user: dict = Depends(_require_detective)):
        rtype = body.rel_type if body.rel_type in VALID_REL_TYPES else "related"
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            _ensure_tables(conn)
            if body.source_id == body.target_id:
                raise HTTPException(status_code=400, detail="Source and target must be different.")
            cur = conn.execute(
                "INSERT INTO case_relationships (case_id, user_id, source_id, target_id, label, rel_type) "
                "VALUES (?,?,?,?,?,?)",
                (case_id, user["id"], body.source_id, body.target_id,
                 (body.label or "").strip() or None, rtype)
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, source_id, target_id, label, rel_type, created_at "
                "FROM case_relationships WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
            return dict(row)
        finally:
            conn.close()

    # ── Delete relationship ───────────────────────────────────────────────────

    @app.delete("/api/detective/cases/{case_id}/graph/relationships/{rel_id}")
    async def delete_relationship(case_id: int, rel_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            conn.execute(
                "DELETE FROM case_relationships WHERE id = ? AND case_id = ? AND user_id = ?",
                (rel_id, case_id, user["id"])
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    # ── Clear entire graph ────────────────────────────────────────────────────

    @app.delete("/api/detective/cases/{case_id}/graph/clear")
    async def clear_graph(case_id: int, user: dict = Depends(_require_detective)):
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            conn.execute(
                "DELETE FROM case_relationships WHERE case_id = ? AND user_id = ?",
                (case_id, user["id"])
            )
            conn.execute(
                "DELETE FROM case_entities WHERE case_id = ? AND user_id = ?",
                (case_id, user["id"])
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    # ── AI extraction ─────────────────────────────────────────────────────────

    @app.post("/api/detective/cases/{case_id}/graph/extract")
    async def extract_graph(case_id: int, user: dict = Depends(_require_detective)):
        """AI-extract entities and relationships from all case log entries and photo analyses."""
        conn = _db()
        try:
            _get_case(case_id, user["id"], conn)
            _ensure_tables(conn)

            entries = conn.execute(
                "SELECT content, entry_type, created_at, "
                "attachment_analysis, multi_photo_analysis "
                "FROM detective_entries WHERE case_id = ? ORDER BY created_at",
                (case_id,)
            ).fetchall()

            uploads = conn.execute(
                "SELECT original_filename, ai_analysis FROM detective_uploads "
                "WHERE case_id = ? AND analysis_status = 'done'",
                (case_id,)
            ).fetchall()

            if not entries and not uploads:
                raise HTTPException(
                    status_code=400,
                    detail="No case entries to extract from. Add investigation log entries first."
                )

            parts = []
            for e in entries:
                line = f"[{e['created_at'][:10]} | {e['entry_type']}] {e['content']}"
                if e["attachment_analysis"]:
                    line += f"\nPhoto: {e['attachment_analysis'][:400]}"
                if e["multi_photo_analysis"]:
                    line += f"\nMulti-photo: {e['multi_photo_analysis'][:300]}"
                parts.append(line)
            for u in uploads:
                if u["ai_analysis"]:
                    parts.append(f"Gallery '{u['original_filename']}': {u['ai_analysis'][:400]}")

            case_text = "\n\n".join(parts)

            # Existing entities — avoid duplicates
            existing = conn.execute(
                "SELECT id, label, entity_type FROM case_entities WHERE case_id = ? AND user_id = ?",
                (case_id, user["id"])
            ).fetchall()
            label_to_id = {e["label"].lower(): e["id"] for e in existing}

            extract_prompt = f"""Analyze this investigation case log. Extract all meaningful entities and their relationships.

CASE LOG:
{case_text[:7000]}

Return ONLY valid JSON, no markdown fences, no explanation:
{{
  "entities": [
    {{"label": "Name or label", "type": "person|location|org|event|evidence", "notes": "1 sentence from the case"}}
  ],
  "relationships": [
    {{"source": "Entity label A", "target": "Entity label B", "label": "short relationship description", "type": "related|contacted|was_at|works_for|knows|sent|received|owns|witnessed"}}
  ]
}}

Rules:
- Only extract entities explicitly mentioned or clearly implied in the case log
- person: people, subjects, witnesses | location: addresses, places | org: companies, groups | event: specific incidents | evidence: documents, messages, items
- Relationships must reference entities from your entities list (exact label match)
- Keep entity labels concise and specific — use real names when available
- 5-25 entities, 3-25 relationships depending on what the data supports
- Do not include entities with zero relationships unless they are central to the case"""

            try:
                from src.api.ai_client import create_message
                raw = create_message(
                    user["id"],
                    system="You are a forensic analyst. Extract entities and relationships from investigation notes. Return ONLY valid JSON.",
                    user_prompt=extract_prompt,
                    max_tokens=2500,
                    call_type="detective_graph_extract",
                )
            except Exception as ex:
                raise HTTPException(
                    status_code=503,
                    detail=f"AI extraction failed: {ex}. Check your API key in Settings."
                )

            # Strip markdown fences if present
            clean = raw.strip()
            if "```" in clean:
                parts_clean = clean.split("```")
                for p in parts_clean:
                    p = p.strip()
                    if p.startswith("json"):
                        p = p[4:].strip()
                    if p.startswith("{"):
                        clean = p
                        break

            try:
                data = json.loads(clean)
            except Exception:
                logger.error(f"[graph extract] invalid JSON from AI: {clean[:500]}")
                raise HTTPException(status_code=500, detail="AI returned invalid JSON. Try again.")

            entities_in       = data.get("entities", [])
            relationships_in  = data.get("relationships", [])

            added_entities = 0
            for ent in entities_in:
                label = (ent.get("label") or "").strip()
                if not label:
                    continue
                etype = ent.get("type", "person")
                if etype not in VALID_ENTITY_TYPES:
                    etype = "person"
                notes = (ent.get("notes") or "").strip() or None

                existing_id = label_to_id.get(label.lower())
                if existing_id:
                    if notes:
                        conn.execute(
                            "UPDATE case_entities SET notes = ? WHERE id = ?",
                            (notes, existing_id)
                        )
                else:
                    cur = conn.execute(
                        "INSERT INTO case_entities (case_id, user_id, label, entity_type, notes) "
                        "VALUES (?,?,?,?,?)",
                        (case_id, user["id"], label, etype, notes)
                    )
                    label_to_id[label.lower()] = cur.lastrowid
                    added_entities += 1

            conn.commit()

            added_rels = 0
            for rel in relationships_in:
                src_label = (rel.get("source") or "").strip().lower()
                tgt_label = (rel.get("target") or "").strip().lower()
                rel_label = (rel.get("label") or "").strip() or None
                rel_type  = rel.get("type", "related")
                if rel_type not in VALID_REL_TYPES:
                    rel_type = "related"

                src_id = label_to_id.get(src_label)
                tgt_id = label_to_id.get(tgt_label)

                if not src_id or not tgt_id or src_id == tgt_id:
                    continue

                exists = conn.execute(
                    "SELECT id FROM case_relationships "
                    "WHERE case_id = ? AND source_id = ? AND target_id = ?",
                    (case_id, src_id, tgt_id)
                ).fetchone()
                if exists:
                    continue

                conn.execute(
                    "INSERT INTO case_relationships (case_id, user_id, source_id, target_id, label, rel_type) "
                    "VALUES (?,?,?,?,?,?)",
                    (case_id, user["id"], src_id, tgt_id, rel_label, rel_type)
                )
                added_rels += 1

            conn.commit()

            # Return updated full graph
            final_entities = conn.execute(
                "SELECT id, label, entity_type, notes, x_pos, y_pos, created_at "
                "FROM case_entities WHERE case_id = ? AND user_id = ? ORDER BY created_at",
                (case_id, user["id"])
            ).fetchall()
            final_rels = conn.execute(
                "SELECT id, source_id, target_id, label, rel_type, created_at "
                "FROM case_relationships WHERE case_id = ? AND user_id = ? ORDER BY created_at",
                (case_id, user["id"])
            ).fetchall()

            return {
                "entities":          [dict(e) for e in final_entities],
                "relationships":     [dict(r) for r in final_rels],
                "added_entities":    added_entities,
                "added_relationships": added_rels,
            }

        finally:
            conn.close()
