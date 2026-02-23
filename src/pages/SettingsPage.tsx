import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useLlmSettings, useUpdateLlmSettings } from '../shared/hooks/useLlmSettings';
import type { LlmSettings, ProviderConfig } from '../shared/types';
import ProviderFormDrawer from './Settings/ProviderFormDrawer';

export default function SettingsPage() {
  const { data: settings, isLoading } = useLlmSettings();
  const { mutate: saveSettings } = useUpdateLlmSettings();
  const [editingProvider, setEditingProvider] = useState<{ key: string; provider: ProviderConfig } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function handleDeleteProvider(key: string) {
    if (!settings) return;
    if (!window.confirm(`确认删除 Provider "${key}"？`)) return;
    const updated: LlmSettings = {
      ...settings,
      providers: Object.fromEntries(
        Object.entries(settings.providers).filter(([k]) => k !== key)
      ),
    };
    saveSettings(updated);
  }

  function handleSaveProvider(key: string, provider: ProviderConfig) {
    if (!settings) return;
    saveSettings({ ...settings, providers: { ...settings.providers, [key]: provider } });
    setDrawerOpen(false);
    setEditingProvider(null);
  }

  function handleDefaultModelChange(primary: string) {
    if (!settings) return;
    saveSettings({ ...settings, defaultModel: { ...settings.defaultModel, primary } });
  }

  if (isLoading || !settings) return <div className="p-6 text-sm text-[#64748B]">加载中...</div>;

  const allModels = Object.entries(settings.providers).flatMap(([providerKey, provider]) =>
    provider.models.map((m) => ({ value: `${providerKey}/${m.id}`, label: m.name || m.id }))
  );

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-semibold text-[#0F172A] mb-6">设置</h1>

      <section className="mb-8">
        <label htmlFor="default-model" className="block text-xs font-medium text-[#64748B] uppercase tracking-wide mb-3">默认模型</label>
        <select
          id="default-model"
          aria-label="默认模型"
          className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500"
          value={settings.defaultModel.primary}
          onChange={(e) => handleDefaultModelChange(e.target.value)}
        >
          <option value="">— 未设置 —</option>
          {allModels.map((m) => (
            <option key={m.value} value={m.value}>{m.label} ({m.value})</option>
          ))}
        </select>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-[#64748B] uppercase tracking-wide">LLM Providers</h2>
          <button
            onClick={() => { setEditingProvider(null); setDrawerOpen(true); }}
            className="flex items-center gap-1 text-sm text-[#2563EB] hover:text-blue-700"
          >
            <Plus size={14} /> 添加
          </button>
        </div>

        <div className="space-y-2">
          {Object.keys(settings.providers).length === 0 ? (
            <div className="text-sm text-[#94A3B8] py-4 text-center">
              暂无 Provider，点击「添加」开始配置
            </div>
          ) : (
            Object.entries(settings.providers).map(([key, provider]) => (
              <div key={key} className="rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    className="flex items-center gap-2 text-sm font-medium text-[#0F172A]"
                    onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                  >
                    {expanded[key] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {key}
                    <span className="text-xs text-[#94A3B8]">{provider.models.length} 个模型</span>
                  </button>
                  <div className="flex gap-2">
                    <button title={`编辑 ${key}`} onClick={() => { setEditingProvider({ key, provider }); setDrawerOpen(true); }}>
                      <Pencil size={14} className="text-[#94A3B8] hover:text-[#0F172A]" />
                    </button>
                    <button title={`删除 ${key}`} onClick={() => handleDeleteProvider(key)}>
                      <Trash2 size={14} className="text-[#94A3B8] hover:text-red-500" />
                    </button>
                  </div>
                </div>
                {expanded[key] && (
                  <div className="border-t border-[#F1F5F9] px-4 py-3 text-xs text-[#64748B] space-y-1 bg-[#FAFAFA] rounded-b-lg">
                    <div>Base URL: {provider.baseUrl}</div>
                    <div>API: {provider.api}</div>
                    <div className="mt-2 space-y-1">
                      {provider.models.map((m) => (
                        <div key={m.id} className="flex justify-between">
                          <span>{m.name || m.id}</span>
                          <span className="text-[#94A3B8]">{m.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <ProviderFormDrawer
        open={drawerOpen}
        providerKey={editingProvider?.key ?? ''}
        provider={editingProvider?.provider ?? null}
        onClose={() => { setDrawerOpen(false); setEditingProvider(null); }}
        onSave={handleSaveProvider}
      />
    </div>
  );
}
