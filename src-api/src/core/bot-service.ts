import { randomUUID } from 'crypto';
import { getDb } from '../shared/db';

export interface Bot {
  id: string;
  name: string;
  avatar_emoji: string;
  description: string;
  skills_config: string; // JSON string
  mcp_config: string;    // JSON string
  llm_config: string;    // JSON string
  openclaw_ws_url: string;
  openclaw_ws_token: string | null;
  openclaw_agent_id: string; // which OpenClaw Agent to target (default: "main")
  connection_status: 'connected' | 'disconnected' | 'error' | 'connecting';
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateBotInput {
  name: string;
  avatar_emoji?: string;
  description?: string;
  skills_config?: unknown[];
  mcp_config?: unknown;
  llm_config?: unknown;
  openclaw_ws_url: string;
  openclaw_ws_token?: string;
  openclaw_agent_id?: string;
  is_active?: boolean;
}

export const BotService = {
  findAll(): Bot[] {
    return getDb().query<Bot, []>('SELECT * FROM bots ORDER BY created_at DESC').all();
  },

  findById(id: string): Bot | null {
    return getDb().query<Bot, [string]>('SELECT * FROM bots WHERE id = ?').get(id);
  },

  create(input: CreateBotInput): Bot {
    const id = randomUUID();
    const now = new Date().toISOString();
    const db = getDb();
    db.run(
      `INSERT INTO bots (id, name, avatar_emoji, description, skills_config, mcp_config, llm_config,
        openclaw_ws_url, openclaw_ws_token, openclaw_agent_id,
        connection_status, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', ?, ?, ?)`,
      [
        id,
        input.name,
        input.avatar_emoji ?? '🤖',
        input.description ?? '',
        JSON.stringify(input.skills_config ?? []),
        JSON.stringify(input.mcp_config ?? {}),
        JSON.stringify(input.llm_config ?? {}),
        input.openclaw_ws_url,
        input.openclaw_ws_token || null,
        input.openclaw_agent_id || 'main',
        input.is_active !== false ? 1 : 0,
        now,
        now,
      ],
    );
    return this.findById(id)!;
  },

  update(id: string, input: Partial<CreateBotInput>): Bot | null {
    const existing = this.findById(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined)             { fields.push('name = ?');              values.push(input.name); }
    if (input.avatar_emoji !== undefined)     { fields.push('avatar_emoji = ?');      values.push(input.avatar_emoji); }
    if (input.description !== undefined)      { fields.push('description = ?');       values.push(input.description); }
    if (input.skills_config !== undefined)    { fields.push('skills_config = ?');     values.push(JSON.stringify(input.skills_config)); }
    if (input.mcp_config !== undefined)       { fields.push('mcp_config = ?');        values.push(JSON.stringify(input.mcp_config)); }
    if (input.llm_config !== undefined)       { fields.push('llm_config = ?');        values.push(JSON.stringify(input.llm_config)); }
    if (input.openclaw_ws_url !== undefined)  { fields.push('openclaw_ws_url = ?');   values.push(input.openclaw_ws_url); }
    if (input.openclaw_ws_token !== undefined){ fields.push('openclaw_ws_token = ?'); values.push(input.openclaw_ws_token || null); }
    if (input.openclaw_agent_id !== undefined){ fields.push('openclaw_agent_id = ?'); values.push(input.openclaw_agent_id || 'main'); }
    if (input.is_active !== undefined)        { fields.push('is_active = ?');         values.push(input.is_active ? 1 : 0); }

    if (fields.length === 0) return existing;
    fields.push('updated_at = ?');
    values.push(now, id);
    getDb().run(`UPDATE bots SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id)!;
  },

  updateStatus(id: string, status: Bot['connection_status']): void {
    getDb().run(
      `UPDATE bots SET connection_status = ?, updated_at = ? WHERE id = ?`,
      [status, new Date().toISOString(), id],
    );
  },

  delete(id: string): boolean {
    const db = getDb();
    db.run('DELETE FROM conversation_bots WHERE bot_id = ?', [id]);
    const info = db.run('DELETE FROM bots WHERE id = ?', [id]);
    return info.changes > 0;
  },
};
