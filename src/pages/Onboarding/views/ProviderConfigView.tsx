import { useEffect, useState } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
import { apiClient } from "../../../shared/api-client";
import { useLlmSettings, useProviderApiKey, useSaveProviderApiKey } from "../../../shared/hooks/useLlmSettings";
import { PROVIDER_GROUPS, ALL_PRESETS, findPreset } from "../../Settings/provider-presets";

const MASKED_PLACEHOLDER = "•••••••••••";

// Provider icons keyed by preset id
const PROVIDER_ICONS: Record<string, string> = {
  openai: "🚀", anthropic: "🧠", google: "✨", openrouter: "🔀",
  groq: "⚡", xai: "𝕏", mistral: "🌬️", cerebras: "🔬", minimax: "🎯",
  zai: "🤖", "kimi-coding": "🌙", "minimax-cn": "🎯",
  deepseek: "🐋", moonshot: "🌕", qwen: "☁️", doubao: "🫘",
  baichuan: "🏔️", siliconflow: "💎", ollama: "🦙", lmstudio: "🖥️",
};

const CUSTOM_TEMPLATES = [
  { name: "Ollama", id: "ollama", url: "http://127.0.0.1:11434/v1", model: "llama3", api: "openai-completions" as const },
  { name: "LM Studio", id: "lmstudio", url: "http://127.0.0.1:1234/v1", model: "local-model", api: "openai-completions" as const },
  { name: "vLLM", id: "vllm", url: "http://127.0.0.1:8000/v1", model: "meta-llama-3-8b", api: "openai-completions" as const },
];

interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

// Sub-component: loads existing API key for a built-in provider
function ExistingKeyLoader({
  providerKey,
  onLoaded,
}: {
  providerKey: string;
  onLoaded: (key: string | null) => void;
}) {
  const { data } = useProviderApiKey(providerKey);
  useEffect(() => {
    if (data !== undefined) onLoaded(data.apiKey);
  }, [data, onLoaded]);
  return null;
}

export function ProviderConfigView({ onRegisterSubmit, onDone }: Props) {
  const { data: llmSettings, isLoading } = useLlmSettings();
  const { mutateAsync: saveApiKey } = useSaveProviderApiKey();

  const [activeTab, setActiveTab] = useState<"builtin" | "custom" | "market">("builtin");

  // Built-in provider selection
  const [selectedId, setSelectedId] = useState("zai");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("");

  // Custom provider fields
  const [cId, setCId] = useState("");
  const [cUrl, setCUrl] = useState("");
  const [cModel, setCModel] = useState("");
  const [cName, setCName] = useState("");
  const [cApiKey, setCApiKey] = useState("");
  const [showCApiKey, setShowCApiKey] = useState(false);
  const [cApi, setCApi] = useState<"openai-completions" | "anthropic-messages">("openai-completions");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  const selectedPreset = findPreset(selectedId);

  // When provider changes, reset model selection to first model of that preset
  useEffect(() => {
    if (selectedPreset?.models.length) {
      setSelectedModelId(selectedPreset.models[0].id);
    }
  }, [selectedId, selectedPreset]);

  // Prefill from backend on first load
  useEffect(() => {
    if (llmSettings && !initialized) {
      const primary = llmSettings.defaultModel.primary;
      if (primary) {
        const slashIdx = primary.indexOf("/");
        const provider = slashIdx > 0 ? primary.slice(0, slashIdx) : primary;
        const model = slashIdx > 0 ? primary.slice(slashIdx + 1) : "";
        const preset = findPreset(provider);

        if (preset) {
          setActiveTab("builtin");
          setSelectedId(provider);
          if (model) setSelectedModelId(model);
        } else if (provider) {
          const providerConfig = llmSettings.providers[provider];
          if (providerConfig) {
            setActiveTab("custom");
            setCId(provider);
            setCUrl(providerConfig.baseUrl ?? "");
            setCApi((providerConfig.api as "openai-completions" | "anthropic-messages") ?? "openai-completions");
            if (providerConfig.apiKey) setCApiKey(MASKED_PLACEHOLDER);
            const firstModel = providerConfig.models?.[0];
            if (firstModel) { setCModel(firstModel.id); setCName(firstModel.name ?? ""); }
          }
        }
      }
      setInitialized(true);
    }
  }, [llmSettings, initialized]);

  async function handleSave() {
    if (activeTab === "builtin") {
      if (!selectedPreset) throw new Error("请选择供应商");
      if (!selectedModelId) throw new Error("请选择模型");

      // Save API key to agent auth-profiles (not openclaw.json)
      const keyToSave = apiKey && apiKey !== MASKED_PLACEHOLDER ? apiKey.trim() : null;
      if (keyToSave) {
        await saveApiKey({ key: selectedId, apiKey: keyToSave });
      }

      // Save model selection to alias table only (no models.providers entry for built-in)
      const model = selectedPreset.models.find((m) => m.id === selectedModelId);
      await apiClient.put("/settings/llm", {
        providers: {
          [selectedId]: {
            // No baseUrl/apiKey — built-in provider
            models: [{ id: selectedModelId, name: model?.name ?? selectedModelId }],
          },
        },
        defaultModel: { primary: `${selectedId}/${selectedModelId}` },
      });
    } else {
      const errs: Record<string, boolean> = {};
      if (!cId.trim()) errs.cId = true;
      if (!cUrl.trim()) errs.cUrl = true;
      if (!cModel.trim()) errs.cModel = true;
      if (Object.keys(errs).length > 0) { setErrors(errs); throw new Error("请填写必填字段"); }

      const keyToSave = cApiKey === MASKED_PLACEHOLDER ? undefined : cApiKey || undefined;
      await apiClient.put("/settings/llm", {
        providers: {
          [cId]: {
            baseUrl: cUrl,
            api: cApi,
            ...(keyToSave !== undefined && { apiKey: keyToSave }),
            models: [{ id: cModel, name: cName || cModel }],
          },
        },
        defaultModel: { primary: `${cId}/${cModel}` },
      });
    }
    onDone();
  }

  onRegisterSubmit(handleSave);

  if (isLoading) {
    return (
      <div>
        <StepBadge />
        <h2 className="text-[20px] font-bold mb-1.5">LLM Provider 配置</h2>
        <p className="text-sm text-[#64748B] mb-4">选择并配置你的主要大模型服务提供商。</p>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-[#F1F5F9] rounded-lg w-2/3" />
          <div className="grid grid-cols-4 gap-2 h-32 bg-[#F1F5F9] rounded-lg" />
          <div className="h-12 bg-[#F1F5F9] rounded-lg" />
        </div>
      </div>
    );
  }

  const hasExistingConfig = initialized && !!llmSettings?.defaultModel.primary;

  return (
    <div>
      <StepBadge />
      <h2 className="text-[20px] font-bold mb-1.5">LLM Provider 配置</h2>
      <p className="text-sm text-[#64748B] mb-4">选择并配置你的主要大模型服务提供商。</p>

      {hasExistingConfig && (
        <div className="flex items-center gap-1.5 text-[12px] text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg px-3 py-2 mb-3">
          <Info size={12} />
          已加载当前配置，修改 API Key 时请重新输入（出于安全原因不显示原始值）
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#E5E7EB] mb-4">
        {([["builtin", "内置 Provider"], ["custom", "自定义 Provider"], ["market", "Marketplace 🛒"]] as const).map(([id, label]) => (
          <div
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3.5 py-2 text-[13px] font-medium cursor-pointer border-b-2 transition-colors whitespace-nowrap ${
              activeTab === id ? "text-[#2563EB] border-[#2563EB]" : "text-[#64748B] border-transparent hover:text-[#0F172A]"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* ── Built-in providers ── */}
      {activeTab === "builtin" && (
        <div className="space-y-4">
          {PROVIDER_GROUPS.filter((g) => g.providers.some((p) => p.builtin)).map((group) => (
            <div key={group.label}>
              <div className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                {group.label}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {group.providers.filter((p) => p.builtin).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`bg-white border rounded-[10px] p-3 text-center transition-all hover:-translate-y-0.5 hover:shadow-md ${
                      selectedId === p.id
                        ? "border-[#2563EB] bg-[#F0F7FF] shadow-[0_0_0_2px_rgba(37,99,235,0.1)]"
                        : "border-[#E5E7EB] hover:border-[#93C5FD]"
                    }`}
                  >
                    <div className="text-[20px] mb-1">{PROVIDER_ICONS[p.id] ?? "🔌"}</div>
                    <div className="font-semibold text-[12px] leading-tight">{p.label}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Selected provider details */}
          {selectedPreset && (
            <div className="border border-[#E5E7EB] rounded-xl p-4 space-y-3 bg-[#FAFAFA]">
              <div className="flex items-center gap-2">
                <span className="text-lg">{PROVIDER_ICONS[selectedPreset.id] ?? "🔌"}</span>
                <span className="font-semibold text-sm">{selectedPreset.label}</span>
                <span className="text-[11px] text-[#94A3B8] font-mono ml-auto">id: {selectedPreset.id}</span>
              </div>

              {/* Load existing key from agent auth-profiles */}
              {initialized && (
                <ExistingKeyLoader
                  providerKey={selectedId}
                  onLoaded={(key) => {
                    if (key && !apiKey) setApiKey(MASKED_PLACEHOLDER);
                  }}
                />
              )}

              {/* Model selection */}
              <div>
                <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">默认模型</label>
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg bg-white outline-none focus:border-[#93C5FD]"
                >
                  {selectedPreset.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">
                  API Key
                  <span className="ml-1 font-normal text-[#94A3B8]">（可选，留空则使用 CLI 认证）</span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    placeholder={apiKey === MASKED_PLACEHOLDER ? undefined : "粘贴 API Key..."}
                    onChange={(e) => setApiKey(e.target.value)}
                    onFocus={() => { if (apiKey === MASKED_PLACEHOLDER) setApiKey(""); }}
                    className="w-full px-3 py-2 pr-9 text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD] font-mono bg-white"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                    tabIndex={-1}
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {apiKey === MASKED_PLACEHOLDER && (
                  <p className="text-[11px] text-[#64748B] mt-1">已配置 API Key，点击输入框可重新设置</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Custom provider ── */}
      {activeTab === "custom" && (
        <div className="space-y-4">
          {/* Quick-fill templates */}
          <div>
            <div className="text-[12px] text-[#64748B] mb-2">快速填充模板：</div>
            <div className="flex gap-2 flex-wrap">
              {[
                ...CUSTOM_TEMPLATES,
                ...ALL_PRESETS.filter((p) => !p.builtin).map((p) => ({
                  name: p.label,
                  id: p.id,
                  url: p.baseUrl ?? "",
                  model: p.models[0]?.id ?? "",
                  api: (p.api ?? "openai-completions") as "openai-completions" | "anthropic-messages",
                })),
              ]
                .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setCId(t.id);
                      setCUrl(t.url);
                      setCModel(t.model);
                      setCApi(t.api);
                    }}
                    className="text-[#64748B] border border-[#E5E7EB] px-2.5 py-1 rounded-lg text-[12px] hover:bg-[#F8FAFC]"
                  >
                    {t.name}
                  </button>
                ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">
                Provider ID <span className="text-[#DC2626]">*</span>
              </label>
              <input
                value={cId}
                onChange={(e) => setCId(e.target.value)}
                placeholder="例如: local-ollama"
                className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cId ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">显示名称</label>
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="例如: Ollama Local"
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium mb-1.5">
              Base URL <span className="text-[#DC2626]">*</span>
            </label>
            <input
              value={cUrl}
              onChange={(e) => setCUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cUrl ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium mb-1.5">API Key</label>
            <div className="relative">
              <input
                type={showCApiKey ? "text" : "password"}
                value={cApiKey}
                onChange={(e) => setCApiKey(e.target.value)}
                onFocus={() => { if (cApiKey === MASKED_PLACEHOLDER) setCApiKey(""); }}
                placeholder="sk-... 或留空（本地无鉴权服务）"
                className="w-full px-3 py-2 pr-9 text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD] font-mono"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowCApiKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                tabIndex={-1}
              >
                {showCApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">
                Model ID <span className="text-[#DC2626]">*</span>
              </label>
              <input
                value={cModel}
                onChange={(e) => setCModel(e.target.value)}
                placeholder="例如: llama3"
                className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cModel ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">API 类型</label>
              <select
                value={cApi}
                onChange={(e) => setCApi(e.target.value as "openai-completions" | "anthropic-messages")}
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg bg-white outline-none"
              >
                <option value="openai-completions">OpenAI Compatible</option>
                <option value="anthropic-messages">Anthropic Compatible</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Marketplace ── */}
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

function StepBadge() {
  return (
    <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
      step 2 / 6 · 必填
    </div>
  );
}
