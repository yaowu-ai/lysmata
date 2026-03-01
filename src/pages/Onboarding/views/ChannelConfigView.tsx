import { useState } from "react";

interface Channel {
  id: string;
  label: string;
  token: string;
  enabled: boolean;
}

interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

const DEFAULT_CHANNELS: Channel[] = [
  { id: "lysmata-desktop", label: "Lysmata 桌面端", token: "sk-lysmata-desktop-local", enabled: true },
  { id: "vscode-extension", label: "VS Code 插件", token: "sk-vscode-extension", enabled: false },
];

export function ChannelConfigView({ onRegisterSubmit, onDone }: Props) {
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS);

  function toggle(id: string) {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  }

  // No backend write for now — channel config is managed post-setup in Settings.
  onRegisterSubmit(async () => {
    onDone();
  });

  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] border border-[#E5E7EB] mb-2.5">
        step 3 / 6 · 可跳过
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">Channel 配置</h2>
      <p className="text-sm text-[#64748B] mb-5">配置可接入 Gateway 的客户端通道白名单与鉴权。</p>

      <div className="space-y-2.5">
        {channels.map((ch) => (
          <div
            key={ch.id}
            className="flex items-center justify-between px-4 py-3.5 bg-[#FAFAFA] border border-[#E5E7EB] rounded-[10px]"
          >
            <div>
              <div className="text-sm font-medium">{ch.label}</div>
              <div className="text-xs text-[#64748B] mt-0.5 font-mono">Token: {ch.token}</div>
            </div>
            <div className="cursor-pointer flex-shrink-0" onClick={() => toggle(ch.id)}>
              <div
                className={`relative w-9 h-5 rounded-[10px] transition-colors ${ch.enabled ? "bg-[#2563EB]" : "bg-[#CBD5E1]"}`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${ch.enabled ? "translate-x-[18px]" : "translate-x-0.5"}`}
                />
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
        添加新 Channel
      </button>
    </div>
  );
}
