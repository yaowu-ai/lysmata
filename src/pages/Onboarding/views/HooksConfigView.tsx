import { useState } from "react";

interface Hook {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
}

interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

const DEFAULT_HOOKS: Hook[] = [
  {
    id: "global-logger",
    name: "全局日志拦截器",
    path: "/hooks/global-logger.js",
    enabled: true,
  },
];

export function HooksConfigView({ onRegisterSubmit, onDone }: Props) {
  const [hooks, setHooks] = useState<Hook[]>(DEFAULT_HOOKS);

  function toggle(id: string) {
    setHooks((prev) => prev.map((h) => (h.id === id ? { ...h, enabled: !h.enabled } : h)));
  }

  // No backend write at onboarding stage — hooks are managed post-setup.
  onRegisterSubmit(async () => {
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
      </div>

      <button className="mt-2.5 w-full flex items-center justify-center gap-1.5 bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        注册新 Hook
      </button>

      <div className="mt-4 px-4 py-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg text-[13px] text-[#1E40AF] leading-[1.5]">
        Hooks 支持热重载，变更后无需重启 Gateway 即可生效。
      </div>
    </div>
  );
}
