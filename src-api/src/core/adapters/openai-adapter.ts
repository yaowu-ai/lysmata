// ── OpenAI-Compatible Adapter ─────────────────────────────────────────────────
//
// Generic adapter for any OpenAI-compatible API endpoint
// (Ollama, vLLM, LM Studio, etc.).  Uses /v1/chat/completions with SSE streaming.

import type { AgentAdapter, AgentEvent, ConnectionTestResult } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function toHttpBase(url: string): string {
  return url.replace(/\/+$/, "");
}

// ── OpenAI-Compatible Adapter Implementation ──────────────────────────────────

export const openaiCompatibleAdapter: AgentAdapter = {
  type: "openai-compatible",

  async sendMessage(params) {
    const { url, token, agentId, content, onChunk, sessionId, signal } = params;
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
        if (data === "[DONE]") return;
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) onChunk(text);
        } catch {
          /* ignore malformed chunks */
        }
      }
    }
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
