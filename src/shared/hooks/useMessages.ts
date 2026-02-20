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

    // Optimistically add the user message immediately so the UI feels instant
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: msgKeys.list(conversationId) });

      const previous = qc.getQueryData<Message[]>(msgKeys.list(conversationId));

      const optimisticMsg: Message = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        sender_type: 'user',
        content: data.content,
        created_at: new Date().toISOString(),
      };

      qc.setQueryData<Message[]>(msgKeys.list(conversationId), (old = []) => [
        ...old,
        optimisticMsg,
      ]);

      return { previous };
    },

    // Roll back on error to avoid phantom messages
    onError: (_err, _data, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(msgKeys.list(conversationId), ctx.previous);
      }
    },

    // Refetch after success to get the real IDs and the bot reply
    onSuccess: () => qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) }),
  });
}

export function useResolveApproval(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { approvalId: string; botId: string; approved: boolean }) =>
      apiClient.post<{ success: boolean }>(`/conversations/${conversationId}/messages/approvals/${data.approvalId}/resolve`, {
        botId: data.botId,
        approved: data.approved,
      }),
    onSuccess: () => {
      // You might want to update the local state to mark this approval as resolved
      qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) });
    },
  });
}
