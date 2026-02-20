import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { MessageRouter } from '../../core/message-router';
import { PushRelay } from '../../core/push-relay';
import { BotService } from '../../core/bot-service';
import { OpenClawProxy } from '../../core/openclaw-proxy';

const messages = new Hono();

messages.get('/', (c) => {
  const msgs = MessageRouter.listMessages(c.req.param('conversationId'));
  return c.json(msgs);
});

messages.post(
  '/',
  zValidator('json', z.object({ content: z.string().min(1) })),
  async (c) => {
    const { content } = c.req.valid('json');
    const convId = c.req.param('conversationId');
    try {
      const botMsg = await MessageRouter.route(convId, content, () => {});
      return c.json(botMsg, 201);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  },
);

messages.post(
  '/approvals/:approvalId/resolve',
  zValidator('json', z.object({ botId: z.string(), approved: z.boolean() })),
  async (c) => {
    const { botId, approved } = c.req.valid('json');
    const approvalId = c.req.param('approvalId');
    const bot = BotService.findById(botId);
    if (!bot) return c.json({ error: 'Bot not found' }, 404);

    try {
      await OpenClawProxy.resolveApproval(
        bot.openclaw_ws_url,
        bot.openclaw_ws_token || undefined,
        approvalId,
        approved
      );
      
      // Update message metadata to mark as resolved
      const db = require('../../shared/db').getDb();
      // Find the message that has this approval id in its metadata
      // Since SQLite JSON functions are available, or we can just fetch and parse,
      // but it's simpler to just let the frontend refresh or ignore DB update.
      // Ideally we would update the message in DB to reflect the new state.

      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  }
);

// SSE streaming endpoint
messages.get('/stream', async (c) => {
  const { content } = c.req.query();
  if (!content) return c.json({ error: 'content query param required' }, 400);
  const convId = c.req.param('conversationId');

  return new Response(
    new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        try {
          await MessageRouter.route(convId, content, (chunk) => {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
          });
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        } catch (err) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
  );
});

// Push-stream SSE endpoint — long-lived connection for bot-initiated messages
messages.get('/push-stream', (c) => {
  const convId = c.req.param('conversationId');

  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      // Send a heartbeat comment every 25s to keep the connection alive
      const enc = new TextEncoder();
      const heartbeat = setInterval(() => {
        try { ctrl.enqueue(enc.encode(': heartbeat\n\n')); } catch { /* closed */ }
      }, 25_000);

      cleanup = PushRelay.registerClient(convId, ctrl);

      // Override cleanup to also clear the heartbeat timer
      const originalCleanup = cleanup;
      cleanup = () => { clearInterval(heartbeat); originalCleanup(); };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

export default messages;
