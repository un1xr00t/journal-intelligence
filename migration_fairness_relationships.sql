-- Migration: Add relationship labels to fairness_config
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_fairness_relationships.sql

ALTER TABLE fairness_config ADD COLUMN partner_relationship TEXT;
ALTER TABLE fairness_config ADD COLUMN member3_relationship TEXT;
