-- migration_decision.sql
-- Saved decision options from the Decision Assistant feature

CREATE TABLE IF NOT EXISTS saved_decisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    goal        TEXT NOT NULL,
    option_type TEXT NOT NULL,   -- lowest-risk | balanced | decisive
    title       TEXT NOT NULL,
    full_json   TEXT NOT NULL,   -- full option object as JSON string
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_decisions_user ON saved_decisions(user_id);
