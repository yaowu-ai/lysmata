/**
 * PushRelay — routes all backend push events to the appropriate SSE channel.
 *
 * Routing rules:
 *   Global events  → 'global' SSE channel  (status, shutdown, tick, cron)
 *   Session events → conversation SSE channel (message, approval, chat,
 *                                               tool_call, tool_result,
 *                                               exec_finished, exec_denied)
 *
 * Flow:
 *   Backend push event (OpenClaw WS, Hermes SSE, etc.)
 *     → AgentAdapter.setPushHandler() → translates to AgentEvent
 *     → PushRelay.handlePush()
 *         → (optional) persist to DB
 *         → broadcast SSE event to subscribers
 */

import { randomUUID } from 'crypto';
import { getDb } from '../shared/db';
import type { AgentEvent } from './adapters/types';

type SseController = ReadableStreamDefaultController<Uint8Array>;

const enc = new TextEncoder();

/** Active SSE subscribers keyed by channelId (conversationId or 'global') */
const sseClients = new Map<string, Set<SseController>>();

/** Encode a JSON payload as an SSE data frame */
function sseFrame(payload: unknown): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Broadcast a payload to every subscriber on a given channel */
export function broadcast(channelId: string, payload: unknown): void {
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

function withCanonicalCompat<T extends Record<string, unknown>>(
  payload: T,
  eventType?: string,
  runId?: string,
  seq?: number,
): T & { eventType?: string; runId?: string; seq?: number } {
  return {
    ...payload,
    eventType,
    runId,
    seq,
  };
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
   * Handle any incoming AgentEvent from any backend adapter.
   *
   * @param event  The backend-agnostic AgentEvent
   * @param botId  The Bot ID that owns the connection
   */
  handlePush(event: AgentEvent, botId: string): void {
    switch (event.type) {
      // ── Global events (no session context) ──────────────────────────────

      case 'tick':
        broadcast('global', withCanonicalCompat({ type: 'tick', botId }, 'tick'));
        return;

      case 'status':
        broadcast(
          'global',
          withCanonicalCompat(
            { type: 'status', botId, health: event.health, presence: event.presence, heartbeat: event.heartbeat },
            'status',
          ),
        );
        return;

      case 'shutdown':
        broadcast('global', withCanonicalCompat({ type: 'shutdown', botId }, 'shutdown'));
        return;

      case 'cron': {
        broadcast('global', withCanonicalCompat({ type: 'cron', botId, action: event.action, summary: event.summary }, 'cron'));

        if (event.action === 'finished' && typeof event.summary === 'string' && event.summary.trim()) {
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
              content: event.summary,
              messageType: 'system_event',
              metadata: JSON.stringify({ action: event.action, summary: event.summary }),
            });
            broadcast(
              conversation_id,
              withCanonicalCompat({ msgId, conversationId: conversation_id, type: 'cron' }, 'cron'),
            );
          }
        }
        return;
      }

      // ── Session / conversation events ────────────────────────────────────

      case 'message': {
        const { sessionId, content } = event;
        if (!sessionId || !content) return;
        const conversationId = sessionId;
        if (!convExists(conversationId)) return;

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content,
          messageType: 'text',
          metadata: event.from ? JSON.stringify({ from: event.from }) : null,
        });

        broadcast(conversationId, withCanonicalCompat({ msgId, conversationId, type: 'message' }, 'message'));
        return;
      }

      case 'approval': {
        const { sessionId, approvalId, metadata } = event;
        if (!sessionId) return;
        const conversationId = sessionId;
        if (!convExists(conversationId)) return;

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content: '需要执行审批',
          messageType: 'approval',
          metadata: JSON.stringify({ id: approvalId, ...metadata }),
        });

        broadcast(conversationId, withCanonicalCompat({ msgId, conversationId, type: 'approval' }, 'approval'));
        return;
      }

      case 'tool_call': {
        const { sessionId, toolName, args, callId } = event;
        if (!sessionId) return;
        const conversationId = sessionId;
        if (!convExists(conversationId)) return;

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content: `调用工具: ${toolName}`,
          messageType: 'tool_call',
          metadata: JSON.stringify({ toolName, args, callId }),
        });

        broadcast(
          conversationId,
          withCanonicalCompat({ msgId, conversationId, type: 'tool_call', toolName, callId }, 'tool_call'),
        );
        return;
      }

      case 'tool_result': {
        const { sessionId, callId, result, error } = event;
        if (!sessionId) return;
        const conversationId = sessionId;
        if (!convExists(conversationId)) return;

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content: error ? `工具执行失败: ${error}` : '工具执行完成',
          messageType: 'tool_result',
          metadata: JSON.stringify({ callId, result, error }),
        });

        broadcast(
          conversationId,
          withCanonicalCompat({ msgId, conversationId, type: 'tool_result', callId }, 'tool_result'),
        );
        return;
      }

      case 'exec_finished': {
        const { sessionId, result } = event;
        if (!sessionId) {
          broadcast('global', withCanonicalCompat({ type: 'exec_finished', result }, 'exec_finished'));
          return;
        }
        const conversationId = sessionId;
        if (!convExists(conversationId)) {
          broadcast('global', withCanonicalCompat({ type: 'exec_finished', result }, 'exec_finished'));
          return;
        }

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content: '命令执行完成',
          messageType: 'system_event',
          metadata: JSON.stringify(result),
        });

        broadcast(
          conversationId,
          withCanonicalCompat({ msgId, conversationId, type: 'exec_finished', result }, 'exec_finished'),
        );
        return;
      }

      case 'process':
        // Phase 2: process events are forwarded on /stream in active runs.
        // Push channel keeps current behavior and ignores these events for now.
        return;

      case 'exec_denied': {
        const { sessionId, reason } = event;
        if (!sessionId) {
          broadcast('global', withCanonicalCompat({ type: 'exec_denied', reason }, 'exec_denied'));
          return;
        }
        const conversationId = sessionId;
        if (!convExists(conversationId)) {
          broadcast('global', withCanonicalCompat({ type: 'exec_denied', reason }, 'exec_denied'));
          return;
        }

        const msgId = persistMessage({
          conversationId,
          botId: botId || null,
          content: `命令执行被拒绝${reason ? `：${reason}` : ''}`,
          messageType: 'system_event',
          metadata: JSON.stringify({ reason }),
        });

        broadcast(
          conversationId,
          withCanonicalCompat({ msgId, conversationId, type: 'exec_denied', reason }, 'exec_denied'),
        );
        return;
      }
    }
  },
};