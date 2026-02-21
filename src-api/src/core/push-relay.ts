/**
 * PushRelay — routes all Gateway push events to the appropriate SSE channel.
 *
 * Routing rules:
 *   Global events  → 'global' SSE channel  (health, presence, heartbeat, shutdown,
 *                                            node_pair_*, cron, tick, system_presence)
 *   Session events → conversation SSE channel (message, approval, chat,
 *                                               exec_finished, exec_denied)
 *
 * Flow:
 *   Gateway WS push event
 *     → connection-pool handleEvent() → PushEvent discriminated union
 *     → OpenClawProxy / openclaw-proxy.ts setPushHandler callback
 *     → PushRelay.handlePush()
 *         → (optional) persist to DB
 *         → broadcast SSE event to subscribers
 */

import { randomUUID } from 'crypto';
import { getDb } from '../shared/db';
import type { PushEvent } from './openclaw-proxy';

type SseController = ReadableStreamDefaultController<Uint8Array>;

const enc = new TextEncoder();

/** Active SSE subscribers keyed by channelId (conversationId or 'global') */
const sseClients = new Map<string, Set<SseController>>();

/** Encode a JSON payload as an SSE data frame */
function sseFrame(payload: unknown): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Broadcast a payload to every subscriber on a given channel */
function broadcast(channelId: string, payload: unknown): void {
  const clients = sseClients.get(channelId);
  if (!clients) return;
  const frame = sseFrame(payload);
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(frame);
    } catch {
      // Controller already closed; subscriber cleanup handles removal
    }
  }
}

/** Check that a conversationId is known to our database */
function convExists(conversationId: string): boolean {
  return !!getDb()
    .query<{ id: string }, [string]>('SELECT id FROM conversations WHERE id = ?')
    .get(conversationId);
}

/** Persist a message row and update conversation timestamp */
function persistMessage(opts: {
  conversationId: string;
  botId: string | null;
  content: string;
  messageType: 'text' | 'approval' | 'system_event';
  metadata: string | null;
}): string {
  const msgId = randomUUID();
  const now = new Date().toISOString();
  getDb().run(
    'INSERT INTO messages (id, conversation_id, sender_type, bot_id, content, mentioned_bot_id, message_type, metadata, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [msgId, opts.conversationId, 'bot', opts.botId, opts.content, null, opts.messageType, opts.metadata, now],
  );
  getDb().run('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, opts.conversationId]);
  return msgId;
}

export const PushRelay = {
  /**
   * Register an SSE controller for a channel.
   * Returns a cleanup function to call when the connection closes.
   */
  registerClient(channelId: string, ctrl: SseController): () => void {
    let set = sseClients.get(channelId);
    if (!set) {
      set = new Set();
      sseClients.set(channelId, set);
    }
    set.add(ctrl);

    return () => {
      set!.delete(ctrl);
      if (set!.size === 0) sseClients.delete(channelId);
    };
  },

  /**
   * Handle any incoming Gateway PushEvent.
   *
   * @param event  The typed PushEvent from the connection pool
   * @param botId  The Bot ID that owns the Gateway connection
   */
  handlePush(event: PushEvent, botId: string): void {
    switch (event.type) {
      // ── Global events (no session context) ──────────────────────────────

      case 'tick':
        // Keep-alive pulse — emit to global channel for optional liveness monitoring
        broadcast('global', { type: 'tick', botId });
        return;

      case 'system_presence':
        broadcast('global', { type: 'system_presence', botId, metadata: event.metadata });
        return;

      case 'presence':
        broadcast('global', { type: 'presence', botId, payload: event.payload });
        return;

      case 'health':
        broadcast('global', { type: 'health', botId, payload: event.payload });
        return;

      case 'heartbeat':
        broadcast('global', { type: 'heartbeat', botId, payload: event.payload });
        return;

      case 'shutdown':
        broadcast('global', { type: 'shutdown', botId });
        return;

      case 'node_pair_requested':
        broadcast('global', { type: 'node_pair_requested', botId, payload: event.payload });
        return;

      case 'node_pair_resolved':
        broadcast('global', { type: 'node_pair_resolved', botId, payload: event.payload });
        return;

      case 'cron': {
        broadcast('global', { type: 'cron', botId, payload: event.payload });

        const { action, summary } = event.payload;
        if (action === 'finished' && typeof summary === 'string' && summary.trim()) {
          const rows = getDb()
            .query<{ conversation_id: string }, [string]>(
              'SELECT conversation_id FROM conversation_bots WHERE bot_id = ?',
            )
            .all(botId);

          for (const { conversation_id } of rows) {
            if (!convExists(conversation_id)) continue;
            const msgId = persistMessage({
              conversationId: conversation_id,
              botId: botId || null,
              content: summary,
              messageType: 'system_event',
              metadata: JSON.stringify(event.payload),
            });
            broadcast(conversation_id, { msgId, conversationId: conversation_id, type: 'cron' });
          }
        }
        return;
      }

      // ── Session / conversation events ────────────────────────────────────

      case 'message': {
        const { sessionId, agentId, content } = event;
        if (!sessionId || !content) return;
        const conversationId = sessionId;
        if (!convExists(conversationId)) return;

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content,
          messageType: 'text',
          metadata: agentId ? JSON.stringify({ agentId }) : null,
        });

        broadcast(conversationId, { msgId, conversationId, type: 'message' });
        return;
      }

      case 'approval': {
        const { sessionId, metadata } = event;
        if (!sessionId) return;
        const conversationId = sessionId;
        if (!convExists(conversationId)) return;

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content: '需要执行审批',
          messageType: 'approval',
          metadata: JSON.stringify(metadata ?? {}),
        });

        broadcast(conversationId, { msgId, conversationId, type: 'approval' });
        return;
      }

      case 'chat': {
        // Cross-platform chat message arriving on a known session
        const sessionId = event.payload.sessionKey;
        if (!sessionId) {
          // No session context — broadcast to global for informational purposes
          broadcast('global', { type: 'chat', payload: event.payload });
          return;
        }
        const conversationId = sessionId;
        if (!convExists(conversationId)) {
          broadcast('global', { type: 'chat', payload: event.payload });
          return;
        }

        const content =
          typeof event.payload.message === 'string'
            ? event.payload.message
            : JSON.stringify(event.payload.message ?? '');

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content,
          messageType: 'text',
          metadata: JSON.stringify({ from: event.payload.from, raw: event.payload }),
        });

        broadcast(conversationId, { msgId, conversationId, type: 'chat' });
        return;
      }

      case 'exec_finished': {
        const { sessionId, payload } = event;
        if (!sessionId) {
          broadcast('global', { type: 'exec_finished', payload });
          return;
        }
        const conversationId = sessionId;
        if (!convExists(conversationId)) {
          broadcast('global', { type: 'exec_finished', payload });
          return;
        }

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content: '命令执行完成',
          messageType: 'system_event',
          metadata: JSON.stringify(payload),
        });

        broadcast(conversationId, { msgId, conversationId, type: 'exec_finished', payload });
        return;
      }

      case 'exec_denied': {
        const { sessionId, payload } = event;
        if (!sessionId) {
          broadcast('global', { type: 'exec_denied', payload });
          return;
        }
        const conversationId = sessionId;
        if (!convExists(conversationId)) {
          broadcast('global', { type: 'exec_denied', payload });
          return;
        }

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content: `命令执行被拒绝${payload.reason ? `：${payload.reason}` : ''}`,
          messageType: 'system_event',
          metadata: JSON.stringify(payload),
        });

        broadcast(conversationId, { msgId, conversationId, type: 'exec_denied', payload });
        return;
      }
    }
  },
};
