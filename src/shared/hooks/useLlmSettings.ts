import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { LlmSettings } from "../types";

const llmSettingsKeys = {
  all: ["settings", "llm"] as const,
};

export function useLlmSettings() {
  return useQuery({
    queryKey: llmSettingsKeys.all,
    queryFn: () => apiClient.get<LlmSettings>("/settings/llm"),
  });
}

export function useUpdateLlmSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: LlmSettings) => apiClient.put<void>("/settings/llm", settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: llmSettingsKeys.all }),
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerKey: string) =>
      apiClient.delete<void>(`/settings/llm/providers?key=${encodeURIComponent(providerKey)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: llmSettingsKeys.all }),
  });
}

export function useCheckProviderUsage() {
  return {
    check: (providerKey: string) =>
      apiClient.get<{
        inUse: boolean;
        count: number;
        bots: Array<{ id: string; name: string }>;
      }>(`/settings/llm/provider-usage?key=${encodeURIComponent(providerKey)}`),
  };
}

export function useProviderApiKey(providerKey: string | null) {
  return useQuery({
    queryKey: ["settings", "llm", "apikey", providerKey],
    queryFn: () =>
      apiClient.get<{ apiKey: string | null }>(
        `/settings/llm/provider-apikey?key=${encodeURIComponent(providerKey!)}`,
      ),
    enabled: !!providerKey,
    staleTime: 0,
  });
}

export function useSaveProviderApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, apiKey }: { key: string; apiKey: string }) =>
      apiClient.put<{ success: boolean }>("/settings/llm/provider-apikey", { key, apiKey }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["settings", "llm", "apikey", vars.key] });
    },
  });
}
