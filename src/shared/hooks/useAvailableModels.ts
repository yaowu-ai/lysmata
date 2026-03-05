import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";

export function useAvailableModels() {
  return useQuery({
    queryKey: ["settings", "models"],
    queryFn: () => apiClient.get<string[]>("/settings/models"),
    staleTime: 5 * 60 * 1000, // 5 分钟内不重复调用 CLI
  });
}
