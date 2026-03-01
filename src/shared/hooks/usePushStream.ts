import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "../../config";
import { msgKeys, fetchSingleMessage } from "./useMessages";
import type { Message } from "../types";

/**
 * Subscribe to bot-initiated (push) messages for a conversation via SSE.
 *
 * Instead of invalidating the full list on every event, we insert a placeholder
 * immediately and then fetch the single message to replace it, avoiding a full
 * refetch round-trip.
 */
export function usePushStream(conversationId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;

    let isActive = true;
    const url = `${API_BASE_URL}/conversations/${conversationId}/messages/push-stream`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      let data: { msgId?: string; conversationId?: string; type?: string };
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const { msgId } = data;
      if (!msgId) return;

      // 1. Insert placeholder to avoid list jump
      qc.setQueryData<Message[]>(msgKeys.list(conversationId), (old = []) => {
        if (old.some((m) => m.id === msgId)) return old;
        return [
          ...old,
          {
            id: msgId,
            conversation_id: conversationId,
            sender_type: "bot",
            content: "",
            created_at: new Date().toISOString(),
          } as Message,
        ];
      });

      // 2. Fetch full message and replace placeholder.
      //    If the placeholder was already evicted by a concurrent invalidateQueries
      //    refetch, check whether the real message arrived via that refetch; if not,
      //    append it so it is never silently dropped.
      fetchSingleMessage(conversationId, msgId)
        .then((msg) => {
          if (!isActive) return;
          qc.setQueryData<Message[]>(msgKeys.list(conversationId), (old = []) => {
            // Replace placeholder if still present
            if (old.some((m) => m.id === msgId)) {
              return old.map((m) => (m.id === msgId ? msg : m));
            }
            // Placeholder evicted — only append if refetch didn't already include it
            if (old.some((m) => m.id === msg.id)) return old;
            return [...old, msg];
          });
        })
        .catch(() => {
          // Fall back to full invalidate if fetch fails
          qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) });
        });
    };

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed here
    };

    return () => {
      isActive = false;
      es.close();
    };
  }, [conversationId, qc]);
}
