"""
src/api/proof_vault_routes.py
Proof Vault — folder-organized evidence of your contributions.

Tables created on first run:
  pv_folders  — user-defined folders (Medical, School, etc.)
  pv_items    — entries inside folders (title, notes, date)
  pv_photos   — photos attached to items

Routes:
  GET    /api/vault/folders                           — list folders
  POST   /api/vault/folders                           — create folder
  PUT    /api/vault/folders/{fid}                     — update folder
  DELETE /api/vault/folders/{fid}                     — delete folder + contents
  GET    /api/vault/folders/{fid}/items               — list items in folder
  POST   /api/vault/folders/{fid}/items               — add item
  PUT    /api/vault/items/{iid}                       — update item
  DELETE /api/vault/items/{iid}                       — delete item + photos
  POST   /api/vault/items/{iid}/photos                — upload photo to item
  GET    /api/vault/items/{iid}/photos/{pid}/image    — serve photo (auth-gated)
  DELETE /api/vault/items/{iid}/photos/{pid}          — delete photo
  POST   /api/vault/folders/{fid}/summary             — AI summary of folder
  POST   /api/vault/summary                           — AI summary of everything
"""

from __future__ import annotations

import logging
import os
import shutil
import hashlib
import uuid
from typing import Optional

from fastapi import Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

logger = logging.getLogger("journal")

VAULT_STORAGE    = "/opt/journal-dashboard/data/vault"
ALLOWED_TYPES    = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"}
MAX_BYTES        = 20 * 1024 * 1024   # 20 MB
FOLDER_ICONS     = ["📁", "🏥", "🏫", "🍽", "💊", "📚", "🎨", "⚽", "🚗", "💰", "📞", "📧", "🎵", "🛁", "🌙", "❤️", "🧸", "📸"]
FOLDER_COLORS    = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"]


# ── Pydantic models ────────────────────────────────────────────────────────────

class FolderCreate(BaseModel):
    name:        str
    icon:        Optional[str] = "📁"
    color:       Optional[str] = "#6366f1"
    description: Optional[str] = None

class FolderUpdate(BaseModel):
    name:        Optional[str] = None
    icon:        Optional[str] = None
    color:       Optional[str] = None
    description: Optional[str] = None

class ItemCreate(BaseModel):
    title:     str
    notes:     Optional[str] = None
    item_date: Optional[str] = None   # YYYY-MM-DD

class ItemUpdate(BaseModel):
    title:     Optional[str] = None
    notes:     Optional[str] = None
    item_date: Optional[str] = None


# ── Route registration ─────────────────────────────────────────────────────────

def register_proof_vault_routes(app, require_any_user):

    def _db():
        from src.auth.auth_db import get_db
        return get_db()

    def _ensure_tables(conn):
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pv_folders (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                name        TEXT    NOT NULL,
                icon        TEXT    DEFAULT '📁',
                color       TEXT    DEFAULT '#6366f1',
                description TEXT,
                created_at  TEXT    DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pv_items (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                folder_id   INTEGER NOT NULL,
                user_id     INTEGER NOT NULL,
                title       TEXT    NOT NULL,
                notes       TEXT,
                item_date   TEXT,
                created_at  TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (folder_id) REFERENCES pv_folders(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pv_photos (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id           INTEGER NOT NULL,
                user_id           INTEGER NOT NULL,
                filename          TEXT    NOT NULL,
                original_filename TEXT,
                file_path         TEXT    NOT NULL,
                created_at        TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (item_id) REFERENCES pv_items(id) ON DELETE CASCADE
            )
        """)
        conn.commit()

    def _folder_path(user_id: int, folder_id: int) -> str:
        p = os.path.join(VAULT_STORAGE, str(user_id), str(folder_id))
        os.makedirs(p, exist_ok=True)
        return p

    def _get_folder(fid: int, user_id: int, conn):
        row = conn.execute(
            "SELECT id, name, icon, color, description FROM pv_folders WHERE id = ? AND user_id = ?",
            (fid, user_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Folder not found.")
        return row

    def _get_item(iid: int, user_id: int, conn):
        row = conn.execute(
            "SELECT id, folder_id, title, notes, item_date FROM pv_items WHERE id = ? AND user_id = ?",
            (iid, user_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found.")
        return row

    def _folder_summary(fid: int, user_id: int, conn) -> str:
        """Build a text summary of all items + photos in a folder for AI."""
        folder = _get_folder(fid, user_id, conn)
        items  = conn.execute(
            "SELECT id, title, notes, item_date FROM pv_items WHERE folder_id = ? AND user_id = ? ORDER BY item_date DESC, created_at DESC",
            (fid, user_id)
        ).fetchall()
        if not items:
            return None
        lines = [f"Folder: {folder['name']}"]
        for it in items:
            photos = conn.execute("SELECT id FROM pv_photos WHERE item_id = ?", (it["id"],)).fetchall()
            line   = f"- [{it['item_date'] or 'undated'}] {it['title']}"
            if it["notes"]:
                line += f" — {it['notes']}"
            if photos:
                line += f" ({len(photos)} photo{'s' if len(photos) > 1 else ''})"
            lines.append(line)
        return "\n".join(lines)

    def _compute_vault_hash(items_with_photos: list) -> str:
        """Hash of (item_id, photo_count) pairs — changes whenever content changes."""
        key = ",".join(f"{r['id']}:{r.get('photo_count', 0)}" for r in items_with_photos)
        return hashlib.sha256(key.encode()).hexdigest()[:16]

    def _ensure_cache_table(conn):
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pv_summary_cache (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER NOT NULL,
                scope         TEXT    NOT NULL,
                scope_id      INTEGER,
                source_hash   TEXT    NOT NULL,
                summary_text  TEXT    NOT NULL,
                item_count    INTEGER,
                photo_count   INTEGER,
                generated_at  TEXT    DEFAULT (datetime('now')),
                UNIQUE(user_id, scope, scope_id, source_hash)
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_pv_summary_cache_lookup
                ON pv_summary_cache (user_id, scope, scope_id)
        """)
        conn.commit()

    def _get_cached_summary(conn, user_id: int, scope: str, scope_id):
        """Return the most recent cached summary row regardless of hash (for display)."""
        return conn.execute(
            """SELECT summary_text, item_count, photo_count, generated_at, source_hash
               FROM pv_summary_cache
               WHERE user_id = ? AND scope = ? AND COALESCE(scope_id, -1) = COALESCE(?, -1)
               ORDER BY generated_at DESC LIMIT 1""",
            (user_id, scope, scope_id)
        ).fetchone()

    def _check_hash_cache(conn, user_id: int, scope: str, scope_id, source_hash: str):
        """Return cached row only if hash matches current content."""
        return conn.execute(
            """SELECT summary_text, item_count, photo_count, generated_at
               FROM pv_summary_cache
               WHERE user_id = ? AND scope = ? AND COALESCE(scope_id, -1) = COALESCE(?, -1)
                 AND source_hash = ?""",
            (user_id, scope, scope_id, source_hash)
        ).fetchone()

    def _write_cache(conn, user_id: int, scope: str, scope_id, source_hash: str,
                     summary_text: str, item_count: int, photo_count: int):
        conn.execute(
            """INSERT INTO pv_summary_cache
                 (user_id, scope, scope_id, source_hash, summary_text, item_count, photo_count)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(user_id, scope, scope_id, source_hash)
               DO UPDATE SET summary_text=excluded.summary_text,
                             item_count=excluded.item_count,
                             photo_count=excluded.photo_count,
                             generated_at=datetime('now')""",
            (user_id, scope, scope_id, source_hash, summary_text, item_count, photo_count)
        )
        conn.commit()

    # ── Folders ───────────────────────────────────────────────────────────────


    @app.get("/api/vault/folders")
    async def list_folders(user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            _ensure_tables(conn)
            rows = conn.execute(
                """SELECT f.id, f.name, f.icon, f.color, f.description, f.created_at,
                          COUNT(i.id) as item_count
                   FROM pv_folders f
                   LEFT JOIN pv_items i ON i.folder_id = f.id
                   WHERE f.user_id = ?
                   GROUP BY f.id
                   ORDER BY f.created_at""",
                (user["id"],)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    @app.post("/api/vault/folders")
    async def create_folder(body: FolderCreate, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            _ensure_tables(conn)
            cur = conn.execute(
                "INSERT INTO pv_folders (user_id, name, icon, color, description) VALUES (?,?,?,?,?)",
                (user["id"], body.name.strip(), body.icon or "📁", body.color or "#6366f1", body.description)
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, name, icon, color, description, created_at FROM pv_folders WHERE id = ?",
                (cur.lastrowid,)
            ).fetchone()
            return {**dict(row), "item_count": 0}
        finally:
            conn.close()

    @app.put("/api/vault/folders/{folder_id}")
    async def update_folder(folder_id: int, body: FolderUpdate, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            _get_folder(folder_id, user["id"], conn)
            sets, vals = [], []
            if body.name        is not None: sets.append("name = ?");        vals.append(body.name.strip())
            if body.icon        is not None: sets.append("icon = ?");        vals.append(body.icon)
            if body.color       is not None: sets.append("color = ?");       vals.append(body.color)
            if body.description is not None: sets.append("description = ?"); vals.append(body.description)
            if not sets:
                raise HTTPException(status_code=400, detail="Nothing to update.")
            vals.extend([folder_id, user["id"]])
            conn.execute(f"UPDATE pv_folders SET {', '.join(sets)} WHERE id = ? AND user_id = ?", vals)
            conn.commit()
            row = conn.execute(
                """SELECT f.id, f.name, f.icon, f.color, f.description, f.created_at,
                          COUNT(i.id) as item_count
                   FROM pv_folders f LEFT JOIN pv_items i ON i.folder_id = f.id
                   WHERE f.id = ? GROUP BY f.id""",
                (folder_id,)
            ).fetchone()
            return dict(row)
        finally:
            conn.close()

    @app.delete("/api/vault/folders/{folder_id}")
    async def delete_folder(folder_id: int, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            _get_folder(folder_id, user["id"], conn)
            # Delete all photo files on disk
            items = conn.execute(
                "SELECT id FROM pv_items WHERE folder_id = ? AND user_id = ?",
                (folder_id, user["id"])
            ).fetchall()
            for it in items:
                photos = conn.execute("SELECT file_path FROM pv_photos WHERE item_id = ?", (it["id"],)).fetchall()
                for p in photos:
                    try:
                        os.remove(p["file_path"])
                    except Exception:
                        pass
            # Remove folder directory
            folder_dir = os.path.join(VAULT_STORAGE, str(user["id"]), str(folder_id))
            shutil.rmtree(folder_dir, ignore_errors=True)
            conn.execute("DELETE FROM pv_folders WHERE id = ? AND user_id = ?", (folder_id, user["id"]))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    # ── Items ─────────────────────────────────────────────────────────────────

    @app.get("/api/vault/folders/{folder_id}/items")
    async def list_items(folder_id: int, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            _get_folder(folder_id, user["id"], conn)
            items = conn.execute(
                "SELECT id, title, notes, item_date, created_at FROM pv_items WHERE folder_id = ? AND user_id = ? ORDER BY item_date DESC, created_at DESC",
                (folder_id, user["id"])
            ).fetchall()
            result = []
            for it in items:
                photos = conn.execute(
                    "SELECT id, original_filename, created_at FROM pv_photos WHERE item_id = ? ORDER BY created_at",
                    (it["id"],)
                ).fetchall()
                result.append({**dict(it), "photos": [dict(p) for p in photos]})
            return result
        finally:
            conn.close()

    @app.post("/api/vault/folders/{folder_id}/items")
    async def add_item(folder_id: int, body: ItemCreate, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            _get_folder(folder_id, user["id"], conn)
            _ensure_tables(conn)
            cur = conn.execute(
                "INSERT INTO pv_items (folder_id, user_id, title, notes, item_date) VALUES (?,?,?,?,?)",
                (folder_id, user["id"], body.title.strip(), body.notes, body.item_date)
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, title, notes, item_date, created_at FROM pv_items WHERE id = ?",
                (cur.lastrowid,)
            ).fetchone()
            return {**dict(row), "photos": []}
        finally:
            conn.close()

    @app.put("/api/vault/items/{item_id}")
    async def update_item(item_id: int, body: ItemUpdate, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            _get_item(item_id, user["id"], conn)
            sets, vals = [], []
            if body.title     is not None: sets.append("title = ?");     vals.append(body.title.strip())
            if body.notes     is not None: sets.append("notes = ?");     vals.append(body.notes)
            if body.item_date is not None: sets.append("item_date = ?"); vals.append(body.item_date)
            if not sets:
                raise HTTPException(status_code=400, detail="Nothing to update.")
            vals.extend([item_id, user["id"]])
            conn.execute(f"UPDATE pv_items SET {', '.join(sets)} WHERE id = ? AND user_id = ?", vals)
            conn.commit()
            row = conn.execute(
                "SELECT id, title, notes, item_date, created_at FROM pv_items WHERE id = ?",
                (item_id,)
            ).fetchone()
            photos = conn.execute(
                "SELECT id, original_filename, created_at FROM pv_photos WHERE item_id = ? ORDER BY created_at",
                (item_id,)
            ).fetchall()
            return {**dict(row), "photos": [dict(p) for p in photos]}
        finally:
            conn.close()

    @app.delete("/api/vault/items/{item_id}")
    async def delete_item(item_id: int, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            it = _get_item(item_id, user["id"], conn)
            photos = conn.execute("SELECT file_path FROM pv_photos WHERE item_id = ?", (item_id,)).fetchall()
            for p in photos:
                try:
                    os.remove(p["file_path"])
                except Exception:
                    pass
            conn.execute("DELETE FROM pv_items WHERE id = ? AND user_id = ?", (item_id, user["id"]))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    # ── Photos ────────────────────────────────────────────────────────────────

    @app.post("/api/vault/items/{item_id}/photos")
    async def upload_photo(item_id: int, file: UploadFile = File(...), user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            it = _get_item(item_id, user["id"], conn)

            content_type = file.content_type or ""
            if content_type not in ALLOWED_TYPES and not file.filename.lower().endswith((".heic", ".heif")):
                raise HTTPException(status_code=400, detail=f"File type not allowed: {content_type}")

            data = await file.read()
            if len(data) > MAX_BYTES:
                raise HTTPException(status_code=413, detail=f"File too large (max {MAX_BYTES // 1024 // 1024} MB).")

            folder_id = it["folder_id"]
            save_dir  = _folder_path(user["id"], folder_id)
            ext       = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
            fname     = f"{uuid.uuid4().hex}{ext}"
            fpath     = os.path.join(save_dir, fname)

            with open(fpath, "wb") as f_out:
                f_out.write(data)

            cur = conn.execute(
                "INSERT INTO pv_photos (item_id, user_id, filename, original_filename, file_path) VALUES (?,?,?,?,?)",
                (item_id, user["id"], fname, file.filename, fpath)
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, original_filename, created_at FROM pv_photos WHERE id = ?",
                (cur.lastrowid,)
            ).fetchone()
            return dict(row)
        finally:
            conn.close()

    @app.get("/api/vault/items/{item_id}/photos/{photo_id}/image")
    async def serve_photo(item_id: int, photo_id: int, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            _get_item(item_id, user["id"], conn)
            row = conn.execute(
                "SELECT file_path, filename FROM pv_photos WHERE id = ? AND item_id = ? AND user_id = ?",
                (photo_id, item_id, user["id"])
            ).fetchone()
            if not row or not os.path.exists(row["file_path"]):
                raise HTTPException(status_code=404, detail="Photo not found.")
            ext = os.path.splitext(row["filename"])[1].lower()
            media_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic"}
            media_type = media_map.get(ext, "image/jpeg")
            return FileResponse(row["file_path"], media_type=media_type)
        finally:
            conn.close()

    @app.delete("/api/vault/items/{item_id}/photos/{photo_id}")
    async def delete_photo(item_id: int, photo_id: int, user: dict = Depends(require_any_user)):
        conn = _db()
        try:
            _get_item(item_id, user["id"], conn)
            row = conn.execute(
                "SELECT file_path FROM pv_photos WHERE id = ? AND item_id = ? AND user_id = ?",
                (photo_id, item_id, user["id"])
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Photo not found.")
            try:
                os.remove(row["file_path"])
            except Exception:
                pass
            conn.execute("DELETE FROM pv_photos WHERE id = ?", (photo_id,))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    # ── AI Summaries ──────────────────────────────────────────────────────────

    @app.get("/api/vault/folders/{folder_id}/summary/cached")
    async def folder_summary_cached(folder_id: int, user: dict = Depends(require_any_user)):
        """Return the most recently cached summary for a folder (no AI call)."""
        conn = _db()
        try:
            _ensure_cache_table(conn)
            _get_folder(folder_id, user["id"], conn)
            row = _get_cached_summary(conn, user["id"], "folder", folder_id)
            if not row:
                return {"cached": False}
            return {
                "cached":       True,
                "summary":      row["summary_text"],
                "item_count":   row["item_count"],
                "photo_count":  row["photo_count"],
                "generated_at": row["generated_at"],
            }
        finally:
            conn.close()

    @app.post("/api/vault/folders/{folder_id}/summary")
    async def folder_summary(folder_id: int, force: bool = False, user: dict = Depends(require_any_user)):
        """AI summary of everything in a single folder. Cached by content hash."""
        conn = _db()
        try:
            _ensure_cache_table(conn)
            folder = _get_folder(folder_id, user["id"], conn)
            text   = _folder_summary(folder_id, user["id"], conn)
            if not text:
                raise HTTPException(status_code=400, detail="No items in this folder yet.")

            # Build hash from item IDs + photo counts
            rows_for_hash = conn.execute(
                """SELECT i.id, COUNT(p.id) as photo_count
                   FROM pv_items i
                   LEFT JOIN pv_photos p ON p.item_id = i.id
                   WHERE i.folder_id = ? AND i.user_id = ?
                   GROUP BY i.id ORDER BY i.id""",
                (folder_id, user["id"])
            ).fetchall()
            source_hash = _compute_vault_hash([dict(r) for r in rows_for_hash])

            photo_count = sum(r["photo_count"] for r in rows_for_hash)
            item_count  = len(rows_for_hash)

            # Cache hit
            if not force:
                cached = _check_hash_cache(conn, user["id"], "folder", folder_id, source_hash)
                if cached:
                    logger.info(f"[vault_cache] hit folder={folder_id} user={user['id']} hash={source_hash}")
                    return {
                        "summary":      cached["summary_text"],
                        "folder_name":  folder["name"],
                        "photo_count":  photo_count,
                        "item_count":   item_count,
                        "cached":       True,
                        "generated_at": cached["generated_at"],
                    }

            try:
                from src.api.ai_client import create_message
                summary = create_message(
                    user["id"],
                    system=(
                        "You are generating a factual summary of documented contributions for a legal/personal record. "
                        "Be specific, chronological, and factual. Use phrases like 'documented X instances' and 'on [date]'. "
                        "This may be used to demonstrate involvement and caregiving. Keep it under 300 words."
                    ),
                    user_prompt=(
                        f"Summarize the following documented contributions from the '{folder['name']}' category. "
                        f"There are {photo_count} photos attached as evidence.\n\n{text}"
                    ),
                    max_tokens=450,
                    call_type="vault_folder_summary",
                )
            except Exception as ex:
                raise HTTPException(status_code=503, detail=f"AI summary failed: {ex}. Check your API key in Settings.")

            _write_cache(conn, user["id"], "folder", folder_id, source_hash, summary, item_count, photo_count)
            logger.info(f"[vault_cache] written folder={folder_id} user={user['id']} hash={source_hash}")

            return {
                "summary":      summary,
                "folder_name":  folder["name"],
                "photo_count":  photo_count,
                "item_count":   item_count,
                "cached":       False,
                "generated_at": None,
            }
        finally:
            conn.close()

    @app.get("/api/vault/summary/cached")
    async def full_summary_cached(user: dict = Depends(require_any_user)):
        """Return the most recently cached full-vault summary (no AI call)."""
        conn = _db()
        try:
            _ensure_cache_table(conn)
            row = _get_cached_summary(conn, user["id"], "full", None)
            if not row:
                return {"cached": False}
            return {
                "cached":       True,
                "summary":      row["summary_text"],
                "item_count":   row["item_count"],
                "photo_count":  row["photo_count"],
                "generated_at": row["generated_at"],
            }
        finally:
            conn.close()

    @app.post("/api/vault/summary")
    async def full_summary(force: bool = False, user: dict = Depends(require_any_user)):
        """AI summary across ALL folders. Cached by content hash."""
        conn = _db()
        try:
            _ensure_tables(conn)
            _ensure_cache_table(conn)
            folders = conn.execute(
                "SELECT id, name, icon FROM pv_folders WHERE user_id = ? ORDER BY created_at",
                (user["id"],)
            ).fetchall()
            if not folders:
                raise HTTPException(status_code=400, detail="No folders yet.")

            all_text     = []
            total_items  = 0
            total_photos = 0
            all_rows_for_hash = []

            for f in folders:
                text = _folder_summary(f["id"], user["id"], conn)
                if text:
                    all_text.append(text)
                    rows_for_hash = conn.execute(
                        """SELECT i.id, COUNT(p.id) as photo_count
                           FROM pv_items i
                           LEFT JOIN pv_photos p ON p.item_id = i.id
                           WHERE i.folder_id = ? AND i.user_id = ?
                           GROUP BY i.id ORDER BY i.id""",
                        (f["id"], user["id"])
                    ).fetchall()
                    all_rows_for_hash.extend([dict(r) for r in rows_for_hash])
                    total_items  += len(rows_for_hash)
                    total_photos += sum(r["photo_count"] for r in rows_for_hash)

            if not all_text:
                raise HTTPException(status_code=400, detail="No items documented yet.")

            source_hash = _compute_vault_hash(all_rows_for_hash)

            # Cache hit
            if not force:
                cached = _check_hash_cache(conn, user["id"], "full", None, source_hash)
                if cached:
                    logger.info(f"[vault_cache] hit full user={user['id']} hash={source_hash}")
                    return {
                        "summary":      cached["summary_text"],
                        "folder_count": len(folders),
                        "item_count":   total_items,
                        "photo_count":  total_photos,
                        "cached":       True,
                        "generated_at": cached["generated_at"],
                    }

            combined = "\n\n".join(all_text)

            try:
                from src.api.ai_client import create_message
                summary = create_message(
                    user["id"],
                    system=(
                        "You are generating a comprehensive summary of documented parenting/caregiving contributions for a legal record. "
                        "Organize by category. Be specific and factual. Reference dates and quantities where available. "
                        "This is meant to demonstrate consistent, documented involvement. Max 500 words."
                    ),
                    user_prompt=(
                        f"Generate a comprehensive summary of all documented contributions across {len(folders)} categories, "
                        f"covering {total_items} documented events with {total_photos} photos as evidence.\n\n{combined}"
                    ),
                    max_tokens=700,
                    call_type="vault_full_summary",
                )
            except Exception as ex:
                raise HTTPException(status_code=503, detail=f"AI summary failed: {ex}. Check your API key.")

            _write_cache(conn, user["id"], "full", None, source_hash, summary, total_items, total_photos)
            logger.info(f"[vault_cache] written full user={user['id']} hash={source_hash}")

            return {
                "summary":      summary,
                "folder_count": len(folders),
                "item_count":   total_items,
                "photo_count":  total_photos,
                "cached":       False,
                "generated_at": None,
            }
        finally:
            conn.close()
