import { Bubble } from "@ant-design/x";
import { cn, formatMsgTime } from "../../shared/lib/utils";
import type { Message } from "../../shared/types";
import { ApprovalBubble } from "./ApprovalBubble";
import { MarkdownContent } from "./MarkdownContent";
import { SystemEventBubble } from "./SystemEventBubble";

interface Props {
  message: Message;
  isPrimary?: boolean;
  isStreaming?: boolean;
  /** Inline pinner under the bubble (e.g. ThoughtChain for aggregated tool calls). */
  extra?: React.ReactNode;
}

function parseMetadata(raw?: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function BotAvatar({ emoji, isPrimary }: { emoji: string; isPrimary?: boolean }) {
  return (
    <div className="relative">
      <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-[17px]">
        {emoji}
      </div>
      {isPrimary && (
        <div className="absolute -top-1 -right-1 w-[15px] h-[15px] rounded-full bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[8px]">
          👑
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ message, isPrimary, isStreaming, extra }: Props) {
  const bot = message.bot;
  const metadata = parseMetadata(message.metadata);

  // Tool events are rendered by ThoughtChainBubble at a higher aggregation
  // level — skip them here.
  if (message.message_type === "tool_call" || message.message_type === "tool_result") {
    return null;
  }

  if (message.sender_type === "user") {
    return (
      <div className="msg-row flex justify-end">
        <div className="max-w-[75%]">
          <Bubble
            placement="end"
            variant="filled"
            shape="corner"
            content={message.content}
            classNames={{ content: "!bg-[#2563EB] !text-white" }}
          />
          <div className="text-[11px] text-[#CBD5E1] text-right mt-1">
            {formatMsgTime(message.created_at)}
          </div>
        </div>
      </div>
    );
  }

  let body: React.ReactNode;
  if (message.message_type === "approval") {
    body = <ApprovalBubble message={message} metadata={metadata} />;
  } else if (message.message_type === "system_event") {
    body = <SystemEventBubble message={message} metadata={metadata} />;
  } else {
    body = (
      <Bubble
        placement="start"
        variant="filled"
        shape="corner"
        content={<MarkdownContent content={message.content} isStreaming={isStreaming} />}
        classNames={{
          content: cn(
            "min-w-0",
            isPrimary ? "!bg-[#F0F7FF] !border-l-[3px] !border-[#2563EB]" : "!bg-[#F1F5F9]",
          ),
        }}
      />
    );
  }

  return (
    <div className="msg-row flex items-start gap-2.5">
      <div className="flex-shrink-0 mt-0.5">
        <BotAvatar emoji={bot?.avatar_emoji ?? "🤖"} isPrimary={isPrimary} />
      </div>
      <div className="max-w-[75%] min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[13px] font-semibold">{bot?.name ?? "Bot"}</span>
          {isPrimary && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-[20px] bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] font-semibold">
              👑 主Bot
            </span>
          )}
          {message.mentioned_bot_id && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-[20px] bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0] font-semibold">
              被@提及
            </span>
          )}
        </div>
        {body}
        {extra}
        <div className="text-[11px] text-[#CBD5E1] mt-1">{formatMsgTime(message.created_at)}</div>
      </div>
    </div>
  );
}
