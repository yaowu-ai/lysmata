import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useBindAgent } from "../../shared/hooks/useAgents";
import type { Agent, AgentBinding } from "../../shared/types";

interface AgentBindingsDrawerProps {
  open: boolean;
  agent: Agent;
  bindings: AgentBinding[];
  onClose: () => void;
}

export function AgentBindingsDrawer({
  open,
  agent,
  bindings,
  onClose,
}: AgentBindingsDrawerProps) {
  const bindMut = useBindAgent();
  const [newBinding, setNewBinding] = useState("");

  function handleAddBinding(e: React.FormEvent) {
    e.preventDefault();

    if (!newBinding.trim()) {
      alert("绑定不能为空");
      return;
    }

    // 验证格式：channel 或 channel:accountId
    if (!/^[a-z0-9_-]+(:[a-z0-9_-]+)?$/i.test(newBinding)) {
      alert("绑定格式错误，应为 channel 或 channel:accountId");
      return;
    }

    bindMut.mutate(
      {
        agent: agent.id,
        bindings: [newBinding.trim()],
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            alert(result.message || "绑定成功");
            setNewBinding("");
          } else {
            alert(result.message || "绑定失败");
          }
        },
        onError: (err) => {
          alert(`绑定失败: ${err}`);
        },
      }
    );
  }

  if (!open) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* 抽屉 */}
      <div className="fixed right-0 top-0 bottom-0 w-[500px] bg-white shadow-xl z-50 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">
              管理绑定
            </h2>
            <p className="text-sm text-[#64748B] mt-0.5">Agent: {agent.id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* 添加新绑定 */}
          <form onSubmit={handleAddBinding} className="mb-6">
            <label className="text-[13px] font-medium text-[#0F172A] mb-1.5 block">
              添加新绑定
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newBinding}
                onChange={(e) => setNewBinding(e.target.value)}
                placeholder="例如: telegram:account1"
                className="flex-1 px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={bindMut.isPending}
                className="px-4 py-2 text-sm bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <Plus size={14} />
                添加
              </button>
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              格式: channel 或 channel:accountId
            </p>
          </form>

          {/* 现有绑定列表 */}
          <div>
            <h3 className="text-[13px] font-medium text-[#0F172A] mb-2">
              当前绑定 ({bindings.length})
            </h3>

            {bindings.length === 0 ? (
              <div className="text-sm text-[#64748B] py-4 text-center border border-dashed border-[#E5E7EB] rounded-lg">
                暂无绑定
              </div>
            ) : (
              <div className="space-y-2">
                {bindings.map((binding, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-gray-50 border border-[#E5E7EB] rounded-lg px-3 py-2"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[#0F172A]">
                        {binding.channel}
                        {binding.accountId && (
                          <span className="text-[#64748B]">
                            :{binding.accountId}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="p-1.5 text-[#64748B] hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="删除绑定"
                      onClick={() => {
                        alert("删除绑定功能待实现");
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E5E7EB]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </>
  );
}
