-- Detective Mode: full schema
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_detective.sql

CREATE TABLE IF NOT EXISTS detective_access (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL UNIQUE,
    granted_by  INTEGER NOT NULL,
    granted_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS detective_cases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    title       TEXT    NOT NULL,
    description TEXT,
    status      TEXT    NOT NULL DEFAULT 'active',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_detective_cases_user ON detective_cases(user_id);

CREATE TABLE IF NOT EXISTS detective_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id      INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    content      TEXT    NOT NULL,
    entry_type   TEXT    NOT NULL DEFAULT 'note',
    severity     TEXT    NOT NULL DEFAULT 'medium',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (case_id)  REFERENCES detective_cases(id)  ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)            ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_detective_entries_case ON detective_entries(case_id);

CREATE TABLE IF NOT EXISTS detective_uploads (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id           INTEGER NOT NULL,
    user_id           INTEGER NOT NULL,
    original_filename TEXT    NOT NULL,
    stored_filename   TEXT    NOT NULL,
    file_path         TEXT    NOT NULL,
    file_size         INTEGER,
    mime_type         TEXT,
    ai_analysis       TEXT,
    analysis_status   TEXT    NOT NULL DEFAULT 'pending',
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (case_id) REFERENCES detective_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)           ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_detective_uploads_case ON detective_uploads(case_id);

CREATE TABLE IF NOT EXISTS detective_cache (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL UNIQUE,
    journal_summary TEXT,
    cached_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS detective_wire_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id    INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    briefing   TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (case_id) REFERENCES detective_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)           ON DELETE CASCADE
);
