/**
 * OpenClaw Proxy — dual-mode adapter (public API Facade)
 *
 * Mode A (WS): ws:// or wss:// URL → implements the OpenClaw Gateway WebSocket Protocol
 * Mode B (HTTP): http:// or https:// URL → OpenAI-compatible HTTP endpoint
 *
 * Implementation is split into:
 *   core/gateway/types.ts           — shared type definitions
 *   core/gateway/device-identity.ts — Ed25519 deterministic identity
 *   core/gateway/connection-pool.ts — connection pool, frame handling, RPC
 *   core/gateway/ws-adapter.ts      — WS handshake + GatewayWSAdapter
 *   core/gateway/http-adapter.ts    — OpenAIHttpAdapter
 */

export type { PushEvent } from './gateway/types';
import { GatewayWSAdapter, getOrCreateWSConnection } from './gateway/ws-adapter';
import { OpenAIHttpAdapter } from './gateway/http-adapter';
import { rpc } from './gateway/connection-pool';
import {
  readOpenClawConfig,
  parseLlmConfig,
  updateOpenClawConfig,
  OPENCLAW_CONFIG_PATH,
} from './openclaw-config-file';

function isWsUrl(url: string): boolean {
  return url.startsWith('ws://') || url.startsWith('wss://');
}

/** Agent configuration payload for agent.config.set RPC */
export interface AgentConfigPayload {
  agentId: string;
  llm?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
  mcp?: Record<string, unknown>;
  skills?: Array<{ name: string; description: string }>;
}

/** Remote agent configuration returned by agent.config.get RPC */
export interface RemoteAgentConfig {
  agentId: string;
  llm?: AgentConfigPayload['llm'];
  mcp?: Record<string, unknown>;
  skills?: Array<{ name: string; description: string }>;
}

export const OpenClawProxy = {
  /**
   * Send a message to an OpenClaw Agent and stream back text chunks.
   *
   * @param url        Bot's gateway URL — `ws://` → Gateway WS protocol, `http://` → OpenAI HTTP
   * @param token      Gateway token (`OPENCLAW_GATEWAY_TOKEN`)
   * @param agentId    Target agent ID (default: "main")
   * @param content    User message (may include context prefix injected by MessageRouter)
   * @param onChunk    Called with each streamed text chunk (accumulated text, not delta)
   * @param sessionId  Conversation session ID — keeps each conversation's context isolated
   *                   in the Gateway (defaults to "main" if omitted, sharing context globally)
   */
  async sendMessage(
    url: string,
    token: string | undefined,
    agentId: string,
    content: string,
    onChunk: (text: string) => void,
    sessionId?: string,
  ): Promise<void> {
    if (isWsUrl(url)) {
      return GatewayWSAdapter.sendMessage(url, token, agentId, content, onChunk, sessionId);
    }
    return OpenAIHttpAdapter.sendMessage(url, token, agentId, content, onChunk, sessionId);
  },

  /**
   * Register a handler for bot-initiated (push) messages on a WS connection.
   * The handler is called once per complete push message when the run lifecycle ends.
   */
  setPushHandler(
    url: string,
    handler: (event: import('./gateway/types').PushEvent) => void,
  ): void {
    GatewayWSAdapter.setPushHandler(url, handler);
  },

  async resolveApproval(
    url: string,
    token: string | undefined,
    approvalId: string,
    approved: boolean,
  ): Promise<void> {
    const entry = await getOrCreateWSConnection(url, token);
    const res = await rpc(entry, 'exec.approval.resolve', {
      id: approvalId,
      approved,
    });
    if (!res.ok) {
      throw new Error(`approval resolve RPC failed: ${res.error?.message ?? 'unknown'}`);
    }
  },

  /**
   * Apply LLM configuration to OpenClaw by writing ~/.openclaw/openclaw.json.
   *
   * The Gateway WebSocket protocol (current version) does not support config-set
   * RPCs (agent.config.set → "unknown method").  The authoritative config lives
   * in the JSON file, so we write it directly and return a note that the user
   * may need to restart OpenClaw for the new LLM settings to take effect.
   *
   * MCP and Skills are stored in Lysmata's local database and injected at
   * message-routing time; they are not written to the OpenClaw config file.
   */
  async applyConfig(
    url: string,
    token: string | undefined,
    config: AgentConfigPayload,
  ): Promise<{ success: boolean; message: string; configPath?: string; needsRestart?: boolean }> {
    try {
      // Verify connectivity first
      if (isWsUrl(url)) {
        const entry = await getOrCreateWSConnection(url, token);
        const health = await rpc(entry, 'health', {});
        if (!health.ok) {
          return { success: false, message: `Gateway 连接验证失败: ${health.error?.message ?? 'unknown'}` };
        }
      }

      // Write LLM config to ~/.openclaw/openclaw.json
      if (config.llm && (config.llm.provider || config.llm.model || config.llm.apiKey)) {
        await updateOpenClawConfig({
          provider: config.llm.provider,
          model: config.llm.model,
          apiKey: config.llm.apiKey,
        });
      }

      return {
        success: true,
        message: 'LLM 配置已写入 OpenClaw 配置文件，重启 OpenClaw 后生效',
        configPath: OPENCLAW_CONFIG_PATH,
        needsRestart: true,
      };
    } catch (err) {
      return {
        success: false,
        message: `写入配置文件失败: ${String(err)}`,
        configPath: OPENCLAW_CONFIG_PATH,
      };
    }
  },

  /**
   * Read current LLM configuration from OpenClaw.
   *
   * Strategy:
   *   1. Verify connectivity via `health` WS RPC (or HTTP ping for HTTP mode).
   *   2. Read the authoritative config from ~/.openclaw/openclaw.json directly.
   *      (The Gateway WebSocket protocol does not expose config read RPCs in the
   *       current version — agent.config.get returns "unknown method".)
   *
   * Returns the parsed LLM provider / model / apiKey plus the config file path
   * so the caller can inform the user where settings live.
   */
  async getConfig(
    url: string,
    token: string | undefined,
    agentId: string,
  ): Promise<{ success: boolean; config?: RemoteAgentConfig; message: string; configPath?: string }> {
    // Step 1 — verify connectivity
    try {
      if (isWsUrl(url)) {
        const entry = await getOrCreateWSConnection(url, token);
        const health = await rpc(entry, 'health', {});
        if (!health.ok) {
          return { success: false, message: `Gateway health 失败: ${health.error?.message ?? 'unknown'}` };
        }
      }
      // For HTTP mode we skip the ping and go straight to the file
    } catch (err) {
      return { success: false, message: `无法连接 Gateway: ${String(err)}` };
    }

    // Step 2 — read ~/.openclaw/openclaw.json
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
      const config: RemoteAgentConfig = {
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
      };

      return {
        success: true,
        config,
        message: `已从配置文件读取 LLM 设置`,
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

  async testConnection(
    url: string,
    token?: string,
  ): Promise<{ success: boolean; message: string }> {
    if (isWsUrl(url)) return GatewayWSAdapter.testConnection(url, token);
    return OpenAIHttpAdapter.testConnection(url, token);
  },

  closeAll(): void {
    GatewayWSAdapter.closeAll();
  },
};
