import { Fragment, useEffect, useRef, useState } from "react";
import { useConversations, useDeleteConversation } from "../../shared/hooks/useConversations";
import { useMessages, useSendMessageStream } from "../../shared/hooks/useMessages";
import { useBots } from "../../shared/hooks/useBots";
import { useChatStore } from "../../shared/store/chat-store";
import { usePushStream } from "../../shared/hooks/usePushStream";
import { ConversationSidebar } from "./ConversationSidebar";
import { BotMessage } from "./BotMessage";
import { MessageInput } from "./MessageInput";
import { NewConversationDialog } from "./NewConversationDialog";
import { MarkdownContent } from "./MarkdownContent";
import { BotInfoPanel } from "./BotInfoPanel";
import { isSameDay, formatDateLabel } from "../../shared/lib/utils";

export function PrivateChatPage() {
  const { data: convs = [], isLoading: convLoading } = useConversations();
  const { data: bots = [] } = useBots();
  const { activeConversationId: activeId, setActiveConversationId } = useChatStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Task A: abort ref
  const abortRef = useRef<(() => void) | null>(null);

  // Task D: delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const singleConvs = convs.filter((c) => c.type === "single");
  const activeConv = singleConvs.find((c) => c.id === activeId) ?? null;

  // Task E: useInfiniteQuery
  const {
    data: msgData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(activeId ?? "");
  const messages = msgData?.messages ?? [];

  const sendStream = useSendMessageStream(activeId ?? "");
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const deleteMut = useDeleteConversation();
  usePushStream(activeId);

  // Task D: delete with confirmation + auto-switch
  function handleDeleteRequest(id: string) {
    setDeleteConfirmId(id);
  }

  function handleDeleteConfirm() {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    const remaining = singleConvs.filter((c) => c.id !== id);
    deleteMut.mutate(id, {
      onSuccess: () => {
        if (activeId === id) {
          setActiveConversationId(remaining[0]?.id ?? null);
        }
      },
    });
  }

  // Task A: stop streaming
  function handleStop() {
    abortRef.current?.();
    abortRef.current = null;
    setStreamingContent(null);
    setIsSending(false);
  }

  // Task E: IntersectionObserver for top sentinel — load older messages
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          // Preserve scroll position: record heights before fetching
          const prevScrollHeight = container?.scrollHeight ?? 0;
          fetchNextPage().then(() => {
            // Compensate scroll to prevent jump
            if (container) {
              const diff = container.scrollHeight - prevScrollHeight;
              container.scrollTop += diff;
            }
          });
        }
      },
      { root: container, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent]);

  useEffect(() => {
    setStreamingContent(null);
    setStreamError(null);
    setIsSending(false);
    abortRef.current = null;
  }, [activeId]);

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
        onDelete={handleDeleteRequest}
        isLoading={convLoading}
      />

      {activeConv ? (
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#F7F7F8]">
          {/* Header */}
          <div className="bg-white border-b border-[#E5E7EB] px-5 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl">
              {convBot?.avatar_emoji ?? "🤖"}
            </div>
            <div>
              <div className="font-semibold text-[15px]">{activeConv.title}</div>
              <div className="text-[12px] text-[#64748B]">{convBot?.name ?? ""}</div>
            </div>
          </div>

          {/* Messages — Task E: scroll container with top sentinel */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
            {/* Top sentinel for loading older messages */}
            <div ref={topSentinelRef} className="h-1 flex-shrink-0">
              {isFetchingNextPage && (
                <div className="text-center text-[12px] text-[#94A3B8] py-2">加载更早消息...</div>
              )}
            </div>

            {messages.map((m, i) => {
              const msgBot = m.bot_id ? bots.find((b) => b.id === m.bot_id) : undefined;
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
                  <BotMessage message={{ ...m, bot: msgBot }} isPrimary />
                </Fragment>
              );
            })}
            {streamingContent !== null && (
              <div className="flex items-start gap-2.5">
                <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl flex-shrink-0 mt-0.5">
                  {convBot?.avatar_emoji ?? "🤖"}
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
                    <div className="bg-[#F0F7FF] border-l-[3px] border-[#2563EB] rounded-[0_12px_12px_12px] px-3.5 py-2.5 text-[14px] leading-[1.65] break-words">
                      <MarkdownContent content={streamingContent} />
                      <span className="inline-block w-[2px] h-[14px] bg-[#2563EB] ml-0.5 animate-pulse align-middle" />
                    </div>
                  )}
                </div>
              </div>
            )}
            {streamError !== null && (
              <div className="flex items-start gap-2.5">
                <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center text-xl flex-shrink-0 mt-0.5">
                  {convBot?.avatar_emoji ?? "🤖"}
                </div>
                <div className="max-w-[75%] bg-[#FFF1F2] border-l-[3px] border-[#EF4444] rounded-[0_12px_12px_12px] px-3.5 py-2.5 text-[13px] text-[#991B1B]">
                  发送失败，Bot 未能响应。请重试。
                </div>
              </div>
            )}
            <div ref={msgEndRef} />
          </div>

          <MessageInput
            bots={convBot ? [convBot] : []}
            onSend={async (content) => {
              const ctrl = new AbortController();
              abortRef.current = () => ctrl.abort();
              setIsSending(true);
              setStreamError(null);
              setStreamingContent("");
              try {
                const result = await sendStream(
                  content,
                  (chunk) => setStreamingContent(chunk),
                  ctrl.signal,
                );
                if (result.error) setStreamError(result.error);
              } finally {
                abortRef.current = null;
                setStreamingContent(null);
                setIsSending(false);
              }
            }}
            onStop={handleStop}
            disabled={isSending}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[#64748B]">
          <p className="text-[14px]">选择一个对话，或点击 + 新建</p>
        </div>
      )}

      {/* Task F: Bot info panel */}
      {activeConv && convBot && <BotInfoPanel bot={convBot} />}

      <NewConversationDialog
        open={dialogOpen}
        mode="single"
        bots={bots}
        onClose={() => setDialogOpen(false)}
        onCreated={setActiveConversationId}
      />

      {/* Task D: Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[340px]">
            <div className="text-[16px] font-semibold mb-2">删除对话</div>
            <div className="text-[14px] text-[#64748B] mb-5">
              确定要删除这个对话吗？删除后将无法恢复。
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-[14px] rounded-lg border border-[#E5E7EB] hover:bg-[#F8FAFC] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-[14px] rounded-lg bg-[#EF4444] text-white hover:bg-[#DC2626] transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
