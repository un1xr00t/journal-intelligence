-- migration_voice_settings.sql
-- Adds voice_tone and voice_openai_key to user_settings.
-- SQLite doesn't support IF NOT EXISTS on ALTER TABLE — errors are safe to ignore.
-- Run with: sqlite3 /opt/journal-dashboard/db/journal.db < migration_voice_settings.sql

ALTER TABLE user_settings ADD COLUMN voice_tone TEXT DEFAULT 'best_friend';
ALTER TABLE user_settings ADD COLUMN voice_openai_key TEXT;

SELECT 'voice columns added (or already exist — ignore errors above)' AS status;
SELECT COUNT(*) AS user_settings_rows FROM user_settings;
