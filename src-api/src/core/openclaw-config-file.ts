/**
 * OpenClaw config file reader/writer
 *
 * Reads and writes ~/.openclaw/openclaw.json directly.
 * This is the authoritative source of truth for LLM provider / model settings,
 * since the Gateway WebSocket protocol does not expose config RPCs.
 *
 * OpenClaw model string format:  "{provider}/{model}"
 *   e.g. "openrouter/google/gemini-3-pro-preview"
 *        "openai/gpt-4o"
 *        "anthropic/claude-3-5-sonnet-20241022"
 */

import { homedir } from "os";
import { join } from "path";

export const OPENCLAW_CONFIG_PATH =
  process.env.OPENCLAW_CONFIG_PATH ?? join(homedir(), ".openclaw", "openclaw.json");

// ── OpenClaw config shape (partial) ─────────────────────────────────────────

export interface OpenClawAgentModel {
  primary?: string;
  fallbacks?: string[];
}

export interface OpenClawAgentDefaults {
  model?: OpenClawAgentModel;
  models?: Record<string, { alias?: string }>;
  workspace?: string;
  heartbeat?: { every?: string; prompt?: string };
  maxConcurrent?: number;
  contextPruning?: Record<string, unknown>;
  compaction?: Record<string, unknown>;
}

export interface OpenClawAuthProfile {
  provider?: string;
  mode?: string;
  type?: string;
  key?: string;
  access?: string;
  refresh?: string;
  expires?: number;
}

export interface OpenClawConfig {
  meta?: { lastTouchedVersion?: string; lastTouchedAt?: string };
  agents?: { defaults?: OpenClawAgentDefaults };
  auth?: { profiles?: Record<string, OpenClawAuthProfile> };
  gateway?: {
    port?: number;
    mode?: string;
    bind?: "loopback" | "lan" | "auto" | "custom" | "tailnet";
    auth?: { mode?: string; token?: string };
    tailscale?: Record<string, unknown>;
  };
  tools?: Record<string, unknown>;
  channels?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
  models?: {
    mode?: string;
    providers?: Record<string, OpenClawProvider>;
  };
  [key: string]: unknown;
}

// ── Parsed LLM config ────────────────────────────────────────────────────────

export interface ParsedLlmConfig {
  /** e.g. "openrouter", "openai", "anthropic" */
  provider: string;
  /** e.g. "google/gemini-3-pro-preview", "gpt-4o" */
  model: string;
  /** Resolved API key from auth.profiles */
  apiKey?: string;
  /** Fallback models */
  fallbacks?: string[];
  /** Raw primary string as stored in config */
  raw: string;
}

// ── Reader ───────────────────────────────────────────────────────────────────

export async function readOpenClawConfig(): Promise<OpenClawConfig | null> {
  try {
    const file = Bun.file(OPENCLAW_CONFIG_PATH);
    const exists = await file.exists();
    if (!exists) return null;
    return (await file.json()) as OpenClawConfig;
  } catch {
    return null;
  }
}

/**
 * Parse the LLM config from openclaw.json:
 *   agents.defaults.model.primary = "openrouter/google/gemini-3-pro-preview"
 *   → provider: "openrouter", model: "google/gemini-3-pro-preview"
 *
 * API key is resolved from auth.profiles["{provider}:default"]
 */
export function parseLlmConfig(config: OpenClawConfig): ParsedLlmConfig | null {
  const primary = config.agents?.defaults?.model?.primary;
  if (!primary) return null;

  const slashIdx = primary.indexOf("/");
  const provider = slashIdx > 0 ? primary.slice(0, slashIdx) : primary;
  const model = slashIdx > 0 ? primary.slice(slashIdx + 1) : "";

  // Resolve API key from auth profiles
  const profiles = config.auth?.profiles ?? {};
  const profileKey = `${provider}:default`;
  const profile = profiles[profileKey];
  const apiKey = profile?.key ?? undefined;

  return {
    provider,
    model,
    apiKey,
    fallbacks: config.agents?.defaults?.model?.fallbacks,
    raw: primary,
  };
}

// ── Writer ───────────────────────────────────────────────────────────────────

export interface ConfigUpdatePayload {
  /** Provider (e.g. "openrouter", "openai", "anthropic") */
  provider?: string;
  /** Model identifier without provider prefix (e.g. "gpt-4o", "google/gemini-3-pro-preview") */
  model?: string;
  /** API key to store in auth.profiles["{provider}:default"] */
  apiKey?: string;
}

/**
 * Merges `update` into the existing openclaw.json and writes it back.
 * Only modifies the specified fields; other settings are preserved.
 */
export async function updateOpenClawConfig(update: ConfigUpdatePayload): Promise<void> {
  const existing = (await readOpenClawConfig()) ?? {};

  const updated: OpenClawConfig = structuredClone(existing);

  if (update.provider || update.model) {
    const provider = update.provider ?? parseLlmConfig(existing)?.provider ?? "openrouter";
    const model = update.model ?? parseLlmConfig(existing)?.model ?? "";
    const primaryStr = model ? `${provider}/${model}` : provider;

    updated.agents ??= {};
    updated.agents.defaults ??= {};
    updated.agents.defaults.model ??= {};
    updated.agents.defaults.model.primary = primaryStr;
  }

  if (update.apiKey !== undefined && update.provider) {
    const profileKey = `${update.provider}:default`;
    updated.auth ??= {};
    updated.auth.profiles ??= {};
    const existing_profile = updated.auth.profiles[profileKey] ?? {};
    updated.auth.profiles[profileKey] = {
      ...existing_profile,
      provider: update.provider,
      mode: "api_key",
      type: "api_key",
      key: update.apiKey,
    };
  }

  await Bun.write(OPENCLAW_CONFIG_PATH, JSON.stringify(updated, null, 2));
}

// ── Provider / LLM Settings helpers ─────────────────────────────────────────

export interface OpenClawProviderModel {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: string[];
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow?: number;
  maxTokens?: number;
}

export interface OpenClawProvider {
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  models: OpenClawProviderModel[];
}

export interface LlmSettings {
  providers: Record<string, OpenClawProvider>;
  defaultModel: {
    primary: string;
    fallbacks?: string[];
  };
}

export async function readLlmSettings(): Promise<LlmSettings> {
  const config = await readOpenClawConfig();
  return {
    providers: config?.models?.providers ?? {},
    defaultModel: {
      primary: config?.agents?.defaults?.model?.primary ?? "",
      fallbacks: config?.agents?.defaults?.model?.fallbacks ?? [],
    },
  };
}

export async function updateLlmSettings(settings: LlmSettings): Promise<void> {
  const existing = (await readOpenClawConfig()) ?? {};
  const updated: OpenClawConfig = structuredClone(existing);

  // Write providers
  updated.models ??= { mode: "merge", providers: {} };
  updated.models.providers = settings.providers;

  // Write default model
  updated.agents ??= {};
  updated.agents.defaults ??= {};
  updated.agents.defaults.model = {
    primary: settings.defaultModel.primary,
    fallbacks: settings.defaultModel.fallbacks,
  };

  // Sync agents.defaults.models alias table from providers
  const aliasTable: Record<string, { alias?: string }> = {};
  for (const [providerKey, provider] of Object.entries(settings.providers)) {
    for (const model of provider.models) {
      aliasTable[`${providerKey}/${model.id}`] = { alias: model.name };
    }
  }
  updated.agents.defaults.models = aliasTable;

  await Bun.write(OPENCLAW_CONFIG_PATH, JSON.stringify(updated, null, 2));
}

export interface GatewaySettings {
  port: number;
  /** "loopback" = 127.0.0.1（仅本地）；"lan" = 0.0.0.0（局域网共享） */
  bind: "loopback" | "lan";
  authMode: "none" | "token";
  /** Auth token value; only present when authMode === "token" */
  authToken?: string;
}

export interface GatewayConfigUpdate {
  port?: number;
  bind?: "loopback" | "lan";
  authMode?: "none" | "token";
  authToken?: string;
}

export async function readGatewaySettings(): Promise<GatewaySettings> {
  const config = await readOpenClawConfig();
  const gw = config?.gateway as Record<string, unknown> | undefined;
  const auth = gw?.auth as { mode?: string; token?: string } | undefined;
  const rawBind = gw?.bind;
  return {
    port: typeof gw?.port === "number" ? gw.port : 18789,
    bind: rawBind === "lan" ? "lan" : "loopback",
    authMode: auth?.mode === "token" ? "token" : "none",
    authToken: typeof auth?.token === "string" ? auth.token : undefined,
  };
}

export async function updateGatewayConfig(update: GatewayConfigUpdate): Promise<void> {
  const existing = (await readOpenClawConfig()) ?? {};
  const updated: OpenClawConfig = structuredClone(existing);

  updated.gateway ??= {};

  // 清理 openclaw 已不再支持的旧字段
  const gw = updated.gateway as Record<string, unknown>;
  delete gw.bindAddress;
  delete gw.autostart;

  if (update.port !== undefined) updated.gateway.port = update.port;
  if (update.bind !== undefined) updated.gateway.bind = update.bind;
  if (update.authMode !== undefined || update.authToken !== undefined) {
    updated.gateway.auth = {
      ...updated.gateway.auth,
      ...(update.authMode !== undefined && { mode: update.authMode }),
      ...(update.authToken !== undefined && { token: update.authToken }),
    };
  }

  updated.meta = { ...updated.meta, lastTouchedAt: new Date().toISOString() };
  await Bun.write(OPENCLAW_CONFIG_PATH, JSON.stringify(updated, null, 2));
}
