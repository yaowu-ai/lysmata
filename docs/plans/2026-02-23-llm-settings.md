# LLM Settings Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Settings page to Lysmata that lets users manage OpenClaw LLM providers and default model by reading/writing `~/.openclaw/openclaw.json` directly.

**Architecture:** New `GET/PUT /settings/llm` Hono routes read and write `models.providers` + `agents.defaults.model` in `openclaw.json`. A new React `SettingsPage` (already routed at `/settings`) renders a provider list with add/edit/delete, and a default model selector. The existing `openclaw-config-file.ts` is extended with provider CRUD helpers.

**Tech Stack:** Bun + Hono + Zod (backend), React 19 + TanStack Query + Tailwind CSS + Radix UI (frontend)

---

### Task 1: Extend `openclaw-config-file.ts` with provider helpers

**Files:**
- Modify: `src-api/src/core/openclaw-config-file.ts`

**Step 1: Add `OpenClawProvider` interface and `readLlmSettings()` function**

Add after the existing interfaces:

```typescript
export interface OpenClawProviderModel {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: string[];
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow?: number;
  maxTokens?: number;
}

export interface OpenClawProvider {
  baseUrl: string;
  apiKey: string;
  api: string;
  models: OpenClawProviderModel[];
}

export interface LlmSettings {
  providers: Record<string, OpenClawProvider>;
  defaultModel: {
    primary: string;
    fallbacks: string[];
  };
}

export async function readLlmSettings(): Promise<LlmSettings> {
  const config = await readOpenClawConfig();
  return {
    providers: (config?.models?.providers ?? {}) as Record<string, OpenClawProvider>,
    defaultModel: {
      primary: config?.agents?.defaults?.model?.primary ?? '',
      fallbacks: config?.agents?.defaults?.model?.fallbacks ?? [],
    },
  };
}
```

**Step 2: Add `updateLlmSettings()` function**

```typescript
export async function updateLlmSettings(settings: LlmSettings): Promise<void> {
  const existing = (await readOpenClawConfig()) ?? {};
  const updated: OpenClawConfig = structuredClone(existing);

  // Write providers
  updated.models ??= { mode: 'merge', providers: {} };
  (updated.models as Record<string, unknown>).providers = settings.providers;

  // Write default model
  updated.agents ??= {};
  updated.agents.defaults ??= {};
  updated.agents.defaults.model = {
    primary: settings.defaultModel.primary,
    fallbacks: settings.defaultModel.fallbacks,
  };

  // Sync agents.defaults.models alias table from providers
  const aliasTable: Record<string, { alias?: string }> = {};
  for (const [providerKey, provider] of Object.entries(settings.providers)) {
    for (const model of provider.models) {
      aliasTable[`${providerKey}/${model.id}`] = { alias: model.name };
    }
  }
  updated.agents.defaults.models = aliasTable;

  await Bun.write(OPENCLAW_CONFIG_PATH, JSON.stringify(updated, null, 2));
}
```

**Step 3: Also add `models` to `OpenClawConfig` interface**

Find the existing `OpenClawConfig` interface and add:
```typescript
models?: {
  mode?: string;
  providers?: Record<string, unknown>;
};
```

**Step 4: Commit**

```bash
git add src-api/src/core/openclaw-config-file.ts
git commit -m "feat: add provider CRUD helpers to openclaw-config-file"
```

---

### Task 2: Add `/settings/llm` Hono routes

**Files:**
- Create: `src-api/src/app/api/settings.ts`
- Modify: `src-api/src/index.ts`

**Step 1: Create `src-api/src/app/api/settings.ts`**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { readLlmSettings, updateLlmSettings } from '../../core/openclaw-config-file';

const settings = new Hono();

const providerModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  reasoning: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
  }).optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
});

const providerSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string(),
  api: z.string().default('openai-completions'),
  models: z.array(providerModelSchema),
});

const llmSettingsSchema = z.object({
  providers: z.record(z.string(), providerSchema),
  defaultModel: z.object({
    primary: z.string(),
    fallbacks: z.array(z.string()).default([]),
  }),
});

settings.get('/llm', async (c) => {
  const data = await readLlmSettings();
  return c.json(data);
});

settings.put('/llm', zValidator('json', llmSettingsSchema), async (c) => {
  const body = c.req.valid('json');
  await updateLlmSettings(body);
  return c.json({ success: true });
});

export default settings;
```

**Step 2: Register route in `src-api/src/index.ts`**

Add import after existing imports:
```typescript
import settings from './app/api/settings';
```

Add route after existing routes:
```typescript
app.route('/settings', settings);
```

**Step 3: Commit**

```bash
git add src-api/src/app/api/settings.ts src-api/src/index.ts
git commit -m "feat: add /settings/llm GET and PUT routes"
```

---

### Task 3: Add frontend types and hooks

**Files:**
- Modify: `src/shared/types/index.ts`
- Create: `src/shared/hooks/useLlmSettings.ts`

**Step 1: Add types to `src/shared/types/index.ts`**

Append at the end of the file:

```typescript
export interface ProviderModel {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: string[];
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow?: number;
  maxTokens?: number;
}

export interface LlmProvider {
  baseUrl: string;
  apiKey: string;
  api: string;
  models: ProviderModel[];
}

export interface LlmSettings {
  providers: Record<string, LlmProvider>;
  defaultModel: {
    primary: string;
    fallbacks: string[];
  };
}
```

**Step 2: Create `src/shared/hooks/useLlmSettings.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LlmSettings } from '../types';

const API_BASE = 'http://127.0.0.1:' + (import.meta.env.VITE_API_PORT ?? '1989');

const llmSettingsKeys = {
  all: ['settings', 'llm'] as const,
};

async function fetchLlmSettings(): Promise<LlmSettings> {
  const res = await fetch(`${API_BASE}/settings/llm`);
  if (!res.ok) throw new Error('Failed to fetch LLM settings');
  return res.json();
}

async function saveLlmSettings(settings: LlmSettings): Promise<void> {
  const res = await fetch(`${API_BASE}/settings/llm`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to save LLM settings');
}

export function useLlmSettings() {
  return useQuery({
    queryKey: llmSettingsKeys.all,
    queryFn: fetchLlmSettings,
  });
}

export function useUpdateLlmSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveLlmSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: llmSettingsKeys.all }),
  });
}
```

**Step 3: Check how `API_BASE` is defined in existing hooks**

Read `src/shared/hooks/useBots.ts` to confirm the API base URL pattern and align if different.

**Step 4: Commit**

```bash
git add src/shared/types/index.ts src/shared/hooks/useLlmSettings.ts
git commit -m "feat: add LlmSettings types and hooks"
```

---

### Task 4: Build `SettingsPage` — Provider list and form

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

**Step 1: Read the existing `SettingsPage.tsx`** to understand what's already there before overwriting.

**Step 2: Replace with full implementation**

```tsx
import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useLlmSettings, useUpdateLlmSettings } from '../shared/hooks/useLlmSettings';
import type { LlmSettings, LlmProvider, ProviderModel } from '../shared/types';
import ProviderFormDrawer from './Settings/ProviderFormDrawer';

export default function SettingsPage() {
  const { data: settings, isLoading } = useLlmSettings();
  const { mutate: saveSettings } = useUpdateLlmSettings();
  const [editingProvider, setEditingProvider] = useState<{ key: string; provider: LlmProvider } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (isLoading || !settings) return <div className="p-6 text-sm text-gray-400">加载中...</div>;

  function handleDeleteProvider(key: string) {
    if (!settings) return;
    const updated: LlmSettings = {
      ...settings,
      providers: Object.fromEntries(
        Object.entries(settings.providers).filter(([k]) => k !== key)
      ),
    };
    saveSettings(updated);
  }

  function handleSaveProvider(key: string, provider: LlmProvider) {
    if (!settings) return;
    saveSettings({ ...settings, providers: { ...settings.providers, [key]: provider } });
    setDrawerOpen(false);
    setEditingProvider(null);
  }

  function handleDefaultModelChange(primary: string) {
    if (!settings) return;
    saveSettings({ ...settings, defaultModel: { ...settings.defaultModel, primary } });
  }

  // Aggregate all models across providers for the default model selector
  const allModels = Object.entries(settings.providers).flatMap(([providerKey, provider]) =>
    provider.models.map((m) => ({ value: `${providerKey}/${m.id}`, label: m.name || m.id }))
  );

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-semibold mb-6">设置</h1>

      {/* Default Model */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">默认模型</h2>
        <select
          className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
          value={settings.defaultModel.primary}
          onChange={(e) => handleDefaultModelChange(e.target.value)}
        >
          <option value="">— 未设置 —</option>
          {allModels.map((m) => (
            <option key={m.value} value={m.value}>{m.label} ({m.value})</option>
          ))}
        </select>
      </section>

      {/* Providers */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">LLM Providers</h2>
          <button
            onClick={() => { setEditingProvider(null); setDrawerOpen(true); }}
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            <Plus size={14} /> 添加
          </button>
        </div>

        <div className="space-y-2">
          {Object.entries(settings.providers).map(([key, provider]) => (
            <div key={key} className="rounded-lg border border-gray-700 bg-gray-900">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  className="flex items-center gap-2 text-sm font-medium"
                  onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
                >
                  {expanded[key] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {key}
                  <span className="text-xs text-gray-500">{provider.models.length} 个模型</span>
                </button>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingProvider({ key, provider }); setDrawerOpen(true); }}>
                    <Pencil size={14} className="text-gray-400 hover:text-white" />
                  </button>
                  <button onClick={() => handleDeleteProvider(key)}>
                    <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
                  </button>
                </div>
              </div>
              {expanded[key] && (
                <div className="border-t border-gray-700 px-4 py-3 text-xs text-gray-400 space-y-1">
                  <div>Base URL: {provider.baseUrl}</div>
                  <div>API: {provider.api}</div>
                  <div className="mt-2 space-y-1">
                    {provider.models.map((m) => (
                      <div key={m.id} className="flex justify-between">
                        <span>{m.name || m.id}</span>
                        <span className="text-gray-600">{m.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
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
```

**Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: implement SettingsPage with provider list and default model selector"
```

---

### Task 5: Build `ProviderFormDrawer`

**Files:**
- Create: `src/pages/Settings/ProviderFormDrawer.tsx`

**Step 1: Create the directory and file**

```bash
mkdir -p src/pages/Settings
```

**Step 2: Create `ProviderFormDrawer.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { LlmProvider, ProviderModel } from '../../shared/types';

interface Props {
  open: boolean;
  providerKey: string;
  provider: LlmProvider | null;
  onClose: () => void;
  onSave: (key: string, provider: LlmProvider) => void;
}

const emptyProvider = (): LlmProvider => ({
  baseUrl: '',
  apiKey: '',
  api: 'openai-completions',
  models: [],
});

const emptyModel = (): ProviderModel => ({ id: '', name: '' });

export default function ProviderFormDrawer({ open, providerKey, provider, onClose, onSave }: Props) {
  const [key, setKey] = useState('');
  const [form, setForm] = useState<LlmProvider>(emptyProvider());

  useEffect(() => {
    if (open) {
      setKey(providerKey);
      setForm(provider ? structuredClone(provider) : emptyProvider());
    }
  }, [open, providerKey, provider]);

  if (!open) return null;

  function updateModel(index: number, field: keyof ProviderModel, value: string | number) {
    setForm((f) => {
      const models = [...f.models];
      models[index] = { ...models[index], [field]: value };
      return { ...f, models };
    });
  }

  function addModel() {
    setForm((f) => ({ ...f, models: [...f.models, emptyModel()] }));
  }

  function removeModel(index: number) {
    setForm((f) => ({ ...f, models: f.models.filter((_, i) => i !== index) }));
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
          <button onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Provider Key（唯一标识）</label>
            <input
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. my-openai"
              disabled={!!provider}
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Base URL</label>
            <input
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="sk-..."
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">API 类型</label>
            <select
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              value={form.api}
              onChange={(e) => setForm((f) => ({ ...f, api: e.target.value }))}
            >
              <option value="openai-completions">openai-completions</option>
              <option value="anthropic">anthropic</option>
              <option value="google">google</option>
            </select>
          </div>

          {/* Models */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">模型列表</label>
              <button type="button" onClick={addModel} className="flex items-center gap-1 text-xs text-blue-400">
                <Plus size={12} /> 添加模型
              </button>
            </div>
            <div className="space-y-2">
              {form.models.map((m, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <input
                      className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs"
                      value={m.id}
                      onChange={(e) => updateModel(i, 'id', e.target.value)}
                      placeholder="模型 ID (e.g. gpt-4o)"
                    />
                    <input
                      className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs"
                      value={m.name}
                      onChange={(e) => updateModel(i, 'name', e.target.value)}
                      placeholder="显示名称"
                    />
                  </div>
                  <button type="button" onClick={() => removeModel(i)} className="mt-1">
                    <Trash2 size={13} className="text-gray-500 hover:text-red-400" />
                  </button>
                </div>
              ))}
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
              className="flex-1 rounded border border-gray-700 px-4 py-2 text-sm"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/pages/Settings/ProviderFormDrawer.tsx
git commit -m "feat: add ProviderFormDrawer for LLM provider add/edit"
```

---

### Task 6: Remove `llm_config` from `BotFormDrawer`

**Files:**
- Modify: `src/pages/BotManagement/BotFormDrawer.tsx`

**Step 1: Read `BotFormDrawer.tsx`** to find the LLM tab and `llm_config` fields.

**Step 2: Remove the LLM tab** from the tabs array and delete the corresponding tab panel content. Keep all other tabs (基础, MCP, Skills, 连接) intact.

**Step 3: Remove `llm_config` from the form state and submit payload.**

**Step 4: Commit**

```bash
git add src/pages/BotManagement/BotFormDrawer.tsx
git commit -m "refactor: remove llm_config from BotFormDrawer (managed globally in Settings)"
```

---

### Task 7: Manual smoke test

1. Run the sidecar: `cd src-api && bun run src/index.ts`
2. Run the frontend: `cd .. && npm run dev`
3. Navigate to `/settings`
4. Verify the existing provider (`zenmux-ai`) loads correctly
5. Add a new provider with one model, save — check `~/.openclaw/openclaw.json` updated
6. Edit the provider, change the API key, save — verify file updated
7. Delete the provider — verify removed from file
8. Change the default model — verify `agents.defaults.model.primary` updated in file
9. Verify Bot form no longer shows LLM tab
