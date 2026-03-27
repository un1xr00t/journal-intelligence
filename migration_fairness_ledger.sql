-- Migration: Fairness Ledger tables
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_fairness_ledger.sql

-- Per-user config: partner name, user's display name for this feature
CREATE TABLE IF NOT EXISTS fairness_config (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL UNIQUE,
    my_name         TEXT NOT NULL DEFAULT 'Me',
    partner_name    TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Task templates — seeded with defaults, user can add custom ones
CREATE TABLE IF NOT EXISTS fairness_tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,  -- childcare | chores | emotional_labor | finances | logistics
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
);

-- Every log entry — who did what and when
CREATE TABLE IF NOT EXISTS fairness_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    task_id     INTEGER NOT NULL REFERENCES fairness_tasks(id),
    performed_by TEXT NOT NULL,  -- 'me' | 'partner'
    logged_at   TEXT NOT NULL DEFAULT (datetime('now')),
    note        TEXT            -- optional context
);

-- Freeform contributions — bigger things that don't fit a task template
CREATE TABLE IF NOT EXISTS fairness_contributions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    performed_by    TEXT NOT NULL,  -- 'me' | 'partner'
    category        TEXT NOT NULL,  -- childcare | chores | emotional_labor | finances | logistics
    description     TEXT NOT NULL,  -- freeform text, no length limit
    contribution_date TEXT NOT NULL DEFAULT (date('now')),
    logged_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fairness_contributions_user ON fairness_contributions (user_id, contribution_date);

-- Living AI summary — regenerates as logs accumulate
CREATE TABLE IF NOT EXISTS fairness_summary (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL UNIQUE,
    summary_text    TEXT NOT NULL,
    score_json      TEXT NOT NULL,  -- JSON: {me: {total, by_category}, partner: {total, by_category}}
    log_count       INTEGER NOT NULL DEFAULT 0,
    generated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fairness_logs_user ON fairness_logs (user_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_fairness_tasks_user ON fairness_tasks (user_id);
