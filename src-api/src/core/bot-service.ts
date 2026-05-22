import { randomUUID } from "crypto";
import { getDb } from "../shared/db";
import type { AgentBackendType } from "./adapters/types";

function normalizeAgentId(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized || "main";
}

export interface Bot {
  id: string;
  name: string;
  avatar_emoji: string;
  description: string;
  skills_config: string; // JSON string
  mcp_config: string; // JSON string
  llm_config: string; // JSON string
  backend_type: AgentBackendType;
  backend_url: string;
  backend_token: string | null;
  agent_id: string; // which Agent to target (default: "main")
  connection_status: "connected" | "disconnected" | "error" | "connecting";
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
  backend_type?: AgentBackendType;
  backend_url: string;
  backend_token?: string;
  agent_id?: string;
  is_active?: boolean;
}

export const BotService = {
  findAll(): Bot[] {
    return getDb().query<Bot, []>("SELECT * FROM bots ORDER BY created_at DESC").all();
  },

  findById(id: string): Bot | null {
    return getDb().query<Bot, [string]>("SELECT * FROM bots WHERE id = ?").get(id);
  },

  create(input: CreateBotInput): Bot {
    const id = randomUUID();
    const now = new Date().toISOString();
    const db = getDb();
    db.run(
      `INSERT INTO bots (id, name, avatar_emoji, description, skills_config, mcp_config, llm_config,
        backend_type, backend_url, backend_token, agent_id,
        connection_status, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', ?, ?, ?)`,
      [
        id,
        input.name,
        input.avatar_emoji ?? "🤖",
        input.description ?? "",
        JSON.stringify(input.skills_config ?? []),
        JSON.stringify(input.mcp_config ?? {}),
        JSON.stringify(input.llm_config ?? {}),
        input.backend_type ?? "openclaw",
        input.backend_url,
        input.backend_token || null,
        normalizeAgentId(input.agent_id),
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
    const values: Array<string | number | null> = [];

    if (input.name !== undefined) {
      fields.push("name = ?");
      values.push(input.name);
    }
    if (input.avatar_emoji !== undefined) {
      fields.push("avatar_emoji = ?");
      values.push(input.avatar_emoji);
    }
    if (input.description !== undefined) {
      fields.push("description = ?");
      values.push(input.description);
    }
    if (input.skills_config !== undefined) {
      fields.push("skills_config = ?");
      values.push(JSON.stringify(input.skills_config));
    }
    if (input.mcp_config !== undefined) {
      fields.push("mcp_config = ?");
      values.push(JSON.stringify(input.mcp_config));
    }
    if (input.llm_config !== undefined) {
      fields.push("llm_config = ?");
      values.push(JSON.stringify(input.llm_config));
    }
    if (input.backend_type !== undefined) {
      fields.push("backend_type = ?");
      values.push(input.backend_type);
    }
    if (input.backend_url !== undefined) {
      fields.push("backend_url = ?");
      values.push(input.backend_url);
    }
    if (input.backend_token !== undefined) {
      fields.push("backend_token = ?");
      values.push(input.backend_token || null);
    }
    if (input.agent_id !== undefined) {
      fields.push("agent_id = ?");
      values.push(normalizeAgentId(input.agent_id));
    }
    if (input.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(input.is_active ? 1 : 0);
    }

    if (fields.length === 0) return existing;
    fields.push("updated_at = ?");
    values.push(now, id);
    getDb().run(`UPDATE bots SET ${fields.join(", ")} WHERE id = ?`, values);
    return this.findById(id)!;
  },

  updateStatus(id: string, status: Bot["connection_status"]): void {
    getDb().run(`UPDATE bots SET connection_status = ?, updated_at = ? WHERE id = ?`, [
      status,
      new Date().toISOString(),
      id,
    ]);
  },

  delete(id: string): boolean {
    const db = getDb();
    db.run("DELETE FROM conversation_bots WHERE bot_id = ?", [id]);
    const info = db.run("DELETE FROM bots WHERE id = ?", [id]);
    return info.changes > 0;
  },

  /** Returns the number of conversations this bot is participating in. */
  conversationCount(id: string): number {
    const row = getDb()
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) as count FROM conversation_bots WHERE bot_id = ?",
      )
      .get(id);
    return row?.count ?? 0;
  },
};
