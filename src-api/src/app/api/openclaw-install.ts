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
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { updateGatewayConfig } from "../../core/openclaw-config-file";
import { resetOpenclawBinCache, resolveOpenclawBin, spawnWithPath } from "../../shared/openclaw-bin";

const app = new Hono();
const MIN_NODE_MAJOR = 22;

async function readSpawnOutput(
  output: number | ReadableStream<Uint8Array> | undefined,
): Promise<string> {
  if (!output || typeof output === "number") return "";
  return await new Response(output).text();
}

async function which(bin: string): Promise<string | null> {
  try {
    const lookupCmd = process.platform === "win32" ? "where" : "which";
    const proc = spawnWithPath([lookupCmd, bin], { stdout: "pipe", stderr: "pipe" });
    const output = (await readSpawnOutput(proc.stdout)).trim();
    const code = await proc.exited;
    const path = output.split(/\r?\n/).find(Boolean)?.trim();
    return code === 0 && path ? path : null;
  } catch {
    return null;
  }
}

async function exec(
  cmd: string[],
  opts?: { cwd?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = spawnWithPath(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    cwd: opts?.cwd,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    readSpawnOutput(proc.stdout),
    readSpawnOutput(proc.stderr),
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

interface NodeTooling {
  nodePath: string;
  nodeVersion?: string;
  nodeMajor?: number;
  npmPath?: string;
  source: string;
  priority: number;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return await Bun.file(path).exists();
  } catch {
    return false;
  }
}

function parseNodeMajor(version?: string): number | undefined {
  const match = version?.match(/^v?(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

function compareVersionDesc(a?: string, b?: string): number {
  const parse = (value?: string) =>
    (value ?? "")
      .replace(/^v/i, "")
      .split(".")
      .map((part) => parseInt(part, 10) || 0);
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (bv[i] ?? 0) - (av[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function compareNodeTooling(a: NodeTooling, b: NodeTooling): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return compareVersionDesc(a.nodeVersion, b.nodeVersion);
}

async function findSiblingNpm(nodePath: string): Promise<string | undefined> {
  const binDir = dirname(nodePath);
  const names = process.platform === "win32"
    ? ["npm.cmd", "npm.exe", "npm"]
    : ["npm"];
  for (const name of names) {
    const candidate = join(binDir, name);
    if (await fileExists(candidate)) return candidate;
  }
  return undefined;
}

async function getNvmNodePaths(home: string): Promise<string[]> {
  if (!home) return [];
  const root = `${home}/.nvm/versions/node`;
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareVersionDesc)
      .map((name) => join(root, name, "bin", process.platform === "win32" ? "node.exe" : "node"));
  } catch {
    return [];
  }
}

async function inspectNodeTooling(): Promise<NodeTooling[]> {
  const home = process.env.HOME ?? "";
  const pathNode = await which("node");
  const pathNpm = await which("npm");
  const candidates: Array<Pick<NodeTooling, "nodePath" | "source" | "priority">> = [];
  const seen = new Set<string>();
  const add = (nodePath: string | null | undefined, source: string, priority: number) => {
    const trimmed = nodePath?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push({ nodePath: trimmed, source, priority });
  };

  add(pathNode, "path", 0);

  const staticDirs = [
    { dir: "/opt/homebrew/bin", source: "homebrew", priority: 10 },
    { dir: "/usr/local/bin", source: "usr-local", priority: 11 },
    { dir: `${home}/.volta/bin`, source: "volta", priority: 20 },
    { dir: `${home}/.fnm/current/bin`, source: "fnm", priority: 21 },
    { dir: `${home}/.nvm/current/bin`, source: "nvm-current", priority: 22 },
    { dir: `${home}/.asdf/shims`, source: "asdf", priority: 23 },
    { dir: `${home}/.local/bin`, source: "local", priority: 24 },
  ];

  for (const { dir, source, priority } of staticDirs) {
    add(join(dir, process.platform === "win32" ? "node.exe" : "node"), source, priority);
  }
  for (const nodePath of await getNvmNodePaths(home)) {
    add(nodePath, "nvm-version", 25);
  }

  const inspected = await Promise.all(
    candidates.map(async ({ nodePath, source, priority }) => {
      if (!(await fileExists(nodePath))) return null;
      const versionResult = await exec([nodePath, "--version"]);
      if (versionResult.exitCode !== 0 || !versionResult.stdout) return null;

      const npmPath = (await findSiblingNpm(nodePath))
        ?? (source === "path" ? pathNpm ?? undefined : undefined);

      return {
        nodePath,
        nodeVersion: versionResult.stdout,
        nodeMajor: parseNodeMajor(versionResult.stdout),
        npmPath,
        source,
        priority,
      } satisfies NodeTooling;
    }),
  );

  const filtered: NodeTooling[] = [];
  for (const item of inspected) {
    if (item) filtered.push(item);
  }
  return filtered.sort(compareNodeTooling);
}

async function resolveNodeTooling(): Promise<NodeTooling | null> {
  const inspected = await inspectNodeTooling();
  const compatible = inspected.filter(
    (candidate) => (candidate.nodeMajor ?? 0) >= MIN_NODE_MAJOR && candidate.npmPath,
  );
  return compatible[0] ?? inspected[0] ?? null;
}

async function checkEnvironment(): Promise<EnvCheckResult> {
  const platform = process.platform;

  // Detect OpenClaw – use resolveOpenclawBin() which scans NVM version dirs,
  // ~/.openclaw/bin, and other managed locations that plain `which` misses.
  resetOpenclawBinCache();
  const resolvedBin = await resolveOpenclawBin();
  const openclawPath = resolvedBin !== "openclaw" ? resolvedBin : null;
  let openclawVersion: string | undefined;
  if (openclawPath) {
    const r = await exec([openclawPath, "--version"]);
    if (r.exitCode === 0) openclawVersion = r.stdout;
  }

  // Detect Node.js / npm across common install layouts.
  const nodeTooling = await resolveNodeTooling();
  const nodePath = nodeTooling?.nodePath ?? null;
  const nodeVersion = nodeTooling?.nodeVersion;
  const nodeMajor = nodeTooling?.nodeMajor;
  const npmPath = nodeTooling?.npmPath ?? null;

  // Detect curl
  const hasCurl = !!(await which("curl"));

  const hasOpenClaw = !!openclawPath;
  const hasNode = !!nodePath && (nodeMajor ?? 0) >= MIN_NODE_MAJOR;
  const hasNpm = !!npmPath;

  let canInstall = true;
  let message = "环境检查通过";

  if (hasOpenClaw) {
    message = `OpenClaw 已安装 (${openclawVersion ?? "unknown"})`;
  } else if (hasNode && hasNpm) {
    message = `Node.js ${nodeVersion} 就绪，可以安装 OpenClaw`;
  } else if (hasNode && !hasNpm && hasCurl && platform !== "win32") {
    message = `检测到 Node.js ${nodeVersion}，但未找到 npm，将通过官方安装脚本处理`;
  } else if (hasCurl && platform !== "win32") {
    message = "将通过官方安装脚本自动安装（含 Node.js）";
  } else if (hasNode && !hasNpm) {
    canInstall = false;
    message = "检测到 Node.js 22+，但未找到 npm，请先安装 npm";
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

  const proc = spawnWithPath([npmPath, "install", "-g", "openclaw@latest"], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      SHARP_IGNORE_GLOBAL_LIBVIPS: "1",
    },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    readSpawnOutput(proc.stdout),
    readSpawnOutput(proc.stderr),
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

  const proc = spawnWithPath(
    ["bash", "-c", "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard"],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: {
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
    streamOutput(proc.stdout as ReadableStream<Uint8Array>),
    streamOutput(proc.stderr as ReadableStream<Uint8Array>, ""),
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

  // Clear stale cache so resolveOpenclawBin() rescans after fresh install
  resetOpenclawBinCache();
  const openclawPath = await resolveOpenclawBin();
  if (!openclawPath || openclawPath === "openclaw") {
    send({ log: "未找到 openclaw 可执行文件" });
    return false;
  }

  const r = await exec([openclawPath, "--version"]);
  if (r.exitCode === 0) {
    send({ log: `找到 openclaw: ${openclawPath}` });
    send({ log: `openclaw 版本: ${r.stdout}` });
    send({ step: "verifying", message: "安装验证通过", progress: 95 });
    return true;
  }

  send({ log: `openclaw --version 失败: ${r.stderr}` });
  return false;
}

async function installGatewayService(send: SendEvent): Promise<void> {
  const openclawPath = await resolveOpenclawBin();
  send({ log: `$ ${openclawPath} gateway install` });
  const proc = spawnWithPath([openclawPath, "gateway", "install"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    readSpawnOutput(proc.stdout),
    readSpawnOutput(proc.stderr),
    proc.exited,
  ]);
  if (exitCode === 0) {
    send({ log: "Gateway 系统服务注册成功" });
  } else {
    // 非致命：部分环境（如无 systemd 的 Linux）可能不支持，Gateway 仍可手动运行
    send({ log: `Gateway 服务注册跳过: ${(stderr || stdout).trim() || "不支持的环境"}` });
  }
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
      await installGatewayService(send);
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
      await installGatewayService(send);
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
    mode?: "local" | "remote";
    port?: number;
    bind?: "loopback" | "lan";
    authMode?: "none" | "token";
    authToken?: string;
  }>();
  await updateGatewayConfig(body);
  return c.json({ ok: true });
});

export default app;
