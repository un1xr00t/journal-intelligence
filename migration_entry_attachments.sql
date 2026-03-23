-- Migration: Add attachment support to detective_entries
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_entry_attachments.sql

ALTER TABLE detective_entries ADD COLUMN attachment_path TEXT;
ALTER TABLE detective_entries ADD COLUMN attachment_filename TEXT;
ALTER TABLE detective_entries ADD COLUMN attachment_mime TEXT;
ALTER TABLE detective_entries ADD COLUMN attachment_analysis TEXT;
ALTER TABLE detective_entries ADD COLUMN attachment_status TEXT DEFAULT 'none';
