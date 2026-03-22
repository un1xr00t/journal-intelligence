-- migration_invites.sql
-- Invite token system: single-use, passphrase-protected, claim-locks to first IP.
-- Run: sqlite3 /opt/journal-dashboard/db/journal.db < migration_invites.sql

CREATE TABLE IF NOT EXISTS invite_tokens (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash           TEXT    NOT NULL UNIQUE,
    passphrase_hash      TEXT    NOT NULL,
    label                TEXT,
    created_by           INTEGER NOT NULL,
    created_at           TEXT    NOT NULL,
    expires_at           TEXT    NOT NULL,
    -- Claim state: set when first IP verifies passphrase
    claimed_at           TEXT,
    claimed_ip           TEXT,
    -- Revoke: admin manually revokes
    revoked              INTEGER NOT NULL DEFAULT 0,
    revoked_at           TEXT,
    -- Invalidated: a 2nd IP tried to use a claimed token — nuclear lockout
    invalidated          INTEGER NOT NULL DEFAULT 0,
    invalidated_at       TEXT,
    invalidated_reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_hash ON invite_tokens(token_hash);

-- Separate temp-access table for invite-granted IPs.
-- Checked by /internal/ip-check alongside share_temp_access.
CREATE TABLE IF NOT EXISTS invite_temp_access (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ip              TEXT    NOT NULL UNIQUE,
    invite_token_id INTEGER NOT NULL,
    expires_at      TEXT    NOT NULL,
    created_at      TEXT    NOT NULL,
    FOREIGN KEY (invite_token_id) REFERENCES invite_tokens(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ita_ip      ON invite_temp_access(ip);
CREATE INDEX IF NOT EXISTS idx_ita_expires ON invite_temp_access(expires_at);
