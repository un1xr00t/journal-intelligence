-- Migration: Add third member to fairness_config
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_fairness_member3.sql

ALTER TABLE fairness_config ADD COLUMN member3_name TEXT;
