/**
 * PushRelay — handles bot-initiated (push) messages from the OpenClaw Gateway.
 *
 * Flow:
 *   Gateway WS push event
 *     → OpenClawProxy.onPushMessage callback (sessionId = conversationId)
 *     → PushRelay.handlePush()
 *         → persist message to DB
 *         → broadcast SSE event to all clients subscribed to that conversationId
 */

import { randomUUID } from 'crypto';
import { getDb } from '../shared/db';

type SseController = ReadableStreamDefaultController<Uint8Array>;

const enc = new TextEncoder();

/** Active SSE subscribers keyed by conversationId */
const sseClients = new Map<string, Set<SseController>>();

export const PushRelay = {
  /**
   * Register an SSE controller for a conversation.
   * Returns a cleanup function to call when the connection closes.
   */
  registerClient(conversationId: string, ctrl: SseController): () => void {
    let set = sseClients.get(conversationId);
    if (!set) {
      set = new Set();
      sseClients.set(conversationId, set);
    }
    set.add(ctrl);

    return () => {
      set!.delete(ctrl);
      if (set!.size === 0) sseClients.delete(conversationId);
    };
  },

  /**
   * Handle an incoming bot-initiated push message.
   *
   * The Gateway sets sessionId = conversationId (see openclaw-proxy.ts sendMessage).
   * When a push run arrives, sessionId is whatever the Gateway stored for that run;
   * for bots this app connected, it equals the conversationId passed at send time.
   *
   * If the sessionId doesn't match any conversation we manage, the message is dropped.
   */
  handlePush(sessionId: string, botId: string, content: string): void {
    if (!sessionId || !content) return;

    // sessionId IS the conversationId for connections made by this app
    const conversationId = sessionId;

    const conv = getDb()
      .query<{ id: string }, [string]>('SELECT id FROM conversations WHERE id = ?')
      .get(conversationId);

    if (!conv) return; // push from an unknown/unmanaged conversation — ignore

    const msgId = randomUUID();
    const now = new Date().toISOString();

    getDb().run(
      'INSERT INTO messages (id, conversation_id, sender_type, bot_id, content, mentioned_bot_id, created_at) VALUES (?,?,?,?,?,?,?)',
      [msgId, conversationId, 'bot', botId || null, content, null, now],
    );

    getDb().run('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId]);

    // Broadcast to all SSE subscribers for this conversation
    const payload = enc.encode(`data: ${JSON.stringify({ msgId, conversationId })}\n\n`);
    const clients = sseClients.get(conversationId);
    if (clients) {
      for (const ctrl of clients) {
        try {
          ctrl.enqueue(payload);
        } catch {
          // Controller may already be closed; subscriber cleanup handles removal
        }
      }
    }
  },
};
