import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomUUID } from "crypto";
import { MessageRouter } from "../../core/message-router";
import { BotService } from "../../core/bot-service";
import { getAdapter } from "../../core/adapters/registry";
import type { AgentEvent, CanonicalStreamEvent, ProcessEventKind } from "../../core/adapters/types";
import { notFound } from "../../shared/errors";
import { createPushSseResponse } from "../../shared/sse";
import { GatewayLogger } from "../../shared/gateway-logger";
import { SSE } from "../../config/constants";

const messages = new Hono();

messages.get("/", (c) => {
  const { before, limit } = c.req.query();
  const msgs = MessageRouter.listMessages(c.req.param("conversationId"), {
    before: before || undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  return c.json(msgs);
});

messages.post("/", zValidator("json", z.object({ content: z.string().min(1) })), async (c) => {
  const { content } = c.req.valid("json");
  const convId = c.req.param("conversationId");
  // Non-streaming endpoint: chunks are not forwarded, only the final message is returned.
  const botMsg = await MessageRouter.route(convId, content, (_chunk, _botId) => {});
  return c.json(botMsg, 201);
});

messages.post(
  "/approvals/:approvalId/resolve",
  zValidator("json", z.object({ botId: z.string(), approved: z.boolean() })),
  async (c) => {
    const { botId, approved } = c.req.valid("json");
    const approvalId = c.req.param("approvalId");
    const bot = BotService.findById(botId);
    if (!bot) throw notFound("Bot");

    const adapter = getAdapter(bot.backend_type);
    if (!adapter.resolveApproval) {
      throw new Error("此 Agent 后端不支持审批操作");
    }
    await adapter.resolveApproval(bot.backend_url, bot.backend_token || "", approvalId, approved);

    return c.json({ success: true });
  },
);

// SSE streaming endpoint — streams bot reply using canonical events
// while keeping legacy {chunk}/{done}/{error} frames for backward compat.
// POST (not GET) so long user inputs aren't constrained by URL length limits.
messages.post(
  "/stream",
  zValidator("json", z.object({ content: z.string().min(1) })),
  async (c) => {
    const { content } = c.req.valid("json");
    const convId = c.req.param("conversationId");
    const enc = new TextEncoder();

    const logUrl = "stream://" + convId;
    const abortCtrl = new AbortController();
    const runId = randomUUID();
    const botMsgId = randomUUID();

    let closed = false;
    let seq = 0;
    let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
    let textStarted = false;

    GatewayLogger.logStreamEvent({ phase: "waiting", url: logUrl, conversationId: convId, runId });

    let controller: ReadableStreamDefaultController<Uint8Array>;

    const emitCanonical = (
      event: Omit<CanonicalStreamEvent, "seq" | "ts">,
      eventName?: string,
    ) => {
      if (closed) return;
      seq += 1;
      const fullEvent: CanonicalStreamEvent = {
        ...event,
        seq,
        ts: new Date().toISOString(),
      };
      const id = `${runId}:${seq}`;
      const frame = `${eventName ? `event: ${eventName}\n` : ""}id: ${id}\ndata: ${JSON.stringify(fullEvent)}\n\n`;
      try {
        controller.enqueue(enc.encode(frame));
      } catch {
        closed = true;
      }
    };

    return new Response(
      new ReadableStream({
        async start(ctrl) {
          controller = ctrl;

          const safeEnqueue = (data: string) => {
            if (closed) return;
            try {
              controller.enqueue(enc.encode(data));
            } catch {
              closed = true;
            }
          };

          keepaliveTimer = setInterval(() => {
            safeEnqueue(": keepalive\n\n");
          }, 5000);

          try {
            emitCanonical(
              {
                v: 1,
                type: "message_created",
                runId,
                conversationId: convId,
                messageId: botMsgId,
              },
              "message_created",
            );

            let prevLength = 0;
            const botMsg = await MessageRouter.route(
              convId,
              content,
              (chunk) => {
                const deltaLength = chunk.length - prevLength;
                GatewayLogger.logStreamEvent({
                  phase: "chunk",
                  url: logUrl,
                  conversationId: convId,
                  runId,
                  chunkSeq: seq,
                  chunkLength: deltaLength,
                  totalLength: chunk.length,
                });
                prevLength = chunk.length;

                if (!textStarted) {
                  textStarted = true;
                  emitCanonical(
                    {
                      v: 1,
                      type: "text_start",
                      runId,
                      conversationId: convId,
                      messageId: botMsgId,
                      payload: { text: "" },
                    },
                    "text_start",
                  );
                }
                emitCanonical(
                  {
                    v: 1,
                    type: "text_delta",
                    runId,
                    conversationId: convId,
                    messageId: botMsgId,
                    payload: { text: chunk },
                  },
                  "text_delta",
                );

                // Legacy compat
                safeEnqueue(`data: ${JSON.stringify({ chunk })}\n\n`);
              },
              abortCtrl.signal,
              (event: AgentEvent) => {
                if (event.type === "process") {
                  emitCanonical(
                    {
                      v: 1,
                      type: "process",
                      runId,
                      conversationId: convId,
                      messageId: botMsgId,
                      payload: {
                        kind: event.kind as ProcessEventKind,
                        data: event.payload,
                        rawStream: event.rawStream,
                      },
                    },
                    "process",
                  );
                } else if (event.type === "tool_call" || event.type === "tool_result") {
                  emitCanonical(
                    {
                      v: 1,
                      type: "process",
                      runId,
                      conversationId: convId,
                      messageId: botMsgId,
                      payload: {
                        kind: event.type as ProcessEventKind,
                        data: { ...event } as Record<string, unknown>,
                      },
                    },
                    "process",
                  );
                }

                // Legacy compat event frame
                safeEnqueue(`data: ${JSON.stringify({ type: "event", event })}\n\n`);
              },
              botMsgId,
            );

            if (textStarted) {
              emitCanonical(
                {
                  v: 1,
                  type: "text_end",
                  runId,
                  conversationId: convId,
                  messageId: botMsgId,
                  payload: { text: botMsg.content },
                },
                "text_end",
              );
            }
            emitCanonical(
              {
                v: 1,
                type: "complete",
                runId,
                conversationId: convId,
                messageId: botMsgId,
                payload: { reason: "completed" },
              },
              "complete",
            );

            // Legacy compat done
            GatewayLogger.logStreamEvent({
              phase: "done",
              url: logUrl,
              conversationId: convId,
              runId,
              botMsgId: botMsg.id,
              totalLength: botMsg.content.length,
            });
            safeEnqueue(`data: ${JSON.stringify({ done: true, botMsg })}\n\n`);
          } catch (err) {
            const errStr = String(err);
            if (!abortCtrl.signal.aborted) {
              emitCanonical(
                {
                  v: 1,
                  type: "error",
                  runId,
                  conversationId: convId,
                  messageId: botMsgId,
                  payload: { message: errStr },
                },
                "error",
              );
              // Legacy compat
              GatewayLogger.logStreamEvent({
                phase: "error",
                url: logUrl,
                conversationId: convId,
                runId,
                error: errStr,
              });
              safeEnqueue(`data: ${JSON.stringify({ error: errStr })}\n\n`);
            } else {
              if (textStarted) {
                emitCanonical(
                  {
                    v: 1,
                    type: "text_end",
                    runId,
                    conversationId: convId,
                    messageId: botMsgId,
                    payload: { text: "" },
                  },
                  "text_end",
                );
              }
              emitCanonical(
                {
                  v: 1,
                  type: "complete",
                  runId,
                  conversationId: convId,
                  messageId: botMsgId,
                  payload: { reason: "stopped" },
                },
                "complete",
              );
            }
          } finally {
            if (keepaliveTimer) clearInterval(keepaliveTimer);
            if (!abortCtrl.signal.aborted) {
              GatewayLogger.logStreamEvent({
                phase: "bubble_cleared",
                url: logUrl,
                conversationId: convId,
                runId,
              });
            }
            closed = true;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        },
        cancel() {
          abortCtrl.abort();
          closed = true;
          GatewayLogger.logStreamEvent({
            phase: "error",
            url: logUrl,
            conversationId: convId,
            runId,
            error: "client cancelled stream (browser closed/navigated away)",
          });
        },
      }),
      { headers: SSE.HEADERS },
    );
  },
);

// Push-stream SSE endpoint — long-lived connection for bot-initiated messages
messages.get("/push-stream", (c) => createPushSseResponse(c.req.param("conversationId")));

messages.get("/:msgId", (c) => {
  const msg = MessageRouter.getMessage(c.req.param("msgId"));
  if (!msg) throw notFound("Message");
  return c.json(msg);
});

export default messages;

