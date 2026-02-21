import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { MessageRouter } from '../../core/message-router';
import { BotService } from '../../core/bot-service';
import { OpenClawProxy } from '../../core/openclaw-proxy';
import { notFound } from '../../shared/errors';
import { createPushSseResponse } from '../../shared/sse';

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
    const botMsg = await MessageRouter.route(convId, content, () => {});
    return c.json(botMsg, 201);
  },
);

messages.post(
  '/approvals/:approvalId/resolve',
  zValidator('json', z.object({ botId: z.string(), approved: z.boolean() })),
  async (c) => {
    const { botId, approved } = c.req.valid('json');
    const approvalId = c.req.param('approvalId');
    const bot = BotService.findById(botId);
    if (!bot) throw notFound('Bot');

    await OpenClawProxy.resolveApproval(
      bot.openclaw_ws_url,
      bot.openclaw_ws_token || undefined,
      approvalId,
      approved
    );

    return c.json({ success: true });
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
messages.get('/push-stream', (c) => createPushSseResponse(c.req.param('conversationId')));

export default messages;
