// ── Multi-Agent Adapter Types ────────────────────────────────────────────────
//
// Backend-agnostic interfaces that decouple the Lysmata sidecar from any
// specific agent runtime (OpenClaw, Hermes, OpenAI-compatible, etc.).
//
// Each backend implements `AgentAdapter`.  The rest of the codebase only
// depends on these types — never on backend-specific protocol details.

// ── Backend type discriminator ──────────────────────────────────────────────

export type AgentBackendType = "openclaw" | "hermes" | "openai-compatible";

// ── Unified Agent Event (backend-agnostic) ───────────────────────────────────
//
// Every backend adapter translates its native events into this shape.
// The `sessionId` field maps to the conversation ID in Lysmata's DB.

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

// ── Connection test result ───────────────────────────────────────────────────

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  rttMs?: number;
  backendType?: AgentBackendType;
  /** Advertised capabilities, e.g. ["streaming", "push-events", "approval", "config-remote"] */
  capabilities?: string[];
}

// ── Agent Adapter interface ──────────────────────────────────────────────────
//
// All backend adapters must implement this interface.  Optional methods
// indicate capabilities that not every backend supports (e.g. remote config,
// approval resolution).  Callers should check for existence before calling.

export interface AgentAdapter {
  readonly type: AgentBackendType;

  /**
   * Send a user message and stream back the agent's reply.
   *
   * @param params.url       Backend endpoint URL
   * @param params.token      Auth token (if required)
   * @param params.agentId   Target agent within the backend (e.g. "main")
   * @param params.content   User message text (may include context injection)
   * @param params.onChunk   Called with the accumulated reply text on every update.
   *                          IMPORTANT: this is NOT per-delta. Each call should carry
   *                          the full text built so far, because the upstream consumer
   *                          (message-router → SSE → frontend) assigns it directly to
   *                          the rendering state. HTTP/SSE-based adapters must
   *                          accumulate internally before invoking this callback.
   * @param params.onEvent   Optional callback for structured events during streaming
   *                          (tool_call, tool_result, approval, etc.)
   * @param params.sessionId Session key for conversation isolation
   * @param params.signal     AbortSignal for cancellation
   */
  sendMessage(params: {
    url: string;
    token?: string;
    agentId: string;
    content: string;
    onChunk: (text: string) => void;
    onEvent?: (event: AgentEvent) => void;
    sessionId?: string;
    signal?: AbortSignal;
  }): Promise<void>;

  /**
   * Register a handler for backend-initiated push events.
   * For WS-based backends this subscribes to the event stream.
   * For polling-based backends this starts a polling loop.
   */
  setPushHandler(url: string, handler: (event: AgentEvent) => void): void;

  /** Test connectivity to the backend. */
  testConnection(url: string, token?: string): Promise<ConnectionTestResult>;

  /** Pre-warm a connection so the first message is fast (optional). */
  prewarmConnection?(url: string, token?: string): Promise<void>;

  /** Resolve a pending approval request (optional — not all backends support this). */
  resolveApproval?(
    url: string,
    token: string,
    approvalId: string,
    approved: boolean,
  ): Promise<void>;

  /** Read remote agent configuration (optional). */
  getRemoteConfig?(url: string, token: string, agentId: string): Promise<unknown>;

  /** Apply remote agent configuration (optional). */
  applyRemoteConfig?(
    url: string,
    token: string,
    config: unknown,
  ): Promise<{ success: boolean; message?: string }>;

  /**
   * Build a session key that the backend uses to isolate conversations.
   * Different backends have different session key conventions.
   */
  buildSessionKey(agentId: string, conversationId: string): string;
}
