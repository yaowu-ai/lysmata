import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { BotService } from "../../core/bot-service";
import { OpenClawProxy } from "../../core/openclaw-proxy";
import { notFound } from "../../shared/errors";
import { createPushSseResponse } from "../../shared/sse";

import { PushRelay } from "../../core/push-relay";

const bots = new Hono();

function normalizeAgentId(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized || "main";
}

const llmConfigSchema = z
  .object({
    provider: z.enum(["openai", "anthropic", "google", "openrouter", "custom"]).optional(),
    model: z.string().optional(),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  })
  .optional();

const createSchema = z.object({
  name: z.string().min(1),
  avatar_emoji: z.string().optional(),
  description: z.string().optional(),
  skills_config: z.array(z.object({ name: z.string(), description: z.string() })).optional(),
  mcp_config: z.unknown().optional(),
  llm_config: llmConfigSchema,
  openclaw_ws_url: z.string().min(1),
  openclaw_ws_token: z.string().optional(),
  openclaw_agent_id: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

bots.get("/", (c) => c.json(BotService.findAll()));

// Must be registered before /:id so the static segment wins over the dynamic one
bots.get("/global-stream", () => createPushSseResponse("global"));

bots.get("/:id", (c) => {
  const bot = BotService.findById(c.req.param("id"));
  if (!bot) throw notFound("Bot");
  return c.json(bot);
});

bots.post("/", zValidator("json", createSchema), (c) => {
  const bot = BotService.create(c.req.valid("json"));
  if (bot.openclaw_ws_url?.startsWith("ws")) {
    OpenClawProxy.setPushHandler(bot.openclaw_ws_url, (event) => {
      PushRelay.handlePush(event, bot.id);
    });
    OpenClawProxy.prewarmConnection(bot.openclaw_ws_url, bot.openclaw_ws_token || undefined).catch(
      () => {},
    );
  }
  return c.json(bot, 201);
});

bots.put("/:id", zValidator("json", updateSchema), (c) => {
  const bot = BotService.update(c.req.param("id"), c.req.valid("json"));
  if (!bot) throw notFound("Bot");
  if (bot.openclaw_ws_url?.startsWith("ws")) {
    OpenClawProxy.setPushHandler(bot.openclaw_ws_url, (event) => {
      PushRelay.handlePush(event, bot.id);
    });
    OpenClawProxy.prewarmConnection(bot.openclaw_ws_url, bot.openclaw_ws_token || undefined).catch(
      () => {},
    );
  }
  return c.json(bot);
});

bots.delete("/:id", (c) => {
  const deleted = BotService.delete(c.req.param("id"));
  if (!deleted) throw notFound("Bot");
  return c.json({ success: true });
});

bots.get("/:id/conversations-count", (c) => {
  const bot = BotService.findById(c.req.param("id"));
  if (!bot) throw notFound("Bot");
  const count = BotService.conversationCount(c.req.param("id"));
  return c.json({ count });
});

bots.get("/:id/remote-config", async (c) => {
  const bot = BotService.findById(c.req.param("id"));
  if (!bot) throw notFound("Bot");
  const result = await OpenClawProxy.getConfig(
    bot.openclaw_ws_url,
    bot.openclaw_ws_token ?? undefined,
    normalizeAgentId(bot.openclaw_agent_id),
  );
  return c.json(result);
});

bots.post("/:id/test-connection", async (c) => {
  const bot = BotService.findById(c.req.param("id"));
  if (!bot) throw notFound("Bot");
  const result = await OpenClawProxy.testConnection(
    bot.openclaw_ws_url,
    bot.openclaw_ws_token ?? undefined,
  );
  BotService.updateStatus(bot.id, result.success ? "connected" : "error");
  return c.json(result);
});

bots.post("/:id/apply-config", async (c) => {
  const bot = BotService.findById(c.req.param("id"));
  if (!bot) throw notFound("Bot");

  let llm: Record<string, unknown> | undefined;
  try {
    llm = JSON.parse(bot.llm_config) as Record<string, unknown>;
  } catch {
    llm = undefined;
  }
  if (llm && Object.keys(llm).length === 0) llm = undefined;

  const result = await OpenClawProxy.applyConfig(
    bot.openclaw_ws_url,
    bot.openclaw_ws_token ?? undefined,
    {
      agentId: normalizeAgentId(bot.openclaw_agent_id),
      ...(llm ? { llm } : {}),
    },
  );

  if (result.success) {
    BotService.updateStatus(bot.id, "connected");
  }

  return c.json(result);
});

export default bots;
