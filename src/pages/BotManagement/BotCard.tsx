import { Pencil, Trash2, Wifi, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Bot, ConnectionStatus } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useAppStore } from '../../shared/store/app-store';

const statusLabel: Record<ConnectionStatus, string> = {
  connected: '已连接',
  disconnected: '未连接',
  connecting: '连接中',
  error: '连接错误',
};

const statusDot: Record<ConnectionStatus, string> = {
  connected: 'bg-[#10B981] shadow-[0_0_0_2px_rgba(16,185,129,0.2)]',
  disconnected: 'bg-[#94A3B8]',
  connecting: 'bg-[#F59E0B] shadow-[0_0_0_2px_rgba(245,158,11,0.25)] animate-pulse',
  error: 'bg-[#EF4444] shadow-[0_0_0_2px_rgba(239,68,68,0.2)]',
};

const statusTextColor: Record<ConnectionStatus, string> = {
  connected: 'text-[#15803D] bg-[#DCFCE7] border-[#BBF7D0]',
  disconnected: 'text-[#64748B] bg-[#F1F5F9] border-[#E5E7EB]',
  connecting: 'text-[#92400E] bg-[#FEF3C7] border-[#FDE68A]',
  error: 'text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA]',
};

interface Props {
  bot: Bot;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  isTesting: boolean;
}

export function BotCard({ bot, onEdit, onDelete, onTest, isTesting }: Props) {
  const navigate = useNavigate();
  const botStatus = useAppStore((s) => s.botStatuses[bot.id]);
  const pendingCount = botStatus?.pendingNodeRequests?.length ?? 0;

  const skills = (() => {
    try { return Array.isArray(bot.skills_config) ? bot.skills_config : JSON.parse(bot.skills_config as unknown as string); }
    catch { return []; }
  })();

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all duration-[160ms]">
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
                'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-[20px] border',
                statusTextColor[bot.connection_status],
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', statusDot[bot.connection_status])} />
              {statusLabel[bot.connection_status]}
            </span>
          </div>
          {bot.description && (
            <p className="text-[13px] text-[#64748B] mt-1 line-clamp-2">{bot.description}</p>
          )}
          <p className="text-[11px] text-[#94A3B8] mt-1 font-mono">{bot.openclaw_ws_url}</p>
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {skills.slice(0, 4).map((s: { name: string }) => (
                <span
                  key={s.name}
                  className="text-[11px] px-2 py-0.5 rounded-[20px] bg-[#F1F5F9] text-[#475569] font-medium border border-[#E5E7EB]"
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Status page button — shows a red badge when there are pending node requests */}
          <button
            onClick={() => navigate(`/bots/${bot.id}/status`)}
            title="查看状态"
            className="relative w-7 h-7 rounded-[7px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#94A3B8] hover:bg-[#EFF6FF] hover:text-blue-600 hover:border-blue-200 transition-colors"
          >
            <Activity size={13} />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#EF4444] text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {pendingCount > 9 ? '9+' : pendingCount}
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
  );
}
