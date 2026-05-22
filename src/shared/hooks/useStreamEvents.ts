import { useCallback, useState } from "react";
import type { AgentEvent } from "../types";

/**
 * Tracks structured AgentEvent frames arriving on the current `/stream` SSE
 * connection (tool_call / tool_result / process / approval / etc.).
 * The caller wires `push` into `useSendMessageStream`'s `onEvent` callback,
 * and passes `inflightEvents` to ChatBody so the in-flight ThoughtChain can
 * render the live sequence of tool steps and process cards.
 *
 * Events persist until the caller clears — typically right before the next
 * stream starts, or when the conversation is unmounted.
 */
export function useStreamEvents() {
  const [inflightEvents, setInflightEvents] = useState<AgentEvent[]>([]);

  const push = useCallback((event: AgentEvent) => {
    setInflightEvents((prev) => [...prev, event]);
  }, []);

  const clear = useCallback(() => {
    setInflightEvents([]);
  }, []);

  return { inflightEvents, push, clear };
}
