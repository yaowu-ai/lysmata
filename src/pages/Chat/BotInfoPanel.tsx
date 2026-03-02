import { ChevronRight, ChevronLeft } from "lucide-react";
import type { Bot } from "../../shared/types";
import { useChatStore } from "../../shared/store/chat-store";

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  connected: { label: "已连接", color: "bg-[#D1FAE5] text-[#065F46]" },
  connecting: { label: "连接中", color: "bg-[#FEF3C7] text-[#92400E]" },
  disconnected: { label: "未连接", color: "bg-[#F1F5F9] text-[#64748B]" },
  error: { label: "错误", color: "bg-[#FEE2E2] text-[#991B1B]" },
};

interface Props {
  bot: Bot;
}

export function BotInfoPanel({ bot }: Props) {
  const { botPanelCollapsed, setBotPanelCollapsed } = useChatStore();
  const badge = STATUS_BADGE[bot.connection_status] ?? STATUS_BADGE.disconnected;

  if (botPanelCollapsed) {
    return (
      <div className="w-10 border-l border-[#E5E7EB] bg-white flex flex-col items-center pt-3 flex-shrink-0 transition-all duration-200">
        <button
          onClick={() => setBotPanelCollapsed(false)}
          title="展开 Bot 信息"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#2563EB] transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="mt-3 text-lg" title={bot.name}>
          {bot.avatar_emoji}
        </div>
      </div>
    );
  }

  return (
    <div className="w-[240px] border-l border-[#E5E7EB] bg-white flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9]">
        <span className="text-[13px] font-semibold text-[#374151]">Bot 信息</span>
        <button
          onClick={() => setBotPanelCollapsed(true)}
          title="折叠面板"
          className="w-6 h-6 rounded flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#374151] transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Bot identity */}
      <div className="flex flex-col items-center px-4 pt-5 pb-4 border-b border-[#F1F5F9]">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-3xl mb-2.5">
          {bot.avatar_emoji}
        </div>
        <div className="text-[14px] font-semibold text-[#0F172A] mb-1.5">{bot.name}</div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
          {badge.label}
        </span>
        {bot.description && (
          <p className="text-[12px] text-[#64748B] text-center mt-2 leading-[1.5]">
            {bot.description}
          </p>
        )}
      </div>

      {/* Skills */}
      <div className="px-4 py-3 flex-1 overflow-y-auto">
        <div className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">
          技能列表
        </div>
        {bot.skills_config?.length > 0 ? (
          <ul className="space-y-1.5">
            {bot.skills_config.map((skill) => (
              <li key={skill.name} className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-[#0F172A]">{skill.name}</span>
                {skill.description && (
                  <span className="text-[11px] text-[#94A3B8] leading-[1.4]">
                    {skill.description}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[#CBD5E1]">暂无技能配置</p>
        )}
      </div>
    </div>
  );
}
