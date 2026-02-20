// ── Bot ────────────────────────────────────────────────────────
export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

export interface Bot {
  id: string;
  name: string;
  avatar_emoji: string;
  description: string;
  skills_config: SkillConfig[];
  mcp_config: string; // raw JSON string
  openclaw_ws_url: string;
  openclaw_ws_token?: string;
  /** Target OpenClaw Agent ID (default: "main"). Supports agent alias names. */
  openclaw_agent_id: string;
  connection_status: ConnectionStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkillConfig {
  name: string;
  description: string;
}

export type CreateBotInput = Omit<Bot, 'id' | 'connection_status' | 'created_at' | 'updated_at'> & {
  openclaw_agent_id?: string;
};
export type UpdateBotInput = Partial<CreateBotInput>;

// ── Conversation ────────────────────────────────────────────────
export type ConversationType = 'single' | 'group';

export interface Conversation {
  id: string;
  title: string;
  type: ConversationType;
  created_at: string;
  updated_at: string;
  bots?: ConversationBot[];
}

export interface ConversationBot {
  conversation_id: string;
  bot_id: string;
  is_primary: boolean;
  join_order: number;
  bot?: Bot;
}

// ── Message ─────────────────────────────────────────────────────
export type SenderType = 'user' | 'bot';

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  bot_id?: string;
  content: string;
  mentioned_bot_id?: string;
  message_type?: 'text' | 'approval' | 'system_event';
  metadata?: string; // JSON string for storing complex payloads (like approval parameters)
  created_at: string;
  bot?: Bot;
}

export interface SendMessageInput {
  content: string;
}
