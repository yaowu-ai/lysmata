import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { PORT } from './config';
import health from './app/api/health';
import bots from './app/api/bots';
import conversations from './app/api/conversations';
import messages from './app/api/messages';
import { OpenClawProxy } from './core/openclaw-proxy';
import { PushRelay } from './core/push-relay';
import { BotService } from './core/bot-service';

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors({ origin: ['http://localhost:1420', 'http://127.0.0.1:1420', 'tauri://localhost'] }));

// Routes
app.route('/health', health);
app.route('/bots', bots);
app.route('/conversations', conversations);
app.route('/conversations/:conversationId/messages', messages);

// Wire push handlers for all active WS bots so bot-initiated messages are captured
function wirePushHandlers() {
  const bots = BotService.findAll().filter((b) => b.openclaw_ws_url?.startsWith('ws'));
  for (const bot of bots) {
    OpenClawProxy.setPushHandler(bot.openclaw_ws_url, (event) => {
      PushRelay.handlePush(event, bot.id);
    });
  }
}
wirePushHandlers();

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
