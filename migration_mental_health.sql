-- mental_health_routes.py handles auto-migration on startup.
-- Run this manually if needed to pre-create the tables.

CREATE TABLE IF NOT EXISTS mental_health_stats_cache (
    user_id       INTEGER PRIMARY KEY,
    stats_json    TEXT    NOT NULL,
    last_entry_id INTEGER NOT NULL DEFAULT 0,
    computed_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS mental_health_narrative (
    user_id       INTEGER NOT NULL,
    week_key      TEXT    NOT NULL,  -- e.g. "2026-W13"
    narrative     TEXT    NOT NULL,
    quotes_json   TEXT    NOT NULL DEFAULT '[]',
    generated_at  TEXT    NOT NULL,
    input_tokens  INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, week_key)
);
