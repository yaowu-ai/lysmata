import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_DIR } from "../config";

export type WindowsShellPreference = "auto" | "cmd" | "powershell" | "pwsh" | "git-bash";

export interface RuntimePreferences {
  windowsShell?: WindowsShellPreference;
}

const PREFERENCES_PATH = join(CONFIG_DIR, "runtime-preferences.json");

function sanitizePreferences(input: unknown): RuntimePreferences {
  if (!input || typeof input !== "object") return {};
  const value = (input as RuntimePreferences).windowsShell;
  if (value && ["auto", "cmd", "powershell", "pwsh", "git-bash"].includes(value)) {
    return { windowsShell: value };
  }
  return {};
}

export async function readRuntimePreferences(): Promise<RuntimePreferences> {
  try {
    const file = Bun.file(PREFERENCES_PATH);
    if (!(await file.exists())) return {};
    return sanitizePreferences(await file.json());
  } catch {
    return {};
  }
}

export async function writeRuntimePreferences(
  update: Partial<RuntimePreferences>,
): Promise<RuntimePreferences> {
  const current = await readRuntimePreferences();
  const next = sanitizePreferences({ ...current, ...update });
  await mkdir(CONFIG_DIR, { recursive: true });
  await Bun.write(PREFERENCES_PATH, JSON.stringify(next, null, 2));
  return next;
}
