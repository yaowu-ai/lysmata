import type { Message } from '../../shared/types';
import { cn } from '../../shared/lib/utils';

interface Props {
  message: Message;
  isPrimary?: boolean;
}

export function BotMessage({ message, isPrimary }: Props) {
  const bot = message.bot;

  if (message.sender_type === 'user') {
    return (
      <div className="msg-row flex justify-end">
        <div className="max-w-[75%]">
          <div className="bg-[#2563EB] text-white rounded-[12px_0_12px_12px] px-3.5 py-2.5 text-[14px] leading-[1.65] break-words">
            {message.content}
          </div>
          <div className="text-[11px] text-[#CBD5E1] text-right mt-1">刚刚</div>
        </div>
      </div>
    );
  }

  return (
    <div className="msg-row flex items-start gap-2.5">
      {/* Avatar */}
      <div className="relative flex-shrink-0 mt-0.5">
        <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-[17px]">
          {bot?.avatar_emoji ?? '🤖'}
        </div>
        {isPrimary && (
          <div className="absolute -top-1 -right-1 w-[15px] h-[15px] rounded-full bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[8px]">
            👑
          </div>
        )}
      </div>

      {/* Bubble */}
      <div className="max-w-[75%] min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[13px] font-semibold">{bot?.name ?? 'Bot'}</span>
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
        <div
          className={cn(
            'rounded-[0_12px_12px_12px] px-3.5 py-2.5 text-[14px] leading-[1.65] break-words whitespace-pre-wrap',
            isPrimary
              ? 'bg-[#F0F7FF] border-l-[3px] border-[#2563EB]'
              : 'bg-[#F1F5F9]',
          )}
        >
          {message.content}
        </div>
        <div className="text-[11px] text-[#CBD5E1] mt-1">刚刚</div>
      </div>
    </div>
  );
}
