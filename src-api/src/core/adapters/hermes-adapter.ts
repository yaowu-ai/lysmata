// ── Hermes Adapter ────────────────────────────────────────────────────────────
//
// Connects to a Hermes Agent via the OpenAI Responses API
// (gateway/platforms/api_server.py:_handle_responses).
// Endpoint: POST /v1/responses with stream=true + store=true.
//
// Why /v1/responses (not /v1/chat/completions)?
//  - Both stream text via OpenAI-style SSE.
//  - /v1/responses ALSO emits structured `function_call` and
//    `function_call_output` items with full arguments + output. The
//    chat/completions path only carries the tool name + preview label
//    (no args, no result), which leaves Lysmata's ThoughtChain empty.
//  - Lysmata's unified `AgentEvent` contract needs the full args/result
//    so the frontend renders meaningful tool steps.
//
// Why NOT /v1/runs?
//  - /v1/runs supports approval but the assistant text is only delivered
//    once, in the terminal `run.completed` event (no token-by-token
//    streaming). Approval on hermes is deferred to a future PR.
//
// Session continuity:
//  - Request body field `conversation: <conversationId>` + `store: true`
//    lets hermes self-manage the previous_response_id chain.
//  - Lysmata still stores the full message history in `app.db.messages`
//    for its own UI; the hermes-side conversation store is independent
//    and used only for LLM prompt context.
//
// Heads up for future maintainers (hermes-side behaviour):
//  - On client abort, hermes persists an `incomplete` snapshot that
//    keeps the partial assistant text (api_server.py:1568-1600). The
//    next turn's LLM prompt will see that partial text as if it were a
//    completed reply.
//  - `response.completed.response.output[]` is server-trimmed at
//    ~100KB (api_server.py:1898-1917); never treat it as authoritative
//    for tool args/result. The per-item events emitted earlier in the
//    stream are the source of truth.

import type { AgentAdapter, AgentEvent, ConnectionTestResult } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function toHttpBase(url: string): string {
  return url.replace(/\/+$/, "");
}

// Hermes emits `function_call.arguments` as a JSON string (api_server.py:1660).
// Accept dict too for forward-compat. Parse failure leaves args undefined —
// the tool call is still surfaced, just without argument detail.
function parseFunctionArgs(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  if (raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// Today hermes emits exactly { type: "input_text", text: "..." } for tool
// output (api_server.py:1727). Use a soft accessor; don't fabricate
// fallbacks for variants the server doesn't produce.
function extractFunctionResult(item: { output?: Array<{ text?: unknown }> }): unknown {
  return item.output?.[0]?.text;
}

// ── Hermes Adapter Implementation ─────────────────────────────────────────────

export const hermesAdapter: AgentAdapter = {
  type: "hermes",

  async sendMessage(params) {
    const { url, token, agentId, content, onChunk, onEvent, sessionId, signal } = params;
    const endpoint = `${toHttpBase(url)}/v1/responses`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const body: Record<string, unknown> = {
      model: agentId || "hermes-agent",
      input: content,
      stream: true,
      store: true,
    };
    if (sessionId) {
      body.conversation = sessionId;
    }

    console.info(`[hermes-adapter] POST ${endpoint} conversation=${sessionId ?? "(none)"}`);

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
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
    // Contract: onChunk receives accumulated text (not a delta). See
    // AgentAdapter.sendMessage JSDoc + CLAUDE.md "流式契约".
    let accumulated = "";

    const resolvedSessionId = sessionId ?? "";

    // SSE frames from /v1/responses look like:
    //   event: response.output_text.delta
    //   id: <runId>:<seq>
    //   data: {"type":"response.output_text.delta","delta":"Hi", ...}
    //   <blank line>
    //
    // The JSON payload always carries a `type` field mirroring the SSE
    // event name (api_server.py:1526-1532). We discriminate on the JSON
    // `type` because it's harder to lose across buffer/parse boundaries.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        if (trimmed.startsWith(":")) continue; // SSE comment / keepalive
        if (trimmed.startsWith("event:")) continue;
        if (trimmed.startsWith("id:")) continue;
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;

        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }

        const t = typeof frame.type === "string" ? frame.type : "";
        switch (t) {
          case "response.created":
            // Initial envelope, status=in_progress. No payload to surface yet.
            continue;

          case "response.output_text.delta": {
            const delta = typeof frame.delta === "string" ? frame.delta : "";
            if (!delta) continue;
            accumulated += delta;
            onChunk(accumulated);
            continue;
          }

          case "response.output_text.done":
            // Full text already accumulated via deltas. (Defensive cross-check
            // against `frame.text` is a future hardening option, not required.)
            continue;

          case "response.output_item.added": {
            if (!onEvent) continue;
            const item = (frame.item as Record<string, unknown> | undefined) ?? {};
            const itemType = typeof item.type === "string" ? item.type : "";
            if (itemType === "function_call") {
              // Hermes serialises the full `arguments` JSON before emitting
              // this event (api_server.py:1656-1690) — no streaming partials.
              // Emit tool_call immediately so the UI can render it as in-flight.
              const toolName = typeof item.name === "string" ? item.name : "unknown";
              const callId = typeof item.call_id === "string" ? item.call_id : undefined;
              onEvent({
                type: "tool_call",
                sessionId: resolvedSessionId,
                toolName,
                args: parseFunctionArgs(item.arguments),
                callId,
              });
            } else if (itemType === "function_call_output") {
              const callId = typeof item.call_id === "string" ? item.call_id : undefined;
              onEvent({
                type: "tool_result",
                sessionId: resolvedSessionId,
                callId,
                result: extractFunctionResult(item as { output?: Array<{ text?: unknown }> }),
              });
            }
            // item.type === "message": skeleton frame, ignore.
            continue;
          }

          case "response.output_item.done":
            // function_call.done carries identical args to .added; redundant.
            // function_call_output.done likewise. message.done's text is
            // already in `accumulated`. Nothing to emit.
            continue;

          case "response.completed":
            return;

          case "response.failed": {
            const errMsg =
              (frame.response as { error?: { message?: string } } | undefined)?.error?.message ||
              "Hermes response failed";
            throw new Error(errMsg);
          }

          default:
            console.info(`[hermes-adapter] unhandled event type: ${t}`);
            continue;
        }
      }
    }
  },

  setPushHandler(_url: string, _handler: (event: AgentEvent) => void): void {
    // Hermes has no persistent push channel:
    //  - /v1/responses is request-scoped (events arrive only during the call)
    //  - /v1/runs events are per-run, not a global subscription
    // Tool events flow through the in-stream `onEvent` callback in sendMessage.
    // (Polling /health to synthesize `status` events is a future option.)
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

  buildSessionKey(_agentId: string, conversationId: string): string {
    // The returned value is passed as the hermes `conversation` body field.
    // We deliberately don't include agentId — multi-agent within one lysmata
    // conversation would share the hermes-side conversation history. That's
    // uncommon today and OK for now.
    return conversationId;
  },
};
