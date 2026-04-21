import { Fragment, useEffect, useRef } from "react";
import { formatDateLabel, isSameDay } from "../../shared/lib/utils";
import type { AgentEvent, Bot, Message } from "../../shared/types";
import { MarkdownContent } from "./MarkdownContent";
import { MessageBubble } from "./MessageBubble";
import { ThoughtChainBubble } from "./ThoughtChainBubble";
import { aggregateEvents, aggregateMessages } from "./utils/aggregateToolCalls";

interface Props {
  messages: Message[];
  bots: Bot[];
  streamingContent: string | null;
  streamError?: string | null;
  inflightEvents: AgentEvent[];
  streamingBot?: Bot | null;
  streamingBotIsPrimary?: boolean;
  onLoadEarlier?: () => void;
  hasMoreEarlier?: boolean;
  isFetchingEarlier?: boolean;
}

export function ChatBody({
  messages,
  bots,
  streamingContent,
  streamError,
  inflightEvents,
  streamingBot,
  streamingBotIsPrimary,
  onLoadEarlier,
  hasMoreEarlier,
  isFetchingEarlier,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const autoScrollEnabledRef = useRef(true);

  // Infinite scroll: load earlier messages when the top sentinel enters view.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !onLoadEarlier) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!hasMoreEarlier || isFetchingEarlier) return;
        const prevScrollHeight = container?.scrollHeight ?? 0;
        Promise.resolve(onLoadEarlier()).then(() => {
          if (container) {
            const diff = container.scrollHeight - prevScrollHeight;
            container.scrollTop += diff;
          }
        });
      },
      { root: container, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadEarlier, hasMoreEarlier, isFetchingEarlier]);

  // Pause auto-scroll when the user scrolls away from the bottom.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      autoScrollEnabledRef.current = distanceFromBottom < 80;
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent]);

  const items = aggregateMessages(messages);
  const inflightItems = aggregateEvents(inflightEvents);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
      <div ref={topSentinelRef} className="h-1 flex-shrink-0">
        {isFetchingEarlier && (
          <div className="text-center text-[12px] text-[#94A3B8] py-2">加载更早消息...</div>
        )}
      </div>

      {items.map((item, i) => {
        if (item.kind === "chain") {
          return <ThoughtChainBubble key={item.key} items={item.items} />;
        }
        const m = item.message;
        const msgBot = m.bot_id ? bots.find((b) => b.id === m.bot_id) : undefined;
        const prev = items[i - 1];
        const prevMsg = prev?.kind === "message" ? prev.message : null;
        const showDateSep = !prevMsg || !isSameDay(prevMsg.created_at, m.created_at);
        return (
          <Fragment key={m.id}>
            {showDateSep && (
              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-[#E5E7EB]" />
                <span className="text-[11px] text-[#94A3B8] px-2 select-none">
                  {formatDateLabel(m.created_at)}
                </span>
                <div className="flex-1 h-px bg-[#E5E7EB]" />
              </div>
            )}
            <MessageBubble message={{ ...m, bot: msgBot }} isPrimary={m.sender_type === "bot"} />
          </Fragment>
        );
      })}

      {inflightItems.length > 0 && (
        <ThoughtChainBubble items={inflightItems} header="正在思考..." />
      )}

      {streamingContent !== null && (
        <div className="msg-row flex items-start gap-2.5">
          <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-[17px] flex-shrink-0 mt-0.5">
            {streamingBot?.avatar_emoji ?? "🤖"}
          </div>
          <div className="max-w-[75%] min-w-0">
            {streamingContent === "" ? (
              <div className="bg-[#F1F5F9] rounded-[0_12px_12px_12px] px-3.5 py-2.5 flex gap-1.5 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            ) : (
              <div
                className={
                  streamingBotIsPrimary
                    ? "bg-[#F0F7FF] border-l-[3px] border-[#2563EB] rounded-[0_12px_12px_12px] px-3.5 py-2.5 text-[14px] leading-[1.65] break-words"
                    : "bg-[#F1F5F9] rounded-[0_12px_12px_12px] px-3.5 py-2.5 text-[14px] leading-[1.65] break-words"
                }
              >
                <MarkdownContent content={streamingContent} isStreaming />
              </div>
            )}
          </div>
        </div>
      )}

      {streamError && (
        <div className="msg-row flex items-start gap-2.5">
          <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center text-[17px] flex-shrink-0 mt-0.5">
            ⚠️
          </div>
          <div className="max-w-[75%] bg-[#FFF1F2] border-l-[3px] border-[#EF4444] rounded-[0_12px_12px_12px] px-3.5 py-2.5 text-[13px] text-[#991B1B]">
            发送失败，Bot 未能响应：{streamError}
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
