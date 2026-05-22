import { afterEach, describe, expect, test } from "bun:test";
import { hermesAdapter } from "./hermes-adapter";
import type { AgentEvent } from "./types";

// ── Test harness ──────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeReadableFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const c of chunks) ctrl.enqueue(c);
      ctrl.close();
    },
  });
}

/** Build one Responses-style SSE frame: `event: T\nid: r:1\ndata: {...}\n\n`. */
function frame(eventType: string, payload: Record<string, unknown>): string {
  return `event: ${eventType}\nid: r:1\ndata: ${JSON.stringify({ type: eventType, ...payload })}\n\n`;
}

function mockSse(parts: string[], opts?: { status?: number }): void {
  const enc = new TextEncoder();
  const chunks = parts.map((p) => enc.encode(p));
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(makeReadableFromChunks(chunks), {
        status: opts?.status ?? 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    )) as typeof fetch;
}

async function runAdapter(): Promise<{
  chunks: string[];
  events: AgentEvent[];
  error: Error | null;
}> {
  const chunks: string[] = [];
  const events: AgentEvent[] = [];
  let error: Error | null = null;
  try {
    await hermesAdapter.sendMessage({
      url: "http://test",
      agentId: "agent",
      content: "hello",
      sessionId: "conv-123",
      onChunk: (text) => chunks.push(text),
      onEvent: (ev) => events.push(ev),
    });
  } catch (e) {
    error = e as Error;
  }
  return { chunks, events, error };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("hermes-adapter sendMessage", () => {
  test("pure text deltas accumulate per onChunk contract", async () => {
    mockSse([
      frame("response.created", { response: { id: "r1", status: "in_progress" } }),
      frame("response.output_text.delta", { delta: "Hello" }),
      frame("response.output_text.delta", { delta: ", " }),
      frame("response.output_text.delta", { delta: "world!" }),
      frame("response.completed", { response: { id: "r1", status: "completed" } }),
    ]);
    const { chunks, events, error } = await runAdapter();
    expect(error).toBeNull();
    expect(events).toEqual([]);
    expect(chunks).toEqual(["Hello", "Hello, ", "Hello, world!"]);
  });

  test("function_call.added emits tool_call with parsed args; output emits tool_result", async () => {
    mockSse([
      frame("response.output_item.added", {
        output_index: 0,
        item: {
          id: "fc_1",
          type: "function_call",
          status: "in_progress",
          name: "read_file",
          call_id: "call_abc",
          arguments: JSON.stringify({ path: "/tmp/x" }),
        },
      }),
      frame("response.output_item.added", {
        output_index: 1,
        item: {
          id: "fco_1",
          type: "function_call_output",
          call_id: "call_abc",
          status: "completed",
          output: [{ type: "input_text", text: "file contents" }],
        },
      }),
      frame("response.completed", { response: { id: "r1" } }),
    ]);
    const { events, error } = await runAdapter();
    expect(error).toBeNull();
    expect(events).toEqual([
      {
        type: "tool_call",
        sessionId: "conv-123",
        toolName: "read_file",
        args: { path: "/tmp/x" },
        callId: "call_abc",
      },
      {
        type: "tool_result",
        sessionId: "conv-123",
        callId: "call_abc",
        result: "file contents",
      },
    ]);
  });

  test("byte-level chunk splits do not corrupt SSE frames", async () => {
    const full =
      frame("response.output_text.delta", { delta: "Hi" }) +
      frame("response.output_text.delta", { delta: " there" }) +
      frame("response.completed", { response: { id: "r1" } });
    // Split at deliberately awkward byte boundaries that bisect frames.
    const parts = [full.slice(0, 10), full.slice(10, 50), full.slice(50, 120), full.slice(120)];
    mockSse(parts);
    const { chunks, error } = await runAdapter();
    expect(error).toBeNull();
    expect(chunks).toEqual(["Hi", "Hi there"]);
  });

  test("response.failed throws with hermes error.message", async () => {
    mockSse([
      frame("response.failed", {
        response: { id: "r1", status: "failed", error: { message: "model timeout" } },
      }),
    ]);
    const { error } = await runAdapter();
    expect(error).not.toBeNull();
    expect(error!.message).toContain("model timeout");
  });

  test("malformed JSON arguments leaves args undefined; tool_call still emitted", async () => {
    mockSse([
      frame("response.output_item.added", {
        item: {
          id: "fc_1",
          type: "function_call",
          name: "broken_tool",
          call_id: "call_z",
          arguments: "{not valid json",
        },
      }),
      frame("response.completed", { response: { id: "r1" } }),
    ]);
    const { events, error } = await runAdapter();
    expect(error).toBeNull();
    expect(events).toEqual([
      {
        type: "tool_call",
        sessionId: "conv-123",
        toolName: "broken_tool",
        args: undefined,
        callId: "call_z",
      },
    ]);
  });

  test("unknown event types are skipped without throwing", async () => {
    mockSse([
      frame("response.output_text.delta", { delta: "hi" }),
      frame("response.future_unknown_event", { foo: "bar" }),
      frame("response.completed", { response: { id: "r1" } }),
    ]);
    const { chunks, events, error } = await runAdapter();
    expect(error).toBeNull();
    expect(events).toEqual([]);
    expect(chunks).toEqual(["hi"]);
  });
});
