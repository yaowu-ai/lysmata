import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { BotService } from '../../core/bot-service';
import { OpenClawProxy } from '../../core/openclaw-proxy';
import { PushRelay } from '../../core/push-relay';

const bots = new Hono();

const createSchema = z.object({
  name: z.string().min(1),
  avatar_emoji: z.string().optional(),
  description: z.string().optional(),
  skills_config: z.array(z.object({ name: z.string(), description: z.string() })).optional(),
  mcp_config: z.unknown().optional(),
  openclaw_ws_url: z.string().min(1),
  openclaw_ws_token: z.string().optional(),
  openclaw_agent_id: z.string().optional(),
  is_active: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

bots.get('/', (c) => c.json(BotService.findAll()));

bots.get('/:id', (c) => {
  const bot = BotService.findById(c.req.param('id'));
  if (!bot) return c.json({ error: 'Not found' }, 404);
  return c.json(bot);
});

bots.post('/', zValidator('json', createSchema), (c) => {
  const bot = BotService.create(c.req.valid('json'));
  return c.json(bot, 201);
});

bots.put('/:id', zValidator('json', updateSchema), (c) => {
  const bot = BotService.update(c.req.param('id'), c.req.valid('json'));
  if (!bot) return c.json({ error: 'Not found' }, 404);
  return c.json(bot);
});

bots.delete('/:id', (c) => {
  const deleted = BotService.delete(c.req.param('id'));
  if (!deleted) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

bots.post('/:id/test-connection', async (c) => {
  const bot = BotService.findById(c.req.param('id'));
  if (!bot) return c.json({ error: 'Not found' }, 404);
  const result = await OpenClawProxy.testConnection(bot.openclaw_ws_url, bot.openclaw_ws_token ?? undefined);
  BotService.updateStatus(bot.id, result.success ? 'connected' : 'error');
  return c.json(result);
});

// Global SSE stream for system presence and global events
bots.get('/global-stream', (c) => {
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const enc = new TextEncoder();
      const heartbeat = setInterval(() => {
        try { ctrl.enqueue(enc.encode(': heartbeat\n\n')); } catch {}
      }, 25_000);
      cleanup = PushRelay.registerClient('global', ctrl);
      const originalCleanup = cleanup;
      cleanup = () => { clearInterval(heartbeat); originalCleanup(); };
    },
    cancel() { cleanup?.(); }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

export default bots;
