"""
src/ingest
Ingest service for Journal Dashboard.
"""

from src.ingest.service import (
    ingest_file,
    compute_hash,
    extract_date_from_filename,
    extract_date_from_content,
    normalize_text,
    get_entry_by_id,
)

__all__ = [
    "ingest_file",
    "compute_hash",
    "extract_date_from_filename",
    "extract_date_from_content",
    "normalize_text",
    "get_entry_by_id",
]
