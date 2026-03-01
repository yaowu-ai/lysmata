import { Fragment, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useConversations, useDeleteConversation } from "../../shared/hooks/useConversations";
import { useMessages, useSendMessageStream } from "../../shared/hooks/useMessages";
import { useBots } from "../../shared/hooks/useBots";
import { useChatStore } from "../../shared/store/chat-store";
import { usePushStream } from "../../shared/hooks/usePushStream";
import { ConversationSidebar } from "./ConversationSidebar";
import { BotMessage } from "./BotMessage";
import { MessageInput } from "./MessageInput";
import { NewConversationDialog } from "./NewConversationDialog";
import type { Bot } from "../../shared/types";
import { isSameDay, formatDateLabel } from "../../shared/lib/utils";

export function GroupChatPage() {
  const { data: convs = [], isLoading: convLoading } = useConversations();
  const { data: bots = [] } = useBots();
  const { activeConversationId: activeId, setActiveConversationId } = useChatStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const groupConvs = convs.filter((c) => c.type === "group");
  const activeConv = groupConvs.find((c) => c.id === activeId) ?? null;

  const { data: messages = [] } = useMessages(activeId ?? "");
  const sendStream = useSendMessageStream(activeId ?? "");
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const deleteMut = useDeleteConversation();
  usePushStream(activeId);

  function handleDelete(id: string) {
    deleteMut.mutate(id, {
      onSuccess: () => {
        if (activeId === id) setActiveConversationId(null);
      },
    });
  }

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    setStreamingContent(null);
    setStreamError(null);
    setIsSending(false);
  }, [activeId]);

  const convBotIds = activeConv?.bots?.map((b) => b.bot_id) ?? [];
  const convBots: Bot[] = convBotIds.map((id) => bots.find((b) => b.id === id)!).filter(Boolean);
  const primaryBotId = activeConv?.bots?.find((b) => b.is_primary)?.bot_id;

  return (
    <div className="flex flex-1 overflow-hidden min-w-0">
      <ConversationSidebar
        title="群聊"
        subtitle="多 Bot 协作 · @mention 路由"
        conversations={groupConvs}
        activeId={activeId}
        onSelect={setActiveConversationId}
        onNew={() => setDialogOpen(true)}
        onDelete={handleDelete}
        isLoading={convLoading}
      />

      {activeConv ? (
        <div className="flex flex-1 overflow-hidden min-w-0">
          {/* Chat area */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#F7F7F8]">
            {/* Group chat header */}
            <div className="bg-white border-b border-[#E5E7EB] px-5 py-3 flex items-center gap-3 flex-shrink-0">
              {/* Stacked avatars */}
              <div className="flex">
                {convBots.slice(0, 4).map((b, i) => (
                  <div key={b.id} className="relative" style={{ marginLeft: i > 0 ? "-8px" : 0 }}>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-lg border-2 border-white">
                      {b.avatar_emoji}
                    </div>
                    {b.id === primaryBotId && (
                      <div className="absolute -top-1 -right-1 w-[15px] h-[15px] rounded-full bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[8px]">
                        👑
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex-1 min-w-0 ml-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[15px]">{activeConv.title}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-[20px] bg-[#EDE9FE] text-[#6D28D9] font-medium">
                    群聊 · {convBots.length} Bot
                  </span>
                </div>
                <div className="text-[12px] text-[#64748B]">
                  输入 <code className="font-mono bg-[#F1F5F9] px-1 rounded text-[11px]">@</code>{" "}
                  可指定 Bot 响应
                </div>
              </div>
              <a
                href="/bots"
                className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] transition-colors"
                title="Bot 管理"
              >
                <Settings size={15} />
              </a>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const showDateSep = !prev || !isSameDay(prev.created_at, m.created_at);
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
                    <BotMessage message={m} isPrimary={m.bot_id === primaryBotId} />
                  </Fragment>
                );
              })}
              {streamingContent !== null && (
                <div className="flex items-start gap-2.5">
                  <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl flex-shrink-0 mt-0.5">
                    🤖
                  </div>
                  <div className="max-w-[75%]">
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
                      <div className="bg-[#F0F7FF] border-l-[3px] border-[#2563EB] rounded-[0_12px_12px_12px] px-3.5 py-2.5 text-[14px] leading-[1.65] break-words whitespace-pre-wrap">
                        {streamingContent}
                        <span className="inline-block w-[2px] h-[14px] bg-[#2563EB] ml-0.5 animate-pulse align-middle" />
                      </div>
                    )}
                  </div>
                </div>
              )}
              {streamError !== null && (
                <div className="flex items-start gap-2.5">
                  <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center text-xl flex-shrink-0 mt-0.5">
                    🤖
                  </div>
                  <div className="max-w-[75%] bg-[#FFF1F2] border-l-[3px] border-[#EF4444] rounded-[0_12px_12px_12px] px-3.5 py-2.5 text-[13px] text-[#991B1B]">
                    发送失败，Bot 未能响应。请重试。
                  </div>
                </div>
              )}
              <div ref={msgEndRef} />
            </div>

            <MessageInput
              bots={convBots}
              onSend={async (content) => {
                setIsSending(true);
                setStreamError(null);
                setStreamingContent("");
                try {
                  const result = await sendStream(content, (chunk) => setStreamingContent(chunk));
                  if (result.error) setStreamError(result.error);
                } finally {
                  setStreamingContent(null);
                  setIsSending(false);
                }
              }}
              disabled={isSending}
              placeholder="发送消息… 输入 @ 可提及特定 Bot"
            />
          </div>

          {/* Right panel: group info */}
          <aside className="w-[280px] bg-white border-l border-[#E5E7EB] flex flex-col flex-shrink-0 overflow-y-auto">
            <div className="px-4 py-3 border-b border-[#E5E7EB]">
              <div className="text-[13px] font-semibold">群组信息</div>
              <div className="text-[12px] text-[#64748B] mt-0.5">{convBots.length} 个 Bot</div>
            </div>
            <div className="px-2 py-2">
              <div className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider px-2 py-1.5">
                参与 Bot
              </div>
              {convBots.map((b) => {
                const isPrimary = b.id === primaryBotId;
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#F8FAFC]"
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-base">
                        {b.avatar_emoji}
                      </div>
                      {isPrimary && (
                        <div className="absolute -top-1 -right-1 w-[15px] h-[15px] rounded-full bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[8px]">
                          👑
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold truncate">{b.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-[20px] font-semibold border ${isPrimary ? "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" : "bg-[#F1F5F9] text-[#64748B] border-[#E5E7EB]"}`}
                        >
                          {isPrimary ? "👑 主Bot" : "辅助"}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#94A3B8] truncate">
                        {b.connection_status}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Context injection preview */}
            <div className="px-4 py-3 border-t border-[#F1F5F9]">
              <div className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">
                感知注入
              </div>
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2.5 text-[12px] leading-[1.6] text-[#78350F]">
                <strong>[群聊上下文]</strong> 当前群聊中还有以下 Bot 可以协作：
                <br />
                {convBots
                  .filter((b) => b.id !== primaryBotId)
                  .map((b) => (
                    <span key={b.id} className="block">
                      • <strong>@{b.name}</strong>：{b.description || b.name}
                    </span>
                  ))}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[#64748B]">
          <p className="text-[14px]">选择一个群聊，或点击 + 新建</p>
        </div>
      )}

      <NewConversationDialog
        open={dialogOpen}
        mode="group"
        bots={bots}
        onClose={() => setDialogOpen(false)}
        onCreated={setActiveConversationId}
      />
    </div>
  );
}
