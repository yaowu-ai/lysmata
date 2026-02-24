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
 *
 * On stream completion the server sends a `{ done: true, botMsg }` frame
 * containing the persisted bot message record. We write both the real user
 * message (replacing the optimistic entry) and the real bot message directly
 * into the React Query cache so the UI never has a gap between the streaming
 * bubble disappearing and the refetch completing — even on slow networks.
 */
export function useSendMessageStream(conversationId: string) {
  const qc = useQueryClient();

  return async (
    content: string,
    onChunk: (text: string) => void,
  ): Promise<{ error?: string }> => {
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

    let botMsg: Message | null = null;
    let streamError: string | undefined;

    try {
      const res = await fetch(
        `${API_BASE_URL}/conversations/${conversationId}/messages/stream?content=${encodeURIComponent(content)}`,
      );
      if (!res.ok || !res.body) throw new Error(`Stream error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break outer; // legacy sentinel kept for compat
          try {
            const parsed = JSON.parse(raw) as {
              chunk?: string;
              done?: boolean;
              botMsg?: Message;
              error?: string;
            };
            if (parsed.error) {
              streamError = parsed.error;
              break outer;
            }
            if (parsed.chunk) {
              onChunk(parsed.chunk);
            }
            if (parsed.done && parsed.botMsg) {
              botMsg = parsed.botMsg;
              break outer;
            }
          } catch { /* ignore malformed SSE JSON frames */ }
        }
      }
    } catch (err) {
      streamError = String(err);
    } finally {
      // Write real records into the cache immediately so there is no visual gap
      // between the streaming bubble disappearing and the refetch completing.
      qc.setQueryData<Message[]>(msgKeys.list(conversationId), (old = []) => {
        // Replace the optimistic user entry with a confirmed one (same content,
        // but keep optimisticId so it is still replaced by the real ID on refetch).
        const withoutOptimistic = old.filter((m) => m.id !== optimisticId);
        const userMsg: Message = {
          id: optimisticId,
          conversation_id: conversationId,
          sender_type: 'user',
          content,
          created_at: new Date().toISOString(),
        } as Message;

        if (botMsg) {
          // Already have real bot message — write it directly.
          // Guard against duplicate if a concurrent invalidate already fetched it.
          const hasBotMsg = old.some((m) => m.id === botMsg!.id);
          return hasBotMsg
            ? old
            : [...withoutOptimistic, userMsg, botMsg!];
        }
        // No bot message yet (stream error or timeout) — keep user message so
        // the bubble doesn't disappear, and let refetch bring the real data.
        const hasUser = old.some((m) => m.id === optimisticId);
        return hasUser ? old : [...withoutOptimistic, userMsg];
      });

      // Background refetch to replace the optimistic user ID with the real DB
      // record ID and pick up any messages we may have missed.
      void qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) });
    }

    return streamError ? { error: streamError } : {};
  };
}

export async function fetchSingleMessage(conversationId: string, msgId: string): Promise<Message> {
  return apiClient.get<Message>(`/conversations/${conversationId}/messages/${msgId}`);
}
