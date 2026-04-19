import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { MessageRouter } from "../../core/message-router";
import { BotService } from "../../core/bot-service";
import { getAdapter } from "../../core/adapters/registry";
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
    await adapter.resolveApproval(
      bot.backend_url,
      bot.backend_token || "",
      approvalId,
      approved,
    );

    return c.json({ success: true });
  },
);

// SSE streaming endpoint — streams bot reply chunks as they arrive
messages.get("/stream", async (c) => {
  const { content } = c.req.query();
  if (!content) return c.json({ error: "content query param required" }, 400);
  const convId = c.req.param("conversationId");
  const enc = new TextEncoder();

  // We need the bot's WS URL for stream_event logs. Resolve it lazily inside
  // the stream (MessageRouter.route determines the target bot).
  // Use a placeholder for now; ws-adapter logUserMessage already has the URL.
  const logUrl = "stream://" + convId;

  // AbortController lets cancel() interrupt the in-flight route() / WS run.
  const abortCtrl = new AbortController();

  let closed = false;
  let chunkSeq = 0;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

  GatewayLogger.logStreamEvent({ phase: "waiting", url: logUrl, conversationId: convId });

  return new Response(
    new ReadableStream({
      async start(controller) {
        const safeEnqueue = (data: string) => {
          if (closed) return;
          try {
            controller.enqueue(enc.encode(data));
          } catch {
            closed = true;
          }
        };

        // Send keepalive ping to prevent Tauri webview timeout (which happens after ~8-10s of silence)
        keepaliveTimer = setInterval(() => {
          safeEnqueue(": keepalive\n\n");
        }, 5000);

        try {
          // Gateway sends accumulated text in each chunk (not a delta).
          // chunk.length == total chars received so far.
          let prevLength = 0;
          const botMsg = await MessageRouter.route(
            convId,
            content,
            (chunk) => {
              chunkSeq += 1;
              const deltaLength = chunk.length - prevLength;
              GatewayLogger.logStreamEvent({
                phase: "chunk",
                url: logUrl,
                conversationId: convId,
                chunkSeq,
                // deltaLength: new chars in this chunk (Gateway sends accumulated text)
                chunkLength: deltaLength,
                // totalLength: accumulated text length so far
                totalLength: chunk.length,
              });
              prevLength = chunk.length;
              safeEnqueue(`data: ${JSON.stringify({ chunk })}\n\n`);
            },
            abortCtrl.signal,
          );

          // Send the real bot message record before [DONE] so the frontend can
          // write it directly into the React Query cache without waiting for a
          // full refetch round-trip. This eliminates the flash of missing bot
          // reply between stream-end and invalidateQueries completing.
          GatewayLogger.logStreamEvent({
            phase: "done",
            url: logUrl,
            conversationId: convId,
            botMsgId: botMsg.id,
            totalLength: botMsg.content.length,
          });
          safeEnqueue(`data: ${JSON.stringify({ done: true, botMsg })}\n\n`);
        } catch (err) {
          const errStr = String(err);
          // Do not forward abort errors to the client — the client already left.
          if (!abortCtrl.signal.aborted) {
            GatewayLogger.logStreamEvent({
              phase: "error",
              url: logUrl,
              conversationId: convId,
              error: errStr,
            });
            safeEnqueue(`data: ${JSON.stringify({ error: errStr })}\n\n`);
          }
        } finally {
          if (keepaliveTimer) clearInterval(keepaliveTimer);
          // bubble_cleared = streaming bubble on the frontend will be dismissed.
          // Only log when the stream completed normally (not cancelled).
          if (!abortCtrl.signal.aborted) {
            GatewayLogger.logStreamEvent({
              phase: "bubble_cleared",
              url: logUrl,
              conversationId: convId,
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
        // Browser closed tab / navigated away — abort the in-flight WS run
        // so we don't keep waiting 120s and then silently discard everything.
        abortCtrl.abort();
        closed = true;
        GatewayLogger.logStreamEvent({
          phase: "error",
          url: logUrl,
          conversationId: convId,
          error: "client cancelled stream (browser closed/navigated away)",
        });
      },
    }),
    { headers: SSE.HEADERS },
  );
});

// Push-stream SSE endpoint — long-lived connection for bot-initiated messages
messages.get("/push-stream", (c) => createPushSseResponse(c.req.param("conversationId")));

messages.get("/:msgId", (c) => {
  const msg = MessageRouter.getMessage(c.req.param("msgId"));
  if (!msg) throw notFound("Message");
  return c.json(msg);
});

export default messages;
