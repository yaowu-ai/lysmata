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
      teardown(entry.url, entry, new Error('Gateway shutdown'));
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

  // Log agent lifecycle events (skip assistant stream chunks to avoid log flooding)
  if (stream === 'lifecycle') {
    GatewayLogger.logPushEvent(url, 'agent', {
      runId,
      stream,
      phase: data?.phase,
      sessionId: payload.sessionId,
      agentId: payload.agentId,
    });
  } else if (stream !== 'assistant') {
    // Log other non-streaming agent events (thinking, tool calls, etc.)
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
  GatewayLogger.logSystem(url, `teardown: ${err.message}`);
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
