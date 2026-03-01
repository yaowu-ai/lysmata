import { Database } from "bun:sqlite";
import { DB_PATH } from "../config";

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH, { create: true });
    _db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    ensureSchema(_db);
  }
  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}

/**
 * Dev-mode fallback: apply the same DDL that Tauri's tauri-plugin-sql
 * would have run. Safe to call multiple times (CREATE TABLE IF NOT EXISTS).
 */
function ensureSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bots (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      avatar_emoji       TEXT NOT NULL DEFAULT '🤖',
      description        TEXT NOT NULL DEFAULT '',
      skills_config      TEXT NOT NULL DEFAULT '[]',
      mcp_config         TEXT NOT NULL DEFAULT '{}',
      llm_config         TEXT NOT NULL DEFAULT '{}',
      openclaw_ws_url    TEXT NOT NULL,
      openclaw_ws_token  TEXT,
      connection_status  TEXT NOT NULL DEFAULT 'disconnected',
      is_active          INTEGER NOT NULL DEFAULT 1,
      created_at         TEXT NOT NULL,
      updated_at         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'single',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_bots (
      conversation_id TEXT NOT NULL,
      bot_id          TEXT NOT NULL,
      is_primary      INTEGER NOT NULL DEFAULT 0,
      join_order      INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (conversation_id, bot_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id               TEXT PRIMARY KEY,
      conversation_id  TEXT NOT NULL,
      sender_type      TEXT NOT NULL,
      bot_id           TEXT,
      content          TEXT NOT NULL,
      mentioned_bot_id TEXT,
      message_type     TEXT DEFAULT 'text',
      metadata         TEXT,
      created_at       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conv_bots_conversation ON conversation_bots(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_bots_active ON bots(is_active);
  `);

  // Cleanup: remove orphaned conversation_bots rows whose bot no longer exists
  db.exec(`DELETE FROM conversation_bots WHERE bot_id NOT IN (SELECT id FROM bots);`);

  // Migration 2: add openclaw_agent_id and llm_config column (idempotent via PRAGMA table_info)
  const cols = db
    .query<{ name: string }, []>("PRAGMA table_info(bots)")
    .all()
    .map((r) => r.name);
  if (!cols.includes("openclaw_agent_id")) {
    db.exec(`ALTER TABLE bots ADD COLUMN openclaw_agent_id TEXT NOT NULL DEFAULT 'main';`);
  }
  if (!cols.includes("llm_config")) {
    db.exec(`ALTER TABLE bots ADD COLUMN llm_config TEXT NOT NULL DEFAULT '{}';`);
  }

  // Migration 3: add message_type and metadata columns to messages table
  const msgCols = db
    .query<{ name: string }, []>("PRAGMA table_info(messages)")
    .all()
    .map((r) => r.name);
  if (!msgCols.includes("message_type")) {
    db.exec(`ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text';`);
  }
  if (!msgCols.includes("metadata")) {
    db.exec(`ALTER TABLE messages ADD COLUMN metadata TEXT;`);
  }
}
