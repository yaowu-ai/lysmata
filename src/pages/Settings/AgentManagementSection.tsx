import { useState } from "react";
import { Plus, AlertCircle, Trash2, Link, Sparkles, FolderOpen, Cpu, Pencil } from "lucide-react";
import { useAgents, useAgentBindings, useDeleteAgent } from "../../shared/hooks/useAgents";
import { useToast } from "../../components/Toast";
import type { Agent } from "../../shared/types";
import { AgentFormDrawer } from "./AgentFormDrawer";
import { AgentBindingsDrawer } from "./AgentBindingsDrawer";

export function AgentManagementSection() {
  const { data: agentsData, isLoading, isFetching } = useAgents();
  const { data: bindingsData } = useAgentBindings();
  const deleteMut = useDeleteAgent();
  const toast = useToast();

  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [bindingsDrawerOpen, setBindingsDrawerOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [recentlyEditedId, setRecentlyEditedId] = useState<string | null>(null);

  const agents = agentsData?.data ?? [];
  const bindings = bindingsData?.data ?? [];

  function handleDelete(agent: Agent) {
    if (confirmingDelete === agent.id) {
      deleteMut.mutate(agent.id, {
        onSuccess: (result) => {
          setConfirmingDelete(null);
          if (result.success) {
            toast.success(result.message ?? "Agent 已删除");
          } else {
            toast.error(result.message ?? "删除失败");
          }
        },
        onError: (err) => {
          setConfirmingDelete(null);
          toast.error(String(err));
        },
      });
    } else {
      setConfirmingDelete(agent.id);
      setTimeout(
        () => setConfirmingDelete((prev) => (prev === agent.id ? null : prev)),
        3000,
      );
    }
  }

  function handleOpenBindings(agent: Agent) {
    setSelectedAgent(agent);
    setBindingsDrawerOpen(true);
  }

  function getBindingCount(agentId: string): number {
    return bindings.filter((b) => b.agent === agentId).length;
  }

  return (
    <section className="bg-white border border-[#E5E7EB] rounded-xl p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
            <Sparkles size={18} className="text-[#2563EB]" />
            OpenClaw Agents
            {isFetching && !isLoading && (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-[#64748B]">
                <svg className="animate-spin w-3 h-3 text-[#2563EB]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                刷新中
              </span>
            )}
          </h2>
          <p className="text-xs text-[#64748B] mt-1">
            管理本地 Agent 配置和 Gateway 绑定关系
          </p>
        </div>
        <button
          onClick={() => {
            setEditingAgent(null);
            setFormDrawerOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} /> 添加 Agent
        </button>
      </div>

      {!agentsData?.success && agentsData?.message && (() => {
        const msg = agentsData.message.toLowerCase();
        const isConfigError =
          msg.includes("config invalid") ||
          msg.includes("invalid option") ||
          msg.includes("invalid config");
        return (
          <div className="mb-4 flex items-start gap-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium mb-0.5">
                {isConfigError ? "OpenClaw 配置文件格式错误" : "OpenClaw CLI 不可用"}
              </div>
              <div className="text-xs text-amber-700">{agentsData.message}</div>
              {isConfigError && (
                <div className="text-xs text-amber-600 mt-1">
                  请检查{" "}
                  <code className="bg-amber-100 px-1 rounded">~/.openclaw/openclaw.json</code>{" "}
                  中{" "}
                  <code className="bg-amber-100 px-1 rounded">models.providers</code> 的{" "}
                  <code className="bg-amber-100 px-1 rounded">api</code>{" "}
                  字段，或在下方「LLM 供应商」面板中重新保存 Provider。
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-[#E5E7EB] border-t-[#2563EB] rounded-full animate-spin" />
            <div className="text-sm text-[#64748B]">加载中...</div>
          </div>
        </div>
      )}

      {!isLoading && agents.length === 0 && agentsData?.success && (
        <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-[#E5E7EB] rounded-xl bg-[#FAFAFA]">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
            <Sparkles size={24} className="text-[#2563EB]" />
          </div>
          <div className="text-sm font-medium text-[#0F172A] mb-1">暂无 Agent</div>
          <div className="text-xs text-[#64748B] mb-4">点击上方按钮创建第一个 Agent</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`group relative bg-white border rounded-xl p-5 hover:shadow-md transition-all duration-200 ${
              recentlyEditedId === agent.id && isFetching
                ? "border-[#2563EB] shadow-[0_0_0_2px_rgba(37,99,235,0.15)]"
                : "border-[#E5E7EB] hover:border-[#2563EB]"
            }`}
          >
            {/* 刷新遮罩 */}
            {recentlyEditedId === agent.id && isFetching && (
              <div className="absolute inset-0 rounded-xl bg-white/70 flex items-center justify-center z-10">
                <div className="flex items-center gap-2 text-sm text-[#2563EB] font-medium">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  正在加载最新配置...
                </div>
              </div>
            )}
            {/* 顶部：标题和操作按钮 */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="text-base font-semibold text-[#0F172A]">{agent.id}</h3>
                  {agent.isDefault && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md">
                      <Sparkles size={12} />
                      默认
                    </span>
                  )}
                  {agent.displayName && (
                    <span className="text-sm text-[#64748B]">{agent.displayName}</span>
                  )}
                </div>
                {agent.identity && (
                  <div className="text-sm text-[#64748B] mb-3">{agent.identity}</div>
                )}
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* 编辑模型 */}
                <button
                  onClick={() => {
                    setEditingAgent(agent);
                    setFormDrawerOpen(true);
                  }}
                  className="p-2 text-[#64748B] hover:text-[#2563EB] hover:bg-blue-50 rounded-lg transition-colors"
                  title="编辑模型"
                >
                  <Pencil size={16} />
                </button>
                {/* 管理绑定 */}
                <button
                  onClick={() => handleOpenBindings(agent)}
                  className="p-2 text-[#64748B] hover:text-[#2563EB] hover:bg-blue-50 rounded-lg transition-colors"
                  title="管理绑定"
                >
                  <Link size={18} />
                </button>
                {/* 删除（两次点击确认） */}
                <button
                  onClick={() => handleDelete(agent)}
                  disabled={deleteMut.isPending}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    confirmingDelete === agent.id
                      ? "text-white bg-red-500 hover:bg-red-600"
                      : "p-2 text-[#64748B] hover:text-red-600 hover:bg-red-50"
                  }`}
                  title={confirmingDelete === agent.id ? "再次点击确认删除" : "删除 Agent"}
                >
                  {confirmingDelete === agent.id ? (
                    "确认删除？"
                  ) : (
                    <Trash2 size={18} />
                  )}
                </button>
              </div>
            </div>

            {/* 详细信息 */}
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-start gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                  <FolderOpen size={16} className="text-[#64748B]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[#64748B] mb-0.5">工作区</div>
                  <div className="text-sm text-[#0F172A] font-mono truncate">
                    {agent.workspace}
                  </div>
                </div>
              </div>

              {agent.model && (
                <div className="flex items-start gap-3 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Cpu size={16} className="text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[#64748B] mb-0.5">模型</div>
                    <div className="text-sm text-[#0F172A] font-mono truncate">{agent.model}</div>
                  </div>
                </div>
              )}
            </div>

            {/* 底部统计 */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#F1F5F9]">
              <div className="flex items-center gap-1.5 text-xs">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[#64748B]">路由规则:</span>
                <span className="font-medium text-[#0F172A]">{agent.routingRules}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[#64748B]">绑定:</span>
                <span className="font-medium text-[#0F172A]">{getBindingCount(agent.id)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AgentFormDrawer
        open={formDrawerOpen}
        agent={editingAgent}
        onClose={() => {
          setFormDrawerOpen(false);
          setEditingAgent(null);
        }}
        onSaved={(agentId) => {
          setRecentlyEditedId(agentId);
          setFormDrawerOpen(false);
          setEditingAgent(null);
          // Clear highlight once refetch settles
          setTimeout(() => setRecentlyEditedId(null), 3000);
        }}
      />

      {selectedAgent && (
        <AgentBindingsDrawer
          open={bindingsDrawerOpen}
          agent={selectedAgent}
          bindings={bindings.filter((b) => b.agent === selectedAgent.id)}
          onClose={() => {
            setBindingsDrawerOpen(false);
            setSelectedAgent(null);
          }}
        />
      )}
    </section>
  );
}
