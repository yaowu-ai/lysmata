// ── Shared types for the OpenClaw Gateway protocol ───────────────────────────

export interface PendingRun {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

// ── Per-event payload shapes ─────────────────────────────────────────────────

export interface HealthPayload {
  uptimeMs?: number;
  limits?: Record<string, unknown>;
  nodes?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PresencePayload {
  devices?: unknown;
  sessions?: unknown;
  online?: boolean;
  [key: string]: unknown;
}

export interface HeartbeatPayload {
  status?: string;
  lastBeat?: unknown;
  [key: string]: unknown;
}

export interface NodePairRequestedPayload {
  nodeId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface NodePairResolvedPayload {
  nodeId?: string;
  status?: "approved" | "rejected";
  [key: string]: unknown;
}

export interface CronPayload {
  jobId?: string;
  nextRun?: string;
  action?: string;
  status?: string;
  summary?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
  [key: string]: unknown;
}

export interface ChatPayload {
  sessionKey?: string;
  message?: unknown;
  from?: string;
  [key: string]: unknown;
}

export interface ExecFinishedPayload {
  sessionKey?: string;
  runId?: string;
  result?: unknown;
  [key: string]: unknown;
}

export interface ExecDeniedPayload {
  sessionKey?: string;
  runId?: string;
  reason?: string;
  [key: string]: unknown;
}

// ── PushEvent — discriminated union covering all Gateway server-push events ──
//
// Each variant maps to one Gateway event name.  The `type` field uses
// snake_case equivalents for JS safety (e.g. `node.pair.requested` → `node_pair_requested`).

export type PushEvent =
  | { type: "message"; sessionId: string; agentId: string; content: string }
  | { type: "approval"; sessionId?: string; agentId?: string; metadata: Record<string, unknown> }
  | { type: "system_presence"; metadata: Record<string, unknown> }
  | { type: "tick" }
  | { type: "chat"; payload: ChatPayload }
  | { type: "presence"; payload: PresencePayload }
  | { type: "health"; payload: HealthPayload }
  | { type: "heartbeat"; payload: HeartbeatPayload }
  | { type: "shutdown" }
  | { type: "node_pair_requested"; payload: NodePairRequestedPayload }
  | { type: "node_pair_resolved"; payload: NodePairResolvedPayload }
  | { type: "cron"; payload: CronPayload }
  | { type: "exec_finished"; sessionId?: string; payload: ExecFinishedPayload }
  | { type: "exec_denied"; sessionId?: string; payload: ExecDeniedPayload };

// ── Connection pool entry ────────────────────────────────────────────────────

export interface PushRunEntry {
  text: string;
  /** sessionId from the first lifecycle.start or assistant frame seen for this run */
  sessionId?: string;
  agentId?: string;
}

export interface PoolEntry {
  ws: WebSocket;
  deviceId: string;
  pendingRequests: Map<string, (res: GatewayResponse) => void>;
  activeRuns: Map<string, PendingRun>;
  /**
   * Accumulates text + session context for bot-initiated (push) runs.
   * sessionId is captured from the first frame so it is available at lifecycle.end
   * even if the final frame omits it (some Gateway versions).
   */
  pushRuns: Map<string, PushRunEntry>;
  /**
   * Run IDs that just completed as client-initiated runs (activeRuns).
   * Kept briefly so that any duplicate/delayed Gateway frames arriving after
   * activeRuns.delete() are not mistakenly treated as new push runs.
   * Entries are auto-evicted after a short TTL.
   */
  recentlyCompletedRuns: Set<string>;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  ready: boolean;
  readyWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }>;
  /** Called when any push event arrives from the Gateway */
  onPushEvent?: (event: PushEvent) => void;
  /** Gateway URL — used to trigger teardown on shutdown events */
  url?: string;
  /** Gateway token used for authentication — stored for reconnect */
  token?: string;
}

// ── Wire protocol frames ─────────────────────────────────────────────────────

export interface GatewayFrame {
  type: "req" | "res" | "event";
}

export interface GatewayEvent extends GatewayFrame {
  type: "event";
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
  /** Monotonically increasing state version for incremental sync */
  stateVersion?: number;
}

export interface GatewayResponse extends GatewayFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}
