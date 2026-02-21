// ── Connection Pool ─────────────────────────────────────────────────────────

import { randomUUID } from 'crypto';
import { GATEWAY } from '../../config/constants';
import type { PoolEntry, GatewayFrame, GatewayEvent, GatewayResponse, PushEvent } from './types';

export const pool = new Map<string, PoolEntry>();

/**
 * Persistent registry of push handlers keyed by gateway URL.
 * Handlers are applied automatically whenever a new WS connection is created
 * (including reconnects), so wirePushHandlers() can safely be called at
 * startup before any pool entry exists.
 */
export const pushHandlerRegistry = new Map<
  string,
  (event: PushEvent) => void
>();

export function sendFrame(ws: WebSocket, frame: object): void {
  ws.send(JSON.stringify(frame));
}

export function handleFrame(entry: PoolEntry, data: string): void {
  let frame: GatewayFrame;
  try {
    frame = JSON.parse(data);
  } catch {
    return;
  }

  if (frame.type === 'res') {
    const res = frame as GatewayResponse;
    const resolver = entry.pendingRequests.get(res.id);
    if (resolver) {
      entry.pendingRequests.delete(res.id);
      resolver(res);
    }
    return;
  }

  if (frame.type === 'event') {
    handleEvent(entry, frame as GatewayEvent);
  }
}

export function handleEvent(entry: PoolEntry, ev: GatewayEvent): void {
  if (ev.event === 'connect.challenge') return; // handled inside connectWS

  if (ev.event === 'exec.approval.requested') {
    if (entry.onPushEvent) {
      entry.onPushEvent({
        type: 'approval',
        sessionId: ev.payload?.sessionKey as string | undefined,
        agentId: ev.payload?.agentId as string | undefined,
        metadata: ev.payload,
      });
    }
    return;
  }

  if (ev.event === 'system-presence') {
    if (entry.onPushEvent) {
      entry.onPushEvent({
        type: 'system_presence',
        metadata: ev.payload,
      });
    }
    return;
  }

  // Gateway broadcasts all agent streaming events under the single event name "agent".
  // The `stream` field inside the payload indicates the stream type:
  //   "assistant"  — accumulated text in payload.data.text
  //   "lifecycle"  — run state change in payload.data.phase ("end" | "error")
  // Source: src/infra/agent-events.ts + src/gateway/server-chat.ts
  if (ev.event !== 'agent') return;

  const payload = ev.payload ?? {};
  const runId = payload.runId as string | undefined;
  if (!runId) return;

  const stream = payload.stream as string | undefined;
  const data = payload.data as Record<string, unknown> | undefined;

  const run = entry.activeRuns.get(runId);

  if (run) {
    // ── Request-response run (initiated by this client) ──
    if (stream === 'assistant') {
      const text = typeof data?.text === 'string' ? data.text : '';
      if (text) run.onChunk(text);
      return;
    }
    if (stream === 'lifecycle') {
      const phase = typeof data?.phase === 'string' ? data.phase : null;
      if (phase === 'end') {
        entry.activeRuns.delete(runId);
        run.onDone();
      } else if (phase === 'error') {
        entry.activeRuns.delete(runId);
        run.onError(new Error((data?.error as string | undefined) ?? 'Agent error'));
      }
    }
    return;
  }

  // ── Bot-initiated push run (runId unknown to this client) ──
  // Buffer the accumulated text; on lifecycle.end deliver via onPushMessage.
  if (stream === 'assistant') {
    const text = typeof data?.text === 'string' ? data.text : '';
    if (text) entry.pushRuns.set(runId, text);
    return;
  }

  if (stream === 'lifecycle') {
    const phase = typeof data?.phase === 'string' ? data.phase : null;
    if (phase === 'end' && entry.onPushEvent) {
      const content = entry.pushRuns.get(runId) ?? '';
      entry.pushRuns.delete(runId);
      if (content) {
        const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
        const agentId   = typeof payload.agentId   === 'string' ? payload.agentId   : '';
        entry.onPushEvent({ type: 'message', sessionId, agentId, content });
      }
    } else if (phase === 'error' || phase === 'end') {
      entry.pushRuns.delete(runId);
    }
  }
}

export function teardown(url: string, entry: PoolEntry, err: Error): void {
  if (entry.heartbeatTimer) clearInterval(entry.heartbeatTimer);
  entry.activeRuns.forEach((run) => run.onError(err));
  entry.activeRuns.clear();
  entry.pendingRequests.forEach((cb) =>
    cb({ type: 'res', id: '', ok: false, error: { message: err.message } }),
  );
  entry.pendingRequests.clear();
  entry.readyWaiters.forEach((w) => w.reject(err));
  entry.readyWaiters.length = 0;
  entry.ready = false;
  pool.delete(url);
}

export function rpc(entry: PoolEntry, method: string, params: object): Promise<GatewayResponse> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const t = setTimeout(() => {
      entry.pendingRequests.delete(id);
      reject(new Error(`RPC timeout: ${method}`));
    }, GATEWAY.RPC_TIMEOUT_MS);
    entry.pendingRequests.set(id, (res) => {
      clearTimeout(t);
      resolve(res);
    });
    sendFrame(entry.ws, { type: 'req', id, method, params });
  });
}
