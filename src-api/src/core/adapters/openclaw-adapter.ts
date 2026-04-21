// ── OpenClaw Adapter ─────────────────────────────────────────────────────────
//
// Wraps the existing OpenClaw Gateway code (ws-adapter, http-adapter,
// connection-pool, openclaw-config-file) behind the AgentAdapter interface.
//
// This is a thin delegation layer — all the real protocol logic lives in
// `core/gateway/` and `core/openclaw-config-file.ts`.

import type { AgentAdapter, AgentEvent, ConnectionTestResult } from "./types";
import { GatewayWSAdapter, getOrCreateWSConnection } from "../gateway/ws-adapter";
import { OpenAIHttpAdapter } from "../gateway/http-adapter";
import { rpc, teardown } from "../gateway/connection-pool";
import type { PushEvent } from "../gateway/types";
import {
  readOpenClawConfig,
  parseLlmConfig,
  updateOpenClawConfig,
  OPENCLAW_CONFIG_PATH,
} from "../openclaw-config-file";

// ── Helpers ─────────────────────────────────────────────────────────────────

function isWsUrl(url: string): boolean {
  return url.startsWith("ws://") || url.startsWith("wss://");
}

/**
 * Translate an OpenClaw-specific PushEvent into a backend-agnostic AgentEvent.
 *
 * Not every PushEvent maps 1:1 — some OpenClaw events (node_pair_*, system_presence)
 * don't have a direct equivalent in the unified model.  We map them to the closest
 * AgentEvent type or drop them if there's no meaningful translation.
 */
function pushEventToAgentEvent(event: PushEvent, botId: string): AgentEvent | null {
  switch (event.type) {
    case "message":
      return {
        type: "message",
        sessionId: event.sessionId,
        content: event.content,
        from: event.agentId,
      };

    case "approval":
      return {
        type: "approval",
        sessionId: event.sessionId ?? "",
        approvalId: (event.metadata?.id as string) ?? "",
        metadata: event.metadata,
      };

    case "chat": {
      const sessionId = event.payload.sessionKey ?? "";
      const content =
        typeof event.payload.message === "string"
          ? event.payload.message
          : JSON.stringify(event.payload.message ?? "");
      return {
        type: "message",
        sessionId,
        content,
        from: event.payload.from,
      };
    }

    case "health":
      return { type: "status", health: event.payload };

    case "presence":
      return { type: "status", presence: event.payload };

    case "heartbeat":
      return { type: "status", heartbeat: event.payload };

    case "shutdown":
      return { type: "shutdown" };

    case "exec_finished":
      return {
        type: "exec_finished",
        sessionId: event.sessionKey ?? event.sessionId,
        result: event.payload,
      };

    case "exec_denied":
      return {
        type: "exec_denied",
        sessionId: event.sessionKey ?? event.sessionId,
        reason: event.payload?.reason,
      };

    case "cron":
      return {
        type: "cron",
        action: event.payload.action,
        summary: event.payload.summary,
      };

    case "tool_call":
      return {
        type: "tool_call",
        sessionId: event.sessionId ?? "",
        toolName: event.toolName,
        args: event.args,
        callId: event.callId,
      };

    case "tool_result":
      return {
        type: "tool_result",
        sessionId: event.sessionId ?? "",
        callId: event.callId,
        result: event.result,
        error: event.error,
      };

    case "tick":
      return { type: "tick" };

    // OpenClaw-specific events without a direct AgentEvent equivalent.
    // We map them to status or drop them.
    case "system_presence":
      return { type: "status", presence: event.metadata };

    case "node_pair_requested":
      // No direct equivalent — could be a future "notification" event type
      return null;

    case "node_pair_resolved":
      return null;

    default:
      return null;
  }
}

// ── OpenClaw Adapter Implementation ──────────────────────────────────────────

export const openclawAdapter: AgentAdapter = {
  type: "openclaw",

  async sendMessage(params) {
    const { url, token, agentId, content, onChunk, onEvent, sessionId, signal } = params;

    if (isWsUrl(url)) {
      // WS mode — delegate to GatewayWSAdapter.
      // Structured tool events emitted during the current run are forwarded via
      // the run's onEvent callback (below). Background push runs continue to go
      // through setPushHandler → onPushEvent, so activeRuns and pushRuns stay
      // strictly separated (no double-delivery).
      return GatewayWSAdapter.sendMessage(
        url,
        token,
        agentId,
        content,
        onChunk,
        sessionId,
        signal,
        onEvent
          ? (runEvent) => {
              // RunEvent is a subset of AgentEvent (tool_call / tool_result).
              onEvent(runEvent);
            }
          : undefined,
      );
    }

    // HTTP mode — delegate to OpenAIHttpAdapter
    return OpenAIHttpAdapter.sendMessage(url, token, agentId, content, onChunk, sessionId);
  },

  setPushHandler(url: string, handler: (event: AgentEvent) => void): void {
    // Wrap the AgentEvent handler to accept PushEvent, translate, and forward.
    const wrappedHandler = (pushEvent: PushEvent) => {
      const agentEvent = pushEventToAgentEvent(pushEvent, "");
      if (agentEvent) {
        handler(agentEvent);
      }
    };

    if (isWsUrl(url)) {
      GatewayWSAdapter.setPushHandler(url, wrappedHandler);
    }
    // HTTP mode: no push channel — polling would go here if needed
  },

  async testConnection(url: string, token?: string): Promise<ConnectionTestResult> {
    if (isWsUrl(url)) {
      const result = await GatewayWSAdapter.testConnection(url, token);
      return {
        ...result,
        backendType: "openclaw",
        capabilities: ["streaming", "push-events", "approval", "config-remote"],
      };
    }

    const result = await OpenAIHttpAdapter.testConnection(url, token);
    return {
      ...result,
      backendType: "openclaw",
      capabilities: ["streaming"],
    };
  },

  async prewarmConnection(url: string, token?: string): Promise<void> {
    if (isWsUrl(url)) {
      try {
        await getOrCreateWSConnection(url, token);
      } catch (err) {
        console.warn(`[openclaw-adapter] prewarm failed for ${url}:`, err);
      }
    }
  },

  async resolveApproval(
    url: string,
    token: string,
    approvalId: string,
    approved: boolean,
  ): Promise<void> {
    const entry = await getOrCreateWSConnection(url, token);
    const res = await rpc(entry, "exec.approval.resolve", {
      id: approvalId,
      approved,
    });
    if (!res.ok) {
      throw new Error(`approval resolve RPC failed: ${res.error?.message ?? "unknown"}`);
    }
  },

  async getRemoteConfig(url: string, token: string, agentId: string): Promise<unknown> {
    // Verify connectivity first
    if (isWsUrl(url)) {
      const entry = await getOrCreateWSConnection(url, token);
      const health = await rpc(entry, "health", {});
      if (!health.ok) {
        return {
          success: false,
          message: `Gateway health 失败: ${health.error?.message ?? "unknown"}`,
        };
      }
    }

    // Read ~/.openclaw/openclaw.json
    try {
      const fileConfig = await readOpenClawConfig();
      if (!fileConfig) {
        return {
          success: false,
          message: `未找到 OpenClaw 配置文件（${OPENCLAW_CONFIG_PATH}）`,
          configPath: OPENCLAW_CONFIG_PATH,
        };
      }

      const llmParsed = parseLlmConfig(fileConfig);
      return {
        success: true,
        config: {
          agentId,
          ...(llmParsed
            ? {
                llm: {
                  provider: llmParsed.provider,
                  model: llmParsed.model,
                  apiKey: llmParsed.apiKey,
                },
              }
            : {}),
        },
        message: "已从配置文件读取 LLM 设置",
        configPath: OPENCLAW_CONFIG_PATH,
      };
    } catch (err) {
      return {
        success: false,
        message: `读取配置文件失败: ${String(err)}`,
        configPath: OPENCLAW_CONFIG_PATH,
      };
    }
  },

  async applyRemoteConfig(
    url: string,
    token: string,
    config: unknown,
  ): Promise<{ success: boolean; message?: string }> {
    const cfg = config as {
      agentId?: string;
      llm?: { provider?: string; model?: string; apiKey?: string };
    };

    try {
      // Verify connectivity
      if (isWsUrl(url)) {
        const entry = await getOrCreateWSConnection(url, token);
        const health = await rpc(entry, "health", {});
        if (!health.ok) {
          return {
            success: false,
            message: `Gateway 连接验证失败: ${health.error?.message ?? "unknown"}`,
          };
        }
      }

      // Write LLM config to ~/.openclaw/openclaw.json
      if (cfg.llm && (cfg.llm.provider || cfg.llm.model || cfg.llm.apiKey)) {
        await updateOpenClawConfig({
          provider: cfg.llm.provider,
          model: cfg.llm.model,
          apiKey: cfg.llm.apiKey,
        });
      }

      return {
        success: true,
        message: "LLM 配置已写入 OpenClaw 配置文件，重启 OpenClaw 后生效",
      };
    } catch (err) {
      return {
        success: false,
        message: `写入配置文件失败: ${String(err)}`,
      };
    }
  },

  buildSessionKey(agentId: string, conversationId: string): string {
    const normalizedAgentId = (agentId ?? "main").trim().toLowerCase() || "main";
    return `agent:${normalizedAgentId}:${conversationId}`;
  },
};
