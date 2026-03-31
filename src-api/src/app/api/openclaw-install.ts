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
import { AppLogger } from "../../shared/app-logger";
import {
  getAvailableWindowsShellOptions,
  resetOpenclawBinCache,
  resolveBinary,
  resolveOpenclawBin,
  spawnInUserShell,
  spawnWithPath,
  type WindowsShellOption,
} from "../../shared/openclaw-bin";
import {
  readRuntimePreferences,
  writeRuntimePreferences,
  type WindowsShellPreference,
} from "../../shared/runtime-preferences";

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
    return await resolveBinary(bin);
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

type InstallErrorKind = "network" | "permission" | "timeout" | "server_error" | "unknown";
type InstallStage =
  | "idle"
  | "checking"
  | "preparing"
  | "installing"
  | "configuring"
  | "verifying"
  | "completed";

interface InstallEvent {
  stage?: InstallStage;
  message?: string;
  log?: string;
  summary?: string;
  error?: string;
  errorKind?: InstallErrorKind;
  platform?: string;
  waitingForPrivilege?: boolean;
  done?: boolean;
}

// ── Install lock & active process ───────────────────────────────────────────

const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000;

let _installLock = false;
let _activeProc: ReturnType<typeof Bun.spawn> | null = null;

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
  networkReachable?: boolean;
  platform: string;
  windowsShell?: WindowsShellPreference;
  windowsShellOptions?: WindowsShellOption[];
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
  const names = process.platform === "win32" ? ["npm.cmd", "npm.exe", "npm"] : ["npm"];
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
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const pathNode = await which("node");
  const pathNpm = await which("npm");

  // 记录初始检测结果
  AppLogger.info("开始检测 Node.js 工具链", {
    module: "inspectNodeTooling",
    home,
    pathNode,
    pathNpm,
    platform: process.platform,
  });

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

  // 记录所有候选路径
  AppLogger.info("Node.js 候选路径", {
    module: "inspectNodeTooling",
    candidateCount: candidates.length,
    candidates: candidates.map((c) => ({
      path: c.nodePath,
      source: c.source,
      priority: c.priority,
    })),
  });

  const inspected = await Promise.all(
    candidates.map(async ({ nodePath, source, priority }) => {
      if (!(await fileExists(nodePath))) {
        AppLogger.info("候选路径不存在", {
          module: "inspectNodeTooling",
          nodePath,
          source,
          priority,
        });
        return null;
      }

      const versionResult = await exec([nodePath, "--version"]);
      if (versionResult.exitCode !== 0 || !versionResult.stdout) {
        AppLogger.warn("无法获取 Node.js 版本", {
          module: "inspectNodeTooling",
          nodePath,
          source,
          priority,
          exitCode: versionResult.exitCode,
          stderr: versionResult.stderr,
        });
        return null;
      }

      const npmPath =
        (await findSiblingNpm(nodePath)) ??
        (source === "path" ? (pathNpm ?? undefined) : undefined);

      const tooling = {
        nodePath,
        nodeVersion: versionResult.stdout,
        nodeMajor: parseNodeMajor(versionResult.stdout),
        npmPath,
        source,
        priority,
      } satisfies NodeTooling;

      AppLogger.info("检测到 Node.js 工具", {
        module: "inspectNodeTooling",
        ...tooling,
      });

      return tooling;
    }),
  );

  const filtered: NodeTooling[] = [];
  for (const item of inspected) {
    if (item) filtered.push(item);
  }

  // 记录最终结果
  AppLogger.info("Node.js 工具链检测完成", {
    module: "inspectNodeTooling",
    totalCandidates: candidates.length,
    validTools: filtered.length,
    tools: filtered.map((t) => ({
      path: t.nodePath,
      version: t.nodeVersion,
      major: t.nodeMajor,
      source: t.source,
      priority: t.priority,
      hasNpm: !!t.npmPath,
    })),
    sortedOrder: filtered.sort(compareNodeTooling).map((t) => t.source),
  });

  return filtered.sort(compareNodeTooling);
}

async function resolveNodeTooling(): Promise<NodeTooling | null> {
  const inspected = await inspectNodeTooling();
  const compatible = inspected.filter(
    (candidate) => (candidate.nodeMajor ?? 0) >= MIN_NODE_MAJOR && candidate.npmPath,
  );

  const result = compatible[0] ?? inspected[0] ?? null;

  AppLogger.info("解析 Node.js 工具链结果", {
    module: "resolveNodeTooling",
    totalInspected: inspected.length,
    compatibleCount: compatible.length,
    minNodeMajor: MIN_NODE_MAJOR,
    selectedTool: result
      ? {
          path: result.nodePath,
          version: result.nodeVersion,
          major: result.nodeMajor,
          source: result.source,
          hasNpm: !!result.npmPath,
        }
      : null,
    allTools: inspected.map((t) => ({
      path: t.nodePath,
      version: t.nodeVersion,
      major: t.nodeMajor,
      source: t.source,
      hasNpm: !!t.npmPath,
      priority: t.priority,
    })),
  });

  return result;
}

async function checkEnvironment(): Promise<EnvCheckResult> {
  const platform = process.platform;

  AppLogger.info("开始环境检查", {
    module: "checkEnvironment",
    platform,
    minNodeMajor: MIN_NODE_MAJOR,
  });

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
  const curlPath = await which("curl");
  const hasCurl = !!curlPath;

  const hasOpenClaw = !!openclawPath;
  const hasNode = !!nodePath && (nodeMajor ?? 0) >= MIN_NODE_MAJOR;
  const hasNpm = !!npmPath;

  // Network reachability: only needed when install.sh download path will be used
  // (npm install uses npm registry, not openclaw.ai/install.sh)
  const needsInstallScript =
    !hasOpenClaw && !(hasNode && hasNpm) && hasCurl && platform !== "win32";
  let networkReachable: boolean | undefined;
  if (needsInstallScript && curlPath) {
    networkReachable = await checkNetworkReachability(curlPath);
  }

  const windowsShellOptions =
    platform === "win32" ? await getAvailableWindowsShellOptions() : undefined;
  const preferences = platform === "win32" ? await readRuntimePreferences() : {};
  const preferredShell = preferences.windowsShell ?? "auto";
  const windowsShell =
    platform === "win32"
      ? windowsShellOptions?.some((option) => option.id === preferredShell)
        ? preferredShell
        : "auto"
      : undefined;

  let canInstall = true;
  let message = "环境检查通过";

  if (hasOpenClaw) {
    message = `OpenClaw 已安装 (${openclawVersion ?? "unknown"})`;
  } else if (hasNode && hasNpm) {
    message = `Node.js ${nodeVersion} 就绪，可以安装 OpenClaw`;
  } else if (hasNode && !hasNpm && hasCurl && platform !== "win32") {
    if (networkReachable === false) {
      message = `检测到 Node.js ${nodeVersion}，但无法连接安装服务器`;
      canInstall = false;
    } else {
      message = `检测到 Node.js ${nodeVersion}，但未找到 npm，将通过官方安装脚本处理`;
    }
  } else if (hasCurl && platform !== "win32") {
    if (networkReachable === false) {
      message = "无法连接到安装服务器，请检查网络连接";
      canInstall = false;
    } else {
      message = "将通过官方安装脚本自动安装（含 Node.js）";
    }
  } else if (hasNode && !hasNpm) {
    canInstall = false;
    message = "检测到 Node.js 22+，但未找到 npm，请先安装 npm";
  } else if (!hasNode) {
    canInstall = false;
    message =
      platform === "win32"
        ? "未检测到 Node.js 22+，请先安装 Node.js，然后再使用 npm 安装 OpenClaw"
        : "未检测到 Node.js 22+，请先安装 Node.js";
  }

  const result = {
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
    networkReachable,
    platform,
    windowsShell,
    windowsShellOptions,
  };

  AppLogger.info("环境检查完成", {
    module: "checkEnvironment",
    ...result,
    processEnvPath: process.env.PATH,
    processEnvHome: process.env.HOME,
    processEnvUser: process.env.USER,
  });

  return result;
}

// ── Helpers: timeout, error classification, network, streaming ──────────────

async function withTimeout<T extends ReturnType<typeof Bun.spawn>>(
  proc: T,
  timeoutMs: number,
): Promise<number> {
  _activeProc = proc;
  try {
    const exitCode = await Promise.race([
      proc.exited,
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          proc.kill();
          reject(new Error(`INSTALL_TIMEOUT:${timeoutMs}`));
        }, timeoutMs),
      ),
    ]);
    return exitCode;
  } finally {
    _activeProc = null;
  }
}

function classifyInstallError(
  exitCode: number,
  output: string,
): { kind: InstallErrorKind; hint: string } {
  if (output.match(/EACCES|permission denied|EPERM/i)) {
    return {
      kind: "permission",
      hint: "权限不足。尝试在终端运行 sudo npm install -g openclaw@latest，或检查全局 npm 目录权限",
    };
  }
  if (
    output.match(
      /ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|getaddrinfo|network|socket hang up/i,
    ) ||
    [6, 7, 28].includes(exitCode)
  ) {
    return {
      kind: "network",
      hint: "网络连接失败。请检查网络连接、DNS 设置，或确认是否需要配置代理",
    };
  }
  if (exitCode === 22) {
    return { kind: "server_error", hint: "安装服务器返回错误，请稍后重试" };
  }
  if (output.match(/INSTALL_TIMEOUT/i)) {
    return { kind: "timeout", hint: "安装超时，网络可能不稳定。请检查网络后重试" };
  }
  if (output.match(/ENOSPC|no space/i)) {
    return { kind: "unknown", hint: "磁盘空间不足，请清理后重试" };
  }
  return { kind: "unknown", hint: "请查看上方日志获取详细错误信息" };
}

async function checkNetworkReachability(curlPath: string): Promise<boolean> {
  try {
    const cmd = `${curlPath} --head --silent --connect-timeout 3 --max-time 5 -o /dev/null -w '%{http_code}' https://openclaw.ai/install.sh`;
    const proc = spawnInUserShell(cmd, { stdout: "pipe", stderr: "pipe" });
    const [stdout, exitCode] = await Promise.all([readSpawnOutput(proc.stdout), proc.exited]);
    return exitCode === 0 && stdout.trim().startsWith("2");
  } catch {
    return false;
  }
}

type SendEvent = (event: InstallEvent) => void;

async function streamProcessOutput(
  reader: ReadableStream<Uint8Array>,
  send: SendEvent,
  prefix?: string,
): Promise<string> {
  const decoder = new TextDecoder();
  const r = reader.getReader();
  let buf = "";
  let allOutput = "";
  while (true) {
    const { done, value } = await r.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    buf += chunk;
    allOutput += chunk;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        const msg = prefix ? `${prefix}${line}` : line;
        if (line.includes("WARN")) send({ log: `⚠ ${msg}` });
        else send({ log: msg });
      }
    }
  }
  if (buf.trim()) {
    const msg = prefix ? `${prefix}${buf}` : buf;
    send({ log: msg });
    allOutput += buf;
  }
  return allOutput;
}

// ── Install logic ────────────────────────────────────────────────────────────

async function runNpmInstall(
  send: SendEvent,
  npmPath: string,
): Promise<{ ok: boolean; stderr: string; exitCode: number }> {
  send({
    stage: "installing",
    message: "正在通过 npm 安装 OpenClaw...",
    summary: "将使用系统 npm 安装 OpenClaw CLI。",
  });
  send({ log: `npm path: ${npmPath}` });
  send({ log: "$ npm install -g openclaw@latest --fetch-timeout=60000" });

  const proc = spawnWithPath(
    [npmPath, "install", "-g", "openclaw@latest", "--fetch-timeout=60000"],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        SHARP_IGNORE_GLOBAL_LIBVIPS: "1",
      },
    },
  );

  const [, stderrOutput, exitCode] = await Promise.all([
    streamProcessOutput(proc.stdout as ReadableStream<Uint8Array>, send),
    streamProcessOutput(proc.stderr as ReadableStream<Uint8Array>, send),
    withTimeout(proc, INSTALL_TIMEOUT_MS),
  ]);

  if (exitCode !== 0) {
    send({ log: `npm install 退出码: ${exitCode}` });
    return { ok: false, stderr: stderrOutput, exitCode };
  }

  send({ log: "npm install 完成" });
  return { ok: true, stderr: "", exitCode: 0 };
}

async function runPosixInstallScript(
  send: SendEvent,
): Promise<{ ok: boolean; stderr: string; exitCode: number }> {
  // Phase 1: Download script to a temp file (safe — no piping to bash)
  send({
    stage: "preparing",
    message: "正在下载安装脚本...",
    summary: "先下载官方安装脚本，再以非交互模式执行。",
  });
  send({
    log: "$ curl -fsSL --connect-timeout 15 --max-time 180 -o /tmp/openclaw-install.sh https://openclaw.ai/install.sh",
  });

  const tmpFile = `/tmp/openclaw-install-${Date.now()}.sh`;
  const curlProc = spawnInUserShell(
    `curl -fsSL --connect-timeout 15 --max-time 180 -o ${tmpFile} https://openclaw.ai/install.sh`,
    { stdout: "pipe", stderr: "pipe" },
  );

  const [, curlStderr, curlExit] = await Promise.all([
    streamProcessOutput(curlProc.stdout as ReadableStream<Uint8Array>, send),
    streamProcessOutput(curlProc.stderr as ReadableStream<Uint8Array>, send),
    withTimeout(curlProc, DOWNLOAD_TIMEOUT_MS),
  ]);

  if (curlExit !== 0) {
    send({ log: `下载安装脚本失败 (退出码: ${curlExit})` });
    spawnInUserShell(`rm -f ${tmpFile}`, {});
    return { ok: false, stderr: curlStderr, exitCode: curlExit };
  }

  // Validate downloaded file is non-empty
  const scriptFile = Bun.file(tmpFile);
  if (!(await scriptFile.exists()) || (await scriptFile.size()) === 0) {
    send({ log: "下载的安装脚本为空或不存在" });
    spawnInUserShell(`rm -f ${tmpFile}`, {});
    return { ok: false, stderr: "downloaded script is empty", exitCode: 1 };
  }

  send({ log: "安装脚本下载完成，开始执行..." });

  // Phase 2: Execute the downloaded script
  send({
    stage: "installing",
    message: "正在执行安装脚本...",
    summary: "将执行下载到本地的安装脚本。",
  });
  send({ log: `$ bash ${tmpFile} --no-onboard` });

  const bashProc = spawnInUserShell(
    `bash ${tmpFile} --no-onboard; exitcode=$?; rm -f ${tmpFile}; exit $exitcode`,
    {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        NONINTERACTIVE: "1",
      },
    },
  );

  const [, bashStderr, bashExit] = await Promise.all([
    streamProcessOutput(bashProc.stdout as ReadableStream<Uint8Array>, send),
    streamProcessOutput(bashProc.stderr as ReadableStream<Uint8Array>, send),
    withTimeout(bashProc, INSTALL_TIMEOUT_MS),
  ]);

  if (bashExit !== 0) {
    send({ log: `安装脚本退出码: ${bashExit}` });
    return { ok: false, stderr: bashStderr, exitCode: bashExit };
  }

  send({ log: "安装脚本执行完成" });
  return { ok: true, stderr: "", exitCode: 0 };
}

async function verifyInstallation(send: SendEvent): Promise<boolean> {
  send({
    stage: "verifying",
    message: "验证安装结果...",
    summary: "确认 openclaw 可执行文件和版本信息。",
  });

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
    send({ stage: "verifying", message: "安装验证通过", summary: "安装已经验证通过。" });
    return true;
  }

  send({ log: `openclaw --version 失败: ${r.stderr}` });
  return false;
}

async function installGatewayService(send: SendEvent): Promise<void> {
  const openclawPath = await resolveOpenclawBin();
  send({
    stage: "configuring",
    message: "正在配置 Gateway 服务...",
    summary: "尝试注册或刷新 OpenClaw Gateway 服务。",
  });
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
    send({
      stage: "checking",
      message: "检查系统环境...",
      summary: "检测 Node.js、npm、curl 和已安装的 OpenClaw。",
    });
    const env = await checkEnvironment();
    const platform = env.platform;

    send({ log: `平台: ${platform}` });
    send({ log: `Node.js: ${env.hasNode ? env.nodeVersion : "未安装"}` });
    send({ log: `npm: ${env.hasNpm ? env.npmPath : "未安装"}` });
    send({ log: `OpenClaw: ${env.hasOpenClaw ? env.openclawVersion : "未安装"}` });
    if (env.networkReachable !== undefined) {
      send({ log: `网络连通: ${env.networkReachable ? "正常" : "不可达"}` });
    }

    // Already installed
    if (env.hasOpenClaw) {
      try {
        await installGatewayService(send);
      } catch (err) {
        send({
          log: `⚠ Gateway 服务注册出错（非致命）: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      send({
        stage: "completed",
        message: `OpenClaw 已安装 (${env.openclawVersion})`,
        summary: "已检测到现有安装，当前页面可直接继续下一步。",
        done: true,
      });
      return;
    }

    let installResult: { ok: boolean; stderr: string; exitCode: number } = {
      ok: false,
      stderr: "",
      exitCode: -1,
    };

    // Path 1: Node.js 22+ + npm available → npm install -g
    if (env.hasNode && env.hasNpm && env.npmPath) {
      send({ log: "检测到 Node.js 22+，使用 npm 安装" });
      installResult = await runNpmInstall(send, env.npmPath);
    }

    // Path 2: Fall back to official install.sh only on macOS/Linux.
    if (!installResult.ok && env.hasCurl && platform !== "win32") {
      if (env.hasNode && env.hasNpm) {
        send({ log: "⚠ npm 安装未成功，切换至官方安装脚本作为备选方案..." });
      } else {
        send({ log: "使用官方安装脚本安装..." });
      }
      installResult = await runPosixInstallScript(send);
    }

    if (!installResult.ok) {
      const { kind, hint } = classifyInstallError(installResult.exitCode, installResult.stderr);
      const baseMsg =
        platform === "win32"
          ? "未找到可用的 Node.js/npm。请先安装 Node.js 22+，然后重新打开应用再安装 OpenClaw。"
          : "自动安装失败";
      send({
        error: `${baseMsg}。${hint}`,
        errorKind: kind,
        platform,
      });
      return;
    }

    // Verify
    const verified = await verifyInstallation(send);
    if (verified) {
      try {
        await installGatewayService(send);
      } catch (err) {
        send({
          log: `⚠ Gateway 服务注册出错（非致命）: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      send({
        stage: "completed",
        message: "OpenClaw 安装成功！",
        summary: "安装和验证已经完成。你可以先检查日志，再手动进入下一步。",
        done: true,
      });
    } else {
      send({
        error: "安装已完成但未能验证。请打开终端运行 openclaw --version 确认，然后点击重试。",
        errorKind: "unknown",
        platform,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { kind, hint } = classifyInstallError(0, msg);
    send({
      error: `安装出错: ${hint}`,
      errorKind: kind,
      platform: process.platform,
    });
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/check-environment", async (c) => {
  const result = await checkEnvironment();
  return c.json(result);
});

app.get("/shell-preferences", async (c) => {
  const preferences = await readRuntimePreferences();
  const windowsShellOptions =
    process.platform === "win32" ? await getAvailableWindowsShellOptions() : [];
  const preferred = preferences.windowsShell ?? "auto";
  return c.json({
    windowsShell: windowsShellOptions.some((option) => option.id === preferred)
      ? preferred
      : "auto",
    windowsShellOptions,
  });
});

app.put("/shell-preferences", async (c) => {
  const body = await c.req.json<{ windowsShell?: WindowsShellPreference }>();
  const next = await writeRuntimePreferences({ windowsShell: body.windowsShell ?? "auto" });
  const windowsShellOptions =
    process.platform === "win32" ? await getAvailableWindowsShellOptions() : [];
  const preferred = next.windowsShell ?? "auto";
  return c.json({
    windowsShell: windowsShellOptions.some((option) => option.id === preferred)
      ? preferred
      : "auto",
    windowsShellOptions,
  });
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
      } catch {
        /* stream closed */
      }
    };

    if (_installLock) {
      send({ error: "另一个安装正在进行中，请等待完成或取消后重试", errorKind: "unknown" });
      return;
    }

    _installLock = true;
    const keepalive = setInterval(() => {
      try {
        s.write(encoder.encode(": keepalive\n\n"));
      } catch {
        /* stream closed */
      }
    }, 5000);

    try {
      await installOpenClaw(send);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const { kind, hint } = classifyInstallError(0, msg);
      send({ error: hint, errorKind: kind, platform: process.platform });
    } finally {
      clearInterval(keepalive);
      _installLock = false;
      _activeProc = null;
    }
  });
});

app.post("/cancel-install", async (c) => {
  if (_activeProc) {
    try {
      _activeProc.kill();
    } catch {
      /* already exited */
    }
    _activeProc = null;
  }
  _installLock = false;
  return c.json({ ok: true });
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
