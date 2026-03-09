"""
src/ingest/service.py
Ingest service — handles file upload, deduplication, storage.
"""

import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Optional
import sqlite3
import yaml

# ── Load Config ───────────────────────────────────────────────

from src.config import CONFIG_PATH, load_config

def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)

config = load_config()
DB_PATH = Path(config["database"]["path"])
STORAGE_BASE = Path(config["storage"]["base_path"])
RAW_PATH = STORAGE_BASE / config["storage"]["raw_entries"]


# ── Database Connection ───────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ── Hash Computation ──────────────────────────────────────────

def compute_hash(content: bytes) -> str:
    """Compute SHA-256 hash of file content."""
    return hashlib.sha256(content).hexdigest()


# ── HTML Stripping ────────────────────────────────────────────

def strip_html(content: str) -> str:
    """Strip HTML tags and decode entities. Falls back to regex if html.parser fails."""
    try:
        from html.parser import HTMLParser

        class _Stripper(HTMLParser):
            def __init__(self):
                super().__init__()
                self.parts = []
                self._skip_tags = {"script", "style", "head"}
                self._skip = False

            def handle_starttag(self, tag, attrs):
                if tag.lower() in self._skip_tags:
                    self._skip = True
                # Add newline after block elements for readability
                if tag.lower() in {"p", "br", "div", "li", "h1", "h2", "h3", "h4", "tr"}:
                    self.parts.append("\n")

            def handle_endtag(self, tag):
                if tag.lower() in self._skip_tags:
                    self._skip = False

            def handle_data(self, data):
                if not self._skip:
                    self.parts.append(data)

        stripper = _Stripper()
        stripper.feed(content)
        text = "".join(stripper.parts)
    except Exception:
        # Fallback: plain regex strip
        text = re.sub(r'<[^>]+>', ' ', content)

    # Decode common HTML entities
    import html as _html
    text = _html.unescape(text)
    return text


def is_html(content: str) -> bool:
    """Detect HTML content."""
    stripped = content.lstrip()
    return stripped.startswith("<!DOCTYPE") or stripped.startswith("<html") or "<body" in stripped[:500]


# ── Date Extraction ───────────────────────────────────────────

def extract_date_from_filename(filename: str) -> Optional[str]:
    """
    Extract date from filename.
    Supports formats:
    - 2026-02-24.txt
    - 2026_02_24.txt
    - 20260224.txt
    - Journal_2026-02-24.txt
    """
    patterns = [
        r'(\d{4})-(\d{2})-(\d{2})',  # 2026-02-24
        r'(\d{4})_(\d{2})_(\d{2})',  # 2026_02_24
        r'(\d{4})(\d{2})(\d{2})',    # 20260224
    ]
    
    for pattern in patterns:
        match = re.search(pattern, filename)
        if match:
            year, month, day = match.groups()
            try:
                date = datetime(int(year), int(month), int(day))
                return date.strftime('%Y-%m-%d')
            except ValueError:
                continue
    
    return None


def extract_date_from_content(content: str) -> Optional[str]:
    """
    Extract date from content. Searches full text (not just first line)
    so HTML exports and varied formats all work.
    Supports:
    - February 24, 2026 / Feb 24, 2026
    - 2/24/2026 or 2-24-2026
    - 2026-02-24
    """
    months = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12,
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
        'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    }

    # Try ISO format anywhere in content
    iso_match = re.search(r'(\d{4})-(\d{2})-(\d{2})', content)
    if iso_match:
        try:
            y, m, d = iso_match.groups()
            datetime(int(y), int(m), int(d))
            return f"{y}-{m}-{d}"
        except ValueError:
            pass

    # Try written format anywhere: "February 25, 2026" or "Feb 25 2026"
    written_match = re.search(
        r'(january|february|march|april|may|june|july|august|september|october|november|december'
        r'|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)'
        r'\s+(\d{1,2}),?\s+(\d{4})',
        content.lower()
    )
    if written_match:
        month_name, day, year = written_match.groups()
        try:
            month = months[month_name]
            datetime(int(year), month, int(day))
            return f"{year}-{month:02d}-{int(day):02d}"
        except (ValueError, KeyError):
            pass

    # Try US format: 2/25/2026
    us_match = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', content)
    if us_match:
        try:
            month, day, year = us_match.groups()
            datetime(int(year), int(month), int(day))
            return f"{year}-{int(month):02d}-{int(day):02d}"
        except ValueError:
            pass

    return None


# ── Text Normalization ────────────────────────────────────────

def normalize_text(content: str) -> str:
    """
    Normalize whitespace and clean up text.
    - Normalize line endings
    - Strip excessive blank lines
    - Trim whitespace
    """
    # Normalize line endings
    text = content.replace('\r\n', '\n').replace('\r', '\n')
    
    # Remove excessive blank lines (more than 2 in a row)
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Strip leading/trailing whitespace
    text = text.strip()
    
    return text


def count_words(text: str) -> int:
    """Count words in text."""
    return len(text.split())


# ── Deduplication Check ───────────────────────────────────────

def check_duplicate(entry_date: str, raw_hash: str, user_id: int) -> dict:
    """
    Check if entry already exists for this user.
    Returns:
        {"status": "new"} - no existing entry
        {"status": "duplicate", "entry_id": id} - exact duplicate (same date + hash + user)
    Multiple entries per day with different content are allowed (no revision logic).
    """
    conn = get_db()
    cursor = conn.cursor()
    
    # Check for exact duplicate (same date + same hash + same user)
    cursor.execute("""
        SELECT id FROM entries 
        WHERE entry_date = ? AND raw_hash = ? AND user_id = ?
    """, (entry_date, raw_hash, user_id))
    
    row = cursor.fetchone()
    conn.close()

    if row:
        return {"status": "duplicate", "entry_id": row["id"]}
    
    return {"status": "new"}


# ── File Storage ──────────────────────────────────────────────

def store_raw_file(entry_date: str, content: bytes, filename: str) -> str:
    """
    Store raw file to disk.
    Returns relative path from storage base.
    """
    # Create year/month directory structure
    date_obj = datetime.strptime(entry_date, '%Y-%m-%d')
    year_month = date_obj.strftime('%Y/%m')
    
    dir_path = RAW_PATH / year_month
    dir_path.mkdir(parents=True, exist_ok=True)
    
    # Use date as filename, preserve extension
    ext = Path(filename).suffix or '.txt'
    file_path = dir_path / f"{entry_date}{ext}"
    
    # Handle collision — multiple entries per day get a counter suffix
    if file_path.exists():
        counter = 1
        while file_path.exists():
            file_path = dir_path / f"{entry_date}_{counter}{ext}"
            counter += 1
    
    file_path.write_bytes(content)
    
    # Return relative path
    return str(file_path.relative_to(STORAGE_BASE))


# ── Database Operations ───────────────────────────────────────

def insert_entry(
    entry_date: str,
    raw_hash: str,
    file_path: str,
    normalized_text: str,
    word_count: int,
    user_id: int,
) -> int:
    """Insert new entry into database."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO entries (entry_date, raw_hash, file_path, normalized_text, word_count, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (entry_date, raw_hash, file_path, normalized_text, word_count, user_id))
    
    conn.commit()
    entry_id = cursor.lastrowid
    conn.close()
    
    return entry_id


def create_revision(entry_date: str, previous_id: int, new_id: int) -> None:
    """Create revision record and mark old entry as not current."""
    conn = get_db()
    cursor = conn.cursor()
    
    # Mark previous entry as not current
    cursor.execute("""
        UPDATE entries SET is_current = 0 WHERE id = ?
    """, (previous_id,))
    
    # Create revision record
    cursor.execute("""
        INSERT INTO revisions (entry_date, previous_id, new_id)
        VALUES (?, ?, ?)
    """, (entry_date, previous_id, new_id))
    
    conn.commit()
    conn.close()


def log_ingest(filename: str, raw_hash: str, action: str, entry_id: int = None, message: str = None) -> None:
    """Log ingest action. Fails silently — never let logging kill an upload."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO ingest_log (filename, raw_hash, action, entry_id, message)
            VALUES (?, ?, ?, ?, ?)
        """, (filename, raw_hash, action, entry_id, message))
        
        conn.commit()
        conn.close()
    except Exception:
        pass  # Logging failure must never propagate


# ── Main Ingest Function ──────────────────────────────────────

def ingest_file(filename: str, content: bytes, user_id: int) -> dict:
    """
    Main ingest function.
    
    Args:
        filename: Original filename
        content: File content as bytes
        user_id: ID of the user this entry belongs to

    Returns:
        {
            "status": "inserted" | "skipped" | "error",
            "entry_id": int (if inserted/skipped),
            "entry_date": str (always present on success),
            "message": str
        }
    """
    raw_hash = None
    try:
        # Decode content
        try:
            text_content = content.decode('utf-8')
        except UnicodeDecodeError:
            text_content = content.decode('latin-1')

        # Strip HTML if the file is an HTML export (Day One, etc.)
        if is_html(text_content):
            text_content = strip_html(text_content)
        
        # Compute hash
        raw_hash = compute_hash(content)
        
        # Extract date
        entry_date = extract_date_from_filename(filename)
        if not entry_date:
            entry_date = extract_date_from_content(text_content)
        
        if not entry_date:
            log_ingest(filename, raw_hash, "error", message="Could not extract date")
            return {
                "status": "error",
                "message": "Could not extract date from filename or content"
            }
        
        # Check for duplicates (scoped per user)
        dup_check = check_duplicate(entry_date, raw_hash, user_id)
        
        if dup_check["status"] == "duplicate":
            log_ingest(filename, raw_hash, "skipped", entry_id=dup_check["entry_id"])
            return {
                "status": "skipped",
                "entry_id": dup_check["entry_id"],
                "entry_date": entry_date,
                "message": f"Duplicate entry for {entry_date}"
            }
        
        # Normalize text
        normalized = normalize_text(text_content)
        word_count = count_words(normalized)
        
        # Store file
        file_path = store_raw_file(entry_date, content, filename)
        
        # Insert entry
        entry_id = insert_entry(entry_date, raw_hash, file_path, normalized, word_count, user_id)
        
        # New entry — multiple entries per day are allowed, no revision logic
        log_ingest(filename, raw_hash, "inserted", entry_id=entry_id)
        return {
            "status": "inserted",
            "entry_id": entry_id,
            "entry_date": entry_date,
            "word_count": word_count,
            "message": f"New entry for {entry_date}"
        }
    
    except Exception as e:
        log_ingest(filename, raw_hash or "unknown", "error", message=str(e))
        return {
            "status": "error",
            "message": str(e)
        }


def get_entry_by_id(entry_id: int) -> Optional[dict]:
    """Fetch entry by ID."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM entries WHERE id = ?
    """, (entry_id,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None
