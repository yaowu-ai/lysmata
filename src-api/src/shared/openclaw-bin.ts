/**
 * Shared utility for locating the `openclaw` CLI binary.
 *
 * macOS GUI apps are launched with a stripped $PATH (/usr/bin:/bin:/usr/sbin:/sbin).
 * The Tauri lib.rs `start_sidecar` function injects the login-shell PATH at startup,
 * but as a defence-in-depth measure this module also probes well-known installation
 * directories so that `openclaw` commands work even if the PATH injection failed.
 *
 * Usage:
 *   import { resolveOpenclawBin, spawnWithPath } from "../../shared/openclaw-bin";
 *
 *   const bin = await resolveOpenclawBin();
 *   const proc = Bun.spawn([bin, "gateway", "restart"], { ... });
 *
 *   // Or use spawnWithPath() which also enriches the child process PATH:
 *   const proc = spawnWithPath([bin, "gateway", "restart"], { stdout: "pipe" });
 */

import { readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, delimiter, dirname, join } from "node:path";
import { readRuntimePreferences, type WindowsShellPreference } from "./runtime-preferences";
import { AppLogger } from "./app-logger";

const IS_WINDOWS = process.platform === "win32";
const PATH_DELIMITER = delimiter;
const UNIX_EXTRA_DIRS = ["/usr/local/bin", "/opt/homebrew/bin", "/opt/homebrew/sbin"];

export type UserShellKind = "posix" | "powershell" | "cmd";

export interface UserShell {
  executable: string;
  kind: UserShellKind;
}

export interface WindowsShellOption {
  id: WindowsShellPreference;
  label: string;
}

function compareVersionNamesDesc(a: string, b: string): number {
  const parse = (input: string) =>
    input
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

async function fileExists(path: string): Promise<boolean> {
  try {
    return await Bun.file(path).exists();
  } catch {
    return false;
  }
}

async function readSpawnOutput(
  output: number | ReadableStream<Uint8Array> | undefined,
): Promise<string> {
  if (!output || typeof output === "number") return "";
  return await new Response(output).text();
}

function getHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? "";
}

function getPathExts(): string[] {
  if (!IS_WINDOWS) return [""];
  const raw = process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM";
  return raw
    .split(";")
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean);
}

function getCommandCandidates(command: string): string[] {
  if (!IS_WINDOWS) return [command];
  const lower = command.toLowerCase();
  if (getPathExts().some((ext) => lower.endsWith(ext))) {
    return [command];
  }
  return [command, ...getPathExts().map((ext) => `${command}${ext}`)];
}

function normalizeSlashes(input: string): string {
  return input.replace(/\//g, "\\");
}

async function resolveGitBashPath(): Promise<string | null> {
  const candidates = [
    process.env["ProgramFiles"] ? join(process.env["ProgramFiles"], "Git", "bin", "bash.exe") : "",
    process.env["ProgramFiles(x86)"]
      ? join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe")
      : "",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

export async function getAvailableWindowsShellOptions(): Promise<WindowsShellOption[]> {
  const options: WindowsShellOption[] = [{ id: "auto", label: "自动" }];
  if (!IS_WINDOWS) return options;

  options.push({ id: "cmd", label: "命令提示符 (cmd)" });

  const powershell = await resolveBinaryWithoutShell("powershell");
  if (powershell) options.push({ id: "powershell", label: "Windows PowerShell" });

  const pwsh = await resolveBinaryWithoutShell("pwsh");
  if (pwsh) options.push({ id: "pwsh", label: "PowerShell 7" });

  const gitBash = await resolveGitBashPath();
  if (gitBash) options.push({ id: "git-bash", label: "Git Bash" });

  return options;
}

async function getPreferredWindowsShellPreference(): Promise<WindowsShellPreference> {
  if (!IS_WINDOWS) return "auto";
  const preferences = await readRuntimePreferences();
  const preferred = preferences.windowsShell ?? "auto";
  const available = await getAvailableWindowsShellOptions();
  return available.some((option) => option.id === preferred) ? preferred : "auto";
}

async function resolveShellExecutable(
  preference: WindowsShellPreference,
): Promise<{ executable: string; kind: UserShellKind } | null> {
  if (!IS_WINDOWS || preference === "auto") return null;
  if (preference === "cmd") {
    return { executable: process.env.COMSPEC?.trim() || "cmd.exe", kind: "cmd" };
  }
  if (preference === "powershell") {
    const executable = await resolveBinaryWithoutShell("powershell");
    return executable ? { executable, kind: "powershell" } : null;
  }
  if (preference === "pwsh") {
    const executable = await resolveBinaryWithoutShell("pwsh");
    return executable ? { executable, kind: "powershell" } : null;
  }
  if (preference === "git-bash") {
    const executable = await resolveGitBashPath();
    return executable ? { executable, kind: "posix" } : null;
  }
  return null;
}

async function resolveBinaryViaWindowsShell(bin: string): Promise<string | null> {
  if (!IS_WINDOWS) return null;
  const preference = await getPreferredWindowsShellPreference();
  const shell = await resolveShellExecutable(preference);
  if (!shell) return null;

  const env = spawnEnv();
  const shellArgs =
    shell.kind === "cmd"
      ? [shell.executable, "/d", "/s", "/c", `where ${bin}`]
      : shell.kind === "powershell"
        ? [
            shell.executable,
            "-NoLogo",
            "-Command",
            `(Get-Command ${bin} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)`,
          ]
        : [shell.executable, "-lc", `command -v ${bin}`];

  const proc = Bun.spawn(shellArgs, {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  const [out, code] = await Promise.all([readSpawnOutput(proc.stdout), proc.exited]);
  const resolved = out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!resolved || code !== 0) return null;
  return shell.kind === "posix" ? normalizeSlashes(resolved) : resolved;
}

async function getNvmVersionBinDirs(home: string): Promise<string[]> {
  if (!home || IS_WINDOWS) return [];
  const root = `${home}/.nvm/versions/node`;
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareVersionNamesDesc)
      .map((name) => `${root}/${name}/bin`);
  } catch {
    return [];
  }
}

async function getManagedBinDirs(home: string): Promise<string[]> {
  const dirs = IS_WINDOWS
    ? [
        process.env.APPDATA ? join(process.env.APPDATA, "npm") : "",
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Volta", "bin") : "",
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "fnm") : "",
        process.env.NVM_HOME ?? "",
        process.env.NVM_SYMLINK ?? "",
        home ? join(home, "scoop", "shims") : "",
        process.env.ProgramData ? join(process.env.ProgramData, "chocolatey", "bin") : "",
        process.env.ProgramFiles ? join(process.env.ProgramFiles, "nodejs") : "",
        process.env["ProgramFiles(x86)"]
          ? join(process.env["ProgramFiles(x86)"] as string, "nodejs")
          : "",
        home ? join(home, ".openclaw", "bin") : "",
      ]
    : [
        `${home}/.volta/bin`,
        `${home}/.fnm/current/bin`,
        `${home}/.nvm/current/bin`,
        `${home}/.asdf/shims`,
        `${home}/.local/bin`,
        `${home}/.npm-global/bin`,
        `${home}/.openclaw/bin`,
        ...UNIX_EXTRA_DIRS,
        ...(await getNvmVersionBinDirs(home)),
      ];
  return Array.from(new Set(dirs.filter(Boolean)));
}

function prependPathEntries(basePath: string, entries: Array<string | undefined>): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...entries, ...basePath.split(PATH_DELIMITER)]) {
    const value = entry?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    merged.push(value);
  }
  return merged.join(PATH_DELIMITER);
}

function getNvmVersionBinDirsSync(home: string): string[] {
  if (!home) return [];
  const root = `${home}/.nvm/versions/node`;
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareVersionNamesDesc)
      .map((name) => `${root}/${name}/bin`);
  } catch {
    return [];
  }
}

/** Build an enriched PATH string by appending common binary directories. */
export function getEnrichedPath(): string {
  const home = getHomeDir();
  const existing = process.env.PATH ?? "";
  const extra = IS_WINDOWS
    ? [
        process.env.APPDATA ? join(process.env.APPDATA, "npm") : "",
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Volta", "bin") : "",
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "fnm") : "",
        process.env.NVM_HOME ?? "",
        process.env.NVM_SYMLINK ?? "",
        home ? join(home, "scoop", "shims") : "",
        process.env.ProgramData ? join(process.env.ProgramData, "chocolatey", "bin") : "",
        process.env.ProgramFiles ? join(process.env.ProgramFiles, "nodejs") : "",
        process.env["ProgramFiles(x86)"]
          ? join(process.env["ProgramFiles(x86)"] as string, "nodejs")
          : "",
        home ? join(home, ".openclaw", "bin") : "",
      ]
    : [
        `${home}/.fnm/current/bin`,
        `${home}/.nvm/current/bin`,
        `${home}/.volta/bin`,
        `${home}/.asdf/shims`,
        `${home}/.local/bin`,
        `${home}/.npm-global/bin`,
        `${home}/.openclaw/bin`,
        ...UNIX_EXTRA_DIRS,
        ...getNvmVersionBinDirsSync(home),
      ];
  const parts = existing.split(PATH_DELIMITER);
  for (const dir of extra) {
    if (dir && !parts.includes(dir)) parts.push(dir);
  }
  return parts.join(PATH_DELIMITER);
}

function sanitizeEnv(env: Record<string, string | undefined>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) sanitized[key] = value;
  }
  return sanitized;
}

/** Env record suitable for passing to Bun.spawn({ env }) */
export function spawnEnv(): Record<string, string> {
  return sanitizeEnv({ ...process.env, PATH: getEnrichedPath() });
}

/** Wrapper around Bun.spawn that always injects the enriched PATH. */
type SpawnOptionsWithEnv = Omit<NonNullable<Parameters<typeof Bun.spawn>[1]>, "env"> & {
  env?: Record<string, string>;
};

export function spawnWithPath(cmd: string[], opts: SpawnOptionsWithEnv = {}) {
  const env = { ...spawnEnv(), ...(opts.env ?? {}) };
  const path = cmd[0]?.startsWith("/")
    ? prependPathEntries(env.PATH ?? "", [dirname(cmd[0])])
    : env.PATH;
  return Bun.spawn(cmd, { ...opts, env: { ...env, PATH: path } });
}

function classifyShell(executable: string): UserShell {
  const name = basename(executable).toLowerCase();
  if (name.includes("pwsh") || name.includes("powershell")) {
    return { executable, kind: "powershell" };
  }
  if (name === "cmd" || name === "cmd.exe") {
    return { executable, kind: "cmd" };
  }
  return { executable, kind: "posix" };
}

export function resolveUserShell(): UserShell {
  const explicit = process.env.LYSMATA_SHELL?.trim();
  if (explicit) return classifyShell(explicit);
  if (IS_WINDOWS) return classifyShell(process.env.COMSPEC?.trim() || "cmd.exe");
  return classifyShell(process.env.SHELL?.trim() || "/bin/sh");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getShellBootstrapEnv(shellExecutable: string): Record<string, string> {
  const home = getHomeDir();
  const username = process.env.USER || process.env.LOGNAME || "unknown";
  return sanitizeEnv({
    HOME: home,
    USER: username,
    LOGNAME: process.env.LOGNAME || username,
    SHELL: shellExecutable,
    LANG: process.env.LANG || "en_US.UTF-8",
    LC_ALL: process.env.LC_ALL,
    TERM: process.env.TERM || "xterm-256color",
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  });
}

export function spawnInUserShell(command: string, opts: SpawnOptionsWithEnv = {}) {
  const shell = resolveUserShell();
  const env = { ...spawnEnv(), ...(opts.env ?? {}) };
  const shellArgs =
    shell.kind === "powershell"
      ? [shell.executable, "-Command", command]
      : shell.kind === "cmd"
        ? [shell.executable, "/c", command]
        : [shell.executable, "-c", command];
  return Bun.spawn(shellArgs, { ...opts, env });
}

export async function resolveBinaryViaDefaultShell(bin: string): Promise<string | null> {
  // On macOS/Linux, try to resolve binary using user's shell environment first
  // This ensures nvm/fnm/etc. are properly initialized
  if (!IS_WINDOWS) {
    const shellResolved = await resolveBinaryViaShellEnv(bin);
    if (shellResolved) {
      return shellResolved;
    }
  }

  // Fall back to the traditional method
  const lookupCmd = IS_WINDOWS ? "where" : "which";
  try {
    const proc = spawnWithPath([lookupCmd, bin], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, code] = await Promise.all([readSpawnOutput(proc.stdout), proc.exited]);
    const resolved = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (code === 0 && resolved) {
      return resolved;
    }
  } catch {
    // ignore
  }

  return null;
}

async function resolveBinaryWithoutShell(bin: string): Promise<string | null> {
  const home = getHomeDir();
  const managedDirs = await getManagedBinDirs(home);
  const candidates = getCommandCandidates(bin);

  for (const dir of managedDirs) {
    for (const candidateName of candidates) {
      const candidate = join(dir, candidateName);
      if (await fileExists(candidate)) return candidate;
    }
  }

  return resolveBinaryViaDefaultShell(bin);
}

export async function resolveBinary(bin: string): Promise<string | null> {
  if (IS_WINDOWS) {
    const shellResolved = await resolveBinaryViaWindowsShell(bin);
    if (shellResolved) return shellResolved;
  }
  return resolveBinaryViaDefaultShell(bin);
}

let _openclawBin: string | null = null;

/**
 * Resolve the full filesystem path of the `openclaw` binary.
 *
 * Resolution order:
 *  1. Cached value from a previous call.
 *  2. Check well-known locations directly (fast, no subprocess).
 *  3. Run `which openclaw` with an enriched PATH.
 *  4. Fall back to bare "openclaw" (relies on PATH being correct at spawn time).
 */
export async function resolveOpenclawBin(): Promise<string> {
  if (_openclawBin) return _openclawBin;

  const resolved = await resolveBinary("openclaw");
  if (resolved) {
    _openclawBin = resolved;
    return resolved;
  }

  _openclawBin = "openclaw";
  return "openclaw";
}

/** Reset the cached bin path (useful for testing or after re-installation). */
export function resetOpenclawBinCache(): void {
  _openclawBin = null;
}
/**
 * Get user's default shell information and startup strategy.
 * We prefer interactive+login startup to mimic launching a real terminal tab/window.
 */
function getUserShellInfo(): {
  executable: string;
  kind: UserShellKind;
  probeArgs: string[][];
  bootstrapEnv: Record<string, string>;
  shellName: string;
} {
  const explicit = process.env.LYSMATA_SHELL?.trim();
  const shell = explicit || process.env.SHELL?.trim() || (IS_WINDOWS ? "cmd.exe" : "/bin/bash");
  const shellInfo = classifyShell(shell);
  const shellName = basename(shell).toLowerCase();
  const probeArgs = shellName.includes("fish")
    ? [["-lic"], ["-lc"], ["-c"]]
    : [["-ilc"], ["-lc"], ["-c"]];

  return {
    executable: shell,
    kind: shellInfo.kind,
    probeArgs,
    bootstrapEnv: getShellBootstrapEnv(shell),
    shellName,
  };
}

/**
 * Resolve binary using user's shell environment (source config files first)
 * This is specifically for macOS/Linux to ensure PATH includes nvm/fnm/etc.
 */
async function resolveBinaryViaShellEnv(bin: string): Promise<string | null> {
  if (IS_WINDOWS) {
    // Windows doesn't need shell environment sourcing
    return null;
  }

  try {
    const shellInfo = getUserShellInfo();
    const { executable, probeArgs, bootstrapEnv, shellName } = shellInfo;
    const command = `command -v -- ${shellQuote(bin)}`;

    // 调试日志：记录 shell 信息和环境变量
    AppLogger.info(`查找二进制文件: ${bin}`, {
      module: "resolveBinaryViaShellEnv",
      binary: bin,
      shell: executable,
      shellName,
      fullCommand: command,
      probeModes: probeArgs.map((args) => args[0]),
      bootstrapPath: bootstrapEnv.PATH,
      home: bootstrapEnv.HOME,
    });

    for (const args of probeArgs) {
      const proc = Bun.spawn([executable, ...args, command], {
        stdout: "pipe",
        stderr: "pipe",
        env: bootstrapEnv,
      });
      const [out, err, code] = await Promise.all([
        readSpawnOutput(proc.stdout),
        readSpawnOutput(proc.stderr),
        proc.exited,
      ]);
      const lines = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const resolved = lines.find((line) => line.startsWith("/")) ?? lines[0];

      if (code === 0 && resolved) {
        AppLogger.info(`找到二进制文件: ${resolved}`, {
          module: "resolveBinaryViaShellEnv",
          binary: bin,
          resolvedPath: resolved,
          probeMode: args[0],
          exitCode: code,
          stdoutPreview: out.substring(0, 200),
          stderrPreview: err.substring(0, 200),
        });
        return resolved;
      }

      AppLogger.warn(`探测模式未找到二进制文件 ${bin}`, {
        module: "resolveBinaryViaShellEnv",
        binary: bin,
        probeMode: args[0],
        exitCode: code,
        stdout: out,
        stderr: err,
        shell: executable,
        command,
      });
    }

    AppLogger.warn(`未找到二进制文件 ${bin}`, {
      module: "resolveBinaryViaShellEnv",
      binary: bin,
      shell: executable,
      triedProbeModes: probeArgs.map((args) => args[0]),
    });
  } catch (error) {
    AppLogger.error(`执行出错`, {
      module: "resolveBinaryViaShellEnv",
      binary: bin,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  return null;
}
