-- Persistent chat messages per case session
-- session_id groups messages into discrete conversations
-- No AI calls — pure storage/retrieval

CREATE TABLE IF NOT EXISTS detective_chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id    INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system-summary')),
  content    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(case_id) REFERENCES detective_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_case_session
  ON detective_chat_messages(case_id, session_id, created_at);
