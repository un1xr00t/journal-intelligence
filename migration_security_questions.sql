-- migration_security_questions.sql
-- Adds security_questions table for offline password recovery.
-- Run once against the live DB.

CREATE TABLE IF NOT EXISTS security_questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_1      TEXT    NOT NULL,
    answer_1_hash   TEXT    NOT NULL,
    question_2      TEXT    NOT NULL,
    answer_2_hash   TEXT    NOT NULL,
    question_3      TEXT    NOT NULL,
    answer_3_hash   TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_security_questions_user
    ON security_questions(user_id);

PRAGMA integrity_check;
