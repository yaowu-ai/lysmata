import type { ReactNode } from "react";
import type { Bot, Conversation } from "../../shared/types";

interface Props {
  bot?: Bot | null;
  conversation?: Conversation | null;
  /** Optional left-side custom element (e.g., Avatar.Group for group chats). */
  avatarSlot?: ReactNode;
  /** Optional right-side controls (e.g., open info panel). */
  trailing?: ReactNode;
}

export function ChatHeader({ bot, conversation, avatarSlot, trailing }: Props) {
  return (
    <div className="bg-white border-b border-[#E5E7EB] px-5 py-3 flex items-center gap-3 flex-shrink-0">
      {avatarSlot ?? (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl">
          {bot?.avatar_emoji ?? "🤖"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] truncate">{conversation?.title ?? "对话"}</div>
        <div className="text-[12px] text-[#64748B] truncate">{bot?.name ?? ""}</div>
      </div>
      {trailing}
    </div>
  );
}
