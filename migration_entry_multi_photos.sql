-- Migration: Multi-photo attachments per detective investigation log entry
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_entry_multi_photos.sql

CREATE TABLE IF NOT EXISTS detective_entry_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES detective_entries(id) ON DELETE CASCADE,
    case_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    original_filename TEXT,
    stored_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT DEFAULT 'image/jpeg',
    file_size INTEGER,
    ai_analysis TEXT,
    analysis_status TEXT DEFAULT 'analyzing',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entry_photos_entry ON detective_entry_photos(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_photos_case  ON detective_entry_photos(case_id);
CREATE INDEX IF NOT EXISTS idx_entry_photos_user  ON detective_entry_photos(user_id);

-- Combined synthesis column on entries (stores result of synthesize-all-photos call)
ALTER TABLE detective_entries ADD COLUMN multi_photo_analysis TEXT;
