// ── Shared types for the OpenClaw Gateway protocol ───────────────────────────

export interface PendingRun {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export interface PushEvent {
  type: 'message' | 'approval' | 'system_presence';
  sessionId?: string;
  agentId?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface PoolEntry {
  ws: WebSocket;
  deviceId: string;
  pendingRequests: Map<string, (res: GatewayResponse) => void>;
  activeRuns: Map<string, PendingRun>;
  /** Accumulates text for bot-initiated (push) runs not in activeRuns */
  pushRuns: Map<string, string>;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  ready: boolean;
  readyWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }>;
  /** Called when a push event arrives */
  onPushEvent?: (event: PushEvent) => void;
}

export interface GatewayFrame {
  type: 'req' | 'res' | 'event';
}

export interface GatewayEvent extends GatewayFrame {
  type: 'event';
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
}

export interface GatewayResponse extends GatewayFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}
