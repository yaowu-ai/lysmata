import { useState } from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { useBots, useDeleteBot, useTestBotConnection, useBotConversationsCount } from "../../shared/hooks/useBots";
import type { Bot } from "../../shared/types";
import { BotFormDrawer } from "./BotFormDrawer";
import { BotCard } from "./BotCard";
import { cn } from "../../shared/lib/utils";

export function BotManagementPage() {
  const { data: bots = [], isLoading, refetch } = useBots();
  const deleteMut = useDeleteBot();
  const testMut = useTestBotConnection();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [search, setSearch] = useState("");
  const [deletingBot, setDeletingBot] = useState<Bot | null>(null);

  const convCountQuery = useBotConversationsCount(deletingBot?.id ?? "", !!deletingBot);

  const filtered = search.trim()
    ? bots.filter(
        (b) =>
          b.name.toLowerCase().includes(search.toLowerCase()) ||
          b.description.toLowerCase().includes(search.toLowerCase()),
      )
    : bots;

  function openCreate() {
    setEditingBot(null);
    setDrawerOpen(true);
  }
  function openEdit(bot: Bot) {
    setEditingBot(bot);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
    setEditingBot(null);
  }
  function requestDelete(bot: Bot) {
    setDeletingBot(bot);
  }
  function cancelDelete() {
    setDeletingBot(null);
  }
  function confirmDelete() {
    if (!deletingBot) return;
    deleteMut.mutate(deletingBot.id);
    setDeletingBot(null);
  }

  const hasConversations = (convCountQuery.data?.count ?? 0) > 0;

  return (
    <div className="flex flex-1 overflow-hidden min-w-0 relative">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between flex-shrink-0 gap-3">
          <div className="flex-shrink-0">
            <h1 className="text-[17px] font-semibold text-[#0F172A]">Bot 管理</h1>
            <p className="text-[13px] text-[#64748B] mt-0.5">
              {bots.length > 0
                ? `${bots.length} 个 Bot · ${bots.filter((b) => b.connection_status === "connected").length} 个已连接`
                : "管理 OpenClaw Agent 连接，配置技能与 MCP"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end">
            {/* Search input */}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索 Bot..."
                className="pl-8 pr-7 py-1.5 text-[13px] border border-[#E5E7EB] rounded-lg bg-white outline-none focus:border-[#93C5FD] focus:shadow-[0_0_0_3px_rgba(147,197,253,0.2)] transition-all w-[180px] focus:w-[240px]"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => refetch()}
              className={cn(
                "w-8 h-8 rounded-[7px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] transition-colors",
                isLoading && "animate-spin",
              )}
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-[#2563EB] text-white text-[14px] font-medium px-4 py-2 rounded-lg hover:bg-[#1D4ED8] transition-colors"
            >
              <Plus size={15} />
              新建 Bot
            </button>
          </div>
        </div>

        {/* Bot list */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-[#64748B] text-[14px]">
              加载中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-[#64748B]">
              {search ? (
                <>
                  <p className="text-[14px]">未找到匹配「{search}」的 Bot</p>
                  <button
                    onClick={() => setSearch("")}
                    className="text-[13px] text-[#2563EB] hover:underline"
                  >
                    清除搜索
                  </button>
                </>
              ) : (
                <p className="text-[14px]">还没有 Bot，点击右上角新建</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 max-w-4xl">
              {filtered.map((bot) => (
                <BotCard
                  key={bot.id}
                  bot={bot}
                  onEdit={() => openEdit(bot)}
                  onDelete={() => requestDelete(bot)}
                  onTest={() => testMut.mutate({ id: bot.id })}
                  isTesting={testMut.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 bg-[rgba(15,23,42,0.18)] z-20" onClick={closeDrawer} />
      )}

      {/* Form drawer */}
      <BotFormDrawer open={drawerOpen} bot={editingBot} onClose={closeDrawer} />

      {/* Delete confirmation dialog */}
      {deletingBot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-[rgba(15,23,42,0.4)]"
            onClick={cancelDelete}
          />
          <div className="relative bg-white rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-[420px] p-6">
            <h3 className="text-[16px] font-semibold text-[#0F172A] mb-2">
              删除 Bot「{deletingBot.name}」？
            </h3>
            <p className="text-[13px] text-[#64748B] leading-[1.6] mb-3">
              此操作不可撤销，将断开 WebSocket 连接并从列表中移除。
            </p>
            {convCountQuery.isLoading ? (
              <div className="flex items-center gap-2 text-[12px] text-[#94A3B8] mb-3">
                <RefreshCw size={12} className="animate-spin" /> 检查会话数据...
              </div>
            ) : hasConversations ? (
              <div className="flex items-start gap-2 text-[12px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2.5 mb-3">
                <span className="mt-0.5 text-[#F59E0B]">⚠</span>
                <span>
                  该 Bot 存在进行中的对话，删除后相关对话记录将保留，但 Bot 将无法继续响应。
                </span>
              </div>
            ) : null}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 rounded-lg border border-[#E5E7EB] text-[14px] text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteMut.isPending}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-[14px] font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleteMut.isPending ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
