-- migration_early_warning.sql
-- Early Warning System — signal_patterns + early_warnings tables
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_early_warning.sql

CREATE TABLE IF NOT EXISTS signal_patterns (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL,
  spike_date         TEXT NOT NULL,
  spike_severity     REAL NOT NULL,
  pre_avg_severity   REAL,
  pre_mood_trend     TEXT,        -- 'declining' | 'stable' | 'rising'
  pre_topics         TEXT,        -- JSON array of tags from pre-window
  pre_people         TEXT,        -- JSON array of person names from pre-window
  pre_keyword_flags  TEXT,        -- JSON array of matched stress keywords
  entry_count        INTEGER DEFAULT 0,
  created_at         TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS early_warnings (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL UNIQUE,
  warning_active        INTEGER DEFAULT 0,
  confidence            REAL DEFAULT 0.0,
  matched_pattern_count INTEGER DEFAULT 0,
  matched_signals       TEXT,     -- JSON: current 3-day window signals
  last_spike_date       TEXT,
  last_spike_severity   REAL,
  dismissed_at          TEXT,     -- ISO timestamp; warning suppressed for 24h
  computed_at           TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

PRAGMA integrity_check;
