import { useEffect, useState, useRef } from "react";
import { X, ChevronDown, Check, Search, Info, Eye, EyeOff } from "lucide-react";
import { OPENCLAW_API_TYPES } from "../../shared/types";
import type { ProviderConfig, OpenClawApiType } from "../../shared/types";
import { PROVIDER_GROUPS, ALL_PRESETS, findPreset } from "./provider-presets";
import { useProviderApiKey, useSaveProviderApiKey } from "../../shared/hooks/useLlmSettings";

interface Props {
  open: boolean;
  providerKey: string;
  provider: ProviderConfig | null;
  onClose: () => void;
  onSave: (key: string, provider: ProviderConfig) => void;
}

// ── Searchable dropdown ──────────────────────────────────────────

interface DropdownOption {
  value: string;
  label: string;
  group?: string;
}

function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  options: DropdownOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const filtered = search
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.value.toLowerCase().includes(search.toLowerCase()),
      )
    : options;

  const groups = new Map<string, DropdownOption[]>();
  for (const o of filtered) {
    const g = o.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(o);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen) setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
        className="w-full flex items-center justify-between rounded border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500 disabled:bg-[#F8FAFC] disabled:text-[#94A3B8] text-left"
      >
        <span className={selectedLabel ? "" : "text-[#94A3B8]"}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown size={14} className="text-[#94A3B8] shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E7EB] rounded-lg shadow-lg max-h-[320px] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#F1F5F9]">
            <Search size={13} className="text-[#94A3B8] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索..."
              className="flex-1 text-sm outline-none bg-transparent text-[#0F172A] placeholder:text-[#94A3B8]"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-[#94A3B8] text-center">无匹配结果</div>
            ) : (
              Array.from(groups.entries()).map(([groupLabel, items]) => (
                <div key={groupLabel}>
                  {groupLabel && (
                    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                      {groupLabel}
                    </div>
                  )}
                  {items.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        onChange(o.value);
                        setIsOpen(false);
                        setSearch("");
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[#F8FAFC] transition-colors ${
                        o.value === value ? "text-[#2563EB] font-medium" : "text-[#0F172A]"
                      }`}
                    >
                      <span className="flex-1">{o.label}</span>
                      {o.value === value && <Check size={13} className="text-[#2563EB] shrink-0" />}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main drawer ──────────────────────────────────────────────────

export default function ProviderFormDrawer({
  open,
  providerKey,
  provider,
  onClose,
  onSave,
}: Props) {
  const isEditing = !!provider;

  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [customModelInput, setCustomModelInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiType, setApiType] = useState<OpenClawApiType>("openai-completions");
  const [useCustomUrl, setUseCustomUrl] = useState(false);

  // Load existing API key from agent auth-profiles when editing a built-in provider
  const editingBuiltinKey = isEditing && open ? providerKey : null;
  const { data: existingKeyData } = useProviderApiKey(editingBuiltinKey);
  const { mutateAsync: saveApiKey, isPending: isSavingKey } = useSaveProviderApiKey();

  useEffect(() => {
    if (!open) return;

    if (isEditing && provider) {
      const preset = ALL_PRESETS.find((p) => p.id === providerKey);
      if (preset) {
        setSelectedPresetId(preset.id);
        const existingIds = provider.models.map((m) => m.id);
        const presetIds = new Set(preset.models.map((m) => m.id));
        setSelectedModelIds(existingIds.filter((id) => presetIds.has(id)));
        const customIds = existingIds.filter((id) => !presetIds.has(id));
        setCustomModelInput(customIds.join(", "));
      } else {
        setSelectedPresetId("__custom__");
        setCustomModelInput(provider.models.map((m) => m.id).join(", "));
      }
      // For custom providers, apiKey is in provider.apiKey
      // For built-in providers, apiKey is loaded from agent auth-profiles (see effect below)
      setApiKey(provider.apiKey ?? "");
      setBaseUrl(provider.baseUrl ?? "");
      setApiType(provider.api ?? "openai-completions");
      const matchedPreset = ALL_PRESETS.find((p) => p.id === providerKey);
      setUseCustomUrl(
        !!provider.baseUrl &&
        !!matchedPreset?.baseUrl &&
        provider.baseUrl !== matchedPreset.baseUrl,
      );
    } else {
      setSelectedPresetId("");
      setSelectedModelIds([]);
      setCustomModelInput("");
      setApiKey("");
      setShowApiKey(false);
      setBaseUrl("");
      setApiType("openai-completions");
      setUseCustomUrl(false);
    }
  }, [open, providerKey, provider, isEditing]);

  // When editing a built-in provider, pre-fill API key from agent auth-profiles
  useEffect(() => {
    if (existingKeyData?.apiKey) {
      setApiKey(existingKeyData.apiKey);
    }
  }, [existingKeyData]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const currentPreset = selectedPresetId && selectedPresetId !== "__custom__"
    ? findPreset(selectedPresetId)
    : undefined;

  const isBuiltin = currentPreset?.builtin === true;
  const isCustomProvider = selectedPresetId === "__custom__";

  function handleProviderChange(presetId: string) {
    setSelectedPresetId(presetId);
    setSelectedModelIds([]);
    setCustomModelInput("");

    if (presetId === "__custom__") {
      setBaseUrl("");
      setApiType("openai-completions");
      setUseCustomUrl(false);
    } else {
      const preset = findPreset(presetId);
      if (preset && !preset.builtin) {
        setBaseUrl(preset.baseUrl ?? "");
        setApiType(preset.api ?? "openai-completions");
        setUseCustomUrl(false);
      }
    }
  }

  function toggleModel(modelId: string) {
    setSelectedModelIds((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedPresetId) return;

    const isCustom = isCustomProvider;
    const key = isCustom
      ? (baseUrl.replace(/https?:\/\//, "").split("/")[0].replace(/\./g, "-") || "custom")
      : selectedPresetId;

    const models = [];

    if (currentPreset) {
      for (const mid of selectedModelIds) {
        const presetModel = currentPreset.models.find((m) => m.id === mid);
        models.push({ id: mid, name: presetModel?.name ?? mid });
      }
    }

    const customIds = customModelInput
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const cid of customIds) {
      if (!models.some((m) => m.id === cid)) {
        models.push({ id: cid, name: cid });
      }
    }

    if (models.length === 0) return;

    // For built-in providers: save API key to agent auth-profiles.json (not openclaw.json)
    if (isBuiltin && apiKey.trim()) {
      await saveApiKey({ key: isEditing ? providerKey : key, apiKey: apiKey.trim() });
    }

    const config: ProviderConfig = {
      baseUrl: isBuiltin ? undefined : (useCustomUrl || isCustom ? baseUrl : currentPreset?.baseUrl) || undefined,
      // For custom providers: apiKey goes into models.providers
      // For built-in providers: apiKey is handled above via agent auth-profiles
      apiKey: isBuiltin ? undefined : (apiKey || undefined),
      api: isBuiltin ? undefined : (isCustom ? apiType : currentPreset?.api),
      models,
    };

    onSave(isEditing ? providerKey : key, config);
  }

  if (!open) return null;

  const providerOptions: DropdownOption[] = [
    ...PROVIDER_GROUPS.flatMap((g) =>
      g.providers.map((p) => ({
        value: p.id,
        label: p.label,
        group: g.label,
      })),
    ),
    { value: "__custom__", label: "完全自定义 Provider", group: "其他" },
  ];

  const hasModels = selectedModelIds.length > 0 || customModelInput.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[480px] h-full bg-white border-l border-[#E5E7EB] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-sm font-semibold text-[#0F172A]">
            {isEditing ? "编辑 Provider" : "添加 Provider"}
          </h2>
          <button aria-label="关闭" onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A]">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Provider 选择 */}
          <div>
            <label className="block text-xs text-[#64748B] mb-1">供应商</label>
            <SearchableDropdown
              options={providerOptions}
              value={selectedPresetId}
              onChange={handleProviderChange}
              placeholder="选择供应商..."
              disabled={isEditing}
            />
          </div>

          {/* 内置 provider 说明 */}
          {isBuiltin && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                这是 openclaw 内置供应商。可在下方直接填写 API Key，或通过命令行
                <code className="font-mono bg-blue-100 px-1 rounded mx-0.5">openclaw models auth login --provider {selectedPresetId}</code>
                完成认证。
              </span>
            </div>
          )}

          {/* 模型选择 - 预设供应商 */}
          {currentPreset && (
            <div>
              <label className="block text-xs text-[#64748B] mb-1.5">选择模型</label>
              <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
                {currentPreset.models.map((m) => {
                  const checked = selectedModelIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#F8FAFC] transition-colors border-b border-[#F1F5F9] last:border-b-0 ${
                        checked ? "bg-[#F0F7FF]" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModel(m.id)}
                        className="rounded border-[#D1D5DB] text-[#2563EB] focus:ring-[#2563EB] focus:ring-offset-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[#0F172A] font-medium">{m.name}</div>
                        <div className="text-[11px] text-[#94A3B8] font-mono truncate">
                          {selectedPresetId}/{m.id}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="mt-2">
                <input
                  type="text"
                  value={customModelInput}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                  placeholder="补充其他模型 ID（逗号分隔）"
                  className="w-full rounded border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs text-[#0F172A] focus:outline-none focus:border-blue-500 placeholder:text-[#C0C7D0]"
                />
              </div>
            </div>
          )}

          {/* 模型选择 - 完全自定义供应商 */}
          {isCustomProvider && (
            <div>
              <label className="block text-xs text-[#64748B] mb-1">模型 ID（逗号分隔）</label>
              <textarea
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                placeholder="例如: my-model-v1, my-model-v2"
                rows={3}
                className="w-full rounded border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          )}

          {/* API Key */}
          {selectedPresetId && (
            <div>
              <label className="block text-xs text-[#64748B] mb-1">
                API Key
                {isBuiltin && (
                  <span className="ml-1 text-[#94A3B8] font-normal">（可选，留空则使用 CLI 认证）</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  className="w-full rounded border border-[#E5E7EB] bg-white px-3 py-2 pr-9 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500 font-mono"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={isBuiltin ? "留空则使用 CLI 认证" : "sk-..."}
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
            </div>
          )}

          {/* 非内置预设 provider 的 Base URL 自定义 */}
          {!isBuiltin && currentPreset && currentPreset.baseUrl && (
            <div>
              <label className="flex items-center gap-2 text-xs text-[#64748B] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useCustomUrl}
                  onChange={(e) => {
                    setUseCustomUrl(e.target.checked);
                    if (!e.target.checked) setBaseUrl(currentPreset.baseUrl ?? "");
                  }}
                  className="rounded border-[#D1D5DB] text-[#2563EB] focus:ring-[#2563EB] focus:ring-offset-0"
                />
                自定义 Base URL
                <span className="text-[#C0C7D0] font-mono">{currentPreset.baseUrl}</span>
              </label>
              {useCustomUrl && (
                <input
                  type="text"
                  className="mt-1.5 w-full rounded border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={currentPreset.baseUrl}
                />
              )}
            </div>
          )}

          {/* 完全自定义 Provider 的 Base URL 和 API 类型 */}
          {isCustomProvider && (
            <>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Base URL</label>
                <input
                  type="text"
                  className="w-full rounded border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">API 类型</label>
                <select
                  className="w-full rounded border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500"
                  value={apiType}
                  onChange={(e) => setApiType(e.target.value as OpenClawApiType)}
                >
                  {OPENCLAW_API_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* 提交 */}
          <div className="pt-4 flex gap-3">
            <button
              type="submit"
              disabled={!selectedPresetId || !hasModels || isSavingKey}
              className="flex-1 rounded bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#93C5FD] disabled:cursor-not-allowed text-white px-4 py-2 text-sm font-medium transition-colors"
            >
              {isSavingKey ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded border border-[#E5E7EB] px-4 py-2 text-sm text-[#64748B] hover:bg-[#F1F5F9]"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
