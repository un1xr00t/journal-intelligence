-- migration_2fa.sql
-- Run against: /opt/journal-dashboard/db/journal.db

CREATE TABLE IF NOT EXISTS totp_secrets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL UNIQUE,
    secret      TEXT    NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 0,
    enabled_at  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS totp_backup_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    code_hash  TEXT    NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    used_at    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_totp_secrets_user_id
    ON totp_secrets(user_id);

CREATE INDEX IF NOT EXISTS idx_totp_backup_codes_user_id
    ON totp_backup_codes(user_id);
