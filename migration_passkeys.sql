-- migration_passkeys.sql
-- WebAuthn passkey credentials

CREATE TABLE IF NOT EXISTS passkey_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key BLOB NOT NULL,
    sign_count INTEGER NOT NULL DEFAULT 0,
    aaguid TEXT,
    transports TEXT,
    device_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_passkey_user   ON passkey_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_passkey_cred   ON passkey_credentials(credential_id);
