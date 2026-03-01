import { useEffect, useState } from "react";
import { apiClient } from "../../../shared/api-client";
import { useLlmSettings } from "../../../shared/hooks/useLlmSettings";

const BUILTIN_PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    icon: "🚀",
    defaultModel: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    api: "openai-completions",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    icon: "🧠",
    defaultModel: "claude-opus-4-6",
    baseUrl: "https://api.anthropic.com",
    api: "anthropic-messages",
  },
  {
    id: "groq",
    label: "Groq",
    icon: "⚡",
    defaultModel: "llama-3.1-70b",
    baseUrl: "https://api.groq.com/openai/v1",
    api: "openai-completions",
  },
  {
    id: "moonshot",
    label: "Moonshot",
    icon: "🌙",
    defaultModel: "moonshot-v1-8k",
    baseUrl: "https://api.moonshot.cn/v1",
    api: "openai-completions",
  },
] as const;

const TEMPLATES: Record<string, { id: string; url: string; model: string }> = {
  ollama: { id: "local-ollama", url: "http://127.0.0.1:11434/v1", model: "llama3" },
  vllm: { id: "local-vllm", url: "http://127.0.0.1:8000/v1", model: "meta-llama-3-8b" },
  lmstudio: { id: "local-lmstudio", url: "http://127.0.0.1:1234/v1", model: "local-model" },
  moonshot: { id: "moonshot", url: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
};

// Sentinel value placed in the API Key field when a key already exists in the
// backend but we intentionally do not re-expose it in plaintext.
const MASKED_PLACEHOLDER = "•••••••••••";

interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

export function ProviderConfigView({ onRegisterSubmit, onDone }: Props) {
  const { data: llmSettings, isLoading } = useLlmSettings();

  const [activeTab, setActiveTab] = useState<"builtin" | "custom" | "market">("builtin");
  const [selectedId, setSelectedId] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [cId, setCId] = useState("");
  const [cUrl, setCUrl] = useState("");
  const [cModel, setCModel] = useState("");
  const [cName, setCName] = useState("");
  const [cApiKey, setCApiKey] = useState("");
  const [cApi, setCApi] = useState<"openai-completions" | "anthropic-messages">("openai-completions");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  // Prefill from backend on first load
  useEffect(() => {
    if (llmSettings && !initialized) {
      const primary = llmSettings.defaultModel.primary;
      if (primary) {
        const slashIdx = primary.indexOf("/");
        const provider = slashIdx > 0 ? primary.slice(0, slashIdx) : primary;
        const builtin = BUILTIN_PROVIDERS.find((p) => p.id === provider);

        if (builtin) {
          setActiveTab("builtin");
          setSelectedId(provider);
          // Show masked placeholder when API key already exists
          const providerConfig = llmSettings.providers[provider];
          if (providerConfig?.apiKey) {
            setApiKey(MASKED_PLACEHOLDER);
          }
        } else if (provider) {
          // Custom provider
          const providerConfig = llmSettings.providers[provider];
          if (providerConfig) {
            setActiveTab("custom");
            setCId(provider);
            setCUrl(providerConfig.baseUrl ?? "");
            setCApi((providerConfig.api as "openai-completions" | "anthropic-messages") ?? "openai-completions");
            if (providerConfig.apiKey) setCApiKey(MASKED_PLACEHOLDER);
            const firstModel = providerConfig.models?.[0];
            if (firstModel) {
              setCModel(firstModel.id);
              setCName(firstModel.name ?? "");
            }
          }
        }
      }
      setInitialized(true);
    }
  }, [llmSettings, initialized]);

  async function handleSave() {
    if (activeTab === "custom") {
      const errs: Record<string, boolean> = {};
      if (!cId.trim()) errs.cId = true;
      if (!cUrl.trim()) errs.cUrl = true;
      if (!cModel.trim()) errs.cModel = true;
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        throw new Error("请填写必填字段");
      }
      const customKeyToSave = cApiKey === MASKED_PLACEHOLDER ? undefined : cApiKey || undefined;
      await apiClient.put("/settings/llm", {
        providers: {
          [cId]: {
            baseUrl: cUrl,
            api: cApi,
            ...(customKeyToSave !== undefined && { apiKey: customKeyToSave }),
            models: [{ id: cModel, name: cName || cModel }],
          },
        },
        defaultModel: { primary: `${cId}/${cModel}` },
      });
    } else if (activeTab === "builtin") {
      const p = BUILTIN_PROVIDERS.find((b) => b.id === selectedId)!;
      // Skip updating API key if user left the masked placeholder unchanged
      const keyToSave = apiKey === MASKED_PLACEHOLDER ? undefined : apiKey;
      await apiClient.put("/settings/llm", {
        providers: {
          [p.id]: {
            baseUrl: p.baseUrl,
            api: p.api,
            ...(keyToSave !== undefined && { apiKey: keyToSave }),
            models: [{ id: p.defaultModel, name: p.defaultModel }],
          },
        },
        defaultModel: { primary: `${p.id}/${p.defaultModel}` },
      });
    }
    onDone();
  }

  // Register submit handler synchronously so parent always holds the latest closure.
  onRegisterSubmit(handleSave);

  function fillTemplate(name: string) {
    const t = TEMPLATES[name];
    if (!t) return;
    setCId(t.id);
    setCUrl(t.url);
    setCModel(t.model);
  }

  if (isLoading) {
    return (
      <div>
        <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
          step 2 / 6 · 必填
        </div>
        <h2 className="text-[20px] font-bold mb-1.5">LLM Provider 配置</h2>
        <p className="text-sm text-[#64748B] mb-4">选择并配置你的主要大模型服务提供商。</p>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[#F1F5F9] rounded-lg w-2/3" />
          <div className="grid grid-cols-4 gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-[#F1F5F9] rounded-[10px]" />
            ))}
          </div>
          <div className="h-[52px] bg-[#F1F5F9] rounded-lg" />
        </div>
      </div>
    );
  }

  const hasExistingConfig = initialized && !!llmSettings?.defaultModel.primary;

  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
        step 2 / 6 · 必填
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">LLM Provider 配置</h2>
      <p className="text-sm text-[#64748B] mb-4">选择并配置你的主要大模型服务提供商。</p>

      {hasExistingConfig && (
        <div className="flex items-center gap-1.5 text-[12px] text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg px-3 py-2 mb-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          已加载当前配置，修改 API Key 时请重新输入（出于安全原因不显示原始值）
        </div>
      )}

      <div className="flex border-b border-[#E5E7EB] mb-4">
        {(
          [
            ["builtin", "内置 Provider"],
            ["custom", "自定义 Provider"],
            ["market", "Marketplace 🛒"],
          ] as const
        ).map(([id, label]) => (
          <div
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3.5 py-2 text-[13px] font-medium cursor-pointer border-b-2 transition-colors whitespace-nowrap ${activeTab === id ? "text-[#2563EB] border-[#2563EB]" : "text-[#64748B] border-transparent hover:text-[#0F172A]"}`}
          >
            {label}
          </div>
        ))}
      </div>

      {activeTab === "builtin" && (
        <div>
          <div className="grid grid-cols-4 gap-2.5 mb-4">
            {BUILTIN_PROVIDERS.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`bg-white border rounded-[10px] p-3.5 cursor-pointer text-center transition-all hover:-translate-y-0.5 hover:shadow-lg ${selectedId === p.id ? "border-[#2563EB] bg-[#F0F7FF] shadow-[0_0_0_2px_rgba(37,99,235,0.1)]" : "border-[#E5E7EB] hover:border-[#93C5FD]"}`}
              >
                <div className="text-[22px] mb-1.5">{p.icon}</div>
                <div className="font-semibold text-[13px]">{p.label}</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">{p.defaultModel}</div>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1.5">
              API Key <span className="text-[#DC2626]">*</span>
            </label>
            <input
              type="password"
              value={apiKey}
              placeholder={apiKey === MASKED_PLACEHOLDER ? undefined : "sk-..."}
              onChange={(e) => setApiKey(e.target.value)}
              onFocus={() => {
                // Clear mask on focus so user can type a new key
                if (apiKey === MASKED_PLACEHOLDER) setApiKey("");
              }}
              className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD]"
            />
            <p className="text-xs text-[#64748B] mt-1">
              {apiKey === MASKED_PLACEHOLDER
                ? "已配置 API Key，点击输入框可重新设置"
                : "安全提示：Key 将加密存储，不上传云端"}
            </p>
          </div>
        </div>
      )}

      {activeTab === "custom" && (
        <div>
          <div className="flex gap-2 mb-3.5 flex-wrap">
            {Object.keys(TEMPLATES).map((name) => (
              <button
                key={name}
                onClick={() => fillTemplate(name)}
                className="bg-transparent text-[#64748B] border border-[#E5E7EB] px-2.5 py-1 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[#F8FAFC]"
              >
                {name}
              </button>
            ))}
          </div>
          <div className="flex gap-4 mb-[18px]">
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">
                Provider ID <span className="text-[#DC2626]">*</span>
              </label>
              <input
                value={cId}
                onChange={(e) => setCId(e.target.value)}
                placeholder="例如: local-ollama"
                className={`w-full px-3 py-[9px] text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cId ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">显示名称</label>
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="例如: Ollama Local"
                className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD]"
              />
            </div>
          </div>
          <div className="mb-[18px]">
            <label className="block text-[13px] font-medium mb-1.5">
              Base URL <span className="text-[#DC2626]">*</span>
            </label>
            <input
              value={cUrl}
              onChange={(e) => setCUrl(e.target.value)}
              placeholder="http://127.0.0.1:11434/v1"
              className={`w-full px-3 py-[9px] text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cUrl ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}
            />
          </div>
          <div className="mb-[18px]">
            <label className="block text-[13px] font-medium mb-1.5">API Key</label>
            <input
              type="password"
              value={cApiKey}
              onChange={(e) => setCApiKey(e.target.value)}
              onFocus={() => { if (cApiKey === MASKED_PLACEHOLDER) setCApiKey(""); }}
              placeholder="sk-... 或留空（本地无鉴权服务）"
              className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD] focus:ring-[3px] focus:ring-[rgba(147,197,253,0.25)]"
            />
            <p className="text-xs text-[#64748B] mt-1">
              支持环境变量引用，如 <span className="font-mono">${"{MY_API_KEY}"}</span>；本地服务可留空
            </p>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">
                Model ID <span className="text-[#DC2626]">*</span>
              </label>
              <input
                value={cModel}
                onChange={(e) => setCModel(e.target.value)}
                placeholder="例如: llama3"
                className={`w-full px-3 py-[9px] text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cModel ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">API 类型</label>
              <select
                value={cApi}
                onChange={(e) => setCApi(e.target.value as "openai-completions" | "anthropic-messages")}
                className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg bg-white outline-none"
              >
                <option value="openai-completions">OpenAI Compatible</option>
                <option value="anthropic-messages">Anthropic Compatible</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {activeTab === "market" && (
        <div className="bg-[#FAFAFA] border border-dashed border-[#E5E7EB] rounded-[10px] py-9 px-6 text-center text-[#64748B]">
          <div className="text-[36px] mb-3">🛒</div>
          <div className="font-semibold text-[#0F172A] text-[15px] mb-1.5">lysmata Marketplace</div>
          <div className="text-[13px] max-w-[300px] mx-auto leading-[1.6]">
            提供稳定的大模型 API 服务。购买额度后一键激活，无需自行配置网络与 Key。
          </div>
          <button className="mt-5 bg-[#2563EB] text-white border-none px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1D4ED8]">
            浏览大模型服务
          </button>
        </div>
      )}
    </div>
  );
}
