import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "../../config";
import { msgKeys, fetchSingleMessage } from "./useMessages";
import type { Message } from "../types";

type InfiniteCache = { pages: Message[][]; pageParams: unknown[] };

function hasMessageInPages(pages: Message[][], id: string): boolean {
  return pages.some((page) => page.some((m) => m.id === id));
}

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

      // 1. Insert placeholder into the last page to avoid list jump
      qc.setQueryData<InfiniteCache>(msgKeys.list(conversationId), (old) => {
        if (!old) return old;
        if (hasMessageInPages(old.pages, msgId)) return old;
        const pages = [...old.pages];
        const lastPage = [...(pages[pages.length - 1] ?? [])];
        lastPage.push({
          id: msgId,
          conversation_id: conversationId,
          sender_type: "bot",
          content: "",
          created_at: new Date().toISOString(),
        } as Message);
        pages[pages.length - 1] = lastPage;
        return { ...old, pages };
      });

      // 2. Fetch full message and replace placeholder.
      //    If the placeholder was already evicted by a concurrent invalidateQueries
      //    refetch, check whether the real message arrived via that refetch; if not,
      //    append it so it is never silently dropped.
      fetchSingleMessage(conversationId, msgId)
        .then((msg) => {
          if (!isActive) return;
          qc.setQueryData<InfiniteCache>(msgKeys.list(conversationId), (old) => {
            if (!old) return old;
            const pages = [...old.pages];

            // Replace placeholder if still present in any page
            const placeholderPageIdx = pages.findIndex((page) =>
              page.some((m) => m.id === msgId),
            );
            if (placeholderPageIdx !== -1) {
              pages[placeholderPageIdx] = pages[placeholderPageIdx].map((m) =>
                m.id === msgId ? msg : m,
              );
              return { ...old, pages };
            }

            // Placeholder evicted — only append if refetch didn't already include it
            if (hasMessageInPages(pages, msg.id)) return old;
            const lastPage = [...(pages[pages.length - 1] ?? [])];
            lastPage.push(msg);
            pages[pages.length - 1] = lastPage;
            return { ...old, pages };
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
