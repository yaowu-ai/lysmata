import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { GatewaySettings } from "../types";

const gatewaySettingsKeys = {
  all: ["settings", "gateway"] as const,
};

export function useGatewaySettings() {
  return useQuery({
    queryKey: gatewaySettingsKeys.all,
    queryFn: () => apiClient.get<GatewaySettings>("/settings/gateway"),
  });
}

export function useUpdateGatewaySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<GatewaySettings>) =>
      apiClient.put<{ success: boolean; needsRestart: boolean }>("/settings/gateway", settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gatewaySettingsKeys.all });
    },
  });
}
