import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { ProviderConfig, ProviderModel } from '../../shared/types';

interface Props {
  open: boolean;
  providerKey: string;
  provider: ProviderConfig | null;
  onClose: () => void;
  onSave: (key: string, provider: ProviderConfig) => void;
}

const emptyProvider = (): ProviderConfig => ({
  baseUrl: '',
  apiKey: '',
  api: 'openai-completions',
  models: [],
});

const emptyModel = (): ProviderModel => ({ id: '', name: '' });

export default function ProviderFormDrawer({ open, providerKey, provider, onClose, onSave }: Props) {
  const [key, setKey] = useState('');
  const [form, setForm] = useState<ProviderConfig>(emptyProvider());

  useEffect(() => {
    if (open) {
      setKey(providerKey);
      setForm(provider ? structuredClone(provider) : emptyProvider());
    }
  }, [open, providerKey, provider]);

  if (!open) return null;

  function updateModel(index: number, field: keyof ProviderModel, value: string | number) {
    setForm((prev) => {
      const models = [...prev.models];
      models[index] = { ...models[index], [field]: value };
      return { ...prev, models };
    });
  }

  function addModel() {
    setForm((prev) => ({ ...prev, models: [...prev.models, emptyModel()] }));
  }

  function removeModel(index: number) {
    setForm((prev) => ({ ...prev, models: prev.models.filter((_, i) => i !== index) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    onSave(key.trim(), form);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[480px] h-full bg-gray-950 border-l border-gray-700 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold">{provider ? '编辑 Provider' : '添加 Provider'}</h2>
          <button aria-label="关闭" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label htmlFor="provider-key" className="block text-xs text-gray-400 mb-1">Provider Key（唯一标识）</label>
            <input
              id="provider-key"
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. my-openai"
              disabled={!!provider}
              required
            />
          </div>

          <div>
            <label htmlFor="provider-base-url" className="block text-xs text-gray-400 mb-1">Base URL</label>
            <input
              id="provider-base-url"
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              value={form.baseUrl ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div>
            <label htmlFor="provider-api-key" className="block text-xs text-gray-400 mb-1">API Key</label>
            <input
              id="provider-api-key"
              type="password"
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              value={form.apiKey ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="sk-..."
            />
          </div>

          <div>
            <label htmlFor="provider-api-type" className="block text-xs text-gray-400 mb-1">API 类型</label>
            <select
              id="provider-api-type"
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              value={form.api ?? 'openai-completions'}
              onChange={(e) => setForm((prev) => ({ ...prev, api: e.target.value }))}
            >
              <option value="openai-completions">openai-completions</option>
              <option value="anthropic">anthropic</option>
              <option value="google">google</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">模型列表</label>
              <button type="button" onClick={addModel} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                <Plus size={12} /> 添加模型
              </button>
            </div>
            <div className="space-y-2">
              {form.models.map((m, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <input
                      aria-label={`模型 ${i + 1} ID`}
                      className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs"
                      value={m.id}
                      onChange={(e) => updateModel(i, 'id', e.target.value)}
                      placeholder="模型 ID (e.g. gpt-4o)"
                    />
                    <input
                      aria-label={`模型 ${i + 1} 显示名称`}
                      className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs"
                      value={m.name}
                      onChange={(e) => updateModel(i, 'name', e.target.value)}
                      placeholder="显示名称"
                    />
                  </div>
                  <button type="button" title={`删除模型 ${i + 1}`} onClick={() => removeModel(i)} className="mt-1">
                    <Trash2 size={13} className="text-gray-500 hover:text-red-400" />
                  </button>
                </div>
              ))}
              {form.models.length === 0 && (
                <div className="text-xs text-gray-600 py-2 text-center">暂无模型，点击「添加模型」</div>
              )}
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="submit"
              className="flex-1 rounded bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium"
            >
              保存
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded border border-gray-700 px-4 py-2 text-sm hover:bg-gray-800"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
