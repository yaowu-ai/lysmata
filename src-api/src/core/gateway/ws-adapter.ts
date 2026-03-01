// ── Gateway WS Adapter ───────────────────────────────────────────────────────

import { randomUUID, sign } from "crypto";
import { GATEWAY } from "../../config/constants";
import { getOrCreateIdentity, base64UrlEncode } from "./device-identity";
import { GatewayLogger } from "../../shared/gateway-logger";
import {
  pool,
  pushHandlerRegistry,
  sendFrame,
  handleFrame,
  teardown,
  rpc,
} from "./connection-pool";
import type { PoolEntry, GatewayFrame, GatewayEvent, GatewayResponse, PushEvent } from "./types";

// ── Connect params builder ──────────────────────────────────────────────────

/**
 * Builds the exact signature payload used by the Gateway's device-auth.ts:
 *
 *   v2|{deviceId}|{clientId}|{clientMode}|{role}|{scopes,csv}|{signedAtMs}|{token}|{nonce}
 *
 * Source: src/gateway/device-auth.ts → buildDeviceAuthPayload()
 */
function buildSignaturePayload(
  deviceId: string,
  signedAtMs: number,
  token: string,
  nonce: string,
): string {
  return [
    "v2",
    deviceId,
    GATEWAY.CLIENT_ID,
    GATEWAY.CLIENT_MODE,
    GATEWAY.ROLE,
    GATEWAY.SCOPES.join(","),
    String(signedAtMs),
    token,
    nonce,
  ].join("|");
}

interface DeviceParams {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
}

function buildConnectParams(opts: { token?: string; deviceId: string; device: DeviceParams }) {
  return {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: GATEWAY.CLIENT_ID,
      version: "1.0.0",
      platform: "desktop",
      mode: GATEWAY.CLIENT_MODE,
    },
    role: GATEWAY.ROLE,
    scopes: GATEWAY.SCOPES,
    caps: [],
    commands: [],
    permissions: {},
    auth: opts.token ? { token: opts.token } : undefined,
    locale: "zh-CN",
    userAgent: "lysmata/1.0.0",
    device: opts.device,
  };
}

// ── Derive HTTP origin from WS URL ──────────────────────────────────────────

/**
 * Derive the HTTP origin from a ws:// / wss:// URL.
 *   ws://localhost:8080/gw  →  http://localhost:8080
 *   wss://example.com/gw   →  https://example.com
 *
 * The Gateway allows connections whose Origin matches its own host (local
 * auto-approval). Setting this header on our server-side WebSocket makes the
 * Gateway treat it as a trusted local control-UI connection instead of an
 * unknown remote origin.
 */
function deriveWsOrigin(wsUrl: string): string {
  try {
    const u = new URL(wsUrl);
    const scheme = u.protocol === "wss:" ? "https" : "http";
    return `${scheme}://${u.host}`;
  } catch {
    return "http://localhost";
  }
}

// ── Gateway WS Handshake ────────────────────────────────────────────────────

/**
 * Performs the full Gateway WS handshake:
 *   connect.challenge (from server) → sign nonce → send connect → hello-ok
 *
 * Falls back to sending without signing after CHALLENGE_TIMEOUT_MS if the
 * gateway has `controlUi.allowInsecureAuth` or `dangerouslyDisableDeviceAuth`
 * enabled (no challenge is pushed in that case).
 */
export async function connectWS(url: string, token?: string): Promise<PoolEntry> {
  // Use the deterministic identity so device.id + publicKey are always
  // consistent for this gateway URL.
  const { id: deviceId, privateKey, publicKeyBase64Url } = getOrCreateIdentity(url);

  // Set Origin to the gateway's own host so it passes the local-origin check.
  const ws = new WebSocket(url, { headers: { Origin: deriveWsOrigin(url) } } as never);
  const entry: PoolEntry = {
    ws,
    deviceId,
    url,
    token,
    pendingRequests: new Map(),
    activeRuns: new Map(),
    pushRuns: new Map(),
    heartbeatTimer: null,
    ready: false,
    readyWaiters: [],
  };

  const connectReqId = randomUUID();

  await new Promise<void>((resolve, reject) => {
    const handshakeTimeout = setTimeout(() => {
      ws.close();
      reject(new Error("OpenClaw Gateway handshake timeout"));
    }, GATEWAY.HANDSHAKE_TIMEOUT_MS);

    let connectSent = false;

    /**
     * Build a signed device object.
     *
     * publicKey format: base64url(raw_32_byte_ed25519_key) — NOT SPKI DER
     * signature format: base64url(sig_bytes)
     * payload:  v2|deviceId|clientId|clientMode|role|scopes,csv|signedAtMs|token|nonce
     *   (from src/gateway/device-auth.ts → buildDeviceAuthPayload)
     */
    function makeSignedDevice(nonce: string): DeviceParams {
      const signedAt = Date.now();
      const payload = buildSignaturePayload(deviceId, signedAt, token ?? "", nonce);
      // Signature must be base64url (Gateway's verifyDeviceSignature tries base64url first)
      const signature = base64UrlEncode(sign(null, Buffer.from(payload), privateKey) as Buffer);
      return { id: deviceId, publicKey: publicKeyBase64Url, signature, signedAt, nonce };
    }

    /** Send the connect request with full device signing (challenge mode) */
    function sendSignedConnect(nonce: string): void {
      if (connectSent) return;
      connectSent = true;
      sendFrame(ws, {
        type: "req",
        id: connectReqId,
        method: "connect",
        params: buildConnectParams({ token, deviceId, device: makeSignedDevice(nonce) }),
      });
    }

    /** Fallback: send with a self-generated nonce (allowInsecureAuth / no-challenge gateways) */
    function sendFallbackConnect(): void {
      if (connectSent) return;
      connectSent = true;
      sendFrame(ws, {
        type: "req",
        id: connectReqId,
        method: "connect",
        params: buildConnectParams({
          token,
          deviceId,
          device: makeSignedDevice(randomUUID()),
        }),
      });
    }

    ws.onerror = () => {
      clearTimeout(handshakeTimeout);
      clearTimeout(challengeFallback);
      GatewayLogger.logSystem(url, "WebSocket connection error during handshake");
      reject(new Error("WebSocket connection error"));
    };

    ws.onopen = () => {
      GatewayLogger.logSystem(url, "WebSocket opened, waiting for connect.challenge");
    };

    // If no challenge arrives within CHALLENGE_TIMEOUT_MS, the gateway is
    // likely configured with allowInsecureAuth — send with a self-generated nonce.
    const challengeFallback = setTimeout(() => {
      sendFallbackConnect();
    }, GATEWAY.CHALLENGE_TIMEOUT_MS);

    ws.onmessage = (ev) => {
      let frame: GatewayFrame;
      try {
        frame = JSON.parse(ev.data as string);
      } catch {
        return;
      }

      // ── Step 1: Server sends connect.challenge ──
      if (frame.type === "event" && (frame as GatewayEvent).event === "connect.challenge") {
        clearTimeout(challengeFallback);
        const nonce = ((frame as GatewayEvent).payload?.nonce as string) ?? randomUUID();
        GatewayLogger.logSystem(url, "connect.challenge received, sending signed connect", {
          nonce,
        });
        sendSignedConnect(nonce);
        return;
      }

      // ── Step 2: Server responds to our connect request ──
      if (frame.type === "res" && (frame as GatewayResponse).id === connectReqId) {
        clearTimeout(handshakeTimeout);
        clearTimeout(challengeFallback);
        const res = frame as GatewayResponse;

        if (!res.ok) {
          GatewayLogger.logSystem(url, "handshake rejected", { error: res.error });
          reject(
            new Error(
              `Gateway connect rejected: ${res.error?.message ?? JSON.stringify(res.error)}`,
            ),
          );
          return;
        }

        // hello-ok — start heartbeat from policy.tickIntervalMs
        const tickMs =
          (res.payload?.policy as { tickIntervalMs?: number } | undefined)?.tickIntervalMs ??
          GATEWAY.DEFAULT_TICK_INTERVAL_MS;

        GatewayLogger.logSystem(url, "hello-ok: handshake complete", {
          deviceId,
          tickIntervalMs: tickMs,
          policy: res.payload?.policy,
        });

        entry.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            // Send 'health' request to keep the connection alive,
            // as 'heartbeat' is not a valid Gateway RPC method.
            sendFrame(ws, { type: "req", id: randomUUID(), method: "health", params: {} });
          }
        }, tickMs);

        entry.ready = true;
        entry.readyWaiters.forEach((w) => w.resolve());
        entry.readyWaiters.length = 0;
        resolve();
        return;
      }

      // Other frames during handshake (rare) — dispatch normally
      handleFrame(entry, ev.data as string);
    };
  });

  // Post-handshake: wire persistent handlers
  ws.onmessage = (ev) => handleFrame(entry, ev.data as string);
  ws.onerror = () => {
    GatewayLogger.logSystem(url, "WebSocket error");
    teardown(url, entry, new Error("WebSocket error"));
  };
  ws.onclose = () => {
    GatewayLogger.logSystem(url, "WebSocket closed");
    teardown(url, entry, new Error("WebSocket closed"));
  };

  pool.set(url, entry);

  // Apply any pre-registered push handler for this URL.
  const registeredHandler = pushHandlerRegistry.get(url);
  if (registeredHandler) entry.onPushEvent = registeredHandler;

  return entry;
}

// ── getOrCreateWSConnection ─────────────────────────────────────────────────

export async function getOrCreateWSConnection(url: string, token?: string): Promise<PoolEntry> {
  const existing = pool.get(url);
  if (existing) {
    if (existing.ws.readyState === WebSocket.OPEN && existing.ready) return existing;

    // Still connecting — wait for it
    if (existing.ws.readyState === WebSocket.CONNECTING || !existing.ready) {
      return new Promise<PoolEntry>((resolve, reject) => {
        existing.readyWaiters.push({ resolve: () => resolve(existing), reject });
      });
    }

    // Dead — remove and reconnect
    pool.delete(url);
  }
  return connectWS(url, token);
}

// ── GatewayWSAdapter public API ─────────────────────────────────────────────

export const GatewayWSAdapter = {
  async sendMessage(
    url: string,
    token: string | undefined,
    agentId: string,
    content: string,
    onChunk: (text: string) => void,
    sessionId?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    // If the caller already aborted before we even start, bail immediately.
    if (signal?.aborted) throw new Error("Aborted before connect");

    const entry = await getOrCreateWSConnection(url, token);

    if (signal?.aborted) throw new Error("Aborted after connect");

    const idempotencyKey = randomUUID();

    // Log the user message before dispatching so the log entry appears
    // immediately before the corresponding OUT req frame.
    GatewayLogger.logUserMessage({
      url,
      agentId,
      sessionKey: sessionId,
      conversationId: sessionId,
      content,
      idempotencyKey,
    });

    const res = await rpc(entry, "agent", {
      message: content,
      agentId,
      ...(sessionId ? { sessionKey: sessionId } : {}),
      deliver: false,
      idempotencyKey,
    });

    if (!res.ok) {
      throw new Error(`agent RPC failed: ${res.error?.message ?? "unknown"}`);
    }

    const runId = res.payload?.runId as string | undefined;
    if (!runId) throw new Error("Gateway did not return a runId");

    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        entry.activeRuns.delete(runId);
        reject(new Error("Agent stream timeout (120s)"));
      }, GATEWAY.STREAM_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(t);
        entry.activeRuns.delete(runId);
      };

      entry.activeRuns.set(runId, {
        onChunk,
        onDone: () => {
          cleanup();
          resolve();
        },
        onError: (e) => {
          cleanup();
          reject(e);
        },
      });

      // If the HTTP /stream connection is cancelled (browser navigates away,
      // user closes tab, etc.) abort this run immediately so we don't keep
      // waiting up to STREAM_TIMEOUT_MS and then silently drop everything.
      signal?.addEventListener(
        "abort",
        () => {
          if (!entry.activeRuns.has(runId)) return; // already done
          cleanup();
          GatewayLogger.logSystem(url, "agent run aborted by client cancel", { runId, sessionId });
          reject(new Error("Aborted by client"));
        },
        { once: true },
      );
    });
  },

  setPushHandler(url: string, handler: (event: PushEvent) => void): void {
    // Persist to registry so the handler is re-applied on every new connection
    // (including reconnects and connections that don't exist yet at call time).
    pushHandlerRegistry.set(url, handler);
    const entry = pool.get(url);
    if (entry) entry.onPushEvent = handler;
  },

  async testConnection(
    url: string,
    token?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const entry = await connectWS(url, token);
      teardown(url, entry, new Error("test complete"), true);
      entry.ws.close();
      return { success: true, message: "连接成功（握手完成）" };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  },

  closeAll(): void {
    pool.forEach((entry, url) => {
      teardown(url, entry, new Error("sidecar shutdown"), true);
      entry.ws.close();
    });
    pool.clear();
  },
};
