import { BotService, type Bot } from "./bot-service";
import { ConversationService } from "./conversation-service";
import { OpenClawProxy } from "./openclaw-proxy";
import { getDb } from "../shared/db";
import { randomUUID } from "crypto";
import { ApiError, notFound } from "../shared/errors";
import { GatewayLogger } from "../shared/gateway-logger";

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: "user" | "bot";
  bot_id: string | null;
  content: string;
  mentioned_bot_id: string | null;
  message_type: string;
  metadata: string | null;
  created_at: string;
}

export const MessageRouter = {
  listMessages(conversationId: string, opts?: { limit?: number; before?: string }): Message[] {
    const db = getDb();
    const limit = opts?.limit ?? 50;

    if (opts?.before) {
      // Cursor-based: fetch messages older than the given message id
      const cursor = db
        .query<Message, [string]>("SELECT created_at FROM messages WHERE id = ?")
        .get(opts.before);
      if (cursor) {
        return db
          .query<
            Message,
            [string, string, number]
          >("SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?")
          .all(conversationId, cursor.created_at, limit)
          .reverse();
      }
    }

    // Default: latest N messages (returned oldest→newest)
    return db
      .query<
        Message,
        [string, number]
      >("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(conversationId, limit)
      .reverse();
  },

  getMessage(msgId: string): Message | null {
    return (
      getDb().query<Message, [string]>("SELECT * FROM messages WHERE id = ?").get(msgId) ?? null
    );
  },

  /** Save user message, determine routing target, forward to OpenClaw, save bot reply. */
  async route(
    conversationId: string,
    userContent: string,
    onChunk: (chunk: string, botId: string) => void,
    signal?: AbortSignal,
  ): Promise<Message> {
    const conv = ConversationService.findById(conversationId);
    if (!conv) throw notFound("Conversation");

    const now = new Date().toISOString();

    // Persist user message
    const userMsgId = randomUUID();
    getDb().run(
      "INSERT INTO messages (id, conversation_id, sender_type, bot_id, content, mentioned_bot_id, created_at) VALUES (?,?,?,?,?,?,?)",
      [userMsgId, conversationId, "user", null, userContent, null, now],
    );
    GatewayLogger.logMessageRoute({
      phase: "received",
      conversationId,
      conversationType: conv.type,
      userMsgId,
      userContentLength: userContent.length,
    });

    // Determine target bot
    const mentionMatch = userContent.match(/@(\S+)/);
    let targetBot: Bot | null = null;
    let mentionedBotId: string | null = null;

    if (mentionMatch) {
      const mentionName = mentionMatch[1].toLowerCase();
      const cbots = conv.bots;
      for (const cb of cbots) {
        const bot = BotService.findById(cb.bot_id);
        if (bot && bot.name.toLowerCase() === mentionName) {
          targetBot = bot;
          mentionedBotId = bot.id;
          break;
        }
      }
    }

    if (!targetBot) {
      // Route to primary bot
      const primaryCb = conv.bots.find((b) => b.is_primary === 1);
      if (primaryCb) targetBot = BotService.findById(primaryCb.bot_id);
    }

    if (!targetBot)
      throw new ApiError(
        422,
        "No active bot found for this conversation — the bot may have been deleted",
      );

    // Build context injection for group chats
    let enrichedContent = userContent;
    if (conv.type === "group") {
      const otherBots = conv.bots
        .filter((cb) => cb.bot_id !== targetBot!.id)
        .map((cb) => BotService.findById(cb.bot_id))
        .filter((b): b is Bot => b !== null);

      if (otherBots.length > 0) {
        const ctxLines = otherBots
          .map((b) => `- @${b.name}: ${b.description || b.name}`)
          .join("\n");
        enrichedContent = `[群聊上下文] 当前群聊中还有以下 Bot 可以协作：\n${ctxLines}\n如需协作，请在回复中使用 @BotName。\n\n${userContent}`;
      }
    }

    // Forward to OpenClaw and collect reply
    const normalizedAgentId =
      (targetBot.openclaw_agent_id ?? "main").trim().toLowerCase() || "main";
    // Gateway expects sessionKey in `agent:{agentId}:{sessionId}` shape for agent binding.
    const gatewaySessionKey = `agent:${normalizedAgentId}:${conversationId}`;
    let replyContent = "";
    GatewayLogger.logMessageRoute({
      phase: "target_selected",
      conversationId,
      conversationType: conv.type,
      userMsgId,
      targetBotId: targetBot.id,
      targetBotName: targetBot.name,
      targetBotUrl: targetBot.openclaw_ws_url,
      agentId: normalizedAgentId,
      sessionKey: gatewaySessionKey,
      mentionedBotId,
      userContentLength: userContent.length,
      enrichedContentLength: enrichedContent.length,
    });
    try {
      await OpenClawProxy.sendMessage(
        targetBot.openclaw_ws_url,
        targetBot.openclaw_ws_token ?? undefined,
        normalizedAgentId,
        enrichedContent,
        (chunk) => {
          // Gateway pushes accumulated text (not deltas), so each chunk is the
          // full content up to that point. Assign instead of append to avoid
          // concatenating repeated prefixes into the final stored message.
          replyContent = chunk;
          onChunk(chunk, targetBot!.id);
        },
        gatewaySessionKey, // explicit gateway session key keeps agent binding consistent
        signal,
      );
    } catch (err) {
      GatewayLogger.logMessageRoute({
        phase: "error",
        conversationId,
        conversationType: conv.type,
        userMsgId,
        targetBotId: targetBot.id,
        targetBotName: targetBot.name,
        targetBotUrl: targetBot.openclaw_ws_url,
        agentId: normalizedAgentId,
        sessionKey: gatewaySessionKey,
        mentionedBotId,
        userContentLength: userContent.length,
        enrichedContentLength: enrichedContent.length,
        error: String(err),
      });
      throw err;
    }

    // Persist bot reply
    const botMsgId = randomUUID();
    const botNow = new Date().toISOString();
    getDb().run(
      "INSERT INTO messages (id, conversation_id, sender_type, bot_id, content, mentioned_bot_id, created_at) VALUES (?,?,?,?,?,?,?)",
      [botMsgId, conversationId, "bot", targetBot.id, replyContent, mentionedBotId, botNow],
    );

    // Touch conversation updated_at
    getDb().run("UPDATE conversations SET updated_at = ? WHERE id = ?", [botNow, conversationId]);

    // Do NOT broadcast here. The /stream endpoint is an active user-initiated
    // request: the frontend useSendMessageStream reads the streaming SSE
    // directly and writes the bot reply into the React Query cache.
    // Broadcasting would create a duplicate write via usePushStream and cause
    // a race condition that drops the message bubble on slow Gateway responses.

    GatewayLogger.logMessageRoute({
      phase: "completed",
      conversationId,
      conversationType: conv.type,
      userMsgId,
      targetBotId: targetBot.id,
      targetBotName: targetBot.name,
      targetBotUrl: targetBot.openclaw_ws_url,
      agentId: normalizedAgentId,
      sessionKey: gatewaySessionKey,
      mentionedBotId,
      botReplyLength: replyContent.length,
    });

    return {
      id: botMsgId,
      conversation_id: conversationId,
      sender_type: "bot",
      bot_id: targetBot.id,
      content: replyContent,
      mentioned_bot_id: mentionedBotId,
      created_at: botNow,
    };
  },
};
