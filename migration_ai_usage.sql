-- migration_ai_usage.sql
-- Track per-user AI token consumption for admin spend visibility.
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_ai_usage.sql

CREATE TABLE IF NOT EXISTS ai_usage_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER,
    provider      TEXT NOT NULL,
    model         TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    called_at     TEXT NOT NULL DEFAULT (datetime('now','utc')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage_log (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_called_at ON ai_usage_log (called_at);

SELECT 'ai_usage_log table ready' AS status;
SELECT COUNT(*) AS existing_rows FROM ai_usage_log;
