import { useState } from "react";
import { X } from "lucide-react";
import { useCreateAgent } from "../../shared/hooks/useAgents";
import { useAvailableModels } from "../../shared/hooks/useAvailableModels";
import type { CreateAgentInput } from "../../shared/types";

interface AgentFormDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function AgentFormDrawer({ open, onClose }: AgentFormDrawerProps) {
  const createMut = useCreateAgent();
  const { data: availableModels = [] } = useAvailableModels();

  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [agentDir, setAgentDir] = useState("");
  const [model, setModel] = useState("");
  const [bindings, setBindings] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      alert("Agent ID 不能为空");
      return;
    }

    // 验证 Agent ID 格式（小写字母、数字、连字符）
    if (!/^[a-z0-9-]+$/.test(name)) {
      alert("Agent ID 只能包含小写字母、数字和连字符");
      return;
    }

    const input: CreateAgentInput = {
      name: name.trim(),
      workspace: workspace.trim() || undefined,
      agentDir: agentDir.trim() || undefined,
      model: model.trim() || undefined,
      bindings: bindings
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean),
    };

    createMut.mutate(input, {
      onSuccess: (result) => {
        if (result.success) {
          alert(result.message || "Agent 创建成功");
          handleClose();
        } else {
          alert(result.message || "创建失败");
        }
      },
      onError: (err) => {
        alert(`创建失败: ${err}`);
      },
    });
  }

  function handleClose() {
    setName("");
    setWorkspace("");
    setAgentDir("");
    setModel("");
    setBindings("");
    onClose();
  }

  if (!open) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={handleClose}
      />

      {/* 抽屉 */}
      <div className="fixed right-0 top-0 bottom-0 w-[500px] bg-white shadow-xl z-50 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-semibold text-[#0F172A]">添加 Agent</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Agent ID */}
            <div>
              <label className="text-[13px] font-medium text-[#0F172A] mb-1.5 block">
                Agent ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: main, production"
                className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-[#64748B] mt-1">
                只能包含小写字母、数字和连字符
              </p>
            </div>

            {/* Workspace */}
            <div>
              <label className="text-[13px] font-medium text-[#0F172A] mb-1.5 block">
                工作区目录
              </label>
              <input
                type="text"
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="留空使用默认路径"
                className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-[#64748B] mt-1">
                默认: ~/.openclaw/workspace-{"{agent_id}"}
              </p>
            </div>

            {/* Agent Dir */}
            <div>
              <label className="text-[13px] font-medium text-[#0F172A] mb-1.5 block">
                Agent 状态目录
              </label>
              <input
                type="text"
                value={agentDir}
                onChange={(e) => setAgentDir(e.target.value)}
                placeholder="留空使用默认路径"
                className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-[#64748B] mt-1">
                默认: ~/.openclaw/agents/{"{agent_id}"}
              </p>
            </div>

            {/* Model */}
            <div>
              <label className="text-[13px] font-medium text-[#0F172A] mb-1.5 block">
                默认模型
              </label>
              <input
                type="text"
                list="agent-model-list"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="例如: openrouter/deepseek/deepseek-v3.2-exp"
                className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {availableModels.length > 0 && (
                <datalist id="agent-model-list">
                  {availableModels.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              )}
              <p className="text-xs text-[#64748B] mt-1">
                留空使用全局默认模型
                {availableModels.length > 0 && `，可从 ${availableModels.length} 个可用模型中选择`}
              </p>
            </div>

            {/* Bindings */}
            <div>
              <label className="text-[13px] font-medium text-[#0F172A] mb-1.5 block">
                初始绑定
              </label>
              <input
                type="text"
                value={bindings}
                onChange={(e) => setBindings(e.target.value)}
                placeholder="例如: telegram:account1, discord"
                className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-[#64748B] mt-1">
                多个绑定用逗号分隔，格式: channel:accountId
              </p>
            </div>
          </div>
        </form>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E5E7EB]">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMut.isPending}
            className="px-4 py-2 text-sm bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {createMut.isPending ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </>
  );
}
