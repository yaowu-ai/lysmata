import { useState } from 'react';
import { apiClient } from '../../../shared/api-client';

const BUILTIN_PROVIDERS = [
  { id: 'openai',    label: 'OpenAI',    icon: '🚀', defaultModel: 'gpt-4o',          baseUrl: 'https://api.openai.com/v1',      api: 'openai'    },
  { id: 'anthropic', label: 'Anthropic', icon: '🧠', defaultModel: 'claude-opus-4-6', baseUrl: 'https://api.anthropic.com',      api: 'anthropic' },
  { id: 'groq',      label: 'Groq',      icon: '⚡', defaultModel: 'llama-3.1-70b',  baseUrl: 'https://api.groq.com/openai/v1', api: 'openai'    },
  { id: 'moonshot',  label: 'Moonshot',  icon: '🌙', defaultModel: 'moonshot-v1-8k', baseUrl: 'https://api.moonshot.cn/v1',     api: 'openai'    },
] as const;

const TEMPLATES: Record<string, { id: string; url: string; model: string }> = {
  ollama:   { id: 'local-ollama',   url: 'http://127.0.0.1:11434/v1', model: 'llama3' },
  vllm:     { id: 'local-vllm',     url: 'http://127.0.0.1:8000/v1',  model: 'meta-llama-3-8b' },
  lmstudio: { id: 'local-lmstudio', url: 'http://127.0.0.1:1234/v1',  model: 'local-model' },
  moonshot: { id: 'moonshot',       url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
};

interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

export function ProviderConfigView({ onRegisterSubmit, onDone }: Props) {
  const [activeTab, setActiveTab] = useState<'builtin' | 'custom' | 'market'>('builtin');
  const [selectedId, setSelectedId] = useState('openai');
  const [apiKey,  setApiKey]  = useState('');
  const [cId,     setCId]     = useState('');
  const [cUrl,    setCUrl]    = useState('');
  const [cModel,  setCModel]  = useState('');
  const [cName,   setCName]   = useState('');
  const [cApi,    setCApi]    = useState<'openai' | 'anthropic'>('openai');
  const [errors,  setErrors]  = useState<Record<string, boolean>>({});

  async function handleSave() {
    if (activeTab === 'custom') {
      const errs: Record<string, boolean> = {};
      if (!cId.trim())    errs.cId    = true;
      if (!cUrl.trim())   errs.cUrl   = true;
      if (!cModel.trim()) errs.cModel = true;
      if (Object.keys(errs).length > 0) { setErrors(errs); throw new Error('请填写必填字段'); }
      await apiClient.put('/settings/llm', {
        providers: { [cId]: { baseUrl: cUrl, api: cApi, models: [{ id: cModel, name: cName || cModel }] } },
        defaultModel: { primary: `${cId}/${cModel}` },
      });
    } else if (activeTab === 'builtin') {
      const p = BUILTIN_PROVIDERS.find((b) => b.id === selectedId)!;
      await apiClient.put('/settings/llm', {
        providers: { [p.id]: { baseUrl: p.baseUrl, api: p.api, apiKey, models: [{ id: p.defaultModel, name: p.defaultModel }] } },
        defaultModel: { primary: `${p.id}/${p.defaultModel}` },
      });
    }
    onDone();
  }

  // Register submit handler synchronously so parent always holds the latest closure.
  onRegisterSubmit(handleSave);

  function fillTemplate(name: string) {
    const t = TEMPLATES[name]; if (!t) return;
    setCId(t.id); setCUrl(t.url); setCModel(t.model);
  }

  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
        step 2 / 6 · 必填
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">LLM Provider 配置</h2>
      <p className="text-sm text-[#64748B] mb-4">选择并配置你的主要大模型服务提供商。</p>

      <div className="flex border-b border-[#E5E7EB] mb-4">
        {([['builtin','内置 Provider'],['custom','自定义 Provider'],['market','Marketplace 🛒']] as const).map(([id, label]) => (
          <div key={id} onClick={() => setActiveTab(id)}
            className={`px-3.5 py-2 text-[13px] font-medium cursor-pointer border-b-2 transition-colors whitespace-nowrap ${activeTab === id ? 'text-[#2563EB] border-[#2563EB]' : 'text-[#64748B] border-transparent hover:text-[#0F172A]'}`}>
            {label}
          </div>
        ))}
      </div>

      {activeTab === 'builtin' && (
        <div>
          <div className="grid grid-cols-4 gap-2.5 mb-4">
            {BUILTIN_PROVIDERS.map((p) => (
              <div key={p.id} onClick={() => setSelectedId(p.id)}
                className={`bg-white border rounded-[10px] p-3.5 cursor-pointer text-center transition-all hover:-translate-y-0.5 hover:shadow-lg ${selectedId === p.id ? 'border-[#2563EB] bg-[#F0F7FF] shadow-[0_0_0_2px_rgba(37,99,235,0.1)]' : 'border-[#E5E7EB] hover:border-[#93C5FD]'}`}>
                <div className="text-[22px] mb-1.5">{p.icon}</div>
                <div className="font-semibold text-[13px]">{p.label}</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">{p.defaultModel}</div>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1.5">API Key <span className="text-[#DC2626]">*</span></label>
            <input type="password" value={apiKey} placeholder="sk-..." onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD]" />
            <p className="text-xs text-[#64748B] mt-1">安全提示：Key 将加密存储，不上传云端</p>
          </div>
        </div>
      )}

      {activeTab === 'custom' && (
        <div>
          <div className="flex gap-2 mb-3.5 flex-wrap">
            {Object.keys(TEMPLATES).map((name) => (
              <button key={name} onClick={() => fillTemplate(name)}
                className="bg-transparent text-[#64748B] border border-[#E5E7EB] px-2.5 py-1 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[#F8FAFC]">{name}</button>
            ))}
          </div>
          <div className="flex gap-4 mb-[18px]">
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">Provider ID <span className="text-[#DC2626]">*</span></label>
              <input value={cId} onChange={(e) => setCId(e.target.value)} placeholder="例如: local-ollama"
                className={`w-full px-3 py-[9px] text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cId ? 'border-[#DC2626]' : 'border-[#E5E7EB]'}`} />
            </div>
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">显示名称</label>
              <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="例如: Ollama Local"
                className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD]" />
            </div>
          </div>
          <div className="mb-[18px]">
            <label className="block text-[13px] font-medium mb-1.5">Base URL <span className="text-[#DC2626]">*</span></label>
            <input value={cUrl} onChange={(e) => setCUrl(e.target.value)} placeholder="http://127.0.0.1:11434/v1"
              className={`w-full px-3 py-[9px] text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cUrl ? 'border-[#DC2626]' : 'border-[#E5E7EB]'}`} />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">Model ID <span className="text-[#DC2626]">*</span></label>
              <input value={cModel} onChange={(e) => setCModel(e.target.value)} placeholder="例如: llama3"
                className={`w-full px-3 py-[9px] text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cModel ? 'border-[#DC2626]' : 'border-[#E5E7EB]'}`} />
            </div>
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">API 类型</label>
              <select value={cApi} onChange={(e) => setCApi(e.target.value as 'openai' | 'anthropic')}
                className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg bg-white outline-none">
                <option value="openai">OpenAI Compatible</option>
                <option value="anthropic">Anthropic Compatible</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'market' && (
        <div className="bg-[#FAFAFA] border border-dashed border-[#E5E7EB] rounded-[10px] py-9 px-6 text-center text-[#64748B]">
          <div className="text-[36px] mb-3">🛒</div>
          <div className="font-semibold text-[#0F172A] text-[15px] mb-1.5">lysmata Marketplace</div>
          <div className="text-[13px] max-w-[300px] mx-auto leading-[1.6]">提供稳定的大模型 API 服务。购买额度后一键激活，无需自行配置网络与 Key。</div>
          <button className="mt-5 bg-[#2563EB] text-white border-none px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1D4ED8]">浏览大模型服务</button>
        </div>
      )}
    </div>
  );
}
