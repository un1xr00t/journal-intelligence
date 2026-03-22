"""
src/api/entry_attachments_routes.py

Entry image attachment routes.

Routes:
  POST   /api/entries/{entry_id}/attachments          — upload image
  GET    /api/entries/{entry_id}/attachments          — list attachments
  GET    /api/entry-attachments/{attachment_id}/file  — serve file (auth-gated)
  DELETE /api/entry-attachments/{attachment_id}       — delete

Security:
  - JWT required on all routes (passed via require_any_user dep)
  - user_id ownership enforced — users cannot read/delete each other's images
  - Files stored at data/attachments/entries/user_{id}/ with UUID-prefixed names
  - Files are NEVER served as static files — always through this auth-gated route
  - Image-only: JPEG, PNG, WEBP (no PDFs, no text — images only for entries)
  - 8 MB per file hard ceiling
  - 100 MB per-user soft cap (enforced at upload time)
"""

import os
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

logger = logging.getLogger("journal.entry_attachments")

# ── Constants ─────────────────────────────────────────────────────────────────

IMAGE_MAX_BYTES      = 8 * 1024 * 1024   # 8 MB per image
USER_TOTAL_CAP_BYTES = 100 * 1024 * 1024 # 100 MB per user soft cap

IMAGE_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

IMAGE_MEDIA_TYPES = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
}

# Magic-byte positive allowlist
IMAGE_MAGIC: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff",        "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n",  "image/png"),
    (b"RIFF",                "image/webp"),  # RIFF....WEBP
]

APP_ROOT = Path("/opt/journal-dashboard")


def _attachment_dir(user_id: int) -> Path:
    d = APP_ROOT / "data" / "attachments" / "entries" / f"user_{user_id}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _validate_image(body: bytes, filename: str) -> str:
    """Validate image bytes. Returns media_type or raises HTTPException."""
    if len(body) == 0:
        raise HTTPException(status_code=400, detail="File is empty.")

    if len(body) > IMAGE_MAX_BYTES:
        mb = IMAGE_MAX_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Image too large. Maximum is {mb} MB.")

    ext = Path(filename).suffix.lower()
    if ext not in IMAGE_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported type '{ext}'. Entry images must be JPEG, PNG, or WEBP.",
        )

    # Positive magic-byte check
    for magic, media_type in IMAGE_MAGIC:
        if body[: len(magic)] == magic:
            if media_type == "image/webp":
                if len(body) >= 12 and body[8:12] == b"WEBP":
                    return media_type
                raise HTTPException(status_code=415, detail="Invalid WEBP file.")
            return media_type

    raise HTTPException(
        status_code=415,
        detail="File content does not match its extension. Only genuine JPEG, PNG, or WEBP images are accepted.",
    )


def _user_total_bytes(conn, user_id: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(file_size), 0) FROM entry_attachments WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    return int(row[0]) if row else 0


# ── Route registration ────────────────────────────────────────────────────────

def register_entry_attachment_routes(app, require_any_user):

    @app.post("/api/entries/{entry_id}/attachments")
    async def upload_entry_attachment(
        entry_id: int,
        file: UploadFile = File(...),
        current_user: dict = Depends(require_any_user),
    ):
        from src.auth.auth_db import get_db

        user_id = current_user["id"]
        body    = await file.read()
        media_type = _validate_image(body, file.filename or "upload.jpg")

        conn = get_db()

        # Verify entry belongs to this user
        row = conn.execute(
            "SELECT id FROM entries WHERE id = ? AND user_id = ?",
            (entry_id, user_id),
        ).fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Entry not found.")

        # Soft cap
        used = _user_total_bytes(conn, user_id)
        if used + len(body) > USER_TOTAL_CAP_BYTES:
            conn.close()
            cap_mb = USER_TOTAL_CAP_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"Storage cap reached. You have used {used // (1024*1024)} MB of your {cap_mb} MB limit.",
            )

        # Build UUID-prefixed storage name so paths are never guessable
        ext          = Path(file.filename or "upload.jpg").suffix.lower()
        storage_name = f"{uuid.uuid4().hex}{ext}"
        dest_dir     = _attachment_dir(user_id)
        file_path    = dest_dir / storage_name

        file_path.write_bytes(body)

        safe_filename = Path(file.filename or storage_name).name

        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            """
            INSERT INTO entry_attachments
                (entry_id, user_id, filename, storage_name, file_path, file_size, media_type, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id,
                user_id,
                safe_filename,
                storage_name,
                str(file_path),
                len(body),
                media_type,
                now,
            ),
        )
        conn.commit()
        attachment_id = cursor.lastrowid
        conn.close()

        logger.info(
            "Entry attachment uploaded: entry=%d user=%d file=%s size=%d",
            entry_id, user_id, safe_filename, len(body),
        )

        return {
            "id":          attachment_id,
            "entry_id":    entry_id,
            "filename":    safe_filename,
            "file_size":   len(body),
            "media_type":  media_type,
            "uploaded_at": now,
        }


    @app.get("/api/entries/{entry_id}/attachments")
    async def list_entry_attachments(
        entry_id: int,
        current_user: dict = Depends(require_any_user),
    ):
        from src.auth.auth_db import get_db

        user_id = current_user["id"]
        conn    = get_db()

        # Verify ownership
        row = conn.execute(
            "SELECT id FROM entries WHERE id = ? AND user_id = ?",
            (entry_id, user_id),
        ).fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Entry not found.")

        rows = conn.execute(
            """
            SELECT id, entry_id, filename, file_size, media_type, uploaded_at
            FROM entry_attachments
            WHERE entry_id = ? AND user_id = ?
            ORDER BY uploaded_at ASC
            """,
            (entry_id, user_id),
        ).fetchall()
        conn.close()

        return {
            "attachments": [dict(r) for r in rows]
        }


    @app.get("/api/entry-attachments/{attachment_id}/file")
    async def serve_entry_attachment(
        attachment_id: int,
        current_user: dict = Depends(require_any_user),
    ):
        """
        Auth-gated file serving. Verifies user_id before returning bytes.
        Files are NEVER exposed as static assets.
        """
        from src.auth.auth_db import get_db

        user_id = current_user["id"]
        conn    = get_db()

        row = conn.execute(
            "SELECT file_path, filename, media_type, user_id FROM entry_attachments WHERE id = ?",
            (attachment_id,),
        ).fetchone()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="Attachment not found.")

        # Ownership check — strictly enforce user isolation
        if row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Access denied.")

        path = Path(row["file_path"])
        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk.")

        return FileResponse(
            path=str(path),
            media_type=row["media_type"],
            filename=row["filename"],
            headers={
                # Prevent browsers from caching with old credentials
                "Cache-Control": "private, max-age=3600",
                "X-Content-Type-Options": "nosniff",
            },
        )


    @app.delete("/api/entry-attachments/{attachment_id}")
    async def delete_entry_attachment(
        attachment_id: int,
        current_user: dict = Depends(require_any_user),
    ):
        from src.auth.auth_db import get_db

        user_id = current_user["id"]
        conn    = get_db()

        row = conn.execute(
            "SELECT file_path, user_id FROM entry_attachments WHERE id = ?",
            (attachment_id,),
        ).fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Attachment not found.")

        if row["user_id"] != user_id:
            conn.close()
            raise HTTPException(status_code=403, detail="Access denied.")

        # Remove from disk first, then DB
        path = Path(row["file_path"])
        if path.exists():
            path.unlink()

        conn.execute("DELETE FROM entry_attachments WHERE id = ?", (attachment_id,))
        conn.commit()
        conn.close()

        logger.info("Entry attachment deleted: id=%d user=%d", attachment_id, user_id)
        return {"message": "Deleted"}
