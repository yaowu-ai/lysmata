import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy } from "lucide-react";
import { useLlmSettings, useUpdateLlmSettings } from "../shared/hooks/useLlmSettings";
import type { LlmSettings, ProviderConfig } from "../shared/types";
import ProviderFormDrawer from "./Settings/ProviderFormDrawer";
import { AgentManagementSection } from "./Settings/AgentManagementSection";
import { GatewayConfigSection } from "./Settings/GatewayConfigSection";
import { ONBOARDING_KEY } from "../shared/store/wizard-store";
import { useToast } from "../components/Toast";
import { apiClient } from "../shared/api-client";

// 工具函数：API Key 遮码
function maskApiKey(key: string | undefined): string {
  if (!key || key.length < 8) return "***";
  return `${key.slice(0, 3)}...${key.slice(-6)}`;
}

// 工具函数：复制到剪贴板
async function copyToClipboard(text: string, toast: ReturnType<typeof useToast>) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("API Key 已复制到剪贴板");
  } catch {
    toast.error("复制失败");
  }
}

export default function SettingsPage() {
  const { data: settings, isLoading, isError, refetch } = useLlmSettings();
  const { mutate: saveSettings } = useUpdateLlmSettings();
  const [editingProvider, setEditingProvider] = useState<{
    key: string;
    provider: ProviderConfig;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  // 默认模型配置：拆分为 Provider 和 Model 两个字段
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");

  async function handleDeleteProvider(key: string) {
    if (!settings) return;

    try {
      // 检查是否有 Bot 正在使用
      const usage = await apiClient.get<{
        inUse: boolean;
        count: number;
        bots: Array<{ id: string; name: string }>;
      }>(`/settings/llm/providers/${key}/usage`);

      if (usage.inUse) {
        toast.error(
          `无法删除：${usage.count} 个 Bot 正在使用此 Provider\n` +
            `请先修改这些 Bot 的配置：${usage.bots.map((b) => b.name).join(", ")}`
        );
        return;
      }

      if (!window.confirm(`确认删除 Provider "${key}"？`)) return;

      const updated: LlmSettings = {
        ...settings,
        providers: Object.fromEntries(Object.entries(settings.providers).filter(([k]) => k !== key)),
      };

      saveSettings(updated, {
        onSuccess: () => toast.success("Provider 已删除"),
        onError: () => toast.error("删除失败"),
      });
    } catch (err) {
      toast.error("检查使用情况失败");
    }
  }

  function handleSaveProvider(key: string, provider: ProviderConfig) {
    if (!settings) return;
    saveSettings(
      { ...settings, providers: { ...settings.providers, [key]: provider } },
      {
        onSuccess: () => {
          toast.success("Provider 已保存");
          setDrawerOpen(false);
          setEditingProvider(null);
        },
        onError: () => toast.error("保存失败"),
      }
    );
  }

  function handleDefaultModelChange(primary: string) {
    if (!settings) return;
    saveSettings(
      { ...settings, defaultModel: { ...settings.defaultModel, primary } },
      {
        onSuccess: () => toast.success("默认模型已更新"),
        onError: () => toast.error("更新失败"),
      }
    );
  }

  function handleSaveDefaultModel() {
    if (!selectedProvider || !selectedModel) {
      toast.error("请选择 Provider 和模型");
      return;
    }
    const primary = `${selectedProvider}/${selectedModel}`;
    handleDefaultModelChange(primary);
  }

  function handleReenterWizard() {
    localStorage.removeItem(ONBOARDING_KEY);
    navigate("/onboarding");
  }

  // 初始化默认 Provider 和 Model
  useEffect(() => {
    if (settings?.defaultModel.primary && !selectedProvider) {
      const [provider, model] = settings.defaultModel.primary.split("/");
      setSelectedProvider(provider || "");
      setSelectedModel(model || "");
    }
  }, [settings, selectedProvider]);

  if (isLoading) return <div className="p-6 text-sm text-[#64748B]">加载中...</div>;

  if (isError || !settings) return (
    <div className="p-6 flex flex-col gap-3">
      <div className="text-sm text-red-500">无法连接到 API 服务，请检查应用是否正常启动</div>
      <button
        onClick={() => refetch()}
        className="self-start px-4 py-2 rounded-lg border border-[#E5E7EB] text-[14px] text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
      >
        重试
      </button>
    </div>
  );

  // 当前选中 Provider 的可用模型
  const availableModels = selectedProvider && settings.providers[selectedProvider]
    ? settings.providers[selectedProvider].models
    : [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-8 max-w-[1200px] mx-auto">
        <h1 className="text-[24px] font-bold mb-6">设置</h1>

      {/* 1. 默认模型配置 */}
      <section className="bg-white border border-[#E5E7EB] rounded-xl p-6 mb-5">
        <h2 className="text-[17px] font-semibold mb-4">默认模型配置</h2>
        <p className="text-[13px] text-[#64748B] mb-4">
          选择新建 Bot 时的默认 LLM Provider 和模型
        </p>
        <div className="mb-4">
          <label className="block text-[13px] font-medium mb-2 text-[#0F172A]">默认 Provider</label>
          <select
            className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB] transition-colors"
            value={selectedProvider}
            onChange={(e) => {
              setSelectedProvider(e.target.value);
              setSelectedModel(""); // 重置模型选择
            }}
          >
            <option value="">— 请选择 Provider —</option>
            {Object.keys(settings.providers).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-[13px] font-medium mb-2 text-[#0F172A]">默认模型</label>
          <select
            className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB] transition-colors"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={!selectedProvider}
          >
            <option value="">— 请选择模型 —</option>
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.id}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSaveDefaultModel}
          className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors"
        >
          保存
        </button>
      </section>

      {/* 2. LLM Providers 管理 */}
      <section className="bg-white border border-[#E5E7EB] rounded-xl p-6 mb-5">
        <h2 className="text-[17px] font-semibold mb-4">LLM Providers</h2>
        <p className="text-[13px] text-[#64748B] mb-4">
          管理 LLM Provider 配置，包括 API Key 和可用模型
        </p>

        <div className="space-y-3 mt-4">
          {Object.keys(settings.providers).length === 0 ? (
            <div className="text-[14px] text-[#94A3B8] py-8 text-center">
              暂无 Provider，点击「添加 Provider」开始配置
            </div>
          ) : (
            Object.entries(settings.providers).map(([key, provider]) => (
              <div
                key={key}
                className="flex items-center px-4 py-4 border border-[#E5E7EB] rounded-lg bg-[#FAFAFA]"
              >
                <div className="flex-1">
                  <div className="text-[14px] font-medium text-[#0F172A] mb-1">{key}</div>
                  <div className="text-[12px] text-[#64748B]">
                    {provider.models.length} 个模型 • API Key: {maskApiKey(provider.apiKey)}
                    {provider.apiKey && (
                      <button
                        onClick={() => copyToClipboard(provider.apiKey!, toast)}
                        className="ml-2 text-[#94A3B8] hover:text-[#0F172A] inline-flex items-center"
                        title="复制 API Key"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingProvider({ key, provider });
                      setDrawerOpen(true);
                    }}
                    className="px-3 py-1.5 text-[13px] text-[#64748B] hover:bg-white rounded transition-colors"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDeleteProvider(key)}
                    className="px-3 py-1.5 text-[13px] text-[#64748B] hover:bg-white rounded transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <button
          onClick={() => {
            setEditingProvider(null);
            setDrawerOpen(true);
          }}
          className="mt-4 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors"
        >
          添加 Provider
        </button>
      </section>

      {/* 3. OpenClaw Agents 管理 */}
      <AgentManagementSection />

      {/* 4. Gateway 配置 */}
      <GatewayConfigSection />

      {/* 5. 配置向导 */}
      <section className="bg-white border border-[#E5E7EB] rounded-xl p-6 mb-5">
        <h2 className="text-[17px] font-semibold mb-4">配置向导</h2>
        <p className="text-[13px] text-[#64748B] mb-4">
          重新运行配置向导，按引导式流程完成所有配置
        </p>
        <button
          onClick={handleReenterWizard}
          className="px-4 py-2 rounded-lg border border-[#E5E7EB] text-[14px] text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
        >
          重新运行配置向导
        </button>
      </section>

      <ProviderFormDrawer
        open={drawerOpen}
        providerKey={editingProvider?.key ?? ""}
        provider={editingProvider?.provider ?? null}
        onClose={() => {
          setDrawerOpen(false);
          setEditingProvider(null);
        }}
        onSave={handleSaveProvider}
      />
      </div>
    </div>
  );
}
