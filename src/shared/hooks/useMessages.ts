import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../../config';
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

/**
 * Returns an async function that sends a message via the streaming endpoint
 * (GET /stream) and calls onChunk for each text chunk received.
 * Optimistically inserts the user message before streaming starts.
 * Invalidates the message list after streaming completes.
 */
export function useSendMessageStream(conversationId: string) {
  const qc = useQueryClient();

  return async (content: string, onChunk: (text: string) => void): Promise<void> => {
    // Optimistically insert user message
    const optimisticId = `optimistic-${Date.now()}`;
    qc.setQueryData<Message[]>(msgKeys.list(conversationId), (old = []) => [
      ...old,
      {
        id: optimisticId,
        conversation_id: conversationId,
        sender_type: 'user',
        content,
        created_at: new Date().toISOString(),
      } as Message,
    ]);

    try {
      const res = await fetch(
        `${API_BASE_URL}/conversations/${conversationId}/messages/stream?content=${encodeURIComponent(content)}`,
      );
      if (!res.ok || !res.body) throw new Error(`Stream error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let streamDone = false;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(raw) as { chunk?: string; error?: string };
            if (parsed.chunk) onChunk(parsed.chunk);
          } catch { /* ignore malformed SSE JSON frames */ }
        }
        if (streamDone) break;
      }
    } finally {
      // Refetch to get real messages — this naturally replaces the optimistic entry.
      // Do NOT remove the optimistic message before refetch completes, or the list
      // will flash empty during the round-trip.
      await qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) });
    }
  };
}

export async function fetchSingleMessage(conversationId: string, msgId: string): Promise<Message> {
  return apiClient.get<Message>(`/conversations/${conversationId}/messages/${msgId}`);
}
