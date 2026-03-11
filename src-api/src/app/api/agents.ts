import { Hono } from "hono";
import type { Agent, AgentBinding, CreateAgentInput, BindAgentInput } from "../../../../src/shared/types";
import { AppLogger } from "../../shared/app-logger";
import { resolveOpenclawBin, resetOpenclawBinCache } from "../../shared/openclaw-bin";
import { updateAgentModel } from "../../core/openclaw-config-file";

const app = new Hono();

interface ApiResult<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/**
 * Resolve the openclaw binary path, returning null if CLI is not installed.
 *
 * Uses resolveOpenclawBin() which does thorough file-existence checks across
 * NVM version directories, well-known paths, and enriched PATH lookups —
 * much more reliable than a plain `which openclaw`.
 */
async function requireOpenClawBin(): Promise<string | null> {
  const bin = await resolveOpenclawBin();
  if (bin.startsWith("/")) return bin;
  // Bare "openclaw" means no installation was found — reset the cache so the
  // next request re-probes (the user may install between requests).
  resetOpenclawBinCache();
  AppLogger.warn("openclaw CLI not found", {
    resolvedBin: bin,
    PATH: process.env.PATH?.substring(0, 200),
    HOME: process.env.HOME,
  });
  return null;
}

/**
 * 解析 `openclaw agents list` 的输出
 *
 * 示例输出格式：
 * - main (default)
 *   Identity: 🐧 Andrew (IDENTITY.md)
 *   Workspace: /Users/user/.openclaw/workspace-main
 *   Agent dir: /Users/user/.openclaw/agents/main
 *   Model: openrouter/deepseek/deepseek-v3.2-exp
 *   Routing rules: 2
 */
function parseAgentList(output: string): Agent[] {
  const agents: Agent[] = [];
  const lines = output.split("\n");
  let currentAgent: Partial<Agent> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 匹配 Agent 头部：- main (default) 或 - demo (Demo)
    const headerMatch = trimmed.match(/^-\s+(\S+)(?:\s+\((.+?)\))?$/);
    if (headerMatch) {
      if (currentAgent?.id) {
        agents.push(currentAgent as Agent);
      }
      const [, id, label] = headerMatch;
      currentAgent = {
        id,
        displayName: label && !label.includes("default") ? label : undefined,
        isDefault: trimmed.includes("(default)"),
        routingRules: 0,
        workspace: "",
        agentDir: "",
      };
      continue;
    }

    if (!currentAgent) continue;

    // 解析属性
    if (trimmed.startsWith("Identity:")) {
      currentAgent.identity = trimmed.replace("Identity:", "").trim();
    } else if (trimmed.startsWith("Workspace:")) {
      currentAgent.workspace = trimmed.replace("Workspace:", "").trim();
    } else if (trimmed.startsWith("Agent dir:")) {
      currentAgent.agentDir = trimmed.replace("Agent dir:", "").trim();
    } else if (trimmed.startsWith("Model:")) {
      currentAgent.model = trimmed.replace("Model:", "").trim();
    } else if (trimmed.startsWith("Routing rules:")) {
      const count = trimmed.replace("Routing rules:", "").trim();
      currentAgent.routingRules = parseInt(count, 10) || 0;
    }
  }

  if (currentAgent?.id) {
    agents.push(currentAgent as Agent);
  }

  return agents;
}

/**
 * 解析 `openclaw agents bindings` 的输出
 *
 * 示例输出格式：
 * telegram:account1 -> main
 * discord -> demo
 * No routing bindings.
 */
function parseBindings(output: string): AgentBinding[] {
  const bindings: AgentBinding[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "No routing bindings.") continue;

    const match = trimmed.match(/^(.+?)\s+->\s+(.+)$/);
    if (match) {
      const [, binding, agent] = match;
      const [channel, accountId] = binding.split(":");
      bindings.push({
        agent,
        channel,
        accountId: accountId || undefined,
      });
    }
  }

  return bindings;
}

/**
 * GET /agents - 列出所有 Agent
 */
app.get("/", async (c) => {
  try {
    const bin = await requireOpenClawBin();
    if (!bin) {
      return c.json<ApiResult<Agent[]>>({
        success: false,
        message: "openclaw CLI 未安装，请先安装 OpenClaw",
      });
    }

    const proc = Bun.spawn([bin, "agents", "list"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      return c.json<ApiResult<Agent[]>>({
        success: false,
        message: stderr || "命令执行失败",
      });
    }

    const agents = parseAgentList(stdout);
    return c.json<ApiResult<Agent[]>>({
      success: true,
      data: agents,
    });
  } catch (err) {
    return c.json<ApiResult<Agent[]>>({
      success: false,
      message: String(err),
    });
  }
});

/**
 * GET /agents/bindings - 查看绑定关系
 */
app.get("/bindings", async (c) => {
  try {
    const bin = await requireOpenClawBin();
    if (!bin) {
      return c.json<ApiResult<AgentBinding[]>>({
        success: false,
        message: "openclaw CLI 未安装",
      });
    }

    const proc = Bun.spawn([bin, "agents", "bindings"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      return c.json<ApiResult<AgentBinding[]>>({
        success: false,
        message: stderr || "命令执行失败",
      });
    }

    const bindings = parseBindings(stdout);
    return c.json<ApiResult<AgentBinding[]>>({
      success: true,
      data: bindings,
    });
  } catch (err) {
    return c.json<ApiResult<AgentBinding[]>>({
      success: false,
      message: String(err),
    });
  }
});

/**
 * POST /agents - 新增 Agent
 */
app.post("/", async (c) => {
  try {
    const bin = await requireOpenClawBin();
    AppLogger.info("agent.create: CLI check", { cliAvailable: !!bin, resolvedBin: bin });
    if (!bin) {
      AppLogger.error("agent.create: openclaw CLI not found");
      return c.json<ApiResult<void>>({ success: false, message: "openclaw CLI 未安装" });
    }

    const input = await c.req.json<CreateAgentInput>();
    AppLogger.info("agent.create: received input", {
      name: input.name,
      workspaceRaw: input.workspace ?? null,
      agentDir: input.agentDir ?? null,
      model: input.model ?? null,
      bindings: input.bindings ?? [],
    });

    if (!input.name) {
      AppLogger.warn("agent.create: missing Agent ID");
      return c.json<ApiResult<void>>({ success: false, message: "Agent ID 不能为空" });
    }

    const args = [bin, "agents", "add", input.name];
    // --json 触发非交互模式，此模式强制要求 --workspace；用户未填时使用默认路径
    const workspace = input.workspace?.trim() || `${process.env.HOME ?? "~"}/.openclaw/workspace-${input.name}`;
    args.push("--workspace", workspace);
    if (input.agentDir) args.push("--agent-dir", input.agentDir);
    if (input.model) args.push("--model", input.model);
    if (input.bindings && input.bindings.length > 0) {
      for (const binding of input.bindings) args.push("--bind", binding);
    }
    args.push("--json");

    AppLogger.info("agent.create: spawning CLI", { cmd: args.join(" ") });

    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    AppLogger.info("agent.create: CLI exited", {
      exitCode,
      stdout: stdout.trim() || null,
      stderr: stderr.trim() || null,
    });

    if (exitCode !== 0) {
      AppLogger.error("agent.create: failed", { exitCode, stderr: stderr.trim() });
      return c.json<ApiResult<void>>({
        success: false,
        message: stderr.trim() || "创建 Agent 失败",
      });
    }

    AppLogger.info("agent.create: success", { agentId: input.name });
    return c.json<ApiResult<void>>({ success: true, message: `Agent "${input.name}" 创建成功` });
  } catch (err) {
    AppLogger.error("agent.create: exception", { error: String(err) });
    return c.json<ApiResult<void>>({ success: false, message: String(err) });
  }
});

/**
 * PATCH /agents/:id - 更新 Agent 模型（直接写入 openclaw.json）
 */
app.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json<{ model?: string }>();

    if (!body.model?.trim()) {
      return c.json<ApiResult<void>>({ success: false, message: "model 不能为空" });
    }

    await updateAgentModel(id, body.model.trim());
    return c.json<ApiResult<void>>({ success: true, message: `Agent "${id}" 模型已更新` });
  } catch (err) {
    return c.json<ApiResult<void>>({ success: false, message: String(err) });
  }
});

/**
 * DELETE /agents/:id - 删除 Agent
 */
app.delete("/:id", async (c) => {
  try {
    const bin = await requireOpenClawBin();
    if (!bin) {
      return c.json<ApiResult<void>>({
        success: false,
        message: "openclaw CLI 未安装",
      });
    }

    const id = c.req.param("id");
    const proc = Bun.spawn([bin, "agents", "delete", id, "--force", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      return c.json<ApiResult<void>>({
        success: false,
        message: stderr || "删除 Agent 失败",
      });
    }

    return c.json<ApiResult<void>>({
      success: true,
      message: `Agent "${id}" 已删除`,
    });
  } catch (err) {
    return c.json<ApiResult<void>>({
      success: false,
      message: String(err),
    });
  }
});

/**
 * POST /agents/:id/bind - 绑定 Gateway
 */
app.post("/:id/bind", async (c) => {
  try {
    const bin = await requireOpenClawBin();
    if (!bin) {
      return c.json<ApiResult<void>>({
        success: false,
        message: "openclaw CLI 未安装",
      });
    }

    const id = c.req.param("id");
    const input = await c.req.json<BindAgentInput>();

    if (!input.bindings || input.bindings.length === 0) {
      return c.json<ApiResult<void>>({
        success: false,
        message: "绑定列表不能为空",
      });
    }

    const args = [bin, "agents", "bind", "--agent", id];
    for (const binding of input.bindings) {
      args.push("--bind", binding);
    }

    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      return c.json<ApiResult<void>>({
        success: false,
        message: stderr || "绑定失败",
      });
    }

    return c.json<ApiResult<void>>({
      success: true,
      message: "绑定成功",
    });
  } catch (err) {
    return c.json<ApiResult<void>>({
      success: false,
      message: String(err),
    });
  }
});

export default app;
