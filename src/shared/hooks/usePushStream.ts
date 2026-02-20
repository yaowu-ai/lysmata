import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../../config';
import { msgKeys } from './useMessages';

/**
 * Subscribe to bot-initiated (push) messages for a conversation via SSE.
 *
 * When the bot proactively sends a message (e.g. a scheduled greeting or
 * task completion notification), the server writes it to the DB and broadcasts
 * an SSE event on /push-stream. This hook invalidates the React Query cache
 * so the message list refreshes automatically.
 */
export function usePushStream(conversationId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;

    const url = `${API_BASE_URL}/conversations/${conversationId}/messages/push-stream`;
    const es = new EventSource(url);

    es.onmessage = () => {
      qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) });
    };

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed here
    };

    return () => {
      es.close();
    };
  }, [conversationId, qc]);
}
