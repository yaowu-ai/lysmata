import type { AgentFramework, AgentFrameworkSettings } from "../types";

export const DEFAULT_AGENT_FRAMEWORK_SETTINGS: AgentFrameworkSettings = {
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

export function isAgentFramework(value: string): value is AgentFramework {
  return value === "openclaw" || value === "hermes";
}

export function toBotBackendUrlForFramework(framework: AgentFramework, endpoint: string): string {
  const normalized = endpoint.trim();
  if (!normalized) {
    return framework === "openclaw"
      ? "ws://127.0.0.1:18789/ws"
      : DEFAULT_AGENT_FRAMEWORK_SETTINGS.frameworks.hermes.endpoint;
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

export function getFrameworkConnectionDefaults(
  settings: AgentFrameworkSettings | undefined,
  framework: AgentFramework,
) {
  const merged = settings ?? DEFAULT_AGENT_FRAMEWORK_SETTINGS;
  const configured = merged.frameworks[framework];
  const fallback = DEFAULT_AGENT_FRAMEWORK_SETTINGS.frameworks[framework];
  const endpoint = configured?.endpoint?.trim() || fallback.endpoint;
  const authToken = configured?.authToken ?? fallback.authToken ?? "";

  return {
    endpoint,
    authToken,
    backendUrl: toBotBackendUrlForFramework(framework, endpoint),
  };
}
