"""
src/api/dayone_import_routes.py
Day One migration wizard — import ZIP or JSON export.

Routes:
  POST /api/import/dayone         — upload file, kick off background job
  GET  /api/import/dayone/status/{job_id} — poll job progress + results
"""

import json
import uuid
import zipfile
import io
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, Request, BackgroundTasks, Depends

# ── In-memory job store ────────────────────────────────────────────────────────
# Survives a single server session; good enough for a single-user app.
_import_jobs: dict = {}


def _new_job() -> dict:
    return {
        "status": "queued",    # queued | processing | done | error
        "total": 0,
        "processed": 0,
        "inserted": 0,
        "skipped": 0,
        "errors": 0,
        "date_first": None,
        "date_last": None,
        "error_message": None,
        # populated once done
        "results": None,
    }


# ── Day One JSON parser ────────────────────────────────────────────────────────

def _parse_dayone_json(raw: bytes) -> list[dict]:
    """
    Parse a Day One JSON export blob.
    Returns list of dicts with keys: date (YYYY-MM-DD), text (str).
    Handles both top-level array and {"entries": [...]} wrapper.
    """
    data = json.loads(raw.decode("utf-8"))

    if isinstance(data, list):
        entries = data
    elif isinstance(data, dict):
        # Day One wraps in {"entries": [...]}
        entries = data.get("entries") or data.get("Entry") or []
    else:
        raise ValueError("Unrecognised Day One JSON structure")

    parsed = []
    for e in entries:
        # Date — prefer modifiedDate, fall back to creationDate
        raw_date = e.get("creationDate") or e.get("date") or e.get("Date")
        if not raw_date:
            continue

        # Handle ISO 8601 with Z suffix or offset
        raw_date = raw_date.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(raw_date)
            date_str = dt.strftime("%Y-%m-%d")
        except ValueError:
            # Try plain date string
            m = re.search(r"(\d{4})-(\d{2})-(\d{2})", raw_date)
            if not m:
                continue
            date_str = m.group(0)

        text = e.get("text") or e.get("Text") or ""
        if not text.strip():
            continue

        # Strip Day One Markdown photo refs: ![](dayone-moment://)
        text = re.sub(r"!\[.*?\]\(dayone-moment://[^\)]+\)", "", text).strip()

        parsed.append({"date": date_str, "text": text})

    return parsed


def _extract_from_zip(raw: bytes) -> list[dict]:
    """
    Extract Day One entries from a ZIP export.
    Looks for any .json file inside the ZIP.
    """
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        json_names = [n for n in zf.namelist() if n.endswith(".json")]
        if not json_names:
            raise ValueError("No JSON file found inside the ZIP archive")

        # Prefer a file called Journal.json; otherwise take the first
        target = next((n for n in json_names if "journal" in n.lower()), json_names[0])
        json_bytes = zf.read(target)

    return _parse_dayone_json(json_bytes)


# ── Background import worker ───────────────────────────────────────────────────

def _run_import(job_id: str, entries: list[dict], user_id: int):
    """
    Runs in a BackgroundTask. Processes each entry through the full pipeline.
    """
    from src.ingest.service import ingest_file
    from src.nlp.extractor import process_entry
    from src.nlp.master_summary import process_master_summary
    from src.patterns.detectors import run_all_detectors

    job = _import_jobs[job_id]
    job["status"] = "processing"
    job["total"] = len(entries)

    dates_seen = []

    for entry in entries:
        try:
            date_str = entry["date"]
            text = entry["text"]
            filename = f"{date_str}.txt"
            content_bytes = text.encode("utf-8")

            ingest_result = ingest_file(filename, content_bytes, user_id=user_id)

            if ingest_result["status"] == "error":
                job["errors"] += 1
            elif ingest_result["status"] == "skipped":
                job["skipped"] += 1
            else:
                job["inserted"] += 1
                entry_id = ingest_result["entry_id"]
                entry_date = ingest_result.get("entry_date", date_str)
                dates_seen.append(entry_date)

                # Run AI extraction synchronously (sequential, with progress tracking)
                try:
                    extraction_result = process_entry(entry_id, entry_date, text, user_id=user_id)
                    if extraction_result.get("status") != "error":
                        daily_summary = extraction_result["summary"].get("summary_text", "")
                        process_master_summary(entry_date, daily_summary, user_id=user_id)
                except Exception:
                    # Extraction failure is non-fatal — entry is still saved
                    pass

        except Exception as e:
            job["errors"] += 1

        job["processed"] += 1

    # Final pass: pattern detection
    try:
        run_all_detectors(user_id)
    except Exception:
        pass

    # Compute date range
    if dates_seen:
        dates_seen.sort()
        job["date_first"] = dates_seen[0]
        job["date_last"] = dates_seen[-1]

    # Pull results summary from DB
    try:
        job["results"] = _build_results(user_id)
    except Exception:
        job["results"] = {}

    job["status"] = "done"


def _build_results(user_id: int) -> dict:
    """
    Query the DB for a post-import intelligence summary.
    Returns entry count, date range, top people, pattern/contradiction counts.
    """
    import json as _json
    from src.auth.auth_db import get_db

    conn = get_db()
    try:
        # Total entries
        total_entries = conn.execute(
            "SELECT COUNT(*) FROM entries WHERE user_id=? AND is_current=1",
            (user_id,)
        ).fetchone()[0]

        # Date range
        row = conn.execute(
            "SELECT MIN(entry_date), MAX(entry_date) FROM entries WHERE user_id=? AND is_current=1",
            (user_id,)
        ).fetchone()
        date_first = row[0]
        date_last = row[1]

        # Top people from entities
        person_counts: dict = {}
        entity_rows = conn.execute(
            """SELECT ds.entities FROM derived_summaries ds
               JOIN entries e ON e.id=ds.entry_id
               WHERE e.user_id=? AND e.is_current=1 AND ds.entities IS NOT NULL""",
            (user_id,)
        ).fetchall()
        PERSON_VARIANTS = {"person", "human", "individual", "per"}
        for row in entity_rows:
            try:
                for ent in _json.loads(row[0]):
                    raw_type = ent.get("type") or ent.get("entity_type") or ""
                    if raw_type.lower() in PERSON_VARIANTS:
                        name = ent.get("name", "")
                        if name:
                            person_counts[name] = person_counts.get(name, 0) + 1
            except Exception:
                continue
        top_people = sorted(person_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        # Pattern / contradiction counts
        pattern_count = conn.execute(
            "SELECT COUNT(*) FROM alerts WHERE user_id=? AND acknowledged=0",
            (user_id,)
        ).fetchone()[0]

        contradiction_count = conn.execute(
            """SELECT COUNT(*) FROM derived_summaries ds
               JOIN entries e ON e.id=ds.entry_id
               WHERE e.user_id=? AND ds.contradiction_flags != '[]'
               AND ds.contradiction_flags IS NOT NULL""",
            (user_id,)
        ).fetchone()[0]

        # Most common mood
        mood_row = conn.execute(
            """SELECT ds.mood_label, COUNT(*) as cnt
               FROM derived_summaries ds JOIN entries e ON e.id=ds.entry_id
               WHERE e.user_id=? AND e.is_current=1 AND ds.mood_label IS NOT NULL
               GROUP BY ds.mood_label ORDER BY cnt DESC LIMIT 1""",
            (user_id,)
        ).fetchone()
        top_mood = mood_row[0] if mood_row else None

    finally:
        conn.close()

    return {
        "total_entries": total_entries,
        "date_first": date_first,
        "date_last": date_last,
        "top_people": [{"name": n, "count": c} for n, c in top_people],
        "pattern_count": pattern_count,
        "contradiction_count": contradiction_count,
        "top_mood": top_mood,
    }


# ── Route registration ─────────────────────────────────────────────────────────

def register_dayone_import_routes(app, require_any_user):

    @app.post("/api/import/dayone")
    async def start_dayone_import(
        request: Request,
        background_tasks: BackgroundTasks,
        current_user: dict = Depends(require_any_user),
    ):
        """
        Accept a Day One ZIP or JSON export, kick off background import.
        Returns {job_id} for status polling.
        """
        content_type = request.headers.get("content-type", "")
        user_id = current_user["id"]

        if "multipart/form-data" in content_type:
            form = await request.form()
            file_obj = form.get("file")
            if not file_obj:
                raise HTTPException(status_code=400, detail="No file in form data")
            raw = await file_obj.read()
            filename = getattr(file_obj, "filename", "export") or "export"
        else:
            raw = await request.body()
            filename = request.headers.get("X-Filename", "export.json")

        if not raw:
            raise HTTPException(status_code=400, detail="Empty file")

        # Parse based on file type
        try:
            if filename.lower().endswith(".zip") or raw[:2] == b"PK":
                entries = _extract_from_zip(raw)
            else:
                entries = _parse_dayone_json(raw)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse Day One export: {e}")

        if not entries:
            raise HTTPException(status_code=422, detail="No entries found in the export file")

        job_id = str(uuid.uuid4())
        _import_jobs[job_id] = _new_job()
        _import_jobs[job_id]["total"] = len(entries)

        background_tasks.add_task(_run_import, job_id, entries, user_id)

        return {"job_id": job_id, "total": len(entries)}


    @app.get("/api/import/dayone/status/{job_id}")
    async def get_import_status(
        job_id: str,
        current_user: dict = Depends(require_any_user),
    ):
        """Poll import job status and progress."""
        job = _import_jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job
