-- Bot table
CREATE TABLE IF NOT EXISTS bots (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  avatar_emoji       TEXT NOT NULL DEFAULT '🤖',
  description        TEXT NOT NULL DEFAULT '',
  skills_config      TEXT NOT NULL DEFAULT '[]',
  mcp_config         TEXT NOT NULL DEFAULT '{}',
  openclaw_ws_url    TEXT NOT NULL,
  openclaw_ws_token  TEXT,
  connection_status  TEXT NOT NULL DEFAULT 'disconnected'
                       CHECK (connection_status IN ('connected','disconnected','error','connecting')),
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Conversation table
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'single'
               CHECK (type IN ('single','group')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Conversation <-> Bot many-to-many
CREATE TABLE IF NOT EXISTS conversation_bots (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  bot_id          TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  is_primary      INTEGER NOT NULL DEFAULT 0,
  join_order      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (conversation_id, bot_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type      TEXT NOT NULL CHECK (sender_type IN ('user','bot')),
  bot_id           TEXT REFERENCES bots(id),
  content          TEXT NOT NULL,
  mentioned_bot_id TEXT REFERENCES bots(id),
  created_at       TEXT NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conv_bots_conversation ON conversation_bots(conversation_id);
CREATE INDEX IF NOT EXISTS idx_bots_active ON bots(is_active);
