// ── Bot ────────────────────────────────────────────────────────
export type ConnectionStatus = "connected" | "disconnected" | "error" | "connecting";

export type LlmProvider = "openai" | "anthropic" | "google" | "openrouter" | "custom";

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface Bot {
  id: string;
  name: string;
  avatar_emoji: string;
  description: string;
  skills_config: SkillConfig[];
  mcp_config: string; // raw JSON string
  llm_config: LlmConfig | null;
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

export type CreateBotInput = Omit<
  Bot,
  "id" | "connection_status" | "created_at" | "updated_at" | "llm_config"
> & {
  openclaw_agent_id?: string;
  llm_config?: LlmConfig | null;
};
export type UpdateBotInput = Partial<CreateBotInput>;

// ── Conversation ────────────────────────────────────────────────
export type ConversationType = "single" | "group";

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
export type SenderType = "user" | "bot";

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  bot_id?: string;
  content: string;
  mentioned_bot_id?: string;
  message_type?: "text" | "approval" | "system_event";
  metadata?: string; // JSON string for storing complex payloads (like approval parameters)
  created_at: string;
  bot?: Bot;
}

export interface SendMessageInput {
  content: string;
}

// ── Gateway Settings ─────────────────────────────────────────────
export interface GatewaySettings {
  port: number;
  /** "loopback" = 127.0.0.1（仅本地）；"lan" = 0.0.0.0（局域网共享） */
  bind: "loopback" | "lan";
  authMode: "none" | "token";
  /** Auth token value; only present when authMode === "token" */
  authToken?: string;
}

// ── LLM Settings ────────────────────────────────────────────────
export interface ProviderModel {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: string[];
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow?: number;
  maxTokens?: number;
}

export interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  models: ProviderModel[];
}

export interface LlmSettings {
  providers: Record<string, ProviderConfig>;
  defaultModel: {
    primary: string;
    fallbacks?: string[];
  };
}
