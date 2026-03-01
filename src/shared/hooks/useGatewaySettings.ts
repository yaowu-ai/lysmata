import { useQuery } from "@tanstack/react-query";
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
