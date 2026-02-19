import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { BotService } from '../../core/bot-service';
import { OpenClawProxy } from '../../core/openclaw-proxy';

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

export default bots;
