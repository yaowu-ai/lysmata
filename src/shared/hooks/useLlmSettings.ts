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
