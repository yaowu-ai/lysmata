import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { Agent, AgentBinding, CreateAgentInput, BindAgentInput } from "../types";

interface ApiResult<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export const agentKeys = {
  all: ["agents"] as const,
  bindings: ["agents", "bindings"] as const,
};

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.all,
    queryFn: async () => {
      const result = await apiClient.get<ApiResult<Agent[]>>("/agents");
      return result;
    },
  });
}

export function useAgentBindings() {
  return useQuery({
    queryKey: agentKeys.bindings,
    queryFn: async () => {
      const result = await apiClient.get<ApiResult<AgentBinding[]>>("/agents/bindings");
      return result;
    },
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) =>
      apiClient.post<ApiResult<void>>("/agents", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
      qc.invalidateQueries({ queryKey: agentKeys.bindings });
    },
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, model }: { id: string; model: string }) =>
      apiClient.patch<ApiResult<void>>(`/agents/${id}`, { model }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<ApiResult<void>>(`/agents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
      qc.invalidateQueries({ queryKey: agentKeys.bindings });
    },
  });
}

export function useBindAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BindAgentInput) =>
      apiClient.post<ApiResult<void>>(`/agents/${input.agent}/bind`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.bindings });
    },
  });
}
