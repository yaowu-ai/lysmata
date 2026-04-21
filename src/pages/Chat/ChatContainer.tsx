import { Modal } from "antd";
import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useBots } from "../../shared/hooks/useBots";
import { useConversations, useDeleteConversation } from "../../shared/hooks/useConversations";
import { useMessages, useSendMessageStream } from "../../shared/hooks/useMessages";
import { usePushStream } from "../../shared/hooks/usePushStream";
import { useStreamEvents } from "../../shared/hooks/useStreamEvents";
import { useChatStore } from "../../shared/store/chat-store";
import type { Bot } from "../../shared/types";
import { BotInfoPanel } from "./BotInfoPanel";
import { ChatBody } from "./ChatBody";
import { ChatEmpty } from "./ChatEmpty";
import { ChatHeader } from "./ChatHeader";
import { ConversationsPane } from "./ConversationsPane";
import { NewConversationDialog } from "./NewConversationDialog";
import { SenderBox } from "./SenderBox";

interface Props {
  mode: "private" | "group";
}

export function ChatContainer({ mode }: Props) {
  const { data: convs = [], isLoading: convLoading } = useConversations();
  const { data: bots = [] } = useBots();
  const { activeConversationId: activeId, setActiveConversationId } = useChatStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const abortRef = useRef<(() => void) | null>(null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const sidebarType = mode === "private" ? "single" : "group";
  const pageConvs = convs.filter((c) => c.type === sidebarType);
  const activeConv = pageConvs.find((c) => c.id === activeId) ?? null;

  const {
    data: msgData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(activeId ?? "");
  const messages = msgData?.messages ?? [];

  const sendStream = useSendMessageStream(activeId ?? "");
  const { inflightEvents, push: pushEvent, clear: clearEvents } = useStreamEvents();
  const deleteMut = useDeleteConversation();
  usePushStream(activeId);

  const convBotIds = activeConv?.bots?.map((b) => b.bot_id) ?? [];
  const convBots: Bot[] = convBotIds
    .map((id) => bots.find((b) => b.id === id))
    .filter((b): b is Bot => !!b);
  const primaryBotId = activeConv?.bots?.find((b) => b.is_primary)?.bot_id ?? convBotIds[0];
  const primaryBot = convBots.find((b) => b.id === primaryBotId) ?? convBots[0] ?? null;

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    setStreamingContent(null);
    setStreamError(null);
    setIsSending(false);
    abortRef.current = null;
    clearEvents();
  }, [activeId, clearEvents]);

  function handleDelete(id: string) {
    if (mode === "private") {
      setDeleteConfirmId(id);
    } else {
      deleteMut.mutate(id, {
        onSuccess: () => {
          if (activeId === id) setActiveConversationId(null);
        },
      });
    }
  }

  function confirmDelete() {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    const remaining = pageConvs.filter((c) => c.id !== id);
    deleteMut.mutate(id, {
      onSuccess: () => {
        if (activeId === id) {
          setActiveConversationId(remaining[0]?.id ?? null);
        }
      },
    });
  }

  function handleStop() {
    abortRef.current?.();
    abortRef.current = null;
    setStreamingContent(null);
    setIsSending(false);
  }

  async function sendContent(content: string) {
    if (!activeId) return;
    const ctrl = new AbortController();
    abortRef.current = () => ctrl.abort();
    setIsSending(true);
    setStreamError(null);
    setStreamingContent("");
    clearEvents();
    try {
      const result = await sendStream(
        content,
        (chunk) => setStreamingContent(chunk),
        ctrl.signal,
        (event) => pushEvent(event),
      );
      if (result.error) setStreamError(result.error);
    } finally {
      abortRef.current = null;
      setStreamingContent(null);
      setIsSending(false);
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  const sidebar = (
    <ConversationsPane
      title={mode === "private" ? "私聊" : "群聊"}
      subtitle={mode === "private" ? "1:1 对话" : "多 Bot 协作 · @mention 路由"}
      conversations={pageConvs}
      activeId={activeId}
      onSelect={setActiveConversationId}
      onNew={() => setDialogOpen(true)}
      onDelete={handleDelete}
      isLoading={convLoading}
    />
  );

  const newDialog = (
    <NewConversationDialog
      open={dialogOpen}
      mode={mode === "private" ? "single" : "group"}
      bots={bots}
      onClose={() => setDialogOpen(false)}
      onCreated={setActiveConversationId}
    />
  );

  if (!activeConv) {
    return (
      <div className="flex flex-1 overflow-hidden min-w-0">
        {sidebar}
        <ChatEmpty hasConversation={false} onPromptClick={undefined} />
        {newDialog}
      </div>
    );
  }

  const hasMessages = messages.length > 0;

  // Header: group mode shows stacked avatars, private mode shows single bot.
  const groupAvatars =
    mode === "group" ? (
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
    ) : undefined;

  const headerTrailing =
    mode === "group" ? (
      <a
        href="/bots"
        className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] transition-colors"
        title="Bot 管理"
      >
        <Settings size={15} />
      </a>
    ) : undefined;

  return (
    <div className="flex flex-1 overflow-hidden min-w-0">
      {sidebar}
      <div className="flex flex-1 overflow-hidden min-w-0">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#F7F7F8]">
          <ChatHeader
            bot={primaryBot}
            conversation={activeConv}
            avatarSlot={groupAvatars}
            trailing={headerTrailing}
          />

          {hasMessages || streamingContent !== null || inflightEvents.length > 0 ? (
            <ChatBody
              messages={messages}
              bots={bots}
              streamingContent={streamingContent}
              streamError={streamError}
              inflightEvents={inflightEvents}
              streamingBot={primaryBot}
              streamingBotIsPrimary
              onLoadEarlier={hasNextPage ? () => fetchNextPage() : undefined}
              hasMoreEarlier={hasNextPage}
              isFetchingEarlier={isFetchingNextPage}
            />
          ) : (
            <ChatEmpty
              bot={primaryBot}
              hasConversation
              onPromptClick={(prompt) => {
                setDraft(prompt);
              }}
            />
          )}

          <div className="px-5 py-3 bg-white border-t border-[#E5E7EB] flex-shrink-0">
            <SenderBox
              value={draft}
              onChange={setDraft}
              onSubmit={sendContent}
              onStop={handleStop}
              loading={isSending}
              placeholder={mode === "group" ? "发送消息… 输入 @ 可提及特定 Bot" : "发送消息…"}
              footer={
                <p className="text-[11px] text-[#CBD5E1] text-center mt-1.5">
                  Enter 发送 · Shift+Enter 换行{mode === "group" ? " · @ 触发 Bot 提及" : ""}
                </p>
              }
            />
          </div>
        </div>

        {mode === "private" && primaryBot && <BotInfoPanel bot={primaryBot} />}
        {mode === "group" && <GroupInfoPanel bots={convBots} primaryBotId={primaryBotId} />}
      </div>

      {newDialog}

      {/* Private mode: delete confirmation via antd Modal */}
      <Modal
        open={!!deleteConfirmId}
        title="删除对话"
        okText="删除"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={confirmDelete}
        onCancel={() => setDeleteConfirmId(null)}
      >
        <p>确定要删除这个对话吗？删除后将无法恢复。</p>
      </Modal>
    </div>
  );
}

function GroupInfoPanel({ bots, primaryBotId }: { bots: Bot[]; primaryBotId?: string }) {
  return (
    <aside className="w-[280px] bg-white border-l border-[#E5E7EB] flex flex-col flex-shrink-0 overflow-y-auto">
      <div className="px-4 py-3 border-b border-[#E5E7EB]">
        <div className="text-[13px] font-semibold">群组信息</div>
        <div className="text-[12px] text-[#64748B] mt-0.5">{bots.length} 个 Bot</div>
      </div>
      <div className="px-2 py-2">
        <div className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider px-2 py-1.5">
          参与 Bot
        </div>
        {bots.map((b) => {
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
                    className={
                      "text-[10px] px-1.5 py-0.5 rounded-[20px] font-semibold border " +
                      (isPrimary
                        ? "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]"
                        : "bg-[#F1F5F9] text-[#64748B] border-[#E5E7EB]")
                    }
                  >
                    {isPrimary ? "👑 主Bot" : "辅助"}
                  </span>
                </div>
                <div className="text-[11px] text-[#94A3B8] truncate">{b.connection_status}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-3 border-t border-[#F1F5F9]">
        <div className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">
          感知注入
        </div>
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2.5 text-[12px] leading-[1.6] text-[#78350F]">
          <strong>[群聊上下文]</strong> 当前群聊中还有以下 Bot 可以协作：
          <br />
          {bots
            .filter((b) => b.id !== primaryBotId)
            .map((b) => (
              <span key={b.id} className="block">
                • <strong>@{b.name}</strong>：{b.description || b.name}
              </span>
            ))}
        </div>
      </div>
    </aside>
  );
}
