import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { BotService } from "../../core/bot-service";
import { getAdapter, detectBackendType } from "../../core/adapters/registry";
import type { AgentBackendType } from "../../core/adapters/types";
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
  backend_type: z.enum(["openclaw", "hermes", "openai-compatible"]).optional(),
  backend_url: z.string().min(1),
  backend_token: z.string().optional(),
  agent_id: z.string().min(1).optional(),
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
  const input = c.req.valid("json");
  // Auto-detect backend_type from URL if not provided
  const backendType: AgentBackendType = input.backend_type ?? detectBackendType(input.backend_url);
  const bot = BotService.create({ ...input, backend_type: backendType });

  // Set up push handler and prewarm connection for the adapter
  const adapter = getAdapter(backendType);
  if (adapter.setPushHandler) {
    adapter.setPushHandler(bot.backend_url, (event) => {
      PushRelay.handlePush(event, bot.id);
    });
  }
  if (adapter.prewarmConnection) {
    adapter.prewarmConnection(bot.backend_url, bot.backend_token || undefined).catch(() => {});
  }
  return c.json(bot, 201);
});

bots.put("/:id", zValidator("json", updateSchema), (c) => {
  const bot = BotService.update(c.req.param("id"), c.req.valid("json"));
  if (!bot) throw notFound("Bot");

  // Re-register push handler and prewarm for the adapter
  const adapter = getAdapter(bot.backend_type);
  if (adapter.setPushHandler) {
    adapter.setPushHandler(bot.backend_url, (event) => {
      PushRelay.handlePush(event, bot.id);
    });
  }
  if (adapter.prewarmConnection) {
    adapter.prewarmConnection(bot.backend_url, bot.backend_token || undefined).catch(() => {});
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
  const adapter = getAdapter(bot.backend_type);
  if (!adapter.getRemoteConfig) {
    return c.json({ success: false, message: "此 Agent 后端不支持远程配置读取" });
  }
  const result = await adapter.getRemoteConfig(
    bot.backend_url,
    bot.backend_token ?? "",
    normalizeAgentId(bot.agent_id),
  );
  return c.json(result);
});

bots.post("/:id/test-connection", async (c) => {
  const bot = BotService.findById(c.req.param("id"));
  if (!bot) throw notFound("Bot");
  const body = await c.req.json().catch(() => ({}));
  const url = body.backend_url || bot.backend_url;
  const token = body.backend_token ?? bot.backend_token ?? undefined;
  const adapter = getAdapter(bot.backend_type);
  const result = await adapter.testConnection(url, token);
  BotService.updateStatus(bot.id, result.success ? "connected" : "error");
  return c.json(result);
});

bots.post("/:id/apply-config", async (c) => {
  const bot = BotService.findById(c.req.param("id"));
  if (!bot) throw notFound("Bot");

  const adapter = getAdapter(bot.backend_type);
  if (!adapter.applyRemoteConfig) {
    return c.json({ success: false, message: "此 Agent 后端不支持远程配置写入" });
  }

  let llm: Record<string, unknown> | undefined;
  try {
    llm = JSON.parse(bot.llm_config) as Record<string, unknown>;
  } catch {
    llm = undefined;
  }
  if (llm && Object.keys(llm).length === 0) llm = undefined;

  const result = await adapter.applyRemoteConfig(
    bot.backend_url,
    bot.backend_token ?? "",
    {
      agentId: normalizeAgentId(bot.agent_id),
      ...(llm ? { llm } : {}),
    },
  );

  if (result.success) {
    BotService.updateStatus(bot.id, "connected");
  }

  return c.json(result);
});

export default bots;
