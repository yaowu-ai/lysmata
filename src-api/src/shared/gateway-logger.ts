/**
 * GatewayLogger — writes all OpenClaw Gateway WebSocket traffic to a
 * NDJSON log file (one JSON object per line) for debugging and inspection.
 *
 * Log file: logs/gateway.log  (configurable via GATEWAY_LOG_PATH env var)
 *
 * Tail the log in real-time:
 *   tail -f logs/gateway.log | jq .
 *   tail -f logs/gateway.log        # raw NDJSON, no jq needed
 *
 * Each line is a JSON object with these common fields:
 *   ts        ISO-8601 timestamp
 *   dir       "IN" | "OUT" | "SYS"
 *   url       Gateway URL
 *   type      frame type ("event" | "req" | "res") or system category
 *   [event]   event name for type=event frames
 *   [method]  RPC method for type=req frames
 *   [ok]      boolean for type=res frames
 *   payload   full payload / params for easy inspection
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { GATEWAY_LOG_PATH } from '../config';

// ── Initialise log directory ──────────────────────────────────────────────────

let logEnabled = false;

if (GATEWAY_LOG_PATH) {
  try {
    const dir = dirname(GATEWAY_LOG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    logEnabled = true;
    // Write a startup marker so the file always has a clear boundary
    appendFileSync(
      GATEWAY_LOG_PATH,
      JSON.stringify({ ts: new Date().toISOString(), dir: 'SYS', type: 'startup', message: 'Gateway logger initialised', logFile: GATEWAY_LOG_PATH }) + '\n',
    );
  } catch (err) {
    console.warn('[gateway-logger] Could not open log file, logging disabled:', err);
  }
}

// ── Internal write helper ─────────────────────────────────────────────────────

function write(entry: Record<string, unknown>): void {
  if (!logEnabled) return;
  try {
    appendFileSync(GATEWAY_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch {
    // Silently ignore write errors to avoid crashing the application
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const GatewayLogger = {
  /** Log a raw incoming WebSocket frame */
  logIncoming(url: string, raw: string): void {
    try {
      const frame = JSON.parse(raw);
      const entry: Record<string, unknown> = {
        ts: new Date().toISOString(),
        dir: 'IN',
        url,
        type: frame.type,
      };
      if (frame.type === 'event') {
        entry.event = frame.event;
        entry.seq = frame.seq;
        entry.stateVersion = frame.stateVersion;
        entry.payload = frame.payload;
      } else if (frame.type === 'res') {
        entry.id = frame.id;
        entry.ok = frame.ok;
        entry.payload = frame.payload;
        entry.error = frame.error;
      } else {
        entry.raw = frame;
      }
      write(entry);
    } catch {
      // Unparseable frame — log raw string
      write({ ts: new Date().toISOString(), dir: 'IN', url, type: 'raw', data: raw });
    }
  },

  /** Log a raw outgoing WebSocket frame */
  logOutgoing(url: string, frame: object): void {
    const f = frame as Record<string, unknown>;
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      dir: 'OUT',
      url,
      type: f.type,
    };
    if (f.type === 'req') {
      entry.id = f.id;
      entry.method = f.method;
      // Omit full params for agent calls to avoid flooding the log with message content
      if (f.method === 'agent') {
        const p = f.params as Record<string, unknown> | undefined;
        entry.params = { agentId: p?.agentId, sessionKey: p?.sessionKey, idempotencyKey: p?.idempotencyKey };
      } else {
        entry.params = f.params;
      }
    } else {
      entry.raw = f;
    }
    write(entry);
  },

  /** Log a resolved PushEvent after handleEvent() maps it to our internal type */
  logPushEvent(url: string, eventType: string, details: Record<string, unknown>): void {
    write({
      ts: new Date().toISOString(),
      dir: 'IN',
      url,
      type: 'push_event',
      event: eventType,
      ...details,
    });
  },

  /**
   * Log a user-to-Bot message dispatch (OUT direction).
   * Written just before the agent RPC frame is enqueued so the log entry
   * appears immediately before the corresponding OUT req frame.
   */
  logUserMessage(opts: {
    url: string;
    agentId: string;
    sessionKey: string | undefined;
    conversationId: string | undefined;
    content: string;
    idempotencyKey: string;
  }): void {
    write({
      ts: new Date().toISOString(),
      dir: 'OUT',
      url: opts.url,
      type: 'user_message',
      agentId: opts.agentId,
      sessionKey: opts.sessionKey,
      conversationId: opts.conversationId,
      idempotencyKey: opts.idempotencyKey,
      contentLength: opts.content.length,
      content: opts.content,
    });
  },

  /**
   * Log streaming bubble lifecycle events (sidecar-level, not WS-level).
   * These entries bridge the gap between WS agent events and the HTTP SSE
   * stream seen by the frontend — useful for diagnosing "message bubble vanished" issues.
   *
   * phase values:
   *   "waiting"  — /stream request received, waiting for Gateway to accept
   *   "accepted" — Gateway returned runId (agent RPC ok)
   *   "chunk"    — first or subsequent assistant text received
   *   "done"     — lifecycle.end received, bot message persisted
   *   "error"    — any error (RPC failed, stream timeout, etc.)
   *   "bubble_cleared" — done frame sent to frontend, streaming bubble will be cleared
   */
  logStreamEvent(opts: {
    phase: 'waiting' | 'accepted' | 'chunk' | 'done' | 'error' | 'bubble_cleared';
    url: string;
    conversationId: string;
    runId?: string;
    chunkSeq?: number;
    chunkLength?: number;
    totalLength?: number;
    botMsgId?: string;
    error?: string;
  }): void {
    write({
      ts: new Date().toISOString(),
      dir: 'SYS',
      url: opts.url,
      type: 'stream_event',
      phase: opts.phase,
      conversationId: opts.conversationId,
      ...(opts.runId !== undefined && { runId: opts.runId }),
      ...(opts.chunkSeq !== undefined && { chunkSeq: opts.chunkSeq }),
      ...(opts.chunkLength !== undefined && { chunkLength: opts.chunkLength }),
      ...(opts.totalLength !== undefined && { totalLength: opts.totalLength }),
      ...(opts.botMsgId !== undefined && { botMsgId: opts.botMsgId }),
      ...(opts.error !== undefined && { error: opts.error }),
    });
  },

  /** Log a system-level connection lifecycle event (connect, disconnect, error) */
  logSystem(url: string, message: string, extra?: Record<string, unknown>): void {
    write({
      ts: new Date().toISOString(),
      dir: 'SYS',
      url,
      type: 'lifecycle',
      message,
      ...extra,
    });
  },
};
