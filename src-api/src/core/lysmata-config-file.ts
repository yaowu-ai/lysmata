import { join } from "node:path";
import { CONFIG_DIR } from "../config";
import { readJsonFile, writeJsonFile } from "../shared/json-file";

export const LYSMATA_CONFIG_PATH = join(CONFIG_DIR, "lysmata.json");

export type AgentFramework = "openclaw" | "hermes";

export interface FrameworkConnectionConfig {
  endpoint: string;
  authToken?: string;
}

export interface LysmataConfig {
  meta?: { lastTouchedAt?: string };
  agentFramework?: AgentFramework;
  frameworks?: {
    openclaw?: FrameworkConnectionConfig;
    hermes?: FrameworkConnectionConfig;
  };
}

export interface AgentFrameworkSettings {
  agentFramework: AgentFramework;
  frameworks: Record<AgentFramework, FrameworkConnectionConfig>;
}

export interface AgentFrameworkSettingsUpdate {
  agentFramework?: AgentFramework;
  frameworks?: Partial<Record<AgentFramework, Partial<FrameworkConnectionConfig>>>;
}

const DEFAULT_SETTINGS: AgentFrameworkSettings = {
  agentFramework: "openclaw",
  frameworks: {
    openclaw: {
      endpoint: "http://127.0.0.1:18789",
      authToken: "",
    },
    hermes: {
      endpoint: "http://127.0.0.1:8642",
      authToken: "",
    },
  },
};

function toBotBackendUrlForFramework(framework: AgentFramework, endpoint: string): string {
  const normalized = endpoint.trim();
  if (!normalized) {
    return framework === "openclaw"
      ? "ws://127.0.0.1:18789/ws"
      : DEFAULT_SETTINGS.frameworks.hermes.endpoint;
  }

  if (framework !== "openclaw") {
    return normalized;
  }

  if (normalized.startsWith("ws://") || normalized.startsWith("wss://")) {
    return normalized;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return normalized;
    }

    const path = url.pathname.replace(/\/+$/, "");
    if (path && path !== "/") {
      return normalized;
    }

    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return normalized;
  }
}

export async function readLysmataConfig(): Promise<LysmataConfig | null> {
  return readJsonFile<LysmataConfig>(LYSMATA_CONFIG_PATH);
}

function sanitizeConnectionConfig(
  input: unknown,
  fallback: FrameworkConnectionConfig,
): FrameworkConnectionConfig {
  if (!input || typeof input !== "object") return fallback;
  const value = input as FrameworkConnectionConfig;
  return {
    endpoint:
      typeof value.endpoint === "string" && value.endpoint.trim().length > 0
        ? value.endpoint.trim()
        : fallback.endpoint,
    authToken: typeof value.authToken === "string" ? value.authToken : fallback.authToken,
  };
}

export async function readAgentFrameworkSettings(): Promise<AgentFrameworkSettings> {
  const config = await readLysmataConfig();
  return {
    agentFramework: config?.agentFramework === "hermes" ? "hermes" : "openclaw",
    frameworks: {
      openclaw: sanitizeConnectionConfig(
        config?.frameworks?.openclaw,
        DEFAULT_SETTINGS.frameworks.openclaw,
      ),
      hermes: sanitizeConnectionConfig(
        config?.frameworks?.hermes,
        DEFAULT_SETTINGS.frameworks.hermes,
      ),
    },
  };
}

export async function updateAgentFrameworkSettings(
  update: AgentFrameworkSettingsUpdate,
): Promise<AgentFrameworkSettings> {
  const existing = (await readLysmataConfig()) ?? {};
  const current = await readAgentFrameworkSettings();

  const next: AgentFrameworkSettings = {
    agentFramework: update.agentFramework ?? current.agentFramework,
    frameworks: {
      openclaw: {
        ...current.frameworks.openclaw,
        ...(update.frameworks?.openclaw ?? {}),
      },
      hermes: {
        ...current.frameworks.hermes,
        ...(update.frameworks?.hermes ?? {}),
      },
    },
  };

  const updated: LysmataConfig = {
    ...existing,
    agentFramework: next.agentFramework,
    frameworks: next.frameworks,
    meta: {
      ...existing.meta,
      lastTouchedAt: new Date().toISOString(),
    },
  };

  await writeJsonFile(LYSMATA_CONFIG_PATH, updated);
  return next;
}

export async function resolveBotConnectionDefaults(framework?: AgentFramework): Promise<{
  backendType: AgentFramework;
  backendUrl: string;
  backendToken?: string;
}> {
  const settings = await readAgentFrameworkSettings();
  const selected = framework ?? settings.agentFramework;
  const config = settings.frameworks[selected];

  return {
    backendType: selected,
    backendUrl: toBotBackendUrlForFramework(selected, config.endpoint),
    backendToken: config.authToken?.trim() ? config.authToken : undefined,
  };
}
