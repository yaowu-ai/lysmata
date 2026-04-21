// ── Gateway connection constants ─────────────────────────────────────────────

export const GATEWAY = {
  CHALLENGE_TIMEOUT_MS: 3_000,
  HANDSHAKE_TIMEOUT_MS: 10_000,
  RPC_TIMEOUT_MS: 30_000,
  // Agent runs can be arbitrarily long (tool loops, deep reasoning). Cap at 1h
  // as a safety net against leaked pending runs; the client can always abort
  // earlier by closing the SSE connection.
  STREAM_TIMEOUT_MS: 3_600_000,
  DEFAULT_TICK_INTERVAL_MS: 15_000,
  CLIENT_ID: "openclaw-control-ui",
  CLIENT_MODE: "ui",
  ROLE: "operator",
  // operator.admin is required for heartbeat; operator.read/write for agent calls
  SCOPES: ["operator.read", "operator.write", "operator.admin"] as const,
} as const;

// ── SSE constants ─────────────────────────────────────────────────────────────

export const SSE = {
  HEARTBEAT_INTERVAL_MS: 25_000,
  HEARTBEAT_MESSAGE: ": heartbeat\n\n",
  HEADERS: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  },
} as const;
