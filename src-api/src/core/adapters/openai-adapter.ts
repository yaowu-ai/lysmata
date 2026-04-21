// ── OpenAI-Compatible Adapter ─────────────────────────────────────────────────
//
// Generic adapter for any OpenAI-compatible API endpoint
// (Ollama, vLLM, LM Studio, etc.).  Uses /v1/chat/completions with SSE streaming.
//
// Structured-event note: OpenAI's streaming protocol emits `tool_calls` deltas
// in `choices[0].delta.tool_calls[]`, accumulated by `index` until
// `finish_reason === "tool_calls"`. The protocol does NOT return tool results —
// execution happens in the agent framework that hosts the model, which then
// injects the result into the NEXT assistant turn as plain text. Therefore
// `onEvent` here can surface `tool_call` events but never `tool_result`.

import type { AgentAdapter, AgentEvent, ConnectionTestResult } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function toHttpBase(url: string): string {
  return url.replace(/\/+$/, "");
}

interface DeltaToolCall {
  index?: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface PendingToolCall {
  id?: string;
  name?: string;
  argsBuffer: string;
}

// ── OpenAI-Compatible Adapter Implementation ──────────────────────────────────

export const openaiCompatibleAdapter: AgentAdapter = {
  type: "openai-compatible",

  async sendMessage(params) {
    const { url, token, agentId, content, onChunk, onEvent, sessionId, signal } = params;
    const endpoint = `${toHttpBase(url)}/v1/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: agentId || "default",
        stream: true,
        messages: [{ role: "user", content }],
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI-compatible HTTP ${res.status}: ${text}`);
    }

    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // Contract: onChunk is called with accumulated text. See AgentAdapter.sendMessage JSDoc.
    let accumulated = "";
    // Accumulate tool_calls deltas keyed by index until finish_reason === "tool_calls".
    const pendingToolCalls = new Map<number, PendingToolCall>();
    const resolvedSessionId = sessionId ?? "";

    const flushToolCalls = () => {
      if (!onEvent || pendingToolCalls.size === 0) return;
      const indexes = Array.from(pendingToolCalls.keys()).sort((a, b) => a - b);
      for (const idx of indexes) {
        const pending = pendingToolCalls.get(idx);
        if (!pending) continue;
        let args: unknown = pending.argsBuffer;
        if (pending.argsBuffer) {
          try {
            args = JSON.parse(pending.argsBuffer);
          } catch {
            /* leave as raw string if not valid JSON */
          }
        }
        onEvent({
          type: "tool_call",
          sessionId: resolvedSessionId,
          toolName: pending.name ?? "unknown",
          args,
          callId: pending.id,
        });
      }
      pendingToolCalls.clear();
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          flushToolCalls();
          return;
        }
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string; tool_calls?: DeltaToolCall[] };
              finish_reason?: string | null;
            }>;
          };
          const choice = chunk.choices?.[0];
          const text = choice?.delta?.content;
          if (text) {
            accumulated += text;
            onChunk(accumulated);
          }
          const toolDeltas = choice?.delta?.tool_calls;
          if (toolDeltas) {
            for (const delta of toolDeltas) {
              const idx = typeof delta.index === "number" ? delta.index : 0;
              let pending = pendingToolCalls.get(idx);
              if (!pending) {
                pending = { argsBuffer: "" };
                pendingToolCalls.set(idx, pending);
              }
              if (delta.id) pending.id = delta.id;
              if (delta.function?.name) pending.name = delta.function.name;
              if (delta.function?.arguments) pending.argsBuffer += delta.function.arguments;
            }
          }
          if (choice?.finish_reason === "tool_calls") {
            flushToolCalls();
          }
        } catch {
          /* ignore malformed chunks */
        }
      }
    }
    // Defensive flush in case stream ended without [DONE] / finish_reason.
    flushToolCalls();
  },

  setPushHandler(_url: string, _handler: (event: AgentEvent) => void): void {
    // Generic OpenAI-compatible endpoints don't support push events.
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
          message: "连接成功（OpenAI Compatible API）",
          rttMs,
          backendType: "openai-compatible",
          capabilities: ["streaming"],
        };
      }
      return { success: false, message: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  },

  buildSessionKey(agentId: string, conversationId: string): string {
    // Generic OpenAI-compatible APIs don't have a session key convention.
    // Return the conversationId directly.
    return conversationId;
  },
};
