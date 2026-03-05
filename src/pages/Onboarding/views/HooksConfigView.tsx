import { useEffect, useRef, useState } from "react";
import { useHookSettings, useUpdateHookSettings } from "../../../shared/hooks/useHookSettings";
import type { HookEntry } from "../../../shared/types";

interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

const DEFAULT_HOOKS: HookEntry[] = [];

export function HooksConfigView({ onRegisterSubmit, onDone }: Props) {
  const { data: backendHooks } = useHookSettings();
  const updateHooks = useUpdateHookSettings();

  const [hooks, setHooks] = useState<HookEntry[]>(DEFAULT_HOOKS);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (backendHooks) {
      setHooks(backendHooks.length > 0 ? backendHooks : DEFAULT_HOOKS);
    }
  }, [backendHooks]);

  function toggle(id: string) {
    setHooks((prev) => prev.map((h) => (h.id === id ? { ...h, enabled: !h.enabled } : h)));
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
      <p className="text-sm text-[#64748B] mb-5">启用或禁用 OpenClaw 内置 Hook，控制 Gateway 行为。</p>

      <div className="space-y-2.5">
        {hooks.length === 0 && (
          <div className="text-sm text-[#94A3B8] text-center py-6">
            加载 Hook 列表中...
          </div>
        )}
        {hooks.map((hook) => (
          <div
            key={hook.id}
            className="bg-[#FAFAFA] border border-[#E5E7EB] rounded-[10px] p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {hook.emoji ? `${hook.emoji} ` : ""}{hook.name ?? hook.id}
                </div>
                {hook.description && (
                  <div className="text-[12px] text-[#64748B] mt-0.5 leading-[1.5]">{hook.description}</div>
                )}
              </div>
              <div className="cursor-pointer flex-shrink-0 ml-3" onClick={() => toggle(hook.id)}>
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

      <div className="mt-4 px-4 py-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg text-[13px] text-[#1E40AF] leading-[1.5]">
        Hooks 支持热重载，变更后无需重启 Gateway 即可生效。
      </div>
    </div>
  );
}
