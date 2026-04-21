// ── OpenAI HTTP Adapter ─────────────────────────────────────────────────────

function toHttpBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export const OpenAIHttpAdapter = {
  async sendMessage(
    baseUrl: string,
    token: string | undefined,
    agentId: string,
    content: string,
    onChunk: (text: string) => void,
    _sessionId?: string,
  ): Promise<void> {
    const endpoint = `${toHttpBase(baseUrl)}/v1/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-openclaw-agent-id": agentId,
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        stream: true,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI HTTP ${res.status}: ${text}`);
    }

    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // Contract: onChunk receives accumulated reply text, not per-delta fragments.
    // See AgentAdapter.sendMessage JSDoc. Upstream (message-router, frontend SSE)
    // assigns the chunk directly to the rendering state, so per-delta would lose
    // all but the last token.
    let accumulated = "";

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

  async testConnection(
    baseUrl: string,
    token?: string,
  ): Promise<{ success: boolean; message: string; rttMs?: number }> {
    const start = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${toHttpBase(baseUrl)}/v1/models`, { headers });
      const rttMs = Date.now() - start;
      if (res.ok) return { success: true, message: "连接成功（HTTP API）", rttMs };
      return { success: false, message: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  },
};
