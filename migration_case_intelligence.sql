-- Case Intelligence: persistent compressed AI summary per case
-- Survives page refreshes, session changes, conversation resets
-- Auto-updated on every wire drop
-- Used by Case Partner chat for token-efficient context injection

CREATE TABLE IF NOT EXISTS case_intelligence (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id      INTEGER NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL,
  summary      TEXT,
  entry_count  INTEGER DEFAULT 0,
  wire_count   INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(case_id) REFERENCES detective_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
