import { BotService, type Bot } from './bot-service';
import { ConversationService } from './conversation-service';
import { OpenClawProxy } from './openclaw-proxy';
import { getDb } from '../shared/db';
import { randomUUID } from 'crypto';

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'user' | 'bot';
  bot_id: string | null;
  content: string;
  mentioned_bot_id: string | null;
  created_at: string;
}

export const MessageRouter = {
  listMessages(conversationId: string): Message[] {
    return getDb()
      .query<Message, [string]>(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      )
      .all(conversationId);
  },

  /** Save user message, determine routing target, forward to OpenClaw, save bot reply. */
  async route(
    conversationId: string,
    userContent: string,
    onChunk: (chunk: string, botId: string) => void,
  ): Promise<Message> {
    const conv = ConversationService.findById(conversationId);
    if (!conv) throw new Error('Conversation not found');

    const now = new Date().toISOString();

    // Persist user message
    const userMsgId = randomUUID();
    getDb().run(
      'INSERT INTO messages (id, conversation_id, sender_type, bot_id, content, mentioned_bot_id, created_at) VALUES (?,?,?,?,?,?,?)',
      [userMsgId, conversationId, 'user', null, userContent, null, now],
    );

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

    if (!targetBot) throw new Error('No target bot found for conversation');

    // Build context injection for group chats
    let enrichedContent = userContent;
    if (conv.type === 'group') {
      const otherBots = conv.bots
        .filter((cb) => cb.bot_id !== targetBot!.id)
        .map((cb) => BotService.findById(cb.bot_id))
        .filter((b): b is Bot => b !== null);

      if (otherBots.length > 0) {
        const ctxLines = otherBots
          .map((b) => `- @${b.name}: ${b.description || b.name}`)
          .join('\n');
        enrichedContent = `[群聊上下文] 当前群聊中还有以下 Bot 可以协作：\n${ctxLines}\n如需协作，请在回复中使用 @BotName。\n\n${userContent}`;
      }
    }

    // Forward to OpenClaw and collect reply
    let replyContent = '';
    await OpenClawProxy.sendMessage(
      targetBot.openclaw_ws_url,
      targetBot.openclaw_ws_token ?? undefined,
      enrichedContent,
      (chunk) => {
        replyContent += chunk;
        onChunk(chunk, targetBot!.id);
      },
    );

    // Persist bot reply
    const botMsgId = randomUUID();
    const botNow = new Date().toISOString();
    getDb().run(
      'INSERT INTO messages (id, conversation_id, sender_type, bot_id, content, mentioned_bot_id, created_at) VALUES (?,?,?,?,?,?,?)',
      [botMsgId, conversationId, 'bot', targetBot.id, replyContent, mentionedBotId, botNow],
    );

    // Touch conversation updated_at
    getDb().run('UPDATE conversations SET updated_at = ? WHERE id = ?', [botNow, conversationId]);

    return {
      id: botMsgId,
      conversation_id: conversationId,
      sender_type: 'bot',
      bot_id: targetBot.id,
      content: replyContent,
      mentioned_bot_id: mentionedBotId,
      created_at: botNow,
    };
  },
};
