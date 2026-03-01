import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ConversationService } from "../../core/conversation-service";
import { notFound } from "../../shared/errors";

const conversations = new Hono();

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["single", "group"]),
  botIds: z.array(z.string()).min(1),
  primaryBotId: z.string(),
});

conversations.get("/", (c) => c.json(ConversationService.findAll()));

conversations.get("/:id", (c) => {
  const conv = ConversationService.findById(c.req.param("id"));
  if (!conv) throw notFound("Conversation");
  return c.json(conv);
});

conversations.post("/", zValidator("json", createSchema), (c) => {
  const conv = ConversationService.create(c.req.valid("json"));
  return c.json(conv, 201);
});

conversations.delete("/:id", (c) => {
  const deleted = ConversationService.delete(c.req.param("id"));
  if (!deleted) throw notFound("Conversation");
  return c.json({ success: true });
});

conversations.post("/:id/bots", zValidator("json", z.object({ botId: z.string() })), (c) => {
  ConversationService.addBot(c.req.param("id"), c.req.valid("json").botId);
  return c.json({ success: true });
});

conversations.delete("/:id/bots/:botId", (c) => {
  ConversationService.removeBot(c.req.param("id"), c.req.param("botId"));
  return c.json({ success: true });
});

conversations.patch("/:id/bots/:botId/primary", (c) => {
  ConversationService.setPrimaryBot(c.req.param("id"), c.req.param("botId"));
  return c.json({ success: true });
});

export default conversations;
