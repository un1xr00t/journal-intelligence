-- migration_share_passphrase.sql
-- Run on server:
--   sqlite3 /opt/journal-dashboard/db/journal.db < migration_share_passphrase.sql

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Add passphrase_hash to share tokens (safe if column already exists -- run manually, not idempotent)
ALTER TABLE exit_plan_share_tokens ADD COLUMN passphrase_hash TEXT;

-- Temp IP access table (granted on correct passphrase entry)
CREATE TABLE IF NOT EXISTS share_temp_access (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ip         TEXT    NOT NULL,
    token_id   INTEGER NOT NULL,
    expires_at TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    UNIQUE(ip, token_id),
    FOREIGN KEY (token_id) REFERENCES exit_plan_share_tokens(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sta_ip      ON share_temp_access(ip);
CREATE INDEX IF NOT EXISTS idx_sta_expires ON share_temp_access(expires_at);

-- App config table (stores share_secret, etc.)
CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

PRAGMA integrity_check;
