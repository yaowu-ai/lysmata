import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { MessageRouter } from '../../core/message-router';

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

export default messages;
