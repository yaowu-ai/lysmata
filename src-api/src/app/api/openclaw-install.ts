/**
 * OpenClaw installation API
 *
 * Strategy:
 *   1. Detect environment (Node.js 22+, existing openclaw, platform)
 *   2. If Node.js 22+ present → npm install -g openclaw@latest
 *   3. If Node.js missing → run official install.sh (macOS/Linux) or install.ps1 (Windows)
 *   4. Verify installation with openclaw --version
 *
 * All install steps are streamed via SSE so the frontend can show real-time progress.
 */

import { Hono } from "hono";
import { stream } from "hono/streaming";
import { updateGatewayConfig } from "../../core/openclaw-config-file";

const app = new Hono();

// ── PATH helpers ─────────────────────────────────────────────────────────────

const COMMON_PATH_DIRS = [
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
];

function getEnrichedPath(): string {
  const home = process.env.HOME ?? "";
  const existing = process.env.PATH ?? "";
  const extra = [
    `${home}/.nvm/current/bin`,
    `${home}/.fnm/current/bin`,
    `${home}/.local/bin`,
    `${home}/.openclaw/bin`,
    ...COMMON_PATH_DIRS,
  ];
  const parts = existing.split(":");
  for (const dir of extra) {
    if (!parts.includes(dir)) parts.push(dir);
  }
  return parts.join(":");
}

function spawnEnv(): Record<string, string> {
  return { ...process.env, PATH: getEnrichedPath() } as Record<string, string>;
}

async function which(bin: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["which", bin], { stdout: "pipe", stderr: "pipe", env: spawnEnv() });
    const path = (await new Response(proc.stdout).text()).trim();
    const code = await proc.exited;
    return code === 0 && path ? path : null;
  } catch {
    return null;
  }
}

async function exec(
  cmd: string[],
  opts?: { cwd?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    env: spawnEnv(),
    cwd: opts?.cwd,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// ── SSE event types ──────────────────────────────────────────────────────────

interface InstallEvent {
  step?: string;
  message?: string;
  progress?: number;
  log?: string;
  error?: string;
  success?: boolean;
}

// ── Environment check ────────────────────────────────────────────────────────

interface EnvCheckResult {
  canInstall: boolean;
  message: string;
  hasOpenClaw: boolean;
  openclawVersion?: string;
  openclawPath?: string;
  hasNode: boolean;
  nodeVersion?: string;
  nodeMajor?: number;
  nodePath?: string;
  hasNpm: boolean;
  npmPath?: string;
  hasCurl: boolean;
  platform: string;
}

async function checkEnvironment(): Promise<EnvCheckResult> {
  const platform = process.platform;

  // Detect OpenClaw
  const openclawPath = await which("openclaw");
  let openclawVersion: string | undefined;
  if (openclawPath) {
    const r = await exec([openclawPath, "--version"]);
    if (r.exitCode === 0) openclawVersion = r.stdout;
  }

  // Detect Node.js
  const nodePath = await which("node");
  let nodeVersion: string | undefined;
  let nodeMajor: number | undefined;
  if (nodePath) {
    const r = await exec([nodePath, "--version"]);
    if (r.exitCode === 0) {
      nodeVersion = r.stdout;
      const m = nodeVersion.match(/^v?(\d+)/);
      if (m) nodeMajor = parseInt(m[1], 10);
    }
  }

  // Detect npm
  const npmPath = await which("npm");

  // Detect curl
  const hasCurl = !!(await which("curl"));

  const hasOpenClaw = !!openclawPath;
  const hasNode = !!nodePath && (nodeMajor ?? 0) >= 22;
  const hasNpm = !!npmPath;

  let canInstall = true;
  let message = "环境检查通过";

  if (hasOpenClaw) {
    message = `OpenClaw 已安装 (${openclawVersion ?? "unknown"})`;
  } else if (hasNode && hasNpm) {
    message = `Node.js ${nodeVersion} 就绪，可以安装 OpenClaw`;
  } else if (hasCurl && platform !== "win32") {
    message = "将通过官方安装脚本自动安装（含 Node.js）";
  } else if (!hasNode) {
    canInstall = false;
    message = "未检测到 Node.js 22+，请先安装 Node.js";
  }

  return {
    canInstall,
    message,
    hasOpenClaw,
    openclawVersion,
    openclawPath: openclawPath ?? undefined,
    hasNode,
    nodeVersion,
    nodeMajor,
    nodePath: nodePath ?? undefined,
    hasNpm,
    npmPath: npmPath ?? undefined,
    hasCurl,
    platform,
  };
}

// ── Install logic ────────────────────────────────────────────────────────────

type SendEvent = (event: InstallEvent) => void;

async function runNpmInstall(send: SendEvent, npmPath: string): Promise<boolean> {
  send({ step: "installing", message: "正在通过 npm 安装 OpenClaw...", progress: 40 });
  send({ log: `npm path: ${npmPath}` });
  send({ log: "$ npm install -g openclaw@latest" });

  const proc = Bun.spawn([npmPath, "install", "-g", "openclaw@latest"], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...spawnEnv(),
      SHARP_IGNORE_GLOBAL_LIBVIPS: "1",
    },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (stdout.trim()) {
    for (const line of stdout.trim().split("\n")) {
      send({ log: line });
    }
  }
  if (stderr.trim()) {
    for (const line of stderr.trim().split("\n")) {
      if (line.includes("WARN")) send({ log: `⚠ ${line}` });
      else send({ log: line });
    }
  }

  if (exitCode !== 0) {
    send({ log: `npm install 退出码: ${exitCode}` });
    return false;
  }

  send({ log: "npm install 完成" });
  return true;
}

async function runInstallScript(send: SendEvent): Promise<boolean> {
  send({ step: "installing", message: "正在执行官方安装脚本...", progress: 30 });
  send({ log: "$ curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard" });

  const proc = Bun.spawn(
    ["bash", "-c", "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard"],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...spawnEnv(),
        NONINTERACTIVE: "1",
      },
    },
  );

  const decoder = new TextDecoder();

  const streamOutput = async (
    reader: ReadableStream<Uint8Array>,
    prefix?: string,
  ) => {
    const r = reader.getReader();
    let buf = "";
    while (true) {
      const { done, value } = await r.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) send({ log: prefix ? `${prefix}${line}` : line });
      }
    }
    if (buf.trim()) send({ log: prefix ? `${prefix}${buf}` : buf });
  };

  await Promise.all([
    streamOutput(proc.stdout),
    streamOutput(proc.stderr, ""),
  ]);

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    send({ log: `安装脚本退出码: ${exitCode}` });
    return false;
  }

  send({ log: "安装脚本执行完成" });
  return true;
}

async function verifyInstallation(send: SendEvent): Promise<boolean> {
  send({ step: "verifying", message: "验证安装结果...", progress: 85 });

  // Give PATH a moment to settle, then re-detect
  const openclawPath = await which("openclaw");
  if (!openclawPath) {
    // Try common known locations directly
    const home = process.env.HOME ?? "";
    const candidates = [
      `${home}/.openclaw/bin/openclaw`,
      "/usr/local/bin/openclaw",
      `${home}/.npm-global/bin/openclaw`,
    ];
    for (const p of candidates) {
      try {
        const f = Bun.file(p);
        if (await f.exists()) {
          const r = await exec([p, "--version"]);
          if (r.exitCode === 0) {
            send({ log: `找到 openclaw: ${p} (${r.stdout})` });
            send({ step: "verifying", message: "安装验证通过", progress: 95 });
            return true;
          }
        }
      } catch { /* skip */ }
    }
    send({ log: "未找到 openclaw 可执行文件" });
    return false;
  }

  const r = await exec([openclawPath, "--version"]);
  if (r.exitCode === 0) {
    send({ log: `openclaw 版本: ${r.stdout}` });
    send({ step: "verifying", message: "安装验证通过", progress: 95 });
    return true;
  }

  send({ log: `openclaw --version 失败: ${r.stderr}` });
  return false;
}

async function installOpenClaw(send: SendEvent): Promise<void> {
  try {
    send({ step: "checking", message: "检查系统环境...", progress: 5 });
    const env = await checkEnvironment();

    send({ log: `平台: ${env.platform}` });
    send({ log: `Node.js: ${env.hasNode ? env.nodeVersion : "未安装"}` });
    send({ log: `npm: ${env.hasNpm ? env.npmPath : "未安装"}` });
    send({ log: `OpenClaw: ${env.hasOpenClaw ? env.openclawVersion : "未安装"}` });

    // Already installed
    if (env.hasOpenClaw) {
      send({ step: "success", message: `OpenClaw 已安装 (${env.openclawVersion})`, progress: 100 });
      send({ success: true });
      return;
    }

    let installed = false;

    // Path 1: Node.js 22+ + npm available → npm install -g
    if (env.hasNode && env.hasNpm && env.npmPath) {
      send({ log: "检测到 Node.js 22+，使用 npm 安装" });
      installed = await runNpmInstall(send, env.npmPath);
    }

    // Path 2: Fall back to official install.sh (macOS/Linux)
    if (!installed && env.hasCurl && env.platform !== "win32") {
      send({ log: "使用官方安装脚本安装..." });
      installed = await runInstallScript(send);
    }

    if (!installed) {
      send({
        error: "自动安装失败。请手动在终端运行：curl -fsSL https://openclaw.ai/install.sh | bash",
      });
      return;
    }

    // Verify
    const verified = await verifyInstallation(send);
    if (verified) {
      send({ step: "success", message: "OpenClaw 安装成功！", progress: 100 });
      send({ success: true });
    } else {
      send({
        error: "安装已完成但未能验证。请打开终端运行 openclaw --version 确认，然后刷新页面。",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send({ error: `安装出错: ${msg}` });
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/check-environment", async (c) => {
  const result = await checkEnvironment();
  return c.json(result);
});

app.get("/install", async (c) => {
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  return stream(c, async (s) => {
    const encoder = new TextEncoder();

    const send: SendEvent = (event) => {
      try {
        s.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      } catch { /* stream closed */ }
    };

    const keepalive = setInterval(() => {
      try {
        s.write(encoder.encode(": keepalive\n\n"));
      } catch { /* stream closed */ }
    }, 5000);

    try {
      await installOpenClaw(send);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      send({ error: msg });
    } finally {
      clearInterval(keepalive);
    }
  });
});

app.post("/skills/install", async (c) => {
  try {
    const body = await c.req.json<{ id: string }>();
    const skillId = body?.id;
    if (!skillId) {
      return c.json({ success: false, message: "缺少 skill id" }, 400);
    }

    // openclaw skills 是内置能力集合，没有 install 子命令。
    // 向导的 Skills 步骤为展示用途，直接返回成功。
    return c.json({ success: true, message: `${skillId} 已就绪` });
  } catch (err) {
    return c.json({ success: false, message: String(err) }, 500);
  }
});

app.post("/gateway-config", async (c) => {
  const body = await c.req.json<{
    port?: number;
    bind?: "loopback" | "lan";
    authMode?: "none" | "token";
    authToken?: string;
  }>();
  await updateGatewayConfig(body);
  return c.json({ ok: true });
});

export default app;
