import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useCreateAgent, useUpdateAgent } from "../../shared/hooks/useAgents";
import { useAvailableModels } from "../../shared/hooks/useAvailableModels";
import { useLlmSettings } from "../../shared/hooks/useLlmSettings";
import { useToast } from "../../components/Toast";
import type { Agent, CreateAgentInput } from "../../shared/types";

interface AgentFormDrawerProps {
  open: boolean;
  /** Pass an existing agent to enter edit mode */
  agent?: Agent | null;
  onClose: () => void;
  /** Called after a successful save with the agent ID */
  onSaved?: (agentId: string) => void;
}

export function AgentFormDrawer({ open, agent, onClose, onSaved }: AgentFormDrawerProps) {
  const isEditing = !!agent;
  const createMut = useCreateAgent();
  const updateMut = useUpdateAgent();
  const { data: availableModels = [] } = useAvailableModels();
  const { data: llmSettings } = useLlmSettings();
  const toast = useToast();

  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [agentDir, setAgentDir] = useState("");
  const [model, setModel] = useState("");
  const [bindings, setBindings] = useState("");
  const [error, setError] = useState("");

  // Build a flat model list from configured providers + CLI available models
  const providerModels: string[] = llmSettings
    ? Object.entries(llmSettings.providers).flatMap(([providerKey, provider]) =>
        provider.models.map((m) => `${providerKey}/${m.id}`),
      )
    : [];
  const allModels = Array.from(new Set([...providerModels, ...availableModels]));

  useEffect(() => {
    if (!open) return;
    if (isEditing && agent) {
      setModel(agent.model ?? "");
    } else {
      setName("");
      setWorkspace("");
      setAgentDir("");
      setModel("");
      setBindings("");
    }
    setError("");
  }, [open, agent, isEditing]);

  function handleClose() {
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (isEditing) {
      if (!model.trim()) {
        setError("模型不能为空");
        return;
      }
      updateMut.mutate(
        { id: agent!.id, model: model.trim() },
        {
          onSuccess: (result) => {
            if (result.success) {
              toast.success(result.message ?? "模型已更新");
              onSaved ? onSaved(agent!.id) : handleClose();
            } else {
              setError(result.message ?? "更新失败");
            }
          },
          onError: (err) => setError(String(err)),
        },
      );
    } else {
      if (!name.trim()) {
        setError("Agent ID 不能为空");
        return;
      }
      if (!/^[a-z0-9-]+$/.test(name.trim())) {
        setError("Agent ID 只能包含小写字母、数字和连字符");
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
            toast.success(result.message ?? "Agent 创建成功");
            onSaved ? onSaved(name.trim()) : handleClose();
          } else {
            setError(result.message ?? "创建失败");
          }
        },
        onError: (err) => setError(String(err)),
      });
    }
  }

  const isPending = isEditing ? updateMut.isPending : createMut.isPending;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={handleClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[500px] bg-white shadow-xl z-50 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-semibold text-[#0F172A]">
            {isEditing ? `编辑 Agent · ${agent!.id}` : "添加 Agent"}
          </h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* 错误提示 */}
            {error && (
              <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* 编辑模式：只显示模型字段 */}
            {isEditing ? (
              <div>
                <label className="text-[13px] font-medium text-[#0F172A] mb-1.5 block">
                  默认模型
                </label>
                <ModelSelect
                  value={model}
                  onChange={setModel}
                  models={allModels}
                />
                <p className="text-xs text-[#64748B] mt-1">
                  格式：<span className="font-mono">provider/model-id</span>，例如{" "}
                  <span className="font-mono">openai/gpt-4o</span>
                </p>
              </div>
            ) : (
              <>
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
                  />
                  <p className="text-xs text-[#64748B] mt-1">只能包含小写字母、数字和连字符</p>
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
                  <ModelSelect
                    value={model}
                    onChange={setModel}
                    models={allModels}
                  />
                  <p className="text-xs text-[#64748B] mt-1">
                    留空使用全局默认模型
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
              </>
            )}
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
            disabled={isPending}
            className="px-4 py-2 text-sm bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? (isEditing ? "保存中..." : "创建中...") : isEditing ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Model selector with grouped options + free-text fallback ────────────────

function ModelSelect({
  value,
  onChange,
  models,
}: {
  value: string;
  onChange: (v: string) => void;
  models: string[];
}) {
  const isCustom = value !== "" && !models.includes(value);

  return (
    <div className="space-y-1.5">
      <select
        value={isCustom ? "__custom__" : value}
        onChange={(e) => {
          if (e.target.value !== "__custom__") onChange(e.target.value);
        }}
        className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— 留空使用全局默认 —</option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value="__custom__">自定义输入...</option>
      </select>
      {/* 自定义输入框：当选了"自定义"或者当前值不在列表里时显示 */}
      {(isCustom || value === "") && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例如: openai/gpt-4o"
          className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
      )}
    </div>
  );
}
