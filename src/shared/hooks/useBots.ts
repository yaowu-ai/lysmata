import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { Bot, CreateBotInput, UpdateBotInput } from "../types";

export interface RemoteAgentConfig {
  agentId: string;
  llm?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
  mcp?: Record<string, unknown>;
  skills?: Array<{ name: string; description: string }>;
}

export interface RemoteConfigResult {
  success: boolean;
  config?: RemoteAgentConfig;
  message: string;
  /** Absolute path to the OpenClaw config file on this machine */
  configPath?: string;
  /** Whether the Gateway needs a restart to pick up the new config */
  needsRestart?: boolean;
}

export const botKeys = {
  all: ["bots"] as const,
  detail: (id: string) => ["bots", id] as const,
  remoteConfig: (id: string) => ["bots", id, "remote-config"] as const,
};

export function useBots() {
  return useQuery({
    queryKey: botKeys.all,
    queryFn: () => apiClient.get<Bot[]>("/bots"),
  });
}

export function useBot(id: string) {
  return useQuery({
    queryKey: botKeys.detail(id),
    queryFn: () => apiClient.get<Bot>(`/bots/${id}`),
    enabled: !!id,
  });
}

export function useCreateBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBotInput) => apiClient.post<Bot>("/bots", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: botKeys.all }),
  });
}

export function useUpdateBot(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBotInput) => apiClient.put<Bot>(`/bots/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: botKeys.all }),
  });
}

export function useDeleteBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/bots/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: botKeys.all }),
  });
}

export function useTestBotConnection() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ success: boolean; message: string; rttMs?: number }>(
        `/bots/${id}/test-connection`,
        {},
      ),
  });
}

export function useApplyBotConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ success: boolean; message: string }>(`/bots/${id}/apply-config`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: botKeys.all }),
  });
}

/**
 * Returns the number of conversations this bot is participating in.
 * Used to show a warning when the user attempts to delete a bot with active conversations.
 */
export function useBotConversationsCount(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["bots", id, "conversations-count"] as const,
    queryFn: () => apiClient.get<{ count: number }>(`/bots/${id}/conversations-count`),
    enabled: enabled && !!id,
    retry: false,
    staleTime: 0,
  });
}

/**
 * Fetches the current LLM / MCP / Skills configuration directly from the OpenClaw Gateway.
 * Only enabled when a valid bot id is provided and `enabled` is true (e.g., drawer is open).
 */
export function useBotRemoteConfig(id: string, enabled: boolean) {
  return useQuery({
    queryKey: botKeys.remoteConfig(id),
    queryFn: () => apiClient.get<RemoteConfigResult>(`/bots/${id}/remote-config`),
    enabled: enabled && !!id,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
