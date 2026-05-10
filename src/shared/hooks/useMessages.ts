import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "../../config";
import { apiClient } from "../api-client";
import type {
  AgentEvent,
  CanonicalStreamEvent,
  Message,
  ProcessEventKind,
  SendMessageInput,
  StreamFrame,
} from "../types";
import { fetchWithEnv } from "../lib/utils";

export const msgKeys = {
  list: (convId: string) => ["messages", convId] as const,
};

const PAGE_SIZE = 50;

export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: msgKeys.list(conversationId),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const url = pageParam
        ? `/conversations/${conversationId}/messages?before=${pageParam}&limit=${PAGE_SIZE}`
        : `/conversations/${conversationId}/messages?limit=${PAGE_SIZE}`;
      return apiClient.get<Message[]>(url);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (firstPage: Message[]) => {
      // firstPage is the oldest page loaded (we load older pages going "up")
      // If we got a full page, there are more older messages
      return firstPage.length === PAGE_SIZE ? firstPage[0]?.id : undefined;
    },
    enabled: !!conversationId,
    select: (data) => ({
      ...data,
      // Flatten all pages into a single sorted list
      messages: data.pages.flat(),
    }),
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
        sender_type: "user",
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
      apiClient.post<{ success: boolean }>(
        `/conversations/${conversationId}/messages/approvals/${data.approvalId}/resolve`,
        {
          botId: data.botId,
          approved: data.approved,
        },
      ),
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
    signal?: AbortSignal,
    onEvent?: (event: AgentEvent) => void,
  ): Promise<{ error?: string; stopped?: boolean }> => {
    // Optimistically append user message to the last page of the infinite query
    const optimisticId = `optimistic-${Date.now()}`;
    qc.setQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
      msgKeys.list(conversationId),
      (old) => {
        if (!old) return old;
        const pages = [...old.pages];
        const lastPage = [...(pages[pages.length - 1] ?? [])];
        lastPage.push({
          id: optimisticId,
          conversation_id: conversationId,
          sender_type: "user",
          content,
          created_at: new Date().toISOString(),
        } as Message);
        pages[pages.length - 1] = lastPage;
        return { ...old, pages };
      },
    );

    let botMsg: Message | null = null;
    let streamError: string | undefined;
    let stopped = false;
    const lastSeqByRunId = new Map<string, number>();
    let activeCanonicalRunId: string | null = null;
    let activeCanonicalMessageId: string | null = null;

    try {
      const res = await fetchWithEnv(
        `${API_BASE_URL}/conversations/${conversationId}/messages/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
          signal,
        },
      );
      if (!res.ok || !res.body) throw new Error(`Stream error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("id: ")) continue;
          if (line.startsWith("event: ")) continue;
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break outer;

          try {
            const parsed = JSON.parse(raw);

            // ── Canonical stream events (v1) ──
            if (parsed && parsed.v === 1 && parsed.type) {
              const ce = parsed as CanonicalStreamEvent;
              const lastSeq = lastSeqByRunId.get(ce.runId) ?? 0;
              if (ce.seq <= lastSeq) continue;
              lastSeqByRunId.set(ce.runId, ce.seq);

              switch (ce.type) {
                case "message_created":
                  activeCanonicalRunId = ce.runId;
                  activeCanonicalMessageId = ce.messageId ?? null;
                  onChunk("");
                  break;
                case "text_start":
                  if (activeCanonicalRunId && ce.runId !== activeCanonicalRunId) continue;
                  onChunk("");
                  break;
                case "text_delta":
                  if (activeCanonicalRunId && ce.runId !== activeCanonicalRunId) continue;
                  if (ce.payload?.text) onChunk(ce.payload.text);
                  break;
                case "text_end":
                  if (activeCanonicalRunId && ce.runId !== activeCanonicalRunId) continue;
                  break;
                case "process": {
                  if (activeCanonicalRunId && ce.runId !== activeCanonicalRunId) continue;
                  const kind = ce.payload?.kind as ProcessEventKind;
                  const data = ce.payload?.data as Record<string, unknown> | undefined;
                  const rawStream = ce.payload?.rawStream as string | undefined;
                  if (kind === "tool_call" && data) {
                    onEvent?.({
                      type: "tool_call",
                      sessionId: (data.sessionId as string) ?? "",
                      toolName: (data.toolName as string) ?? "unknown",
                      args: data.args,
                      callId: data.callId as string | undefined,
                    });
                  } else if (kind === "tool_result" && data) {
                    onEvent?.({
                      type: "tool_result",
                      sessionId: (data.sessionId as string) ?? "",
                      callId: data.callId as string | undefined,
                      result: data.result,
                      error: data.error as string | undefined,
                    });
                  } else {
                    onEvent?.({
                      type: "process",
                      kind,
                      sessionId: ce.conversationId,
                      runId: ce.runId,
                      payload: data,
                      rawStream,
                    });
                  }
                  break;
                }
                case "complete":
                  if (activeCanonicalRunId && ce.runId !== activeCanonicalRunId) continue;
                  if (ce.payload?.reason === "stopped") {
                    stopped = true;
                  }
                  break;
                case "error":
                  if (activeCanonicalRunId && ce.runId !== activeCanonicalRunId) continue;
                  if (!stopped) {
                    streamError = ce.payload?.message as string;
                  }
                  break outer;
              }
              continue;
            }

            // ── Legacy frames ──
            const legacy = parsed as StreamFrame;
            if ("type" in legacy && legacy.type === "event") {
              onEvent?.(legacy.event);
              continue;
            }
            if ("error" in legacy && legacy.error) {
              if (!stopped) {
                streamError = legacy.error;
              }
              break outer;
            }
            if ("chunk" in legacy && legacy.chunk) {
              onChunk(legacy.chunk);
            }
            if ("done" in legacy && legacy.done && legacy.botMsg) {
              botMsg = legacy.botMsg;
              break outer;
            }
          } catch {
            /* ignore malformed SSE JSON frames */
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        stopped = true;
        streamError = undefined;
      } else {
        streamError = String(err);
      }
    } finally {
      if (botMsg) {
        qc.setQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
          msgKeys.list(conversationId),
          (old) => {
            if (!old) return old;
            const pages = [...old.pages];
            const lastPage = [...(pages[pages.length - 1] ?? [])];
            const withoutOptimistic = lastPage.filter((m) => m.id !== optimisticId);
            const hasBotMsg = lastPage.some((m) => m.id === botMsg!.id);
            pages[pages.length - 1] = hasBotMsg
              ? withoutOptimistic
              : [...withoutOptimistic, botMsg!];
            return { ...old, pages };
          },
        );
      } else if (activeCanonicalMessageId && !stopped && !streamError) {
        void qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) });
      }

      void qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) });
    }

    if (stopped) return { stopped: true };
    return streamError ? { error: streamError } : { stopped: false };
  };
}

export async function fetchSingleMessage(conversationId: string, msgId: string): Promise<Message> {
  return apiClient.get<Message>(`/conversations/${conversationId}/messages/${msgId}`);
}
