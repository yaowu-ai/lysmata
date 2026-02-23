import { useState } from 'react';
import type { Message } from '../../shared/types';
import { cn, formatMsgTime } from '../../shared/lib/utils';
import { useResolveApproval } from '../../shared/hooks/useMessages';

interface Props {
  message: Message;
  isPrimary?: boolean;
}

function SystemEventCard({ metadata, content }: { metadata: Record<string, unknown>; content: string }) {
  const hasResult = 'result' in metadata;
  const hasReason = 'reason' in metadata && !hasResult;
  const hasSummary = 'summary' in metadata;

  if (hasResult) {
    const result = metadata.result as { command?: string; output?: string } | undefined;
    return (
      <div className="border border-[#D1FAE5] bg-[#F0FDF4] rounded-lg overflow-hidden text-[13px]">
        <div className="px-3 py-2 font-semibold flex items-center gap-2 border-b border-[#D1FAE5]">
          <span>✅</span> 命令执行完成
        </div>
        {result && (
          <div className="p-3">
            {result.command != null && (
              <div className="mb-1">
                <code className="bg-[#DCFCE7] px-1.5 py-0.5 rounded text-[#166534] text-[12px]">
                  {result.command}
                </code>
              </div>
            )}
            {result.output != null && (
              <pre className="bg-[#1E293B] text-[#E2E8F0] p-2 rounded-md overflow-x-auto text-[12px] max-h-[120px] overflow-y-auto mt-2">
                {result.output}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  if (hasReason) {
    return (
      <div className="border border-[#FEE2E2] bg-[#FFF5F5] rounded-lg overflow-hidden text-[13px]">
        <div className="px-3 py-2 font-semibold flex items-center gap-2 border-b border-[#FEE2E2]">
          <span>🚫</span> 命令执行被拒绝
        </div>
        <div className="p-3 text-[#991B1B]">
          {String(metadata.reason || '未提供原因')}
        </div>
      </div>
    );
  }

  if (hasSummary) {
    return (
      <div className="border border-[#E2E8F0] bg-[#F8FAFC] rounded-lg overflow-hidden text-[13px]">
        <div className="px-3 py-2 font-semibold flex items-center gap-2 border-b border-[#E2E8F0] text-[#475569]">
          <span>🕐</span> 定时任务完成
        </div>
        <div className="p-3 text-[#334155] whitespace-pre-wrap">
          {String(metadata.summary)}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[#E2E8F0] bg-[#F8FAFC] rounded-lg px-3 py-2 text-[13px] text-[#64748B]">
      <span className="mr-2">⚙️</span>{content}
    </div>
  );
}

export function BotMessage({ message, isPrimary }: Props) {
  const bot = message.bot;
  const resolveMut = useResolveApproval(message.conversation_id);
  const [resolvedState, setResolvedState] = useState<'pending' | 'approved' | 'rejected'>('pending');

  let metadata: any = {};
  try {
    if (message.metadata) metadata = JSON.parse(message.metadata);
  } catch {}

  const isApproval = message.message_type === 'approval';
  const isSystemEvent = message.message_type === 'system_event';

  const handleResolve = (approved: boolean) => {
    if (!bot || !metadata.id) return;
    resolveMut.mutate(
      { approvalId: metadata.id, botId: bot.id, approved },
      {
        onSuccess: () => setResolvedState(approved ? 'approved' : 'rejected'),
      }
    );
  };

  if (message.sender_type === 'user') {
    return (
      <div className="msg-row flex justify-end">
        <div className="max-w-[75%]">
          <div className="bg-[#2563EB] text-white rounded-[12px_0_12px_12px] px-3.5 py-2.5 text-[14px] leading-[1.65] break-words">
            {message.content}
          </div>
          <div className="text-[11px] text-[#CBD5E1] text-right mt-1">{formatMsgTime(message.created_at)}</div>
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

        {isApproval ? (
          <div className="border border-[#E2E8F0] bg-white rounded-lg shadow-sm overflow-hidden text-[13px]">
            <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-3 py-2 font-semibold flex items-center gap-2">
              <span className="text-[#F59E0B]">⚠️</span>
              执行审批请求
            </div>
            <div className="p-3">
              <div className="mb-2">
                <span className="text-[#64748B] mr-2">命令:</span>
                <code className="bg-[#F1F5F9] px-1.5 py-0.5 rounded text-[#0F172A]">
                  {metadata.call?.command || metadata.command || '未知'}
                </code>
              </div>
              <div className="mb-3">
                <span className="text-[#64748B] block mb-1">参数:</span>
                <pre className="bg-[#1E293B] text-[#E2E8F0] p-2 rounded-md overflow-x-auto text-[12px]">
                  {JSON.stringify(metadata.call?.args || metadata.args || {}, null, 2)}
                </pre>
              </div>

              {resolvedState === 'pending' ? (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => handleResolve(true)}
                    disabled={resolveMut.isPending}
                    className="flex-1 bg-[#10B981] hover:bg-[#059669] text-white py-1.5 rounded transition-colors disabled:opacity-50"
                  >
                    允许
                  </button>
                  <button
                    onClick={() => handleResolve(false)}
                    disabled={resolveMut.isPending}
                    className="flex-1 bg-[#EF4444] hover:bg-[#DC2626] text-white py-1.5 rounded transition-colors disabled:opacity-50"
                  >
                    拒绝
                  </button>
                </div>
              ) : (
                <div className={cn(
                  "text-center py-1.5 rounded mt-3 font-medium",
                  resolvedState === 'approved' ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#FEE2E2] text-[#991B1B]"
                )}>
                  {resolvedState === 'approved' ? '已允许' : '已拒绝'}
                </div>
              )}
            </div>
          </div>
        ) : isSystemEvent ? (
          <SystemEventCard metadata={metadata} content={message.content} />
        ) : (
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
        )}

        <div className="text-[11px] text-[#CBD5E1] mt-1">{formatMsgTime(message.created_at)}</div>
      </div>
    </div>
  );
}
