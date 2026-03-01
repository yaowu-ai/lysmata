import { useState } from 'react';
import { apiClient } from '../../../shared/api-client';

interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

export function GatewayConfigView({ onRegisterSubmit, onDone }: Props) {
  const [port,      setPort]      = useState(18789);
  const [bindAddr,  setBindAddr]  = useState('127.0.0.1');
  const [authMode,  setAuthMode]  = useState<'none' | 'token'>('none');
  const [autostart, setAutostart] = useState(true);

  async function handleSave() {
    await apiClient.post('/openclaw/gateway-config', {
      port, bindAddress: bindAddr, authMode, autostart,
    });
    onDone();
  }

  // Register submit handler synchronously on every render so parent always
  // holds the latest closure (avoids stale state in the callback).
  onRegisterSubmit(handleSave);

  return (
    <div>
      <div className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
        step 1 / 6 · 必填
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">Gateway 配置</h2>
      <p className="text-sm text-[#64748B] mb-5">设置 OpenClaw Gateway 的基础运行参数。</p>

      <div className="flex gap-4 mb-[18px]">
        <div className="flex-1">
          <label className="block text-[13px] font-medium mb-1.5">绑定地址</label>
          <input type="text" value={bindAddr} onChange={(e) => setBindAddr(e.target.value)}
            className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD] focus:ring-[3px] focus:ring-[rgba(147,197,253,0.25)]" />
          <p className="text-xs text-[#64748B] mt-1">本地使用保持 127.0.0.1；局域网共享可设为 0.0.0.0</p>
        </div>
        <div className="flex-1">
          <label className="block text-[13px] font-medium mb-1.5">监听端口</label>
          <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))}
            className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD] focus:ring-[3px] focus:ring-[rgba(147,197,253,0.25)]" />
          <p className="text-xs text-[#64748B] mt-1">默认 18789，若有冲突请修改</p>
        </div>
      </div>

      <div className="mb-[18px]">
        <label className="block text-[13px] font-medium mb-1.5">认证模式</label>
        <select value={authMode} onChange={(e) => setAuthMode(e.target.value as 'none' | 'token')}
          className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg bg-white outline-none focus:border-[#93C5FD] appearance-none">
          <option value="none">None（本地无感，推荐）</option>
          <option value="token">Token（需鉴权）</option>
        </select>
        <p className="text-xs text-[#64748B] mt-1">建议本地环境使用 None，提升开发体验</p>
      </div>

      <div className="flex items-center justify-between px-4 py-3.5 bg-[#FAFAFA] border border-[#E5E7EB] rounded-[10px]">
        <div>
          <div className="text-sm font-medium">开机自启 (Daemon)</div>
          <div className="text-xs text-[#64748B] mt-0.5">让 Gateway 作为后台服务随系统启动</div>
        </div>
        <div className="cursor-pointer" onClick={() => setAutostart((v) => !v)}>
          <div className={`relative w-9 h-5 rounded-[10px] transition-colors ${autostart ? 'bg-[#2563EB]' : 'bg-[#CBD5E1]'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autostart ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
