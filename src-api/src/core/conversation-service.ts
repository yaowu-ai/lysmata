import { randomUUID } from 'crypto';
import { getDb } from '../shared/db';

export interface Conversation {
  id: string;
  title: string;
  type: 'single' | 'group';
  created_at: string;
  updated_at: string;
}

export interface ConversationWithBots extends Conversation {
  bots: ConversationBotRow[];
}

export interface ConversationBotRow {
  conversation_id: string;
  bot_id: string;
  is_primary: number;
  join_order: number;
}

export const ConversationService = {
  findAll(): ConversationWithBots[] {
    const convs = getDb()
      .query<Conversation, []>('SELECT * FROM conversations ORDER BY updated_at DESC')
      .all();
    return convs.map((c) => ({ ...c, bots: this._getBots(c.id) }));
  },

  findById(id: string): ConversationWithBots | null {
    const conv = getDb()
      .query<Conversation, [string]>('SELECT * FROM conversations WHERE id = ?')
      .get(id);
    if (!conv) return null;
    return { ...conv, bots: this._getBots(id) };
  },

  create(input: {
    title: string;
    type: 'single' | 'group';
    botIds: string[];
    primaryBotId: string;
  }): ConversationWithBots {
    const id = randomUUID();
    const now = new Date().toISOString();
    const db = getDb();
    db.run(
      'INSERT INTO conversations (id, title, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, input.title, input.type, now, now],
    );
    input.botIds.forEach((botId, i) => {
      db.run(
        'INSERT INTO conversation_bots (conversation_id, bot_id, is_primary, join_order) VALUES (?, ?, ?, ?)',
        [id, botId, botId === input.primaryBotId ? 1 : 0, i + 1],
      );
    });
    return this.findById(id)!;
  },

  delete(id: string): boolean {
    const db = getDb();
    db.run('DELETE FROM messages WHERE conversation_id = ?', [id]);
    db.run('DELETE FROM conversation_bots WHERE conversation_id = ?', [id]);
    const info = db.run('DELETE FROM conversations WHERE id = ?', [id]);
    return info.changes > 0;
  },

  setPrimaryBot(conversationId: string, botId: string): void {
    const db = getDb();
    db.run('UPDATE conversation_bots SET is_primary = 0 WHERE conversation_id = ?', [conversationId]);
    db.run(
      'UPDATE conversation_bots SET is_primary = 1 WHERE conversation_id = ? AND bot_id = ?',
      [conversationId, botId],
    );
    db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [
      new Date().toISOString(),
      conversationId,
    ]);
  },

  addBot(conversationId: string, botId: string): void {
    const db = getDb();
    const maxOrder = db
      .query<{ max_order: number }, [string]>(
        'SELECT COALESCE(MAX(join_order),0) as max_order FROM conversation_bots WHERE conversation_id = ?',
      )
      .get(conversationId);
    db.run(
      'INSERT OR IGNORE INTO conversation_bots (conversation_id, bot_id, is_primary, join_order) VALUES (?, ?, 0, ?)',
      [conversationId, botId, (maxOrder?.max_order ?? 0) + 1],
    );
    db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [
      new Date().toISOString(),
      conversationId,
    ]);
  },

  removeBot(conversationId: string, botId: string): void {
    getDb().run(
      'DELETE FROM conversation_bots WHERE conversation_id = ? AND bot_id = ?',
      [conversationId, botId],
    );
  },

  _getBots(conversationId: string): ConversationBotRow[] {
    return getDb()
      .query<ConversationBotRow, [string]>(
        'SELECT * FROM conversation_bots WHERE conversation_id = ? ORDER BY join_order',
      )
      .all(conversationId);
  },
};
