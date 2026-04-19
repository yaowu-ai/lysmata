// ── Agent Adapter Registry ────────────────────────────────────────────────────
//
// Central registry for all backend adapters.  The rest of the codebase
// resolves adapters through `getAdapter()` instead of importing a specific
// backend implementation directly.

import type { AgentAdapter, AgentBackendType } from "./types";

// ── Registry ─────────────────────────────────────────────────────────────────

const adapters = new Map<AgentBackendType, AgentAdapter>();

/** Register an adapter implementation. Called once at startup for each backend. */
export function registerAdapter(adapter: AgentAdapter): void {
  if (adapters.has(adapter.type)) {
    console.warn(`[adapter-registry] Overwriting existing adapter for "${adapter.type}"`);
  }
  adapters.set(adapter.type, adapter);
}

/** Look up a registered adapter by backend type. Throws if not found. */
export function getAdapter(type: AgentBackendType): AgentAdapter {
  const adapter = adapters.get(type);
  if (!adapter) {
    throw new Error(
      `No adapter registered for backend type "${type}". ` +
        `Registered types: [${[...adapters.keys()].join(", ")}]`,
    );
  }
  return adapter;
}

/** Return all registered backend types. */
export function getRegisteredTypes(): AgentBackendType[] {
  return [...adapters.keys()];
}

// ── URL → Backend Type inference ──────────────────────────────────────────────
//
// Used when creating a Bot: the user provides a URL and we auto-detect
// the most likely backend type.  The user can always override manually.

const HERMES_PORT_PATTERN = /:8642(?:\/|$)/;

export function detectBackendType(url: string): AgentBackendType {
  const lower = url.toLowerCase();

  // WebSocket URLs → OpenClaw Gateway
  if (lower.startsWith("ws://") || lower.startsWith("wss://")) {
    return "openclaw";
  }

  // HTTP URLs with Hermes default port → Hermes
  if (HERMES_PORT_PATTERN.test(lower)) {
    return "hermes";
  }

  // All other HTTP URLs → generic OpenAI-compatible
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return "openai-compatible";
  }

  // Fallback: assume OpenClaw for unknown schemes
  return "openclaw";
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
//
// Import and register all built-in adapters.  This function should be called
// once during application startup (before any Bot operations).

let bootstrapped = false;

export function bootstrapAdapters(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  // Import each adapter module and register it.
  // We use dynamic require() to avoid circular imports at module-eval time.
  // Each adapter module exports a singleton `adapter` object.

  try {
    const { openclawAdapter } = require("./openclaw-adapter");
    registerAdapter(openclawAdapter);
  } catch (err) {
    console.warn("[adapter-registry] Failed to load openclaw adapter:", err);
  }

  try {
    const { hermesAdapter } = require("./hermes-adapter");
    registerAdapter(hermesAdapter);
  } catch (err) {
    console.warn("[adapter-registry] Failed to load hermes adapter:", err);
  }

  try {
    const { openaiCompatibleAdapter } = require("./openai-adapter");
    registerAdapter(openaiCompatibleAdapter);
  } catch (err) {
    console.warn("[adapter-registry] Failed to load openai-compatible adapter:", err);
  }

  console.log(
    `[adapter-registry] Bootstrapped. Registered types: [${getRegisteredTypes().join(", ")}]`,
  );
}
