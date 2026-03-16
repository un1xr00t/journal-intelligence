-- init_db.sql
-- Journal Intelligence — initial database setup.
-- Run once on a fresh install. Safe to re-run (CREATE TABLE IF NOT EXISTS throughout).
--
-- Tables that auto-create on first use (NOT here):
--   exit_plan_*, reflection_cache, resource_profiles,
--   journal_prompt_cache, user_profiles, ai_usage_log
--
-- Usage:
--   sqlite3 /path/to/journal.db < init_db.sql

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ── Core entries ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entries (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date       TEXT    NOT NULL,
    raw_hash         TEXT    NOT NULL,
    file_path        TEXT,
    normalized_text  TEXT,
    word_count       INTEGER DEFAULT 0,
    ingested_at      TEXT    NOT NULL DEFAULT (datetime('now','utc')),
    is_current       INTEGER NOT NULL DEFAULT 1,
    user_id          INTEGER NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries (user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_entries_hash      ON entries (raw_hash);

-- ── AI-derived data ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS derived_summaries (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id               INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    mood_label             TEXT,
    mood_score             REAL,
    severity               REAL,
    summary_text           TEXT,
    tags                   TEXT,    -- JSON array
    key_events             TEXT,    -- JSON array
    entities               TEXT,    -- JSON array [{name, type}]
    contradiction_flags    TEXT DEFAULT '[]',  -- JSON array [{type, statement}]
    notable_quotes         TEXT DEFAULT '[]',  -- JSON array
    therapist_insight      TEXT,
    therapist_insight_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_derived_entry ON derived_summaries (entry_id);

-- ── Users & auth ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    email         TEXT,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'viewer',  -- 'owner' or 'viewer'
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now','utc')),
    last_login    TEXT,
    api_key_hash  TEXT,
    api_key_prefix TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT    NOT NULL UNIQUE,
    device_hint  TEXT,
    ip_address   TEXT,
    issued_at    TEXT    NOT NULL DEFAULT (datetime('now','utc')),
    expires_at   TEXT    NOT NULL,
    last_used_at TEXT,
    revoked      INTEGER NOT NULL DEFAULT 0,
    revoked_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS auth_audit (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event      TEXT    NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    details    TEXT,
    timestamp  TEXT    NOT NULL DEFAULT (datetime('now','utc'))
);

CREATE TABLE IF NOT EXISTS rate_limits (
    ip_address     TEXT    NOT NULL,
    endpoint       TEXT    NOT NULL,
    attempt_count  INTEGER NOT NULL DEFAULT 0,
    window_start   TEXT,
    blocked_until  TEXT,
    PRIMARY KEY (ip_address, endpoint)
);

-- ── Per-user AI settings ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_settings (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ai_provider TEXT    DEFAULT 'anthropic',
    ai_api_key  TEXT,
    ai_base_url TEXT,
    ai_model    TEXT,
    updated_at  TEXT    DEFAULT (datetime('now','utc'))
);

-- ── Pattern detection & evidence ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_type      TEXT    NOT NULL,
    priority        REAL    DEFAULT 0,
    title           TEXT,
    description     TEXT,
    evidence        TEXT,   -- JSON
    date_range      TEXT,
    entry_ids       TEXT,   -- JSON array
    status          TEXT    DEFAULT 'active',
    ai_analysis     TEXT,
    ai_analyzed_at  TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now','utc')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now','utc'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts (user_id, status);

CREATE TABLE IF NOT EXISTS evidence (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_id       INTEGER REFERENCES entries(id) ON DELETE CASCADE,
    alert_id       INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
    evidence_type  TEXT    NOT NULL,
    label          TEXT,
    quote_text     TEXT,
    context_text   TEXT,
    entry_date     TEXT,
    is_bookmarked  INTEGER DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now','utc')),
    UNIQUE (entry_id, alert_id, label)
);

CREATE INDEX IF NOT EXISTS idx_evidence_user ON evidence (user_id);

-- ── Master summaries & rollups ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS master_summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version         INTEGER DEFAULT 1,
    summary_text    TEXT,
    current_state   TEXT,
    overall_arc     TEXT,
    key_themes      TEXT,   -- JSON array
    active_threads  TEXT,   -- JSON array
    notable_patterns TEXT,  -- JSON array
    key_people      TEXT,   -- JSON array
    entry_count     INTEGER DEFAULT 0,
    date_range      TEXT,
    generated_at    TEXT    NOT NULL DEFAULT (datetime('now','utc')),
    is_current      INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_master_summaries_user ON master_summaries (user_id, is_current);

CREATE TABLE IF NOT EXISTS rollups (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_type   TEXT    NOT NULL,  -- 'weekly' or 'monthly'
    period_start  TEXT    NOT NULL,
    period_end    TEXT    NOT NULL,
    entry_count   INTEGER DEFAULT 0,
    avg_mood      REAL,
    avg_severity  REAL,
    summary       TEXT,
    key_events    TEXT,   -- JSON array
    created_at    TEXT    NOT NULL DEFAULT (datetime('now','utc'))
);

-- ── User memory profile ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_memory (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    preferred_name   TEXT,
    pronouns         TEXT,
    situation_type   TEXT,
    situation_story  TEXT,
    people           TEXT,   -- JSON array [{name, role, note}]
    topics           TEXT,   -- JSON array
    goals            TEXT,   -- JSON array
    ai_summary       TEXT,
    preferred_tone   TEXT    DEFAULT 'therapist',
    created_at       TEXT    NOT NULL DEFAULT (datetime('now','utc')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now','utc'))
);

-- ── Resource profiles ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resource_profiles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    profile_json TEXT,
    signal_ver   TEXT,
    generated_at TEXT    NOT NULL DEFAULT (datetime('now','utc'))
);

SELECT 'Journal Intelligence database initialized.' AS status;
SELECT 'Tables created: ' || COUNT(*) AS table_count FROM sqlite_master WHERE type='table';
