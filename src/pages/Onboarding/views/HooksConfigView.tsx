import { useEffect, useRef, useState } from "react";
import { useHookSettings, useUpdateHookSettings } from "../../../shared/hooks/useHookSettings";
import type { HookEntry } from "../../../shared/types";

interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

const DEFAULT_HOOKS: HookEntry[] = [
  {
    id: "global-logger",
    name: "全局日志拦截器",
    path: "/hooks/global-logger.js",
    enabled: true,
  },
];

export function HooksConfigView({ onRegisterSubmit, onDone }: Props) {
  const { data: backendHooks } = useHookSettings();
  const updateHooks = useUpdateHookSettings();

  const [hooks, setHooks] = useState<HookEntry[]>(DEFAULT_HOOKS);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const submittedRef = useRef(false);

  useEffect(() => {
    if (backendHooks) {
      setHooks(backendHooks.length > 0 ? backendHooks : DEFAULT_HOOKS);
    }
  }, [backendHooks]);

  function toggle(id: string) {
    setHooks((prev) => prev.map((h) => (h.id === id ? { ...h, enabled: !h.enabled } : h)));
  }

  function confirmAddHook() {
    if (!newName.trim() || !newPath.trim()) return;
    const id = newName.trim().toLowerCase().replace(/\\s+/g, "-");
    setHooks((prev) => [...prev, { id, name: newName.trim(), path: newPath.trim(), enabled: true }]);
    setShowAddForm(false);
    setNewName("");
    setNewPath("");
  }

  onRegisterSubmit(async () => {
    if (!submittedRef.current) {
      submittedRef.current = true;
      await updateHooks.mutateAsync(hooks);
    }
    onDone();
  });

  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] border border-[#E5E7EB] mb-2.5">
        step 5 / 6 · 可跳过
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">Hooks 配置</h2>
      <p className="text-sm text-[#64748B] mb-5">设置请求的预处理或后处理钩子逻辑，默认关闭。</p>

      <div className="space-y-2.5">
        {hooks.map((hook) => (
          <div
            key={hook.id}
            className="bg-[#FAFAFA] border border-[#E5E7EB] rounded-[10px] p-4"
          >
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="text-sm font-medium">{hook.name}</div>
                <div className="text-[12px] text-[#64748B] mt-0.5 font-mono">path: {hook.path}</div>
              </div>
              <div className="cursor-pointer flex-shrink-0" onClick={() => toggle(hook.id)}>
                <div
                  className={`relative w-9 h-5 rounded-[10px] transition-colors ${hook.enabled ? "bg-[#2563EB]" : "bg-[#CBD5E1]"}`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hook.enabled ? "translate-x-[18px]" : "translate-x-0.5"}`}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        {showAddForm && (
          <div className="px-4 py-3.5 bg-[#F8FAFC] border border-[#BFDBFE] rounded-[10px] space-y-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Hook 名称（如：请求日志）"
              className="w-full px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#2563EB] bg-white"
            />
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmAddHook();
                if (e.key === "Escape") setShowAddForm(false);
              }}
              placeholder="脚本路径（如：/hooks/my-hook.js）"
              className="w-full px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#2563EB] bg-white font-mono"
            />
            <div className="flex gap-2">
              <button
                onClick={confirmAddHook}
                className="flex-1 bg-[#2563EB] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#1D4ED8] transition-colors"
              >
                确认注册
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 bg-transparent text-[#64748B] border border-[#E5E7EB] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#F1F5F9] transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          注册新 Hook
        </button>
      )}

      <div className="mt-4 px-4 py-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg text-[13px] text-[#1E40AF] leading-[1.5]">
        Hooks 支持热重载，变更后无需重启 Gateway 即可生效。
      </div>
    </div>
  );
}
