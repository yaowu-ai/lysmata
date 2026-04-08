import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  readLlmSettings,
  updateLlmSettings,
  applyOnboardingTemplate,
  deleteProviderSettings,
  readProviderApiKey,
  writeProviderApiKey,
  readGatewaySettings,
  updateGatewayConfig,
  readChannelSettings,
  updateChannelSettings,
  OPENCLAW_API_TYPES,
} from "../../core/openclaw-config-file";
import type { HookEntry } from "../../../../src/shared/types";
import { getDb } from "../../shared/db";
import { resolveOpenclawBin, spawnWithPath } from "../../shared/openclaw-bin";

const settings = new Hono();

const providerModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  reasoning: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  cost: z
    .object({
      input: z.number(),
      output: z.number(),
      cacheRead: z.number(),
      cacheWrite: z.number(),
    })
    .optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
});

const providerSchema = z.object({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  api: z.enum(OPENCLAW_API_TYPES).optional(),
  models: z.array(providerModelSchema),
});

const llmSettingsSchema = z.object({
  providers: z.record(z.string(), providerSchema),
  defaultModel: z.object({
    primary: z.string(),
    fallbacks: z.array(z.string()).optional(),
  }),
});

const onboardingTemplateSchema = z.object({
  templateId: z.enum(["general", "info", "task"]),
});

settings.get("/llm", async (c) => {
  try {
    const data = await readLlmSettings();
    return c.json(data);
  } catch {
    return c.json({ error: "Failed to read LLM settings" }, 500);
  }
});

settings.put("/llm", zValidator("json", llmSettingsSchema), async (c) => {
  try {
    const body = c.req.valid("json");
    await updateLlmSettings(body);
    return c.json({ success: true });
  } catch {
    return c.json({ error: "Failed to update LLM settings" }, 500);
  }
});

settings.post("/apply-template", zValidator("json", onboardingTemplateSchema), async (c) => {
  try {
    const body = c.req.valid("json");
    const data = await applyOnboardingTemplate(body.templateId);
    return c.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply onboarding template";
    return c.json({ error: message }, 400);
  }
});

settings.get("/gateway", async (c) => {
  try {
    const data = await readGatewaySettings();
    return c.json(data);
  } catch {
    return c.json({ error: "Failed to read gateway settings" }, 500);
  }
});

const gatewayUpdateSchema = z.object({
  mode: z.enum(["local", "remote"]).optional(),
  port: z.number().int().min(1024).max(65535).optional(),
  bind: z.enum(["loopback", "lan"]).optional(),
  authMode: z.enum(["none", "token"]).optional(),
  authToken: z.string().optional(),
});

settings.put("/gateway", zValidator("json", gatewayUpdateSchema), async (c) => {
  try {
    const body = c.req.valid("json");
    await updateGatewayConfig(body);
    return c.json({ success: true, needsRestart: true });
  } catch (err) {
    console.error("Failed to update gateway settings:", err);
    return c.json({ error: "Failed to update gateway settings" }, 500);
  }
});

settings.get("/llm/provider-usage", async (c) => {
  const providerKey = c.req.query("key");
  if (!providerKey) return c.json({ error: "Missing ?key= parameter" }, 400);

  const db = getDb();
  try {
    const stmt = db.query<{ id: string; name: string }, [string]>(
      `SELECT id, name FROM bots WHERE llm_config LIKE ? AND is_active = 1`,
    );
    const bots = stmt.all(`%"provider":"${providerKey}"%`);

    return c.json({
      inUse: bots.length > 0,
      count: bots.length,
      bots: bots.map((b) => ({ id: b.id, name: b.name })),
    });
  } catch (err) {
    console.error("Failed to check provider usage:", err);
    return c.json({ error: "Failed to check provider usage" }, 500);
  }
});

settings.delete("/llm/providers", async (c) => {
  const providerKey = c.req.query("key");
  if (!providerKey) return c.json({ error: "Missing ?key= parameter" }, 400);

  try {
    const current = await readLlmSettings();
    if (!(providerKey in current.providers)) {
      return c.json({ error: "Provider not found" }, 404);
    }

    const { [providerKey]: _removed, ...remaining } = current.providers;

    const primaryProvider = current.defaultModel.primary?.split("/")[0];
    const defaultModel =
      primaryProvider === providerKey
        ? { primary: "", fallbacks: [] }
        : current.defaultModel;

    await deleteProviderSettings(providerKey, { providers: remaining, defaultModel });
    return c.json({ success: true });
  } catch (err) {
    console.error("Failed to delete provider:", err);
    return c.json({ error: "Failed to delete provider" }, 500);
  }
});

// GET /llm/provider-apikey?key=zai  → returns { apiKey: "..." | null }
settings.get("/llm/provider-apikey", async (c) => {
  const providerKey = c.req.query("key");
  if (!providerKey) return c.json({ error: "Missing ?key= parameter" }, 400);
  try {
    const apiKey = await readProviderApiKey(providerKey);
    return c.json({ apiKey: apiKey ?? null });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// PUT /llm/provider-apikey  { key: "zai", apiKey: "sk-..." }
settings.put("/llm/provider-apikey", async (c) => {
  const body = await c.req.json<{ key: string; apiKey: string }>();
  if (!body.key || !body.apiKey) return c.json({ error: "key and apiKey required" }, 400);
  try {
    await writeProviderApiKey(body.key, body.apiKey);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

settings.post("/gateway-restart", async (c) => {
  try {
    const bin = await resolveOpenclawBin();

    // 先尝试 service 模式重启（launchd）
    const restartProc = spawnWithPath([bin, "gateway", "restart"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [restartStderr, restartCode] = await Promise.all([
      new Response(restartProc.stderr).text(),
      restartProc.exited,
    ]);

    if (restartCode === 0) {
      return c.json({ success: true });
    }

    // 降级：Gateway 未注册为系统服务，改用 stop + start
    console.warn("gateway restart failed (service mode), falling back to stop+start:", restartStderr);

    const stopProc = spawnWithPath([bin, "gateway", "stop"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await stopProc.exited; // 忽略 stop 的退出码（进程可能已不存在）

    const startProc = spawnWithPath([bin, "gateway", "start"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [startStderr, startCode] = await Promise.all([
      new Response(startProc.stderr).text(),
      startProc.exited,
    ]);

    if (startCode !== 0) {
      console.error("Gateway start failed:", startStderr);
      return c.json({ success: false, error: startStderr || "重启失败" }, 500);
    }

    return c.json({ success: true });
  } catch (err) {
    console.error("Gateway restart error:", err);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

const channelEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  token: z.string(),
  enabled: z.boolean(),
});

settings.get("/channels", async (c) => {
  try {
    const data = await readChannelSettings();
    return c.json(data);
  } catch {
    return c.json({ error: "Failed to read channel settings" }, 500);
  }
});

settings.put("/channels", zValidator("json", z.array(channelEntrySchema)), async (c) => {
  try {
    const body = c.req.valid("json");
    await updateChannelSettings(body);
    return c.json({ success: true });
  } catch {
    return c.json({ error: "Failed to update channel settings" }, 500);
  }
});

const hookUpdateSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
});

settings.get("/hooks", async (c) => {
  try {
    const bin = await resolveOpenclawBin();
    const proc = spawnWithPath([bin, "hooks", "list", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) return c.json<HookEntry[]>([]);
    const parsed = JSON.parse(stdout) as {
      hooks: { name: string; description?: string; emoji?: string; disabled?: boolean }[];
    };
    const hooks: HookEntry[] = (parsed.hooks ?? []).map((h) => ({
      id: h.name,
      name: h.name,
      description: h.description,
      emoji: h.emoji,
      enabled: !h.disabled,
    }));
    return c.json(hooks);
  } catch {
    return c.json<HookEntry[]>([]);
  }
});

settings.put("/hooks", zValidator("json", z.array(hookUpdateSchema)), async (c) => {
  try {
    const body = c.req.valid("json");
    const bin = await resolveOpenclawBin();
    await Promise.all(
      body.map(async (hook) => {
        const cmd = hook.enabled ? "enable" : "disable";
        const proc = spawnWithPath([bin, "hooks", cmd, hook.id], {
          stdout: "pipe",
          stderr: "pipe",
        });
        await proc.exited;
      }),
    );
    return c.json({ success: true });
  } catch {
    return c.json({ error: "Failed to update hook settings" }, 500);
  }
});

// 去除 ANSI 转义码（颜色、光标等控制字符）
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

settings.get("/models", async (c) => {
  try {
    const bin = await resolveOpenclawBin();
    const proc = spawnWithPath([bin, "models", "list"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) return c.json<string[]>([]);
    const models = stdout
      .split("\n")
      .map((l) => l.replace(ANSI_RE, "").trim()) // 去掉颜色码
      .map((l) => l.split(/\s+/)[0])             // 只取第一列（模型 ID）
      .filter((l) => !!l && !l.startsWith("-") && l !== "Model"); // 去掉表头/分隔线
    return c.json(models);
  } catch {
    return c.json<string[]>([]);
  }
});

export default settings;
