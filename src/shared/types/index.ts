// ── Bot ────────────────────────────────────────────────────────
export type ConnectionStatus = "connected" | "disconnected" | "error" | "connecting";

export type LlmProvider = "openai" | "anthropic" | "google" | "openrouter" | "custom";

export type AgentBackendType = "openclaw" | "hermes" | "openai-compatible";

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
  backend_type: AgentBackendType;
  backend_url: string;
  backend_token?: string;
  /** Target Agent ID within the backend (default: "main"). */
  agent_id: string;
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
  agent_id?: string;
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
  message_type?: "text" | "approval" | "system_event" | "tool_call" | "tool_result";
  metadata?: string; // JSON string for storing complex payloads (like approval parameters)
  created_at: string;
  bot?: Bot;
}

export interface SendMessageInput {
  content: string;
}

// ── Agent Event (从 src-api/src/core/adapters/types.ts 手动同步) ──
// 修改后端 AgentEvent 时，必须同步更新此镜像类型以保持字段一致。
export type AgentEvent =
  | { type: "message"; sessionId: string; content: string; from?: string }
  | {
      type: "approval";
      sessionId: string;
      approvalId: string;
      metadata: Record<string, unknown>;
    }
  | {
      type: "tool_call";
      sessionId: string;
      toolName: string;
      args?: unknown;
      callId?: string;
    }
  | {
      type: "tool_result";
      sessionId: string;
      callId?: string;
      result?: unknown;
      error?: string;
    }
  | {
      type: "status";
      health?: unknown;
      presence?: unknown;
      heartbeat?: unknown;
    }
  | { type: "shutdown" }
  | { type: "exec_finished"; sessionId?: string; result?: unknown }
  | { type: "exec_denied"; sessionId?: string; reason?: string }
  | { type: "cron"; action?: string; summary?: string }
  | { type: "tick" };

// ── Stream Frame (message-router → /stream SSE → 前端 useMessages) ──
// 旧帧（chunk / done / error）无 `type` 字段，新帧有 `type === "event"`。
// 前端解析器用 `"type" in frame` 判别。
export type StreamFrame =
  | { chunk: string }
  | { done: true; botMsg: Message }
  | { error: string }
  | { type: "event"; event: AgentEvent };

// ── Gateway Settings ─────────────────────────────────────────────
export interface GatewaySettings {
  /** "local" = 本地模式；"remote" = 远程模式 */
  mode: "local" | "remote";
  port: number;
  /** "loopback" = 127.0.0.1（仅本地）；"lan" = 0.0.0.0（局域网共享） */
  bind: "loopback" | "lan";
  authMode: "none" | "token";
  /** Auth token value; only present when authMode === "token" */
  authToken?: string;
}

// ── Channel Settings ─────────────────────────────────────────────
export interface ChannelEntry {
  id: string;
  label: string;
  token: string;
  enabled: boolean;
}

// ── Hook Settings ─────────────────────────────────────────────────
export interface HookEntry {
  id: string;
  name?: string;
  description?: string;
  emoji?: string;
  path?: string;
  enabled: boolean;
}

// ── LLM Settings ────────────────────────────────────────────────
export const OPENCLAW_API_TYPES = [
  "openai-completions",
  "openai-responses",
  "openai-codex-responses",
  "anthropic-messages",
  "google-generative-ai",
  "github-copilot",
  "bedrock-converse-stream",
  "ollama",
] as const;

export type OpenClawApiType = (typeof OPENCLAW_API_TYPES)[number];

export const OPENCLAW_API_TYPE_LABELS: Record<OpenClawApiType, string> = {
  "openai-completions": "OpenAI Completions",
  "openai-responses": "OpenAI Responses",
  "openai-codex-responses": "OpenAI Codex Responses",
  "anthropic-messages": "Anthropic Messages",
  "google-generative-ai": "Google Generative AI",
  "github-copilot": "GitHub Copilot",
  "bedrock-converse-stream": "Bedrock Converse Stream",
  ollama: "Ollama",
};

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
  api?: OpenClawApiType;
  models: ProviderModel[];
}

export interface LlmSettings {
  providers: Record<string, ProviderConfig>;
  defaultModel: {
    primary: string;
    fallbacks?: string[];
  };
}

// ── Agent (OpenClaw CLI managed) ────────────────────────────────
export interface Agent {
  id: string; // Agent ID (e.g., "main", "production")
  displayName?: string; // Optional display name
  identity?: string; // Identity description (e.g., "🐧 Andrew (IDENTITY.md)")
  workspace: string; // Workspace directory path
  agentDir: string; // Agent state directory
  model?: string; // Primary model (e.g., "openrouter/deepseek/deepseek-v3.2-exp")
  routingRules: number; // Number of routing rules
  isDefault: boolean; // Whether this is the default agent
}

export interface AgentBinding {
  agent: string; // Agent ID
  channel: string; // Channel name (e.g., "telegram", "discord")
  accountId?: string; // Optional account ID within channel
}

export interface CreateAgentInput {
  name: string; // Agent ID (required)
  workspace?: string; // Workspace directory (optional)
  agentDir?: string; // Agent state directory (optional)
  model?: string; // Model ID (optional)
  bindings?: string[]; // Initial bindings (e.g., ["telegram:account1"])
}

export interface BindAgentInput {
  agent: string;
  bindings: string[]; // Array of "channel:accountId" strings
}

// ── Onboarding Workspace Templates ──────────────────────────────────────────
export type WorkspaceTemplateId = "export-owner" | "equipment-rental" | "platform-ops";

export interface WorkspaceTemplateMeta {
  id: WorkspaceTemplateId;
  name: string;
  description: string;
  icon: string;
  badge: string;
  footnote: string;
  outcome: string;
  generatedFiles: string[];
}

export interface WorkspaceTemplateField {
  key: "assistantName" | "assistantGoal" | "toneStyle";
  label: string;
  type: "text" | "textarea";
  required: boolean;
  placeholder?: string;
  maxLength?: number;
}

export interface WorkspaceTemplateSchema {
  template: WorkspaceTemplateMeta;
  defaults: {
    assistantName: string;
    assistantGoal: string;
    toneStyle: string;
  };
  fields: WorkspaceTemplateField[];
}

export interface WorkspaceInitResult {
  success: true;
  assistantId: string;
  assistantName: string;
  botId: string;
  botName: string;
  workspacePath: string;
  writtenFiles: Array<{
    kind: "agents" | "soul" | "tools" | "memory" | "assistant-profile";
    relativePath: string;
    absolutePath: string;
    sourceTemplate: WorkspaceTemplateId;
  }>;
  warnings: string[];
}
