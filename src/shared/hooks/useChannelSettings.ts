import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { ChannelEntry } from "../types";

const channelSettingsKeys = {
  all: ["settings", "channels"] as const,
};

export function useChannelSettings() {
  return useQuery({
    queryKey: channelSettingsKeys.all,
    queryFn: () => apiClient.get<ChannelEntry[]>("/settings/channels"),
  });
}

export function useUpdateChannelSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channels: ChannelEntry[]) =>
      apiClient.put<void>("/settings/channels", channels),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelSettingsKeys.all }),
  });
}
