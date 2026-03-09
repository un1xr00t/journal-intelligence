-- ============================================================
-- cleanup_contradictions.sql
-- Run this ONCE on the server to clear bad contradiction data
-- before re-running the pattern scan with the fixed detectors.
--
-- Usage:
--   sqlite3 /opt/journal-dashboard/db/journal.db < cleanup_contradictions.sql
-- ============================================================

-- Step 1: Delete evidence rows tied to contradiction alerts
DELETE FROM evidence
WHERE alert_id IN (
    SELECT id FROM alerts WHERE alert_type = 'contradiction'
);

-- Step 2: Delete all contradiction alerts
DELETE FROM alerts WHERE alert_type = 'contradiction';

-- Step 3: Remove duplicate evidence rows (same entry + same quote)
-- Keep only the earliest occurrence of each (entry_id, quote_text) pair.
DELETE FROM evidence
WHERE id NOT IN (
    SELECT MIN(id)
    FROM evidence
    GROUP BY entry_id, COALESCE(quote_text, CAST(id AS TEXT))
);

-- Verify
SELECT
    'alerts remaining (non-contradiction)' AS check_label,
    COUNT(*) AS count
FROM alerts
WHERE acknowledged = 0
UNION ALL
SELECT
    'contradiction alerts remaining' AS check_label,
    COUNT(*) AS count
FROM alerts
WHERE alert_type = 'contradiction'
UNION ALL
SELECT
    'evidence rows remaining' AS check_label,
    COUNT(*) AS count
FROM evidence;
