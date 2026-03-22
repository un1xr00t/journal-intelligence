-- Migration: entry_attachments
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_entry_attachments.sql

CREATE TABLE IF NOT EXISTS entry_attachments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id     INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    filename     TEXT NOT NULL,
    storage_name TEXT NOT NULL,   -- UUID-prefixed filename on disk (never guessable)
    file_path    TEXT NOT NULL,   -- full path on server
    file_size    INTEGER,
    media_type   TEXT NOT NULL,
    uploaded_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (entry_id) REFERENCES entries(id),
    FOREIGN KEY (user_id)  REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_entry_attachments_entry
    ON entry_attachments (entry_id);

CREATE INDEX IF NOT EXISTS idx_entry_attachments_user
    ON entry_attachments (user_id);

SELECT 'entry_attachments table created OK';
