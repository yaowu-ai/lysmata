import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useBots, useDeleteBot, useTestBotConnection } from "../../shared/hooks/useBots";
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

  return (
    <div className="flex flex-1 overflow-hidden min-w-0 relative">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-[17px] font-semibold text-[#0F172A]">Bot 管理</h1>
            <p className="text-[13px] text-[#64748B] mt-0.5">
              管理 OpenClaw Agent 连接，配置技能与 MCP
            </p>
          </div>
          <div className="flex items-center gap-2">
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
          ) : bots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-[#64748B]">
              <p className="text-[14px]">还没有 Bot，点击右上角新建</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 max-w-4xl">
              {bots.map((bot) => (
                <BotCard
                  key={bot.id}
                  bot={bot}
                  onEdit={() => openEdit(bot)}
                  onDelete={() => deleteMut.mutate(bot.id)}
                  onTest={() => testMut.mutate(bot.id)}
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
    </div>
  );
}
