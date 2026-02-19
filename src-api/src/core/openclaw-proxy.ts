/**
 * OpenClaw WS Proxy
 *
 * Maintains a persistent WebSocket connection pool keyed by bot ID.
 * Forwards user messages to the target OpenClaw instance and streams
 * the response back via callbacks.
 */

interface PoolEntry {
  ws: WebSocket;
  url: string;
  token?: string;
  pendingResolvers: Array<{
    onChunk: (chunk: string) => void;
    onDone: () => void;
    onError: (err: Error) => void;
  }>;
}

const pool = new Map<string, PoolEntry>();

function buildWsUrl(url: string, token?: string): string {
  if (!token) return url;
  const u = new URL(url);
  u.searchParams.set('token', token);
  return u.toString();
}

function createConnection(botId: string, url: string, token?: string): PoolEntry {
  const ws = new WebSocket(buildWsUrl(url, token));
  const entry: PoolEntry = { ws, url, token, pendingResolvers: [] };

  ws.onmessage = (ev) => {
    const data = ev.data as string;
    if (entry.pendingResolvers.length === 0) return;

    try {
      const parsed = JSON.parse(data) as { content?: string; done?: boolean; error?: string };
      const resolver = entry.pendingResolvers[0];

      if (parsed.error) {
        entry.pendingResolvers.shift();
        resolver.onError(new Error(parsed.error));
        return;
      }
      if (parsed.content) resolver.onChunk(parsed.content);
      if (parsed.done) {
        entry.pendingResolvers.shift();
        resolver.onDone();
      }
    } catch {
      // Non-JSON frame — treat as raw text chunk
      const resolver = entry.pendingResolvers[0];
      if (resolver) resolver.onChunk(data);
    }
  };

  ws.onerror = () => {
    entry.pendingResolvers.forEach((r) => r.onError(new Error('WebSocket error')));
    entry.pendingResolvers.length = 0;
    pool.delete(botId);
  };

  ws.onclose = () => {
    pool.delete(botId);
  };

  pool.set(botId, entry);
  return entry;
}

async function getOrCreateConnection(botId: string, url: string, token?: string): Promise<PoolEntry> {
  const existing = pool.get(botId);
  if (existing && existing.ws.readyState === WebSocket.OPEN) return existing;

  const entry = createConnection(botId, url, token);

  // Wait for connection to open (max 5 s)
  await new Promise<void>((resolve, reject) => {
    if (entry.ws.readyState === WebSocket.OPEN) { resolve(); return; }
    const t = setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    entry.ws.addEventListener('open', () => { clearTimeout(t); resolve(); }, { once: true });
    entry.ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('WS connect error')); }, { once: true });
  });

  return entry;
}

export const OpenClawProxy = {
  /**
   * Send a message to an OpenClaw instance and stream back chunks.
   * The connection is reused if already open.
   */
  async sendMessage(
    url: string,
    token: string | undefined,
    content: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    // Use url as key (no per-bot ID here since callers pass url directly)
    const key = url;
    const entry = await getOrCreateConnection(key, url, token);

    return new Promise<void>((resolve, reject) => {
      entry.pendingResolvers.push({
        onChunk,
        onDone: resolve,
        onError: reject,
      });
      entry.ws.send(JSON.stringify({ type: 'message', content }));
    });
  },

  /** One-shot connection test — does not persist in pool. */
  async testConnection(url: string, token?: string): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(buildWsUrl(url, token));
        const t = setTimeout(() => {
          ws.close();
          resolve({ success: false, message: 'Connection timeout (5s)' });
        }, 5000);
        ws.onopen = () => {
          clearTimeout(t);
          ws.close();
          resolve({ success: true, message: 'Connection successful' });
        };
        ws.onerror = () => {
          clearTimeout(t);
          resolve({ success: false, message: 'Connection failed' });
        };
      } catch (err) {
        resolve({ success: false, message: String(err) });
      }
    });
  },

  /** Close all pooled connections (e.g., on sidecar shutdown). */
  closeAll(): void {
    pool.forEach((entry) => entry.ws.close());
    pool.clear();
  },
};
