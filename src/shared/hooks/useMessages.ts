import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';
import type { Message, SendMessageInput } from '../types';

export const msgKeys = {
  list: (convId: string) => ['messages', convId] as const,
};

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: msgKeys.list(conversationId),
    queryFn: () => apiClient.get<Message[]>(`/conversations/${conversationId}/messages`),
    enabled: !!conversationId,
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SendMessageInput) =>
      apiClient.post<Message>(`/conversations/${conversationId}/messages`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) }),
  });
}
