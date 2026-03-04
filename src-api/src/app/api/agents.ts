import { Hono } from "hono";
import type { Agent, AgentBinding, CreateAgentInput, BindAgentInput } from "../../../../src/shared/types";

const app = new Hono();

interface ApiResult<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/**
 * 检查 OpenClaw CLI 是否已安装
 */
async function checkOpenClawCli(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", "openclaw"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
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
    if (!(await checkOpenClawCli())) {
      return c.json<ApiResult<Agent[]>>({
        success: false,
        message: "openclaw CLI 未安装，请先安装 OpenClaw",
      });
    }

    const proc = Bun.spawn(["openclaw", "agents", "list"], {
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
    if (!(await checkOpenClawCli())) {
      return c.json<ApiResult<AgentBinding[]>>({
        success: false,
        message: "openclaw CLI 未安装",
      });
    }

    const proc = Bun.spawn(["openclaw", "agents", "bindings"], {
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
    if (!(await checkOpenClawCli())) {
      return c.json<ApiResult<void>>({
        success: false,
        message: "openclaw CLI 未安装",
      });
    }

    const input = await c.req.json<CreateAgentInput>();

    if (!input.name) {
      return c.json<ApiResult<void>>({
        success: false,
        message: "Agent ID 不能为空",
      });
    }

    const args = ["openclaw", "agents", "add", input.name];

    if (input.workspace) {
      args.push("--workspace", input.workspace);
    }
    if (input.agentDir) {
      args.push("--agent-dir", input.agentDir);
    }
    if (input.model) {
      args.push("--model", input.model);
    }
    if (input.bindings && input.bindings.length > 0) {
      for (const binding of input.bindings) {
        args.push("--bind", binding);
      }
    }

    args.push("--json");

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
        message: stderr || "创建 Agent 失败",
      });
    }

    return c.json<ApiResult<void>>({
      success: true,
      message: `Agent "${input.name}" 创建成功`,
    });
  } catch (err) {
    return c.json<ApiResult<void>>({
      success: false,
      message: String(err),
    });
  }
});

/**
 * DELETE /agents/:id - 删除 Agent
 */
app.delete("/:id", async (c) => {
  try {
    if (!(await checkOpenClawCli())) {
      return c.json<ApiResult<void>>({
        success: false,
        message: "openclaw CLI 未安装",
      });
    }

    const id = c.req.param("id");

    const proc = Bun.spawn(["openclaw", "agents", "delete", id, "--force", "--json"], {
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
    if (!(await checkOpenClawCli())) {
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

    const args = ["openclaw", "agents", "bind", "--agent", id];
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
