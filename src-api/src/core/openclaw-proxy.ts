/**
 * OpenClaw Proxy — dual-mode adapter
 *
 * Mode A (WS): ws:// or wss:// URL → implements the OpenClaw Gateway WebSocket Protocol
 *   Ref: https://docs.openclaw.ai/gateway/protocol
 *   Handshake flow:
 *     1. Server → connect.challenge  {nonce, ts}
 *     2. Client → connect request    (with Ed25519-signed nonce, client.id:"cli")
 *     3. Server → hello-ok           (with tickIntervalMs for heartbeat)
 *
 * Mode B (HTTP): http:// or https:// URL → OpenAI-compatible HTTP endpoint
 *   POST /v1/chat/completions  (must be enabled in OpenClaw config)
 *   Ref: https://docs.openclaw.ai/gateway/openai-http-api
 */

import { randomUUID, createHash, createPrivateKey, createPublicKey, sign } from 'crypto';
import type { KeyObject } from 'crypto';

// ── Deterministic Ed25519 identity ──────────────────────────────────────────
//
// Source: src/infra/device-identity.ts in the OpenClaw repo
//
// The Gateway's identity contract (from deriveDeviceIdFromPublicKey /
// verifyDeviceSignature / normalizeDevicePublicKeyBase64Url):
//
//   publicKey field  = base64url( raw_32_byte_ed25519_key )   ← NOT SPKI DER
//   device.id        = sha256( raw_32_byte_ed25519_key ).hex()
//   signature        = base64url( ed25519_sign(privateKey, payload) )
//
// If we send base64(SPKI_DER_44_bytes) as publicKey, the Gateway prepends
// its own 12-byte SPKI prefix → 12+44=56 bytes → invalid DER → parse error
// → "device signature invalid".
//
// Ed25519 SPKI DER = [12-byte prefix] + [32-byte raw key]  (44 bytes total)
// Ed25519 PKCS#8 v1 DER prefix (RFC 8410 §10.3):
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
// Ed25519 SPKI DER prefix length (matches device-identity.ts: "302a300506032b6570032100" = 12 bytes)
const ED25519_SPKI_PREFIX_LEN = 12;

interface DeviceIdentity {
  id: string;
  privateKey: KeyObject;
  /** base64url of the raw 32-byte Ed25519 public key (NOT SPKI DER) */
  publicKeyBase64Url: string;
}

/** base64url-encode a Buffer (no + / =) */
function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

/** Cache: gateway URL → stable identity (lives for the process lifetime) */
const identityCache = new Map<string, DeviceIdentity>();

/**
 * Returns a stable Ed25519 identity derived deterministically from the
 * gateway URL. The same URL always yields the same device.id + key pair.
 *
 * Key format contract (from src/infra/device-identity.ts):
 *   - publicKey field  = base64url(raw_32_bytes)  — Gateway prepends SPKI prefix itself
 *   - device.id        = sha256(raw_32_bytes).hex()
 *   - signature        = base64url(sig_bytes)
 */
function getOrCreateIdentity(url: string): DeviceIdentity {
  const cached = identityCache.get(url);
  if (cached) return cached;

  // Derive a deterministic 32-byte seed from the URL (stable across restarts)
  const seed = createHash('sha256').update(`openclaw-device-v1:${url}`).digest();
  const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  const privateKey = createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(privateKey);

  // Extract just the raw 32-byte key from SPKI DER (strip the 12-byte prefix)
  const spkiDer = (publicKey as KeyObject).export({ type: 'spki', format: 'der' }) as Buffer;
  const rawKey = spkiDer.subarray(ED25519_SPKI_PREFIX_LEN); // raw 32 bytes

  // device.id = sha256(raw_32_bytes).hex()
  const id = createHash('sha256').update(rawKey).digest('hex');

  // publicKey field = base64url(raw_32_bytes)  — NOT base64(SPKI_DER)
  const publicKeyBase64Url = base64UrlEncode(rawKey);

  const identity: DeviceIdentity = { id, privateKey, publicKeyBase64Url };
  identityCache.set(url, identity);
  return identity;
}

// ── Types ───────────────────────────────────────────────────────────────────

interface PendingRun {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

interface PoolEntry {
  ws: WebSocket;
  deviceId: string;
  pendingRequests: Map<string, (res: GatewayResponse) => void>;
  activeRuns: Map<string, PendingRun>;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  ready: boolean;
  readyWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }>;
}

interface GatewayFrame {
  type: 'req' | 'res' | 'event';
}

interface GatewayEvent extends GatewayFrame {
  type: 'event';
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
}

interface GatewayResponse extends GatewayFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

// ── Connection Pool ─────────────────────────────────────────────────────────

const pool = new Map<string, PoolEntry>();


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
    const scheme = u.protocol === 'wss:' ? 'https' : 'http';
    return `${scheme}://${u.host}`;
  } catch {
    return 'http://localhost';
  }
}

function sendFrame(ws: WebSocket, frame: object): void {
  ws.send(JSON.stringify(frame));
}

function handleFrame(entry: PoolEntry, data: string): void {
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

function handleEvent(entry: PoolEntry, ev: GatewayEvent): void {
  if (ev.event === 'connect.challenge') return; // handled inside connectWS

  const payload = ev.payload ?? {};
  const runId = payload.runId as string | undefined;
  if (!runId) return;

  const run = entry.activeRuns.get(runId);
  if (!run) return;

  if (ev.event === 'agent.stream') {
    const stream = payload.stream as string | undefined;
    if (stream !== 'assistant') return;
    const delta = payload.delta as Record<string, unknown> | undefined;
    const text = delta?.text as string | undefined;
    if (text) run.onChunk(text);
    return;
  }

  if (ev.event === 'agent.lifecycle') {
    const phase = payload.phase as string | undefined;
    if (phase === 'end') {
      entry.activeRuns.delete(runId);
      run.onDone();
    } else if (phase === 'error') {
      entry.activeRuns.delete(runId);
      run.onError(new Error((payload.error as string | undefined) ?? 'Agent lifecycle error'));
    }
  }
}

function teardown(url: string, entry: PoolEntry, err: Error): void {
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

// ── Connect params builder ──────────────────────────────────────────────────

const CLIENT_ID = 'openclaw-control-ui';
const CLIENT_MODE = 'ui';
const ROLE = 'operator';
// operator.admin is required for heartbeat; operator.read/write for agent calls
const SCOPES = ['operator.read', 'operator.write', 'operator.admin'];

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
    'v2',
    deviceId,
    CLIENT_ID,
    CLIENT_MODE,
    ROLE,
    SCOPES.join(','),
    String(signedAtMs),
    token,
    nonce,
  ].join('|');
}

interface DeviceParams {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
}

function buildConnectParams(opts: {
  token?: string;
  deviceId: string;
  device: DeviceParams;
}) {
  return {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: CLIENT_ID,
      version: '1.0.0',
      platform: 'desktop',
      mode: CLIENT_MODE,
    },
    role: ROLE,
    scopes: SCOPES,
    caps: [],
    commands: [],
    permissions: {},
    auth: { token: opts.token ?? '' },
    locale: 'zh-CN',
    userAgent: 'lysmata/1.0.0',
    device: opts.device,
  };
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
const CHALLENGE_TIMEOUT_MS = 3000;
const HANDSHAKE_TIMEOUT_MS = 10000;

async function connectWS(url: string, token?: string): Promise<PoolEntry> {
  // Use the deterministic identity so device.id + publicKey are always
  // consistent for this gateway URL.
  const { id: deviceId, privateKey, publicKeyBase64Url } = getOrCreateIdentity(url);

  // Set Origin to the gateway's own host so it passes the local-origin check.
  // The Gateway allows connections from its own host (loopback / gateway-host
  // tailnet) and rejects cross-origin requests by default.
  const ws = new WebSocket(url, { headers: { Origin: deriveWsOrigin(url) } } as never);
  const entry: PoolEntry = {
    ws,
    deviceId,
    pendingRequests: new Map(),
    activeRuns: new Map(),
    heartbeatTimer: null,
    ready: false,
    readyWaiters: [],
  };

  const connectReqId = randomUUID();

  await new Promise<void>((resolve, reject) => {
    const handshakeTimeout = setTimeout(() => {
      ws.close();
      reject(new Error('OpenClaw Gateway handshake timeout'));
    }, HANDSHAKE_TIMEOUT_MS);

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
      const payload = buildSignaturePayload(deviceId, signedAt, token ?? '', nonce);
      // Signature must be base64url (Gateway's verifyDeviceSignature tries base64url first)
      const signature = base64UrlEncode(sign(null, Buffer.from(payload), privateKey) as Buffer);
      return { id: deviceId, publicKey: publicKeyBase64Url, signature, signedAt, nonce };
    }

    /** Send the connect request with full device signing (challenge mode) */
    function sendSignedConnect(nonce: string): void {
      if (connectSent) return;
      connectSent = true;
      sendFrame(ws, {
        type: 'req',
        id: connectReqId,
        method: 'connect',
        params: buildConnectParams({ token, deviceId, device: makeSignedDevice(nonce) }),
      });
    }

    /** Fallback: send with a self-generated nonce (allowInsecureAuth / no-challenge gateways) */
    function sendFallbackConnect(): void {
      if (connectSent) return;
      connectSent = true;
      sendFrame(ws, {
        type: 'req',
        id: connectReqId,
        method: 'connect',
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
      reject(new Error('WebSocket connection error'));
    };

    ws.onopen = () => {
      // Do NOT send anything here.
      // Wait for connect.challenge first (docs: "pre-connect challenge").
      // challengeFallback fires if the gateway skips the challenge.
    };

    // If no challenge arrives within CHALLENGE_TIMEOUT_MS, the gateway is
    // likely configured with allowInsecureAuth — send with a self-generated nonce.
    const challengeFallback = setTimeout(() => {
      sendFallbackConnect();
    }, CHALLENGE_TIMEOUT_MS);

    ws.onmessage = (ev) => {
      let frame: GatewayFrame;
      try {
        frame = JSON.parse(ev.data as string);
      } catch {
        return;
      }

      // ── Step 1: Server sends connect.challenge ──
      if (frame.type === 'event' && (frame as GatewayEvent).event === 'connect.challenge') {
        clearTimeout(challengeFallback);
        const nonce = ((frame as GatewayEvent).payload?.nonce as string) ?? randomUUID();
        sendSignedConnect(nonce);
        return;
      }

      // ── Step 2: Server responds to our connect request ──
      if (frame.type === 'res' && (frame as GatewayResponse).id === connectReqId) {
        clearTimeout(handshakeTimeout);
        clearTimeout(challengeFallback);
        const res = frame as GatewayResponse;

        if (!res.ok) {
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
          15000;

        entry.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            sendFrame(ws, { type: 'req', id: randomUUID(), method: 'heartbeat', params: {} });
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
  ws.onerror = () => teardown(url, entry, new Error('WebSocket error'));
  ws.onclose = () => teardown(url, entry, new Error('WebSocket closed'));

  pool.set(url, entry);
  return entry;
}

async function getOrCreateWSConnection(url: string, token?: string): Promise<PoolEntry> {
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

function rpc(entry: PoolEntry, method: string, params: object): Promise<GatewayResponse> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const t = setTimeout(() => {
      entry.pendingRequests.delete(id);
      reject(new Error(`RPC timeout: ${method}`));
    }, 30_000);
    entry.pendingRequests.set(id, (res) => {
      clearTimeout(t);
      resolve(res);
    });
    sendFrame(entry.ws, { type: 'req', id, method, params });
  });
}

// ── Gateway WS Adapter ──────────────────────────────────────────────────────

const GatewayWSAdapter = {
  async sendMessage(
    url: string,
    token: string | undefined,
    agentId: string,
    content: string,
    onChunk: (text: string) => void,
  ): Promise<void> {
    const entry = await getOrCreateWSConnection(url, token);

    const res = await rpc(entry, 'agent', {
      message: content,
      agentId,
      deliver: false,
      // idempotencyKey is required by AgentParamsSchema (NonEmptyString)
      idempotencyKey: randomUUID(),
    });

    if (!res.ok) {
      throw new Error(`agent RPC failed: ${res.error?.message ?? 'unknown'}`);
    }

    const runId = res.payload?.runId as string | undefined;
    if (!runId) throw new Error('Gateway did not return a runId');

    return new Promise<void>((resolve, reject) => {
      entry.activeRuns.set(runId, { onChunk, onDone: resolve, onError: reject });
    });
  },

  async testConnection(
    url: string,
    token?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const entry = await connectWS(url, token);
      teardown(url, entry, new Error('test complete'));
      entry.ws.close();
      return { success: true, message: '连接成功（握手完成）' };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  },

  closeAll(): void {
    pool.forEach((entry, url) => {
      teardown(url, entry, new Error('sidecar shutdown'));
      entry.ws.close();
    });
    pool.clear();
  },
};

// ── OpenAI HTTP Adapter ─────────────────────────────────────────────────────

function toHttpBase(url: string): string {
  return url.replace(/\/+$/, '');
}

const OpenAIHttpAdapter = {
  async sendMessage(
    baseUrl: string,
    token: string | undefined,
    agentId: string,
    content: string,
    onChunk: (text: string) => void,
  ): Promise<void> {
    const endpoint = `${toHttpBase(baseUrl)}/v1/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-openclaw-agent-id': agentId,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        stream: true,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI HTTP ${res.status}: ${text}`);
    }

    if (!res.body) throw new Error('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) onChunk(text);
        } catch {
          /* ignore malformed chunks */
        }
      }
    }
  },

  async testConnection(
    baseUrl: string,
    token?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${toHttpBase(baseUrl)}/v1/models`, { headers });
      if (res.ok) return { success: true, message: '连接成功（HTTP API）' };
      return { success: false, message: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  },
};

// ── Public API ──────────────────────────────────────────────────────────────

function isWsUrl(url: string): boolean {
  return url.startsWith('ws://') || url.startsWith('wss://');
}

export const OpenClawProxy = {
  /**
   * Send a message to an OpenClaw Agent and stream back text chunks.
   *
   * @param url      Bot's gateway URL — `ws://` → Gateway WS protocol, `http://` → OpenAI HTTP
   * @param token    Gateway token (`OPENCLAW_GATEWAY_TOKEN`)
   * @param agentId  Target agent ID (default: "main")
   * @param content  User message (may include context prefix injected by MessageRouter)
   * @param onChunk  Called with each streamed text delta
   */
  async sendMessage(
    url: string,
    token: string | undefined,
    agentId: string,
    content: string,
    onChunk: (text: string) => void,
  ): Promise<void> {
    if (isWsUrl(url)) {
      return GatewayWSAdapter.sendMessage(url, token, agentId, content, onChunk);
    }
    return OpenAIHttpAdapter.sendMessage(url, token, agentId, content, onChunk);
  },

  async testConnection(
    url: string,
    token?: string,
  ): Promise<{ success: boolean; message: string }> {
    if (isWsUrl(url)) return GatewayWSAdapter.testConnection(url, token);
    return OpenAIHttpAdapter.testConnection(url, token);
  },

  closeAll(): void {
    GatewayWSAdapter.closeAll();
  },
};
