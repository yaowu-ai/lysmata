import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';
import type { Conversation } from '../types';

export const convKeys = {
  all: ['conversations'] as const,
  detail: (id: string) => ['conversations', id] as const,
};

export function useConversations() {
  return useQuery({
    queryKey: convKeys.all,
    queryFn: () => apiClient.get<Conversation[]>('/conversations'),
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: convKeys.detail(id),
    queryFn: () => apiClient.get<Conversation>(`/conversations/${id}`),
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; type: 'single' | 'group'; botIds: string[]; primaryBotId: string }) =>
      apiClient.post<Conversation>('/conversations', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: convKeys.all }),
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/conversations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: convKeys.all }),
  });
}
