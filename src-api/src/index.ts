import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { PORT } from './config';
import health from './app/api/health';
import bots from './app/api/bots';
import conversations from './app/api/conversations';
import messages from './app/api/messages';
import { OpenClawProxy } from './core/openclaw-proxy';

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors({ origin: ['http://localhost:1420', 'http://127.0.0.1:1420', 'tauri://localhost'] }));

// Routes
app.route('/health', health);
app.route('/bots', bots);
app.route('/conversations', conversations);
app.route('/conversations/:conversationId/messages', messages);

// Graceful shutdown
process.on('SIGTERM', () => { OpenClawProxy.closeAll(); process.exit(0); });
process.on('SIGINT',  () => { OpenClawProxy.closeAll(); process.exit(0); });

Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  fetch: app.fetch,
});

console.info(`[sidecar] Hono API running on http://127.0.0.1:${PORT}`);

export default app;
