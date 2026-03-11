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

export interface OpenClawAgentEntry {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
}

export interface OpenClawConfig {
  meta?: { lastTouchedVersion?: string; lastTouchedAt?: string };
  agents?: { defaults?: OpenClawAgentDefaults; list?: OpenClawAgentEntry[] };
  auth?: { profiles?: Record<string, OpenClawAuthProfile> };
  gateway?: {
    port?: number;
    mode?: string;
    bind?: "loopback" | "lan" | "auto" | "custom" | "tailnet";
    auth?: { mode?: string; token?: string };
    tailscale?: Record<string, unknown>;
  };
  tools?: Record<string, unknown>;
  channels?: Record<string, { label: string; token: string; enabled: boolean }>;
  hooks?: Record<string, { name: string; path: string; enabled: boolean }>;
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

// NOTE: Keep in sync with OPENCLAW_API_TYPES in src/shared/types/index.ts
export const OPENCLAW_API_TYPES = [
  "openai-completions",
  "openai-responses",
  "openai-codex-responses",
  "anthropic-messages",
  "google-generative-ai",
  "github-copilot",
  "bedrock-converse-stream",
  "ollama",
] as const;

export type OpenClawApiType = (typeof OPENCLAW_API_TYPES)[number];

export interface OpenClawProvider {
  baseUrl?: string;
  apiKey?: string;
  api?: OpenClawApiType;
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

  // Start with explicitly configured providers (custom providers with baseUrl)
  const providers: Record<string, OpenClawProvider> = {
    ...(config?.models?.providers ?? {}),
  };

  // Reconstruct built-in providers from the alias table (agents.defaults.models).
  // Built-in providers are NOT written to models.providers (openclaw rejects them
  // without a baseUrl), but their models are stored as aliases:
  //   { "zai/glm-4.7": { alias: "GLM-4.7" }, ... }
  const aliasTable = config?.agents?.defaults?.models ?? {};
  for (const [fullId, entry] of Object.entries(aliasTable)) {
    const slashIdx = fullId.indexOf("/");
    if (slashIdx < 1) continue;
    const providerKey = fullId.slice(0, slashIdx);
    const modelId = fullId.slice(slashIdx + 1);
    if (!providers[providerKey]) {
      providers[providerKey] = { models: [] };
    }
    if (!providers[providerKey].models.some((m) => m.id === modelId)) {
      providers[providerKey].models.push({ id: modelId, name: entry.alias ?? modelId });
    }
  }

  return {
    providers,
    defaultModel: {
      primary: config?.agents?.defaults?.model?.primary ?? "",
      fallbacks: config?.agents?.defaults?.model?.fallbacks ?? [],
    },
  };
}

export async function updateLlmSettings(settings: LlmSettings): Promise<void> {
  const existing = (await readOpenClawConfig()) ?? {};
  const updated: OpenClawConfig = structuredClone(existing);

  // Only write providers that have a non-empty baseUrl to models.providers.
  // Built-in openclaw providers (openai, zai, etc.) must NOT be written here —
  // openclaw schema requires baseUrl to be a string and rejects undefined/missing.
  const customProviders: Record<string, OpenClawProvider> = {};
  for (const [key, provider] of Object.entries(settings.providers)) {
    const hasBaseUrl = typeof provider.baseUrl === "string" && provider.baseUrl.trim().length > 0;
    if (hasBaseUrl) {
      customProviders[key] = {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey || undefined,
        api: provider.api,
        models: provider.models,
      };
    }
    // Built-in providers (no baseUrl): only alias table entry needed (handled below).
    // API keys for built-in providers are stored in agent auth-profiles.json files,
    // NOT in openclaw.json — see writeAgentAuthKey().
  }

  updated.models ??= { mode: "merge", providers: {} };
  updated.models.providers = customProviders;

  // Write default model
  updated.agents ??= {};
  updated.agents.defaults ??= {};
  updated.agents.defaults.model = {
    primary: settings.defaultModel.primary,
    fallbacks: settings.defaultModel.fallbacks,
  };

  // Sync agents.defaults.models alias table from ALL providers (including built-in).
  // Merge with existing aliases so models not managed by our UI are preserved.
  const existingAliases = updated.agents.defaults.models ?? {};
  const aliasTable: Record<string, { alias?: string }> = { ...existingAliases };
  for (const [providerKey, provider] of Object.entries(settings.providers)) {
    for (const model of provider.models) {
      aliasTable[`${providerKey}/${model.id}`] = { alias: model.name };
    }
  }
  updated.agents.defaults.models = aliasTable;

  await Bun.write(OPENCLAW_CONFIG_PATH, JSON.stringify(updated, null, 2));
}

// ── Agent auth-profiles.json helpers ────────────────────────────────────────
//
// API keys for built-in providers (zai, openai, etc.) are stored per-agent at:
//   ~/.openclaw/agents/{agentId}/agent/auth-profiles.json
// Structure: { profiles: { "zai:default": { type, provider, key } }, lastGood, usageStats }

const OPENCLAW_AGENTS_DIR = join(homedir(), ".openclaw", "agents");

interface AgentAuthProfiles {
  version?: number;
  profiles?: Record<string, { type?: string; provider?: string; key?: string }>;
  lastGood?: Record<string, string>;
  usageStats?: Record<string, unknown>;
}

async function readAgentAuthProfiles(agentId: string): Promise<AgentAuthProfiles> {
  try {
    const path = join(OPENCLAW_AGENTS_DIR, agentId, "agent", "auth-profiles.json");
    const file = Bun.file(path);
    if (!(await file.exists())) return {};
    return (await file.json()) as AgentAuthProfiles;
  } catch {
    return {};
  }
}

async function writeAgentAuthProfiles(agentId: string, data: AgentAuthProfiles): Promise<void> {
  const path = join(OPENCLAW_AGENTS_DIR, agentId, "agent", "auth-profiles.json");
  await Bun.write(path, JSON.stringify(data, null, 2));
}

/** List all agent IDs that have an agent directory. */
export async function listAgentIds(): Promise<string[]> {
  try {
    const glob = new Bun.Glob("*/agent/auth-profiles.json");
    const ids: string[] = [];
    for await (const match of glob.scan(OPENCLAW_AGENTS_DIR)) {
      ids.push(match.split("/")[0]);
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * Read the API key for a provider from all agents' auth-profiles.json.
 * Returns the key from the first agent that has it (they should all be the same).
 */
export async function readProviderApiKey(providerKey: string): Promise<string | undefined> {
  const agentIds = await listAgentIds();
  const profileKey = `${providerKey}:default`;
  for (const agentId of agentIds) {
    const profiles = await readAgentAuthProfiles(agentId);
    const key = profiles.profiles?.[profileKey]?.key;
    if (key) return key;
  }
  return undefined;
}

/**
 * Write an API key for a provider to all agents' auth-profiles.json.
 * This mirrors what `openclaw models auth login` does for api_key providers.
 */
export async function writeProviderApiKey(providerKey: string, apiKey: string): Promise<void> {
  const agentIds = await listAgentIds();
  if (agentIds.length === 0) return;
  const profileKey = `${providerKey}:default`;
  await Promise.all(
    agentIds.map(async (agentId) => {
      const existing = await readAgentAuthProfiles(agentId);
      const updated: AgentAuthProfiles = structuredClone(existing);
      updated.profiles ??= {};
      updated.profiles[profileKey] = {
        type: "api_key",
        provider: providerKey,
        key: apiKey,
      };
      updated.lastGood ??= {};
      updated.lastGood[providerKey] = profileKey;
      await writeAgentAuthProfiles(agentId, updated);
    }),
  );
}

/**
 * Delete a provider: removes it from models.providers AND clears its alias
 * entries from agents.defaults.models (used by built-in providers).
 */
export async function deleteProviderSettings(
  providerKey: string,
  remaining: LlmSettings,
): Promise<void> {
  // updateLlmSettings writes the remaining providers and rebuilds the alias table.
  // We need to first call it, then strip the deleted provider's alias entries.
  await updateLlmSettings(remaining);

  // Strip alias entries for the deleted provider (built-in providers live here)
  const raw = (await readOpenClawConfig()) ?? {};
  if (raw.agents?.defaults?.models) {
    const prefix = `${providerKey}/`;
    let changed = false;
    for (const k of Object.keys(raw.agents.defaults.models)) {
      if (k.startsWith(prefix)) {
        delete raw.agents.defaults.models[k];
        changed = true;
      }
    }
    if (changed) {
      await Bun.write(OPENCLAW_CONFIG_PATH, JSON.stringify(raw, null, 2));
    }
  }
}

export interface GatewaySettings {
  /** "local" = 本地模式；"remote" = 远程模式 */
  mode: "local" | "remote";
  port: number;
  /** "loopback" = 127.0.0.1（仅本地）；"lan" = 0.0.0.0（局域网共享） */
  bind: "loopback" | "lan";
  authMode: "none" | "token";
  /** Auth token value; only present when authMode === "token" */
  authToken?: string;
}

export interface GatewayConfigUpdate {
  mode?: "local" | "remote";
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
  const rawMode = gw?.mode;
  return {
    mode: rawMode === "remote" ? "remote" : "local",
    port: typeof gw?.port === "number" ? gw.port : 18789,
    bind: rawBind === "lan" ? "lan" : "loopback",
    authMode: auth?.mode === "token" ? "token" : "none",
    authToken: typeof auth?.token === "string" ? auth.token : undefined,
  };
}

// ── Channel Settings ────────────────────────────────────────────────────────

export interface ChannelEntry {
  id: string;
  label: string;
  token: string;
  enabled: boolean;
}

export async function readChannelSettings(): Promise<ChannelEntry[]> {
  const config = await readOpenClawConfig();
  const raw = config?.channels ?? {};
  return Object.entries(raw).map(([id, v]) => ({
    id,
    label: v.label,
    token: v.token,
    enabled: v.enabled,
  }));
}

export async function updateChannelSettings(channels: ChannelEntry[]): Promise<void> {
  const existing = (await readOpenClawConfig()) ?? {};
  const updated: OpenClawConfig = structuredClone(existing);
  updated.channels = {};
  for (const ch of channels) {
    updated.channels[ch.id] = { label: ch.label, token: ch.token, enabled: ch.enabled };
  }
  updated.meta = { ...updated.meta, lastTouchedAt: new Date().toISOString() };
  await Bun.write(OPENCLAW_CONFIG_PATH, JSON.stringify(updated, null, 2));
}

// Hook settings are managed via CLI: `openclaw hooks enable/disable <name>`
// Do NOT write to openclaw.json hooks section directly — OpenClaw only accepts
// predefined hook IDs and rejects unknown keys with a config validation error.

export async function updateGatewayConfig(update: GatewayConfigUpdate): Promise<void> {
  const existing = (await readOpenClawConfig()) ?? {};
  const updated: OpenClawConfig = structuredClone(existing);

  updated.gateway ??= {};

  // 清理 openclaw 已不再支持的旧字段
  const gw = updated.gateway as Record<string, unknown>;
  delete gw.bindAddress;
  delete gw.autostart;

  if (update.mode !== undefined) updated.gateway.mode = update.mode;
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

/**
 * Update the model of a specific agent in agents.list[].
 * If the agent entry doesn't exist in the list yet, it is appended.
 */
export async function updateAgentModel(agentId: string, model: string): Promise<void> {
  const existing = (await readOpenClawConfig()) ?? {};
  const updated: OpenClawConfig = structuredClone(existing);

  updated.agents ??= {};
  updated.agents.list ??= [];

  const entry = updated.agents.list.find((a) => a.id === agentId);
  if (entry) {
    entry.model = model;
  } else {
    updated.agents.list.push({ id: agentId, model });
  }

  updated.meta = { ...updated.meta, lastTouchedAt: new Date().toISOString() };
  await Bun.write(OPENCLAW_CONFIG_PATH, JSON.stringify(updated, null, 2));
}
