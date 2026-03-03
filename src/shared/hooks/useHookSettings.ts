import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { HookEntry } from "../types";

const hookSettingsKeys = {
  all: ["settings", "hooks"] as const,
};

export function useHookSettings() {
  return useQuery({
    queryKey: hookSettingsKeys.all,
    queryFn: () => apiClient.get<HookEntry[]>("/settings/hooks"),
  });
}

export function useUpdateHookSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hooks: HookEntry[]) => apiClient.put<void>("/settings/hooks", hooks),
    onSuccess: () => qc.invalidateQueries({ queryKey: hookSettingsKeys.all }),
  });
}
