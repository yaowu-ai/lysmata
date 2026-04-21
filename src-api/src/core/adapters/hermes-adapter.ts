// ── Hermes Adapter ────────────────────────────────────────────────────────────
//
// Connects to a Hermes Agent via its OpenAI-compatible HTTP API server
// (gateway/platforms/api_server.py).  Hermes exposes:
//
//   POST /v1/chat/completions   — OpenAI Chat Completions (SSE streaming)
//   POST /v1/responses          — OpenAI Responses API (stateful)
//   POST /v1/runs               — Async run with SSE lifecycle events
//   GET  /v1/models             — List available models
//   GET  /health                 — Health check
//
// We use /v1/chat/completions for messaging (same as OpenAIHttpAdapter)
// and parse the custom `hermes.tool.progress` SSE event for tool execution.

import type { AgentAdapter, AgentEvent, ConnectionTestResult } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function toHttpBase(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Derive a stable session ID from the conversation, matching Hermes's
 * _derive_chat_session_id logic (SHA256 of first user message).
 * For simplicity, we use the conversationId directly as the session ID.
 */
function deriveHermesSessionId(conversationId: string): string {
  return conversationId;
}

// ── Hermes Adapter Implementation ─────────────────────────────────────────────

export const hermesAdapter: AgentAdapter = {
  type: "hermes",

  async sendMessage(params) {
    const { url, token, agentId, content, onChunk, onEvent, sessionId, signal } = params;
    const endpoint = `${toHttpBase(url)}/v1/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    // Pass session ID via X-Hermes-Session-Id header for conversation continuity
    if (sessionId) {
      headers["X-Hermes-Session-Id"] = deriveHermesSessionId(sessionId);
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: agentId || "hermes-agent",
        stream: true,
        messages: [{ role: "user", content }],
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Hermes HTTP ${res.status}: ${text}`);
    }

    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // Contract: onChunk is called with accumulated text. See AgentAdapter.sendMessage JSDoc.
    let accumulated = "";
    // Track the most recent `event:` line so the following `data:` line can be
    // parsed in context. Hermes emits:
    //   event: hermes.tool.start|progress|end
    //   data: { ... }
    // Default to "data" when no custom event is named (OpenAI-style chunks).
    let currentEvent = "data";

    const resolvedSessionId = sessionId ?? "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === "") {
          // Blank line marks end of an SSE message — reset event name.
          currentEvent = "data";
          continue;
        }

        if (trimmed.startsWith("event:")) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }

        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;

        // Hermes custom tool events — forward to onEvent for ThoughtChain UI.
        if (currentEvent.startsWith("hermes.tool")) {
          if (!onEvent) continue;
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(data) as Record<string, unknown>;
          } catch {
            /* drop malformed */
            continue;
          }
          const callId =
            (typeof parsed.call_id === "string" && parsed.call_id) ||
            (typeof parsed.callId === "string" && parsed.callId) ||
            (typeof parsed.id === "string" && parsed.id) ||
            undefined;
          if (currentEvent === "hermes.tool.start") {
            const toolName =
              (typeof parsed.name === "string" && parsed.name) ||
              (typeof parsed.tool === "string" && parsed.tool) ||
              (typeof parsed.toolName === "string" && parsed.toolName) ||
              "unknown";
            onEvent({
              type: "tool_call",
              sessionId: resolvedSessionId,
              toolName,
              args: parsed.args ?? parsed.input ?? parsed.params,
              callId,
            });
          } else if (currentEvent === "hermes.tool.end") {
            onEvent({
              type: "tool_result",
              sessionId: resolvedSessionId,
              callId,
              result: parsed.result ?? parsed.output ?? parsed.content,
              error: typeof parsed.error === "string" ? parsed.error : undefined,
            });
          }
          // hermes.tool.progress → intentionally no event (progress is in-flight noise
          // without a clean callId bridge; ThoughtChain shows the pending state fine).
          continue;
        }

        // Default OpenAI-style chat.completion chunk.
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) {
            accumulated += text;
            onChunk(accumulated);
          }
        } catch {
          /* ignore malformed chunks */
        }
      }
    }
  },

  setPushHandler(url: string, handler: (event: AgentEvent) => void): void {
    // Hermes does not have a WebSocket push channel.
    // For real-time status, we could poll /health or use /v1/runs SSE.
    // For now, push events are not supported for Hermes.
    // Tool execution events come through the streaming response (onEvent).
    console.log(
      `[hermes-adapter] Push handler registered for ${url} (polling not yet implemented)`,
    );
  },

  async testConnection(url: string, token?: string): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${toHttpBase(url)}/v1/models`, { headers });
      const rttMs = Date.now() - start;
      if (res.ok) {
        return {
          success: true,
          message: "连接成功（Hermes API）",
          rttMs,
          backendType: "hermes",
          capabilities: ["streaming", "tool-calls"],
        };
      }
      // Fallback: try /health endpoint
      const healthRes = await fetch(`${toHttpBase(url)}/health`, { headers }).catch(() => null);
      if (healthRes && healthRes.ok) {
        return {
          success: true,
          message: "连接成功（Hermes Health）",
          rttMs: Date.now() - start,
          backendType: "hermes",
          capabilities: ["streaming", "tool-calls"],
        };
      }
      return { success: false, message: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  },

  buildSessionKey(agentId: string, conversationId: string): string {
    // Hermes uses X-Hermes-Session-Id header, not a session key in the URL.
    // We return the conversationId directly — it will be passed as the header value.
    return conversationId;
  },
};
