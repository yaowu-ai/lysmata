import { useState } from "react";
import { Plus, AlertCircle, Trash2, Link, Sparkles, FolderOpen, Cpu } from "lucide-react";
import { useAgents, useAgentBindings, useDeleteAgent } from "../../shared/hooks/useAgents";
import type { Agent } from "../../shared/types";
import { AgentFormDrawer } from "./AgentFormDrawer";
import { AgentBindingsDrawer } from "./AgentBindingsDrawer";

export function AgentManagementSection() {
  const { data: agentsData, isLoading } = useAgents();
  const { data: bindingsData } = useAgentBindings();
  const deleteMut = useDeleteAgent();

  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const [bindingsDrawerOpen, setBindingsDrawerOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const agents = agentsData?.data ?? [];
  const bindings = bindingsData?.data ?? [];

  function handleDelete(agent: Agent) {
    if (
      !window.confirm(
        `确认删除 Agent "${agent.id}"？\n\n此操作将删除工作区和状态文件。`
      )
    ) {
      return;
    }
    deleteMut.mutate(agent.id);
  }

  function handleOpenBindings(agent: Agent) {
    setSelectedAgent(agent);
    setBindingsDrawerOpen(true);
  }

  // 获取某个 Agent 的绑定数量
  function getBindingCount(agentId: string): number {
    return bindings.filter((b) => b.agent === agentId).length;
  }

  return (
    <section className="mt-8 pt-8 border-t border-[#E5E7EB]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
            <Sparkles size={18} className="text-[#2563EB]" />
            OpenClaw Agents
          </h2>
          <p className="text-xs text-[#64748B] mt-1">
            管理本地 Agent 配置和 Gateway 绑定关系
          </p>
        </div>
        <button
          onClick={() => setFormDrawerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} /> 添加 Agent
        </button>
      </div>

      {!agentsData?.success && agentsData?.message && (() => {
        const msg = agentsData.message.toLowerCase();
        const isConfigError = msg.includes("config invalid") || msg.includes("invalid option") || msg.includes("invalid config");
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
                  请检查 <code className="bg-amber-100 px-1 rounded">~/.openclaw/openclaw.json</code> 中 <code className="bg-amber-100 px-1 rounded">models.providers</code> 的 <code className="bg-amber-100 px-1 rounded">api</code> 字段，或在下方「LLM 供应商」面板中重新保存 Provider。
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
            className="group relative bg-white border border-[#E5E7EB] rounded-xl p-5 hover:border-[#2563EB] hover:shadow-md transition-all duration-200"
          >
            {/* 顶部：标题和操作按钮 */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="text-base font-semibold text-[#0F172A]">
                    {agent.id}
                  </h3>
                  {agent.isDefault && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md">
                      <Sparkles size={12} />
                      默认
                    </span>
                  )}
                  {agent.displayName && (
                    <span className="text-sm text-[#64748B]">
                      {agent.displayName}
                    </span>
                  )}
                </div>

                {agent.identity && (
                  <div className="text-sm text-[#64748B] mb-3">
                    {agent.identity}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleOpenBindings(agent)}
                  className="p-2 text-[#64748B] hover:text-[#2563EB] hover:bg-blue-50 rounded-lg transition-colors"
                  title="管理绑定"
                >
                  <Link size={18} />
                </button>
                <button
                  onClick={() => handleDelete(agent)}
                  disabled={deleteMut.isPending}
                  className="p-2 text-[#64748B] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="删除 Agent"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            {/* 详细信息网格 */}
            <div className="grid grid-cols-1 gap-3">
              {/* 工作区 */}
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

              {/* 模型 */}
              {agent.model && (
                <div className="flex items-start gap-3 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Cpu size={16} className="text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[#64748B] mb-0.5">模型</div>
                    <div className="text-sm text-[#0F172A] font-mono truncate">
                      {agent.model}
                    </div>
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

      <AgentFormDrawer open={formDrawerOpen} onClose={() => setFormDrawerOpen(false)} />
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
