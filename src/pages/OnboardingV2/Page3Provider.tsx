import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../shared/api-client";
import {
  useLlmSettings,
  useProviderApiKey,
  useSaveProviderApiKey,
} from "../../shared/hooks/useLlmSettings";
import { findPreset } from "../Settings/provider-presets";
import { OnboardingPageShell } from "./OnboardingPageShell";

const MASKED_PLACEHOLDER = "•••••••••••";

const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    subtitle: "通用默认推荐，适合先跑通第一次成功路径。",
    icon: "🚀",
    defaultModelId: "gpt-4o-mini",
  },
  {
    id: "zai",
    label: "智谱 AI（ZAI）",
    subtitle: "更贴近中文环境，适合作为国内默认选项。",
    icon: "🤖",
    defaultModelId: "glm-5",
  },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

export function OnboardingPage() {
  const navigate = useNavigate();
  const { data: llmSettings, isLoading } = useLlmSettings();
  const { mutateAsync: saveApiKey } = useSaveProviderApiKey();

  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>("openai");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.id === selectedProviderId) ?? PROVIDERS[0],
    [selectedProviderId],
  );

  const selectedPreset = findPreset(selectedProviderId);
  const selectedModel = selectedPreset?.models.find(
    (model) => model.id === selectedProvider.defaultModelId,
  );

  const { data: providerKeyData } = useProviderApiKey(initialized ? selectedProviderId : null);

  useEffect(() => {
    if (!llmSettings || initialized) return;

    const primary = llmSettings.defaultModel.primary;
    const provider = primary.split("/")[0] as ProviderId;
    if (provider === "openai" || provider === "zai") {
      setSelectedProviderId(provider);
    }
    setInitialized(true);
  }, [initialized, llmSettings]);

  useEffect(() => {
    if (!providerKeyData) return;
    if (providerKeyData.apiKey && !apiKey) {
      setApiKey(MASKED_PLACEHOLDER);
    }
    if (!providerKeyData.apiKey && apiKey === MASKED_PLACEHOLDER) {
      setApiKey("");
    }
  }, [apiKey, providerKeyData]);

  async function handleSave() {
    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey || normalizedApiKey === MASKED_PLACEHOLDER) {
      setApiKeyError("请输入所选 Provider 的 LLM Key 后再继续");
      throw new Error("api key required");
    }

    if (!selectedPreset || !selectedModel) {
      setSaveError("默认模型配置缺失，请检查 provider 预设。");
      throw new Error("missing provider preset");
    }

    setSaveError("");
    setIsSaving(true);

    try {
      await saveApiKey({ key: selectedProviderId, apiKey: normalizedApiKey });
      await apiClient.put("/settings/llm", {
        providers: {
          [selectedProviderId]: {
            models: [{ id: selectedModel.id, name: selectedModel.name }],
          },
        },
        defaultModel: { primary: `${selectedProviderId}/${selectedModel.id}` },
      });

      navigate("/onboarding/template");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试");
      throw error;
    } finally {
      setIsSaving(false);
    }
  }

  const footer = {
    hint: "先选择一个 Provider，再填写对应的 LLM Key。模型会使用系统默认推荐值。",
    actions: [
      {
        label: "上一步",
        onClick: () => navigate("/onboarding/install"),
        variant: "secondary" as const,
        disabled: isSaving,
      },
      {
        label: isSaving ? "保存中..." : "保存并继续",
        onClick: () => {
          void handleSave();
        },
        variant: "primary" as const,
        disabled: isLoading || isSaving,
      },
    ],
  };

  if (isLoading && !initialized) {
    return (
      <OnboardingPageShell footer={footer}>
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-24 rounded-full bg-[#EFF6FF]" />
          <div className="h-8 w-56 rounded-xl bg-[#F1F5F9]" />
          <div className="h-20 rounded-3xl bg-[#F1F5F9]" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-36 rounded-3xl bg-[#F1F5F9]" />
            <div className="h-36 rounded-3xl bg-[#F1F5F9]" />
          </div>
          <div className="h-28 rounded-3xl bg-[#F1F5F9]" />
        </div>
      </OnboardingPageShell>
    );
  }

  return (
    <OnboardingPageShell
      footer={footer}
      mainClassName="items-start"
      contentClassName="max-w-[760px]"
    >
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const isActive = provider.id === selectedProviderId;
          const preset = findPreset(provider.id);
          const modelName =
            preset?.models.find((model) => model.id === provider.defaultModelId)?.name ??
            provider.defaultModelId;

          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => {
                setSelectedProviderId(provider.id);
                setApiKeyError("");
                setSaveError("");
              }}
              className={[
                "rounded-[20px] border p-5 text-left transition-all",
                isActive
                  ? "border-[#93C5FD] bg-[#F8FBFF] shadow-[0_0_0_4px_rgba(147,197,253,0.16)]"
                  : "border-[#E2E8F0] bg-white hover:border-[#BFDBFE] hover:-translate-y-0.5",
              ].join(" ")}
            >
              <div className="text-[24px]">{provider.icon}</div>
              <div className="mt-3 text-[16px] font-semibold text-[#0F172A]">{provider.label}</div>
              <p className="mt-2 text-[13px] leading-6 text-[#64748B]">{provider.subtitle}</p>
              <div className="mt-4 inline-flex rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-semibold text-[#64748B]">
                默认模型：{modelName}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4 text-[13px] leading-7 text-[#64748B]">
        当前已选：
        <span className="font-semibold text-[#0F172A]"> {selectedProvider.label}</span>
        。保存后会默认使用
        <span className="font-semibold text-[#0F172A]">
          {" "}
          {selectedModel?.name ?? selectedProvider.defaultModelId}
        </span>
        作为首次模型。
      </div>

      <div className="mt-5">
        <label
          htmlFor="provider-api-key"
          className="block text-[13px] font-semibold text-[#0F172A]"
        >
          LLM Key
        </label>
        <div className="mt-2 relative">
          <input
            id="provider-api-key"
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              if (apiKeyError) setApiKeyError("");
              if (saveError) setSaveError("");
            }}
            onFocus={() => {
              if (apiKey === MASKED_PLACEHOLDER) {
                setApiKey("");
              }
            }}
            placeholder={`输入 ${selectedProvider.label} 的 Key`}
            autoComplete="off"
            spellCheck={false}
            className={[
              "w-full rounded-2xl border bg-white px-4 py-3 pr-12 text-sm text-[#0F172A] outline-none transition-shadow",
              apiKeyError
                ? "border-[#FCA5A5] shadow-[0_0_0_4px_rgba(252,165,165,0.18)]"
                : "border-[#E2E8F0] focus:border-[#93C5FD] focus:shadow-[0_0_0_4px_rgba(147,197,253,0.18)]",
            ].join(" ")}
          />
          <button
            type="button"
            onClick={() => setShowApiKey((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#475569]"
            tabIndex={-1}
          >
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {apiKeyError && (
          <div className="mt-2 text-[12px] font-semibold text-[#DC2626]">{apiKeyError}</div>
        )}
        {saveError && (
          <div className="mt-2 text-[12px] font-semibold text-[#DC2626]">{saveError}</div>
        )}
      </div>
    </OnboardingPageShell>
  );
}
