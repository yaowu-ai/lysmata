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

function isWsUrl(url: string): boolean {
  return url.startsWith('ws://') || url.startsWith('wss://');
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
