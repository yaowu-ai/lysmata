import { Pencil, Trash2, Wifi, Activity, Cpu, Puzzle, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Bot, ConnectionStatus, LlmConfig } from "../../shared/types";
import { cn } from "../../shared/lib/utils";
import { useAppStore } from "../../shared/store/app-store";

const statusLabel: Record<ConnectionStatus, string> = {
  connected: "已连接",
  disconnected: "未连接",
  connecting: "连接中",
  error: "连接错误",
};

const statusDot: Record<ConnectionStatus, string> = {
  connected: "bg-[#10B981] shadow-[0_0_0_2px_rgba(16,185,129,0.2)]",
  disconnected: "bg-[#94A3B8]",
  connecting: "bg-[#F59E0B] shadow-[0_0_0_2px_rgba(245,158,11,0.25)] animate-pulse",
  error: "bg-[#EF4444] shadow-[0_0_0_2px_rgba(239,68,68,0.2)]",
};

const statusTextColor: Record<ConnectionStatus, string> = {
  connected: "text-[#15803D] bg-[#DCFCE7] border-[#BBF7D0]",
  disconnected: "text-[#64748B] bg-[#F1F5F9] border-[#E5E7EB]",
  connecting: "text-[#92400E] bg-[#FEF3C7] border-[#FDE68A]",
  error: "text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA]",
};

const providerStyle: Record<string, { label: string; cls: string }> = {
  openai: { label: "OpenAI", cls: "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]" },
  anthropic: { label: "Anthropic", cls: "bg-[#F3E8FF] text-[#7E22CE] border-[#E9D5FF]" },
  google: { label: "Google", cls: "bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]" },
  openrouter: { label: "OpenRouter", cls: "bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]" },
  custom: { label: "Custom", cls: "bg-[#F1F5F9] text-[#475569] border-[#E5E7EB]" },
};

interface Props {
  bot: Bot;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  isTesting: boolean;
}

function parseSafe<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "object") return v as T;
  try {
    return JSON.parse(v as string) as T;
  } catch {
    return fallback;
  }
}

export function BotCard({ bot, onEdit, onDelete, onTest, isTesting }: Props) {
  const navigate = useNavigate();
  const botStatus = useAppStore((s) => s.botStatuses[bot.id]);
  const pendingCount = botStatus?.pendingNodeRequests?.length ?? 0;

  const skills = parseSafe<Array<{ name: string }>>(bot.skills_config, []);
  const llm = parseSafe<LlmConfig | null>(bot.llm_config, null);
  const mcp = parseSafe<{ mcpServers?: Record<string, unknown> } | null>(bot.mcp_config, null);

  const mcpCount = mcp?.mcpServers ? Object.keys(mcp.mcpServers).length : 0;
  const llmProvider = llm?.provider;
  const llmModel = llm?.model;
  const providerInfo = llmProvider ? (providerStyle[llmProvider] ?? providerStyle.custom) : null;

  const hasConfig = providerInfo || mcpCount > 0 || skills.length > 0;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all duration-[160ms]">
      {/* Top section */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-2xl flex-shrink-0">
            {bot.avatar_emoji}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[15px]">{bot.name}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-[20px] border",
                  statusTextColor[bot.connection_status],
                )}
              >
                <span
                  className={cn("w-1.5 h-1.5 rounded-full", statusDot[bot.connection_status])}
                />
                {statusLabel[bot.connection_status]}
              </span>
            </div>
            {bot.description && (
              <p className="text-[13px] text-[#64748B] mt-1 line-clamp-2">{bot.description}</p>
            )}
            <p className="text-[11px] text-[#94A3B8] mt-1 font-mono truncate">
              {bot.openclaw_ws_url}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => navigate(`/bots/${bot.id}/status`)}
              title="查看状态"
              className="relative w-7 h-7 rounded-[7px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#94A3B8] hover:bg-[#EFF6FF] hover:text-blue-600 hover:border-blue-200 transition-colors"
            >
              <Activity size={13} />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#EF4444] text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={onTest}
              disabled={isTesting}
              title="测试连接"
              className="w-7 h-7 rounded-[7px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] transition-colors disabled:opacity-50"
            >
              <Wifi size={13} />
            </button>
            <button
              onClick={onEdit}
              title="编辑"
              className="w-7 h-7 rounded-[7px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] transition-colors"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              title="删除"
              className="w-7 h-7 rounded-[7px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#94A3B8] hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Config summary strip */}
      {hasConfig && (
        <div className="border-t border-[#F1F5F9] bg-[#FAFAFA] px-5 py-3 flex items-center gap-6">
          {/* LLM info */}
          <div className="flex items-center gap-2 min-w-0">
            <Cpu size={12} className="text-[#94A3B8] flex-shrink-0" />
            {providerInfo ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0",
                    providerInfo.cls,
                  )}
                >
                  {providerInfo.label}
                </span>
                {llmModel && (
                  <span className="text-[11px] text-[#64748B] font-mono truncate">{llmModel}</span>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-[#94A3B8]">未配置 LLM</span>
            )}
          </div>

          <div className="w-px h-3.5 bg-[#E5E7EB] flex-shrink-0" />

          {/* MCP info */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Puzzle size={12} className="text-[#94A3B8]" />
            {mcpCount > 0 ? (
              <span className="text-[11px] text-[#475569] font-medium">{mcpCount} 个 MCP</span>
            ) : (
              <span className="text-[11px] text-[#94A3B8]">未配置 MCP</span>
            )}
          </div>

          <div className="w-px h-3.5 bg-[#E5E7EB] flex-shrink-0" />

          {/* Skills info */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Zap size={12} className="text-[#94A3B8] flex-shrink-0" />
            {skills.length > 0 ? (
              <div className="flex items-center gap-1 min-w-0">
                {skills.slice(0, 3).map((s) => (
                  <span
                    key={s.name}
                    className="text-[10px] px-1.5 py-0.5 rounded-[20px] bg-[#F1F5F9] text-[#475569] font-medium border border-[#E5E7EB] whitespace-nowrap"
                  >
                    {s.name}
                  </span>
                ))}
                {skills.length > 3 && (
                  <span className="text-[10px] text-[#94A3B8]">+{skills.length - 3}</span>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-[#94A3B8]">未配置 Skills</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
