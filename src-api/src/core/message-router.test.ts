import { afterEach, describe, expect, test } from "bun:test";
import { unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const dbPath = join(tmpdir(), `lysmata-message-router-${randomUUID()}.db`);
process.env.DB_PATH = dbPath;
process.env.GATEWAY_LOG_PATH = "";

import type { AgentAdapter, AgentEvent } from "./adapters/types";

const { closeDb, getDb } = await import("../shared/db");
const { registerAdapter } = await import("./adapters/registry");
const { BotService } = await import("./bot-service");
const { ConversationService } = await import("./conversation-service");
const { MessageRouter } = await import("./message-router");

let fakeEvents: AgentEvent[] = [];
let fakeReply = "final answer";

const fakeAdapter: AgentAdapter = {
  type: "openai-compatible",
  async sendMessage(params) {
    for (const event of fakeEvents) {
      params.onEvent?.(event);
    }
    params.onChunk(fakeReply);
  },
  setPushHandler() {},
  async testConnection() {
    return { success: true, message: "ok" };
  },
  buildSessionKey(_agentId, conversationId) {
    return conversationId;
  },
};

registerAdapter(fakeAdapter);

function resetDb(): void {
  closeDb();
  try {
    unlinkSync(dbPath);
    unlinkSync(`${dbPath}-shm`);
    unlinkSync(`${dbPath}-wal`);
  } catch {
    /* ignore cleanup errors */
  }
  getDb();
}

function createConversation(): string {
  const bot = BotService.create({
    name: "TestBot",
    backend_type: "openai-compatible",
    backend_url: "http://fake",
  });
  const conv = ConversationService.create({
    title: "Test",
    type: "single",
    botIds: [bot.id],
    primaryBotId: bot.id,
  });
  return conv.id;
}

afterEach(() => {
  closeDb();
  try {
    unlinkSync(dbPath);
    unlinkSync(`${dbPath}-shm`);
    unlinkSync(`${dbPath}-wal`);
  } catch {
    /* ignore cleanup errors */
  }
  fakeEvents = [];
  fakeReply = "final answer";
});

describe("MessageRouter thinking_content", () => {
  test("stores process events on the final bot message", async () => {
    resetDb();
    const conversationId = createConversation();
    fakeEvents = [
      {
        type: "process",
        kind: "thinking",
        sessionId: conversationId,
        runId: "run-1",
        payload: { text: "thinking..." },
        rawStream: "thinking",
      },
    ];
    fakeReply = "done";

    const botMsg = await MessageRouter.route(conversationId, "hello", () => {});

    expect(botMsg.content).toBe("done");
    expect(botMsg.thinking_content).not.toBeNull();
    expect(JSON.parse(botMsg.thinking_content!)).toEqual(fakeEvents);
  });

  test("stores tool call and result events on the final bot message", async () => {
    resetDb();
    const conversationId = createConversation();
    fakeEvents = [
      {
        type: "tool_call",
        sessionId: conversationId,
        toolName: "read_file",
        args: { path: "/tmp/a" },
        callId: "call-1",
      },
      {
        type: "tool_result",
        sessionId: conversationId,
        callId: "call-1",
        result: "contents",
      },
    ];

    const botMsg = await MessageRouter.route(conversationId, "hello", () => {});

    expect(JSON.parse(botMsg.thinking_content!)).toEqual(fakeEvents);
    const listed = MessageRouter.listMessages(conversationId);
    expect(listed.at(-1)?.id).toBe(botMsg.id);
    expect(listed.at(-1)?.thinking_content).toBe(botMsg.thinking_content);
  });

  test("leaves thinking_content null when there are no structured events", async () => {
    resetDb();
    const conversationId = createConversation();

    const botMsg = await MessageRouter.route(conversationId, "hello", () => {});

    expect(botMsg.content).toBe("final answer");
    expect(botMsg.thinking_content).toBeNull();
  });
});
