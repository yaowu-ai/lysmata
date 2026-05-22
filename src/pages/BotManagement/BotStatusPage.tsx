import { useParams, useNavigate } from "react-router-dom";
import {
  Activity,
  Heart,
  Wifi,
  Users,
  GitBranch,
  Clock,
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  Circle,
} from "lucide-react";
import { useBot } from "../../shared/hooks/useBots";
import { useAppStore } from "../../shared/store/app-store";
import { cn } from "../../shared/lib/utils";
import type { ConnectionStatus } from "../../shared/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUptime(ms?: number): string {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatTime(iso?: string | unknown): string {
  if (!iso || typeof iso !== "string") return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusCard({
  icon: Icon,
  title,
  children,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-blue-600">
          <Icon size={14} />
        </div>
        <h3 className="text-[13px] font-semibold text-[#0F172A]">{title}</h3>
        {badge && <div className="ml-auto">{badge}</div>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#F1F5F9] last:border-0">
      <span className="text-[12px] text-[#64748B]">{label}</span>
      <span className="text-[12px] font-medium text-[#0F172A] max-w-[60%] text-right truncate">
        {value ?? "—"}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-[12px] text-[#94A3B8] text-center py-3">{text}</p>;
}

const connStatusConfig: Record<
  ConnectionStatus,
  { dot: string; label: string; icon: React.ElementType }
> = {
  connected: { dot: "bg-[#10B981]", label: "已连接", icon: CheckCircle },
  disconnected: { dot: "bg-[#94A3B8]", label: "未连接", icon: Circle },
  connecting: { dot: "bg-[#F59E0B] animate-pulse", label: "连接中", icon: AlertCircle },
  error: { dot: "bg-[#EF4444]", label: "连接错误", icon: XCircle },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export function BotStatusPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: bot, isLoading } = useBot(id);
  const status = useAppStore((s) => s.botStatuses[id]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[14px] text-[#64748B]">
        加载中…
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="flex flex-1 items-center justify-center text-[14px] text-[#64748B]">
        找不到该 Bot
      </div>
    );
  }

  const connCfg = connStatusConfig[bot.connection_status];
  const ConnIcon = connCfg.icon;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate("/bots")}
          className="w-8 h-8 rounded-[7px] border border-[#E5E7EB] flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] transition-colors"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl flex-shrink-0">
          {bot.avatar_emoji}
        </div>
        <div>
          <h1 className="text-[16px] font-semibold text-[#0F172A] leading-tight">{bot.name}</h1>
          <p className="text-[12px] text-[#94A3B8] font-mono">{bot.backend_url}</p>
        </div>
        {status?.isShutdown && (
          <div className="ml-auto flex items-center gap-1.5 text-[12px] font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] px-2.5 py-1 rounded-full">
            <AlertCircle size={12} />
            Gateway 已关闭
          </div>
        )}
        {status?.updatedAt && !status.isShutdown && (
          <div className="ml-auto text-[11px] text-[#94A3B8]">
            更新于 {formatTime(status.updatedAt)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. 连接状态 */}
          <StatusCard icon={Wifi} title="连接状态">
            <div className="flex items-center gap-3 mb-3">
              <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", connCfg.dot)} />
              <span className="text-[13px] font-semibold text-[#0F172A]">{connCfg.label}</span>
              <ConnIcon
                size={14}
                className={cn(
                  bot.connection_status === "connected"
                    ? "text-[#10B981]"
                    : bot.connection_status === "error"
                      ? "text-[#EF4444]"
                      : bot.connection_status === "connecting"
                        ? "text-[#F59E0B]"
                        : "text-[#94A3B8]",
                )}
              />
            </div>
            <Row label="Agent ID" value={bot.agent_id} />
            <Row label="Gateway 关闭" value={status?.isShutdown ? "是" : "否"} />
          </StatusCard>

          {/* 2. 健康快照 */}
          <StatusCard
            icon={Activity}
            title="系统健康"
            badge={
              status?.health ? (
                <span className="text-[11px] text-[#15803D] bg-[#DCFCE7] border border-[#BBF7D0] px-2 py-0.5 rounded-full">
                  正常
                </span>
              ) : (
                <span className="text-[11px] text-[#64748B] bg-[#F1F5F9] border border-[#E5E7EB] px-2 py-0.5 rounded-full">
                  无数据
                </span>
              )
            }
          >
            {status?.health ? (
              <>
                <Row label="运行时长" value={formatUptime(status.health.uptimeMs)} />
                <Row
                  label="节点数"
                  value={
                    status.health.nodes ? String(Object.keys(status.health.nodes).length) : "—"
                  }
                />
                {status.health.limits && (
                  <div className="mt-2">
                    <p className="text-[11px] text-[#94A3B8] mb-1.5">限制配置</p>
                    {Object.entries(status.health.limits).map(([k, v]) => (
                      <Row key={k} label={k} value={String(v)} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <EmptyState text="尚未收到健康数据" />
            )}
          </StatusCard>

          {/* 3. 心跳状态 */}
          <StatusCard icon={Heart} title="心跳状态">
            {status?.lastHeartbeat ? (
              <>
                <Row label="状态" value={status.lastHeartbeat.status ?? "—"} />
                <Row label="上次心跳" value={formatTime(status.lastHeartbeat.lastBeat as string)} />
              </>
            ) : (
              <EmptyState text="尚未收到心跳数据" />
            )}
          </StatusCard>

          {/* 4. 在线状态 */}
          <StatusCard icon={Users} title="在线状态">
            {status?.presence ? (
              <>
                <Row
                  label="在线"
                  value={
                    status.presence.online === true
                      ? "是"
                      : status.presence.online === false
                        ? "否"
                        : "—"
                  }
                />
                <Row
                  label="设备数"
                  value={
                    Array.isArray(status.presence.devices)
                      ? String(status.presence.devices.length)
                      : "—"
                  }
                />
                <Row
                  label="会话数"
                  value={
                    Array.isArray(status.presence.sessions)
                      ? String(status.presence.sessions.length)
                      : "—"
                  }
                />
              </>
            ) : (
              <EmptyState text="尚未收到在线状态数据" />
            )}
          </StatusCard>

          {/* 5. 待配对节点 */}
          <StatusCard
            icon={GitBranch}
            title="待配对节点"
            badge={
              status?.pendingNodeRequests?.length ? (
                <span className="text-[11px] font-bold text-white bg-[#EF4444] px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {status.pendingNodeRequests.length}
                </span>
              ) : null
            }
          >
            {status?.pendingNodeRequests?.length ? (
              <div className="space-y-2">
                {status.pendingNodeRequests.map((req, i) => (
                  <div
                    key={req.requestId ?? i}
                    className="flex items-center justify-between p-2.5 bg-[#FFF7ED] border border-[#FED7AA] rounded-lg"
                  >
                    <div>
                      <p className="text-[12px] font-medium text-[#0F172A]">
                        节点 {req.nodeId ?? "未知"}
                      </p>
                      {req.requestId && (
                        <p className="text-[11px] text-[#94A3B8] font-mono mt-0.5">
                          {req.requestId}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-[#92400E] bg-[#FEF3C7] border border-[#FDE68A] px-2 py-0.5 rounded-full">
                      待审批
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="无待配对节点" />
            )}
          </StatusCard>

          {/* 6. 定时任务 */}
          <StatusCard icon={Clock} title="定时任务">
            {status?.lastCronAt ? (
              <Row label="上次触发" value={formatTime(status.lastCronAt)} />
            ) : (
              <EmptyState text="尚未收到定时任务触发" />
            )}
          </StatusCard>
        </div>
      </div>
    </div>
  );
}
