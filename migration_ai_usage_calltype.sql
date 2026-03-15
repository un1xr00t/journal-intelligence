-- migration_ai_usage_calltype.sql
-- Adds call_type column to ai_usage_log for per-feature spend breakdown.
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_ai_usage_calltype.sql

ALTER TABLE ai_usage_log ADD COLUMN call_type TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_usage_call_type ON ai_usage_log (call_type);
SELECT 'call_type column added' AS status;
