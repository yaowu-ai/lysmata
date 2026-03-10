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

import { readdir } from "node:fs/promises";
import { dirname } from "node:path";

const EXTRA_DIRS = [
  "/usr/local/bin",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
];

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

async function getNvmVersionBinDirs(home: string): Promise<string[]> {
  if (!home) return [];
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
  const dirs = [
    `${home}/.volta/bin`,
    `${home}/.fnm/current/bin`,
    `${home}/.nvm/current/bin`,
    `${home}/.asdf/shims`,
    `${home}/.local/bin`,
    `${home}/.npm-global/bin`,
    `${home}/.openclaw/bin`,
    ...EXTRA_DIRS,
    ...(await getNvmVersionBinDirs(home)),
  ];
  return dirs.filter(Boolean);
}

function prependPathEntries(basePath: string, entries: Array<string | undefined>): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...entries, ...basePath.split(":")]) {
    const value = entry?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    merged.push(value);
  }
  return merged.join(":");
}

/** Build an enriched PATH string by appending common binary directories. */
export function getEnrichedPath(): string {
  const home = process.env.HOME ?? "";
  const existing = process.env.PATH ?? "";
  const extra = [
    `${home}/.fnm/current/bin`,
    `${home}/.nvm/current/bin`,
    `${home}/.volta/bin`,
    `${home}/.asdf/shims`,
    `${home}/.local/bin`,
    `${home}/.npm-global/bin`,
    `${home}/.openclaw/bin`,
    ...EXTRA_DIRS,
  ];
  const parts = existing.split(":");
  for (const dir of extra) {
    if (dir && !parts.includes(dir)) parts.push(dir);
  }
  return parts.join(":");
}

/** Env record suitable for passing to Bun.spawn({ env }) */
export function spawnEnv(): Record<string, string> {
  return { ...process.env, PATH: getEnrichedPath() } as Record<string, string>;
}

/** Wrapper around Bun.spawn that always injects the enriched PATH. */
type SpawnOptionsWithEnv = Omit<NonNullable<Parameters<typeof Bun.spawn>[1]>, "env"> & {
  env?: Record<string, string>;
};

export function spawnWithPath(
  cmd: string[],
  opts: SpawnOptionsWithEnv = {},
) {
  const env = { ...spawnEnv(), ...(opts.env ?? {}) };
  const path = cmd[0]?.startsWith("/")
    ? prependPathEntries(env.PATH ?? "", [dirname(cmd[0])])
    : env.PATH;
  return Bun.spawn(cmd, { ...opts, env: { ...env, PATH: path } });
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

  const home = process.env.HOME ?? "";
  const candidates = (await getManagedBinDirs(home)).map((dir) => `${dir}/openclaw`);

  for (const p of candidates) {
    if (p && (await fileExists(p))) {
      _openclawBin = p;
      return p;
    }
  }

  // Try `which` with enriched PATH as a last resort before giving up.
  try {
    const proc = spawnWithPath(["which", "openclaw"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    const resolved = out.trim();
    if (code === 0 && resolved) {
      _openclawBin = resolved;
      return resolved;
    }
  } catch {
    // ignore
  }

  _openclawBin = "openclaw";
  return "openclaw";
}

/** Reset the cached bin path (useful for testing or after re-installation). */
export function resetOpenclawBinCache(): void {
  _openclawBin = null;
}
