// ── Connection Pool ─────────────────────────────────────────────────────────

import { randomUUID } from 'crypto';
import { GATEWAY } from '../../config/constants';
import { GatewayLogger } from '../../shared/gateway-logger';
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

/** URLs currently undergoing reconnect — prevents concurrent reconnect attempts */
const reconnectingUrls = new Set<string>();

export function sendFrame(ws: WebSocket, frame: object): void {
  // Derive URL from the pool for logging
  const url = [...pool.entries()].find(([, e]) => e.ws === ws)?.[0] ?? 'unknown';
  GatewayLogger.logOutgoing(url, frame);
  ws.send(JSON.stringify(frame));
}

export function handleFrame(entry: PoolEntry, data: string): void {
  const url = entry.url ?? 'unknown';
  GatewayLogger.logIncoming(url, data);

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
  const url = entry.url ?? 'unknown';

  // ── connect.challenge is handled inside connectWS handshake ──
  if (ev.event === 'connect.challenge') return;

  // ── tick: keep-alive ping from Gateway, no response needed ──
  if (ev.event === 'tick') {
    GatewayLogger.logPushEvent(url, 'tick', {});
    entry.onPushEvent?.({ type: 'tick' });
    return;
  }

  // ── exec.approval.requested ──
  if (ev.event === 'exec.approval.requested') {
    GatewayLogger.logPushEvent(url, 'exec.approval.requested', {
      sessionKey: ev.payload?.sessionKey,
      agentId: ev.payload?.agentId,
      runId: ev.payload?.runId,
      command: ev.payload?.command,
      reason: ev.payload?.reason,
    });
    if (entry.onPushEvent) {
      entry.onPushEvent({
        type: 'approval',
        sessionId: ev.payload?.sessionKey as string | undefined,
        agentId: ev.payload?.agentId as string | undefined,
        metadata: ev.payload ?? {},
      });
    }
    return;
  }

  // ── system-presence (legacy event name used by some Gateway versions) ──
  if (ev.event === 'system-presence') {
    GatewayLogger.logPushEvent(url, 'system-presence', { payload: ev.payload });
    entry.onPushEvent?.({
      type: 'system_presence',
      metadata: ev.payload ?? {},
    });
    return;
  }

  // ── presence (standard event name per protocol v3 docs) ──
  if (ev.event === 'presence') {
    GatewayLogger.logPushEvent(url, 'presence', {
      online: ev.payload?.online,
      devices: ev.payload?.devices,
      sessions: ev.payload?.sessions,
    });
    entry.onPushEvent?.({
      type: 'presence',
      payload: {
        devices: ev.payload?.devices,
        sessions: ev.payload?.sessions,
        online: ev.payload?.online as boolean | undefined,
        ...ev.payload,
      },
    });
    return;
  }

  // ── health: system health snapshot (CPU, memory, nodes, etc.) ──
  if (ev.event === 'health') {
    GatewayLogger.logPushEvent(url, 'health', {
      uptimeMs: ev.payload?.uptimeMs,
      nodes: ev.payload?.nodes,
    });
    entry.onPushEvent?.({
      type: 'health',
      payload: {
        uptimeMs: ev.payload?.uptimeMs as number | undefined,
        limits: ev.payload?.limits as Record<string, unknown> | undefined,
        nodes: ev.payload?.nodes as Record<string, unknown> | undefined,
        ...ev.payload,
      },
    });
    return;
  }

  // ── heartbeat: agent/node business-level heartbeat result ──
  if (ev.event === 'heartbeat') {
    GatewayLogger.logPushEvent(url, 'heartbeat', {
      status: ev.payload?.status,
      lastBeat: ev.payload?.lastBeat,
    });
    entry.onPushEvent?.({
      type: 'heartbeat',
      payload: {
        status: ev.payload?.status as string | undefined,
        lastBeat: ev.payload?.lastBeat,
        ...ev.payload,
      },
    });
    return;
  }

  // ── shutdown: Gateway is about to close (graceful shutdown) ──
  if (ev.event === 'shutdown') {
    GatewayLogger.logSystem(url, 'Gateway shutdown event received');
    entry.onPushEvent?.({ type: 'shutdown' });
    if (entry.url) {
      teardown(entry.url, entry, new Error('Gateway shutdown'), true);
      entry.ws.close();
    }
    return;
  }

  // ── chat: cross-platform chat message or Agent reply ──
  if (ev.event === 'chat') {
    GatewayLogger.logPushEvent(url, 'chat', {
      sessionKey: ev.payload?.sessionKey,
      from: ev.payload?.from,
      message: ev.payload?.message,
    });
    entry.onPushEvent?.({
      type: 'chat',
      payload: {
        sessionKey: ev.payload?.sessionKey as string | undefined,
        message: ev.payload?.message,
        from: ev.payload?.from as string | undefined,
        ...ev.payload,
      },
    });
    return;
  }

  // ── node.pair.requested: new node requests pairing ──
  if (ev.event === 'node.pair.requested') {
    GatewayLogger.logPushEvent(url, 'node.pair.requested', {
      nodeId: ev.payload?.nodeId,
      requestId: ev.payload?.requestId,
    });
    entry.onPushEvent?.({
      type: 'node_pair_requested',
      payload: {
        nodeId: ev.payload?.nodeId as string | undefined,
        requestId: ev.payload?.requestId as string | undefined,
        ...ev.payload,
      },
    });
    return;
  }

  // ── node.pair.resolved: pairing approved / rejected / expired ──
  if (ev.event === 'node.pair.resolved') {
    GatewayLogger.logPushEvent(url, 'node.pair.resolved', {
      nodeId: ev.payload?.nodeId,
      status: ev.payload?.status,
    });
    entry.onPushEvent?.({
      type: 'node_pair_resolved',
      payload: {
        nodeId: ev.payload?.nodeId as string | undefined,
        status: ev.payload?.status as 'approved' | 'rejected' | undefined,
        ...ev.payload,
      },
    });
    return;
  }

  // ── cron: scheduled job fired ──
  if (ev.event === 'cron') {
    GatewayLogger.logPushEvent(url, 'cron', {
      jobId: ev.payload?.jobId,
      nextRun: ev.payload?.nextRun,
      payload: ev.payload,
    });
    entry.onPushEvent?.({
      type: 'cron',
      payload: {
        jobId: ev.payload?.jobId as string | undefined,
        nextRun: ev.payload?.nextRun as string | undefined,
        ...ev.payload,
      },
    });
    return;
  }

  // ── exec.finished: node executed a command successfully ──
  if (ev.event === 'exec.finished') {
    GatewayLogger.logPushEvent(url, 'exec.finished', {
      sessionKey: ev.payload?.sessionKey,
      runId: ev.payload?.runId,
      result: ev.payload?.result,
    });
    entry.onPushEvent?.({
      type: 'exec_finished',
      sessionId: ev.payload?.sessionKey as string | undefined,
      payload: {
        sessionKey: ev.payload?.sessionKey as string | undefined,
        runId: ev.payload?.runId as string | undefined,
        result: ev.payload?.result,
        ...ev.payload,
      },
    });
    return;
  }

  // ── exec.denied: node refused to execute a command ──
  if (ev.event === 'exec.denied') {
    GatewayLogger.logPushEvent(url, 'exec.denied', {
      sessionKey: ev.payload?.sessionKey,
      runId: ev.payload?.runId,
      reason: ev.payload?.reason,
    });
    entry.onPushEvent?.({
      type: 'exec_denied',
      sessionId: ev.payload?.sessionKey as string | undefined,
      payload: {
        sessionKey: ev.payload?.sessionKey as string | undefined,
        runId: ev.payload?.runId as string | undefined,
        reason: ev.payload?.reason as string | undefined,
        ...ev.payload,
      },
    });
    return;
  }

  // ── agent: streaming text + lifecycle for both client-initiated and push runs ──
  if (ev.event !== 'agent') return;

  const payload = ev.payload ?? {};
  const runId = payload.runId as string | undefined;
  if (!runId) return;

  const stream = payload.stream as string | undefined;
  const data = payload.data as Record<string, unknown> | undefined;

  // Gateway agent events use `sessionKey` (format: "agent:{agentId}:{conversationId}"),
  // NOT `sessionId`. Extract the conversationId from the last segment.
  // e.g. "agent:main:f83a8f60-1c5e-4009-a83b-293d29760963" → "f83a8f60-..."
  const rawSessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey : undefined;
  const sessionId = rawSessionKey?.split(':').at(-1) || undefined;

  // ── Structured logging per stream type ──────────────────────────────────────
  if (stream === 'lifecycle') {
    const phase = typeof data?.phase === 'string' ? data.phase : 'unknown';
    GatewayLogger.logPushEvent(url, 'agent', {
      runId,
      stream,
      phase,
      sessionId,
      agentId: payload.agentId,
      // On error, capture the error message
      ...(phase === 'error' && { agentError: data?.error }),
    });
  } else if (stream === 'assistant') {
    // Log each chunk: seq from the outer event + text length (not content to
    // avoid flooding the log with long messages).
    const text = typeof data?.text === 'string' ? data.text : '';
    GatewayLogger.logPushEvent(url, 'agent_chunk', {
      runId,
      seq: ev.seq,
      textLength: text.length,
      isActiveRun: entry.activeRuns.has(runId),
      isPushRun: !entry.activeRuns.has(runId),
    });
  } else {
    // Thinking, tool calls, etc.
    GatewayLogger.logPushEvent(url, 'agent', { runId, stream, data });
  }

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
    if (text) {
      const existing = entry.pushRuns.get(runId);
      // Capture sessionId from this frame too in case lifecycle.start wasn't received
      const frameSessionId = sessionId ?? existing?.sessionId;
      const frameAgentId = typeof payload.agentId === 'string' ? payload.agentId : existing?.agentId;
      entry.pushRuns.set(runId, {
        text,
        sessionId: frameSessionId,
        agentId: frameAgentId,
      });
    }
    return;
  }

  if (stream === 'lifecycle') {
    const phase = typeof data?.phase === 'string' ? data.phase : null;

    // Capture sessionId/agentId from lifecycle.start into the pushRun entry so
    // it is available even if the lifecycle.end frame omits them.
    if (phase === 'start') {
      const existing = entry.pushRuns.get(runId);
      const startSessionId = sessionId ?? existing?.sessionId;
      const startAgentId = typeof payload.agentId === 'string' ? payload.agentId : existing?.agentId;
      entry.pushRuns.set(runId, {
        text: existing?.text ?? '',
        sessionId: startSessionId,
        agentId: startAgentId,
      });
      return;
    }

    if (phase === 'end' && entry.onPushEvent) {
      const pushEntry = entry.pushRuns.get(runId);
      entry.pushRuns.delete(runId);
      const content = pushEntry?.text ?? '';
      // Prefer sessionId from the buffered entry (captured at lifecycle.start/assistant)
      // over the one in this end frame, since some Gateway versions omit it at end.
      const resolvedSessionId = pushEntry?.sessionId ?? sessionId ?? '';
      const resolvedAgentId = pushEntry?.agentId ?? (typeof payload.agentId === 'string' ? payload.agentId : '') ;

      if (content) {
        GatewayLogger.logPushEvent(url, 'agent_push_deliver', {
          runId,
          sessionId: resolvedSessionId,
          agentId: resolvedAgentId,
          contentLength: content.length,
          sessionIdSource: pushEntry?.sessionId ? 'buffered' : sessionId ? 'end_frame' : 'missing',
        });
        entry.onPushEvent({ type: 'message', sessionId: resolvedSessionId, agentId: resolvedAgentId, content });
      } else {
        // lifecycle.end but no content buffered — log so we can diagnose missing bubbles
        GatewayLogger.logPushEvent(url, 'agent_push_empty', {
          runId,
          sessionId: resolvedSessionId,
          reason: 'lifecycle.end received but pushRuns had no content',
        });
      }
    } else if (phase === 'error') {
      const pushEntry = entry.pushRuns.get(runId);
      GatewayLogger.logPushEvent(url, 'agent_push_error', {
        runId,
        sessionId: pushEntry?.sessionId ?? sessionId,
        agentError: data?.error,
        hadBufferedContent: !!(pushEntry?.text),
      });
      entry.pushRuns.delete(runId);
    } else if (phase === 'end') {
      // end without onPushEvent registered — bot push will be silently dropped
      GatewayLogger.logPushEvent(url, 'agent_push_no_handler', {
        runId,
        sessionId,
        reason: 'lifecycle.end but no onPushEvent handler registered',
      });
      entry.pushRuns.delete(runId);
    }
  }
}

/** Schedules an exponential-backoff reconnect for unintentional disconnects. */
function scheduleReconnect(url: string, token: string | undefined, attempt: number): void {
  if (attempt > 10) {
    GatewayLogger.logSystem(url, `reconnect: giving up after ${attempt} attempts`);
    return;
  }
  const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
  GatewayLogger.logSystem(url, `reconnect: attempt ${attempt + 1} in ${delayMs}ms`);
  setTimeout(async () => {
    if (pool.has(url)) return; // already reconnected by another path
    if (reconnectingUrls.has(url)) return; // prevent concurrent reconnect
    reconnectingUrls.add(url);
    try {
      const { connectWS } = await import('./ws-adapter');
      const entry = await connectWS(url, token);
      const handler = pushHandlerRegistry.get(url);
      if (handler) entry.onPushEvent = handler;
      GatewayLogger.logSystem(url, `reconnect: success on attempt ${attempt + 1}`);
    } catch {
      scheduleReconnect(url, token, attempt + 1);
    } finally {
      reconnectingUrls.delete(url);
    }
  }, delayMs);
}

export function teardown(url: string, entry: PoolEntry, err: Error, intentional = false): void {
  GatewayLogger.logSystem(url, `teardown: ${err.message} (intentional=${intentional})`);
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

  if (!intentional) {
    scheduleReconnect(url, entry.token, 0);
  }
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
