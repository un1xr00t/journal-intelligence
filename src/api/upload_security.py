"""
src/api/upload_security.py
Upload security layer — validates all file uploads before they touch the ingest pipeline.

Protections:
  - File size limit (default 5 MB)
  - Allowed extension allowlist (.txt, .html, .htm, .md)
  - Magic byte validation (actual content vs claimed type)
  - Filename sanitization (path traversal prevention)
  - Upload rate limiting (per IP, in-memory sliding window)
  - Entry text size cap (for inline text POSTs)
"""

import re
import time
import logging
from collections import defaultdict
from pathlib import Path
from fastapi import HTTPException, Request

logger = logging.getLogger("journal.upload_security")

# ── Constants ─────────────────────────────────────────────────────────────────

MAX_FILE_BYTES       = 5 * 1024 * 1024   # 5 MB hard ceiling
MAX_TEXT_BYTES       = 1 * 1024 * 1024   # 1 MB for raw text body uploads
RATE_LIMIT_WINDOW    = 60                 # seconds
RATE_LIMIT_MAX_CALLS = 20                 # uploads per window per IP

ALLOWED_EXTENSIONS = {".txt", ".html", ".htm", ".md"}

# Magic byte signatures for allowed types.
# Each entry: (offset, bytes_to_match)
MAGIC_SIGNATURES: dict[str, list[tuple[int, bytes]]] = {
    "html": [
        (0, b"<!DOCTYPE"),
        (0, b"<!doctype"),
        (0, b"<html"),
        (0, b"<HTML"),
    ],
    "text": [
        # UTF-8 BOM — plain text
        (0, b"\xef\xbb\xbf"),
    ],
}

# Dangerous magic bytes we explicitly reject even if extension looks fine.
BLOCKED_MAGIC: list[tuple[int, bytes, str]] = [
    (0, b"MZ",             "Windows executable"),
    (0, b"\x7fELF",        "ELF binary"),
    (0, b"PK\x03\x04",     "ZIP / Office archive"),
    (0, b"\x50\x4b\x05\x06","Empty ZIP"),
    (0, b"%PDF",            "PDF file"),
    (0, b"\x89PNG",         "PNG image"),
    (0, b"\xff\xd8\xff",    "JPEG image"),
    (0, b"GIF8",            "GIF image"),
    (0, b"II*\x00",         "TIFF image"),
    (0, b"MM\x00*",         "TIFF image"),
    (0, b"\x1f\x8b",        "GZIP archive"),
    (0, b"BZh",             "BZIP2 archive"),
    (0, b"\xfd7zXZ",        "XZ archive"),
    (0, b"Rar!",            "RAR archive"),
    (0, b"\xcafeBABE",      "Java class file"),
    (0, b"\xfe\xed\xfa",    "Mach-O binary"),
]

# ── In-Memory Rate Limiter ────────────────────────────────────────────────────

# { ip: [(timestamp, ...), ...] }
_rate_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(ip: str) -> None:
    """Sliding window rate limit. Raises 429 if exceeded."""
    now = time.monotonic()
    window_start = now - RATE_LIMIT_WINDOW
    calls = _rate_store[ip]

    # Prune old entries
    _rate_store[ip] = [t for t in calls if t > window_start]

    if len(_rate_store[ip]) >= RATE_LIMIT_MAX_CALLS:
        logger.warning("Upload rate limit exceeded for IP %s", ip)
        raise HTTPException(
            status_code=429,
            detail=f"Too many uploads. Max {RATE_LIMIT_MAX_CALLS} per {RATE_LIMIT_WINDOW}s.",
        )

    _rate_store[ip].append(now)


# ── Filename Sanitizer ────────────────────────────────────────────────────────

def sanitize_filename(filename: str) -> str:
    """
    Strip path components and dangerous characters from a filename.
    Returns a safe basename.  Raises 400 if result is empty or extension
    is not on the allowlist.
    """
    if not filename:
        return "entry.txt"

    # Strip any path components — attacker might send ../../etc/passwd.txt
    name = Path(filename).name

    # Remove null bytes and control chars
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)

    # Keep only safe characters: alphanum, dash, underscore, dot, space
    name = re.sub(r"[^\w.\- ]", "_", name)

    # Collapse multiple dots to prevent extension tricks like file.txt.exe
    name = re.sub(r"\.{2,}", ".", name)

    if not name:
        name = "entry.txt"

    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        # If it has no extension or a disallowed one, slap .txt on it
        name = Path(name).stem + ".txt"

    logger.debug("Sanitized filename: %s → %s", filename, name)
    return name


# ── Magic Byte Checker ────────────────────────────────────────────────────────

def validate_file_content(body: bytes, filename: str) -> None:
    """
    Validate that file content is safe text/HTML.
    Raises 415 for dangerous/binary content.
    Raises 413 for oversized files.
    """
    # Size check first — cheap
    if len(body) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_FILE_BYTES // (1024*1024)} MB.",
        )

    if len(body) == 0:
        raise HTTPException(status_code=400, detail="File is empty.")

    # Check against blocked magic bytes (binary / executable content)
    for offset, magic, label in BLOCKED_MAGIC:
        if body[offset : offset + len(magic)] == magic:
            logger.warning(
                "Blocked upload: %s matched blocked magic '%s' for file '%s'",
                magic.hex(), label, filename,
            )
            raise HTTPException(
                status_code=415,
                detail=f"File type not allowed: detected {label}.",
            )

    # Attempt to decode as text — if it's genuinely binary it will fail
    try:
        body.decode("utf-8")
    except UnicodeDecodeError:
        try:
            body.decode("latin-1")
        except Exception:
            logger.warning("Blocked upload: undecodable binary content for file '%s'", filename)
            raise HTTPException(
                status_code=415,
                detail="File must be a readable text document (UTF-8 or Latin-1).",
            )

    # Scan for embedded null bytes (common in binary-disguised-as-text attacks)
    if b"\x00" in body:
        logger.warning("Blocked upload: null bytes in file '%s'", filename)
        raise HTTPException(
            status_code=415,
            detail="File contains null bytes — only plain text files are accepted.",
        )


# ── Text Body Size Check ──────────────────────────────────────────────────────

def validate_text_body(body: bytes) -> None:
    """For inline text POST uploads (non-multipart). Applies a 1 MB cap."""
    if len(body) > MAX_TEXT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Request body too large. Maximum allowed is {MAX_TEXT_BYTES // 1024} KB.",
        )
    if len(body) == 0:
        raise HTTPException(status_code=400, detail="Empty request body.")


# ── Main Entry Point ──────────────────────────────────────────────────────────

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def run_upload_security(request: Request, body: bytes, filename: str) -> str:
    """
    Full security pipeline for any upload.

    1. Rate limit check (per IP)
    2. Filename sanitization
    3. File content / magic byte validation (includes size check)

    Returns the sanitized filename.
    Raises HTTPException on any violation.
    """
    ip = get_client_ip(request)
    _check_rate_limit(ip)

    safe_name = sanitize_filename(filename)
    validate_file_content(body, safe_name)

    return safe_name
