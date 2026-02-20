import { useEffect, useRef, useState } from 'react';
import { useConversations } from '../../shared/hooks/useConversations';
import { useMessages, useSendMessage } from '../../shared/hooks/useMessages';
import { useBots } from '../../shared/hooks/useBots';
import { useChatStore } from '../../shared/store/chat-store';
import { usePushStream } from '../../shared/hooks/usePushStream';
import { ConversationSidebar } from './ConversationSidebar';
import { BotMessage } from './BotMessage';
import { MessageInput } from './MessageInput';
import { NewConversationDialog } from './NewConversationDialog';

export function PrivateChatPage() {
  const { data: convs = [], isLoading: convLoading } = useConversations();
  const { data: bots = [] } = useBots();
  const { activeConversationId: activeId, setActiveConversationId } = useChatStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const singleConvs = convs.filter((c) => c.type === 'single');
  const activeConv = singleConvs.find((c) => c.id === activeId) ?? null;

  const { data: messages = [] } = useMessages(activeId ?? '');
  const sendMut = useSendMessage(activeId ?? '');
  usePushStream(activeId);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const convBotId = activeConv?.bots?.[0]?.bot_id;
  const convBot = bots.find((b) => b.id === convBotId);

  return (
    <div className="flex flex-1 overflow-hidden min-w-0">
      <ConversationSidebar
        title="私聊"
        subtitle="1:1 对话"
        conversations={singleConvs}
        activeId={activeId}
        onSelect={setActiveConversationId}
        onNew={() => setDialogOpen(true)}
        isLoading={convLoading}
      />

      {activeConv ? (
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#F7F7F8]">
          {/* Header */}
          <div className="bg-white border-b border-[#E5E7EB] px-5 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl">
              {convBot?.avatar_emoji ?? '🤖'}
            </div>
            <div>
              <div className="font-semibold text-[15px]">{activeConv.title}</div>
              <div className="text-[12px] text-[#64748B]">{convBot?.name ?? ''}</div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
            {messages.map((m) => {
              const msgBot = m.bot_id ? bots.find((b) => b.id === m.bot_id) : undefined;
              return <BotMessage key={m.id} message={{ ...m, bot: msgBot }} isPrimary />;
            })}
            {sendMut.isPending && (
              <div className="flex items-start gap-2.5">
                <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl">
                  {convBot?.avatar_emoji ?? '🤖'}
                </div>
                <div className="bg-[#F1F5F9] rounded-[0_12px_12px_12px] px-3.5 py-2.5 flex gap-1.5 items-center">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={msgEndRef} />
          </div>

          <MessageInput
            bots={convBot ? [convBot] : []}
            onSend={(content) => sendMut.mutate({ content })}
            disabled={sendMut.isPending}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[#64748B]">
          <p className="text-[14px]">选择一个对话，或点击 + 新建</p>
        </div>
      )}

      <NewConversationDialog
        open={dialogOpen}
        mode="single"
        bots={bots}
        onClose={() => setDialogOpen(false)}
        onCreated={setActiveConversationId}
      />
    </div>
  );
}
