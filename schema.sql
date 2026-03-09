-- ============================================================
-- journal.db  —  Full DDL (v3 with Auth)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. RAW ENTRIES
-- Primary record for each ingested file.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date      DATE    NOT NULL,          -- YYYY-MM-DD
    raw_hash        TEXT    NOT NULL,          -- SHA-256 of file bytes
    file_path       TEXT    NOT NULL,          -- path under data/raw/
    normalized_text TEXT    NOT NULL,          -- whitespace-normalized content
    word_count      INTEGER,
    ingested_at     DATETIME DEFAULT (datetime('now')),
    is_current      INTEGER  DEFAULT 1,        -- 0 if superseded by a revision

    UNIQUE (entry_date, raw_hash)              -- de-dupe key
);

CREATE INDEX IF NOT EXISTS idx_entries_date    ON entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_entries_current ON entries (entry_date, is_current);

-- ------------------------------------------------------------
-- 2. REVISIONS
-- When a date gets a new file with a different hash, the old
-- entry is kept and a revision record links to both.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revisions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date      DATE    NOT NULL,
    previous_id     INTEGER NOT NULL REFERENCES entries(id),
    new_id          INTEGER NOT NULL REFERENCES entries(id),
    revised_at      DATETIME DEFAULT (datetime('now')),
    change_note     TEXT
);

-- ------------------------------------------------------------
-- 3. DERIVED SUMMARIES (LLM output — cached per entry)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS derived_summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id        INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    summary_text    TEXT,
    key_events      TEXT,   -- JSON array of strings
    contradiction_flags TEXT, -- JSON array of {statement, type}
    mood_label      TEXT,   -- calm / anxious / sad / angry / mixed
    mood_score      REAL,   -- 0.0 – 10.0
    severity        REAL,   -- 0.0 – 10.0
    tags            TEXT,   -- JSON array of strings
    entities        TEXT,   -- JSON array of {name, type}
    notable_quotes  TEXT,   -- JSON array of strings
    prompt_version  TEXT,   -- tracks which prompt template was used
    generated_at    DATETIME DEFAULT (datetime('now')),

    UNIQUE (entry_id)
);

CREATE INDEX IF NOT EXISTS idx_summaries_mood     ON derived_summaries (mood_label);
CREATE INDEX IF NOT EXISTS idx_summaries_severity ON derived_summaries (severity);

-- ------------------------------------------------------------
-- 4. MASTER SUMMARY VERSIONS
-- Living narrative document, versioned after each ingest.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    version         INTEGER NOT NULL,
    overall_arc     TEXT,
    current_state   TEXT,
    key_themes      TEXT,   -- JSON array
    key_people      TEXT,   -- JSON array of {name, role, recent_mentions}
    active_threads  TEXT,   -- JSON array of strings
    notable_patterns TEXT,  -- JSON array of strings
    last_entry_date DATE,   -- date of most recent entry incorporated
    prompt_version  TEXT,
    created_at      DATETIME DEFAULT (datetime('now')),

    UNIQUE (version)
);

CREATE INDEX IF NOT EXISTS idx_master_version ON master_summaries (version DESC);

-- ------------------------------------------------------------
-- 5. ROLLUPS  (weekly / monthly aggregates)
-- Rebuilt only for the impacted period when new entries arrive.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rollups (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    period_type     TEXT    NOT NULL CHECK (period_type IN ('week','month')),
    period_start    DATE    NOT NULL,  -- Monday for week, 1st for month
    period_end      DATE    NOT NULL,
    entry_count     INTEGER DEFAULT 0,
    avg_mood_score  REAL,
    avg_severity    REAL,
    dominant_tags   TEXT,   -- JSON array (top N by frequency)
    top_entities    TEXT,   -- JSON array
    summary_text    TEXT,   -- brief LLM-free narrative derived from stored summaries
    computed_at     DATETIME DEFAULT (datetime('now')),

    UNIQUE (period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_rollups_period ON rollups (period_type, period_start);

-- ------------------------------------------------------------
-- 6. PATTERNS / ALERTS
-- Rule-based and AI-assisted detections.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type      TEXT    NOT NULL,  -- spike|sequence|contradiction|instability|severity_streak
    priority_score  REAL    DEFAULT 0, -- higher = more urgent
    date_range_start DATE,
    date_range_end   DATE,
    supporting_dates TEXT,  -- JSON array of YYYY-MM-DD
    description     TEXT,
    ai_analysis     TEXT,   -- null until AI detector runs; then cached
    suggested_packets TEXT, -- JSON array of packet type strings
    acknowledged    INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT (datetime('now')),
    updated_at      DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_type      ON alerts (alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_priority  ON alerts (priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_ack       ON alerts (acknowledged);

-- ------------------------------------------------------------
-- 7. EVIDENCE REFERENCES
-- Manual or auto-tagged evidence items linked to entries.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id        INTEGER REFERENCES entries(id),
    alert_id        INTEGER REFERENCES alerts(id),
    label           TEXT    NOT NULL,  -- short title for the vault
    quote_text      TEXT,              -- verbatim excerpt
    evidence_type   TEXT,              -- statement|event|admission|contradiction|observation
    source_date     DATE,
    is_bookmarked   INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_entry ON evidence (entry_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type  ON evidence (evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_bm    ON evidence (is_bookmarked);

-- ------------------------------------------------------------
-- 8. EXPORTS
-- Record of every generated export packet.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    packet_type     TEXT    NOT NULL, -- weekly_digest|incident|pattern_report|therapy_summary|chronology
    date_range_start DATE,
    date_range_end   DATE,
    format          TEXT    NOT NULL, -- pdf|html|csv|json|md
    redacted        INTEGER DEFAULT 0,
    file_path       TEXT,             -- path under data/derived/exports/
    alert_ids       TEXT,             -- JSON array of alert IDs included
    entry_ids       TEXT,             -- JSON array of entry IDs included
    created_by      INTEGER REFERENCES users(id),
    created_at      DATETIME DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 9. INGEST LOG
-- Audit trail for every file seen by the ingest service.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingest_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    filename        TEXT    NOT NULL,
    raw_hash        TEXT    NOT NULL,
    action          TEXT    NOT NULL CHECK (action IN ('inserted','skipped','revised','error')),
    entry_id        INTEGER REFERENCES entries(id),
    message         TEXT,
    logged_at       DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ingest_action ON ingest_log (action);

-- ------------------------------------------------------------
-- 10. SEARCH INDEX (FTS5 virtual table)
-- Full-text search over raw + summary content.
-- ------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    entry_date,
    normalized_text,
    summary_text,
    tags,
    entities,
    content='',            -- contentless; rebuild via scripts/rebuild_fts.py
    tokenize='porter ascii'
);

-- ============================================================
-- AUTHENTICATION TABLES
-- ============================================================

-- ------------------------------------------------------------
-- 11. USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT    UNIQUE NOT NULL,
    username        TEXT    UNIQUE NOT NULL,
    password_hash   TEXT,              -- NULL for OAuth-only users
    role            TEXT    NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'viewer')),
    is_active       INTEGER DEFAULT 1,
    created_at      DATETIME DEFAULT (datetime('now')),
    last_login      DATETIME
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- ------------------------------------------------------------
-- 12. REFRESH TOKENS
-- Server-side storage for revocable refresh tokens.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT    UNIQUE NOT NULL,   -- SHA-256 hash of raw token
    device_hint     TEXT,                       -- e.g. "iPhone 15 Pro", "Chrome/macOS"
    ip_address      TEXT,
    issued_at       DATETIME DEFAULT (datetime('now')),
    expires_at      DATETIME NOT NULL,
    last_used_at    DATETIME,
    revoked         INTEGER DEFAULT 0,
    revoked_at      DATETIME
);

CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_hash    ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens (expires_at);

-- ------------------------------------------------------------
-- 13. AUTH AUDIT LOG
-- All authentication events for security monitoring.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_audit (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES users(id),
    event           TEXT    NOT NULL,  -- login|logout|refresh|failed|revoke|password_change
    ip_address      TEXT,
    user_agent      TEXT,
    details         TEXT,              -- JSON with additional context
    timestamp       DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_user      ON auth_audit (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_event     ON auth_audit (event);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON auth_audit (timestamp DESC);

-- ------------------------------------------------------------
-- 14. RATE LIMIT TRACKING
-- For auth endpoint rate limiting.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address      TEXT    NOT NULL,
    endpoint        TEXT    NOT NULL,
    attempt_count   INTEGER DEFAULT 1,
    window_start    DATETIME DEFAULT (datetime('now')),
    blocked_until   DATETIME,

    UNIQUE (ip_address, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_rate_ip ON rate_limits (ip_address);
