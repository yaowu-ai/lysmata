import { create } from 'zustand';

// ── Payload shapes mirroring src-api/src/core/gateway/types.ts ───────────────
// (duplicated here to avoid a cross-package import; keep in sync with server types)

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
  status?: 'approved' | 'rejected';
  [key: string]: unknown;
}

// ── Per-bot realtime status snapshot ─────────────────────────────────────────

export interface BotStatusInfo {
  health?: HealthPayload;
  lastHeartbeat?: HeartbeatPayload;
  presence?: PresencePayload;
  pendingNodeRequests: NodePairRequestedPayload[];
  /** ISO timestamp of the last cron event received from this bot's Gateway */
  lastCronAt?: string;
  isShutdown: boolean;
  /** ISO timestamp of the last status update */
  updatedAt: string;
}

function emptyBotStatus(): BotStatusInfo {
  return {
    pendingNodeRequests: [],
    isShutdown: false,
    updatedAt: new Date().toISOString(),
  };
}

// ── Store interface ───────────────────────────────────────────────────────────

interface AppStore {
  // Sidecar / API availability
  sidecarReady: boolean;
  setSidecarReady: (ready: boolean) => void;

  // Global presence fallback (no botId context)
  presence: Record<string, unknown>;
  setPresence: (presence: Record<string, unknown>) => void;

  // Global health / heartbeat fallbacks (no botId context)
  health: HealthPayload | null;
  setHealth: (health: HealthPayload) => void;

  lastHeartbeat: HeartbeatPayload | null;
  setLastHeartbeat: (hb: HeartbeatPayload) => void;

  // Global shutdown flag (no botId context)
  isShutdown: boolean;
  setShutdown: (v: boolean) => void;

  // Global node pairing fallbacks (no botId context)
  pendingNodeRequests: NodePairRequestedPayload[];
  addNodeRequest: (req: NodePairRequestedPayload) => void;
  resolveNodeRequest: (nodeId: string, status: 'approved' | 'rejected') => void;

  // ── Per-bot realtime status snapshots ──────────────────────────────────────
  botStatuses: Record<string, BotStatusInfo>;

  /** Merge a partial patch into the bot's status entry (creates if missing) */
  setBotStatus: (botId: string, patch: Partial<BotStatusInfo>) => void;

  addBotNodeRequest: (botId: string, req: NodePairRequestedPayload) => void;
  resolveBotNodeRequest: (botId: string, nodeId: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  sidecarReady: false,
  setSidecarReady: (ready) => set({ sidecarReady: ready }),

  presence: {},
  setPresence: (presence) => set({ presence }),

  health: null,
  setHealth: (health) => set({ health }),

  lastHeartbeat: null,
  setLastHeartbeat: (hb) => set({ lastHeartbeat: hb }),

  isShutdown: false,
  setShutdown: (v) => set({ isShutdown: v }),

  pendingNodeRequests: [],
  addNodeRequest: (req) =>
    set((s) => ({ pendingNodeRequests: [...s.pendingNodeRequests, req] })),
  resolveNodeRequest: (nodeId, _status) =>
    set((s) => ({
      pendingNodeRequests: s.pendingNodeRequests.filter((r) => r.nodeId !== nodeId),
    })),

  botStatuses: {},

  setBotStatus: (botId, patch) =>
    set((s) => {
      const prev = s.botStatuses[botId] ?? emptyBotStatus();
      return {
        botStatuses: {
          ...s.botStatuses,
          [botId]: { ...prev, ...patch, updatedAt: new Date().toISOString() },
        },
      };
    }),

  addBotNodeRequest: (botId, req) =>
    set((s) => {
      const prev = s.botStatuses[botId] ?? emptyBotStatus();
      return {
        botStatuses: {
          ...s.botStatuses,
          [botId]: {
            ...prev,
            pendingNodeRequests: [...prev.pendingNodeRequests, req],
            updatedAt: new Date().toISOString(),
          },
        },
      };
    }),

  resolveBotNodeRequest: (botId, nodeId) =>
    set((s) => {
      const prev = s.botStatuses[botId];
      if (!prev) return s;
      return {
        botStatuses: {
          ...s.botStatuses,
          [botId]: {
            ...prev,
            pendingNodeRequests: prev.pendingNodeRequests.filter((r) => r.nodeId !== nodeId),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    }),
}));
