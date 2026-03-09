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

const EXTRA_DIRS = [
  "/usr/local/bin",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
];

/** Build an enriched PATH string by appending common binary directories. */
export function getEnrichedPath(): string {
  const home = process.env.HOME ?? "";
  const existing = process.env.PATH ?? "";
  const extra = [
    `${home}/.nvm/current/bin`,
    `${home}/.fnm/current/bin`,
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
export function spawnWithPath(
  cmd: string[],
  opts: Omit<Parameters<typeof Bun.spawn>[1], "env"> & { env?: Record<string, string> } = {},
) {
  return Bun.spawn(cmd, { ...opts, env: { ...spawnEnv(), ...(opts.env ?? {}) } });
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
  const candidates = [
    ...EXTRA_DIRS.map((d) => `${d}/openclaw`),
    `${home}/.local/bin/openclaw`,
    `${home}/.npm-global/bin/openclaw`,
    `${home}/.openclaw/bin/openclaw`,
  ];

  for (const p of candidates) {
    if (p && (await Bun.file(p).exists())) {
      _openclawBin = p;
      return p;
    }
  }

  // Try `which` with enriched PATH as a last resort before giving up.
  try {
    const proc = Bun.spawn(["which", "openclaw"], {
      stdout: "pipe",
      stderr: "pipe",
      env: spawnEnv(),
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
