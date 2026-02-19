import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';
import type { Bot, CreateBotInput, UpdateBotInput } from '../types';

export const botKeys = {
  all: ['bots'] as const,
  detail: (id: string) => ['bots', id] as const,
};

export function useBots() {
  return useQuery({
    queryKey: botKeys.all,
    queryFn: () => apiClient.get<Bot[]>('/bots'),
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
    mutationFn: (data: CreateBotInput) => apiClient.post<Bot>('/bots', data),
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
      apiClient.post<{ success: boolean; message: string }>(`/bots/${id}/test-connection`, {}),
  });
}
