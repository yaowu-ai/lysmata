import { useEffect, useRef, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Wifi,
  CheckCircle,
  XCircle,
  Info,
  Upload,
  RefreshCw,
  CloudDownload,
  AlertTriangle,
  FolderOpen,
  RotateCcw,
} from "lucide-react";
import {
  useCreateBot,
  useUpdateBot,
  useTestBotConnection,
  useApplyBotConfig,
  useBotRemoteConfig,
} from "../../shared/hooks/useBots";
import type { Bot, SkillConfig } from "../../shared/types";
import type { RemoteConfigResult } from "../../shared/hooks/useBots";
import { cn } from "../../shared/lib/utils";

const TABS = ["基础", "MCP", "Skills", "连接"] as const;
type Tab = (typeof TABS)[number];

interface Props {
  open: boolean;
  bot: Bot | null;
  onClose: () => void;
}

function parseSafe<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "object") return v as T;
  try {
    return JSON.parse(v as string) as T;
  } catch {
    return fallback;
  }
}

export function BotFormDrawer({ open, bot, onClose }: Props) {
  const isEdit = !!bot;
  const createMut = useCreateBot();
  const updateMut = useUpdateBot(bot?.id ?? "");
  const testMut = useTestBotConnection();
  const applyMut = useApplyBotConfig();

  // Remote config: auto-fetch when editing an existing Bot
  const remoteConfig = useBotRemoteConfig(bot?.id ?? "", isEdit && open);

  const [tab, setTab] = useState<Tab>("基础");

  // 基础
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🤖");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  // MCP
  const [mcpJson, setMcpJson] = useState("{}");
  const [mcpJsonError, setMcpJsonError] = useState("");

  // Skills
  const [skills, setSkills] = useState<SkillConfig[]>([]);

  // 连接
  const [gatewayUrl, setGatewayUrl] = useState("ws://localhost:18789/ws");
  const [agentId, setAgentId] = useState("main");
  const [wsToken, setWsToken] = useState("");

  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    rttMs?: number;
  } | null>(null);
  const [applyResult, setApplyResult] = useState<RemoteConfigResult | null>(null);

  // Track whether we already merged remote config for this open session (avoid re-merging on re-renders)
  const remoteMergedRef = useRef(false);

  // ── Step 1: populate from local DB on open ─────────────────────────────────
  useEffect(() => {
    remoteMergedRef.current = false;

    if (bot) {
      setName(bot.name);
      setEmoji(bot.avatar_emoji);
      setDescription(bot.description);
      setIsActive(!!bot.is_active);

      setMcpJson(
        typeof bot.mcp_config === "string"
          ? bot.mcp_config
          : JSON.stringify(bot.mcp_config, null, 2),
      );
      setMcpJsonError("");

      const s = parseSafe<SkillConfig[]>(bot.skills_config, []);
      setSkills(Array.isArray(s) ? s : []);

      setGatewayUrl(bot.openclaw_ws_url);
      setAgentId(bot.openclaw_agent_id ?? "main");
      setWsToken(bot.openclaw_ws_token ?? "");
    } else {
      setName("");
      setEmoji("🤖");
      setDescription("");
      setIsActive(true);
      setMcpJson("{}");
      setMcpJsonError("");
      setSkills([]);
      setGatewayUrl("ws://localhost:18789/ws");
      setAgentId("main");
      setWsToken("");
    }
    setTab("基础");
    setTestResult(null);
    setApplyResult(null);
  }, [bot, open]);

  // ── Step 2: merge remote config when it arrives ────────────────────────────
  useEffect(() => {
    if (remoteMergedRef.current) return;
    if (!remoteConfig.data?.success) return;
    const rc = remoteConfig.data.config;
    if (!rc) return;

    remoteMergedRef.current = true;

    if (rc.mcp && Object.keys(rc.mcp).length > 0) {
      setMcpJson(JSON.stringify(rc.mcp, null, 2));
      setMcpJsonError("");
    }

    if (rc.skills && rc.skills.length > 0) {
      setSkills(rc.skills);
    }
  }, [remoteConfig.data]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function handleSave() {
    let parsedMcp: unknown = {};
    try {
      parsedMcp = JSON.parse(mcpJson);
    } catch {
      parsedMcp = {};
    }

    const payload = {
      name,
      avatar_emoji: emoji,
      description,
      skills_config: skills,
      mcp_config: typeof parsedMcp === "string" ? parsedMcp : JSON.stringify(parsedMcp),
      openclaw_ws_url: gatewayUrl,
      openclaw_agent_id: agentId || "main",
      openclaw_ws_token: wsToken || undefined,
      is_active: isActive,
    };
    if (isEdit) await updateMut.mutateAsync(payload);
    else await createMut.mutateAsync(payload);
    onClose();
  }

  async function handleTest() {
    if (!bot) return;
    const r = await testMut.mutateAsync(bot.id);
    setTestResult(r);
  }

  async function handleApplyConfig() {
    if (!bot) return;
    setApplyResult(null);
    await handleSave().catch(() => {});
    const r = await applyMut.mutateAsync(bot.id);
    setApplyResult(r);
  }

  function handleMcpChange(val: string) {
    setMcpJson(val);
    try {
      JSON.parse(val);
      setMcpJsonError("");
    } catch (e) {
      setMcpJsonError(String(e));
    }
  }

  function handleRefreshRemote() {
    remoteMergedRef.current = false;
    void remoteConfig.refetch();
  }

  const isPending = createMut.isPending || updateMut.isPending;
  const isHttpMode = gatewayUrl.startsWith("http://") || gatewayUrl.startsWith("https://");
  const mcpServerCount = (() => {
    try {
      const parsed = JSON.parse(mcpJson) as { mcpServers?: Record<string, unknown> };
      return parsed?.mcpServers ? Object.keys(parsed.mcpServers).length : 0;
    } catch {
      return 0;
    }
  })();

  // Remote config sync status banner (shown in MCP / Skills tabs)
  const syncBanner = isEdit
    ? (() => {
        if (remoteConfig.isLoading || remoteConfig.isFetching) return "loading" as const;
        if (remoteConfig.data?.success) return "ok" as const;
        if (remoteConfig.isError || (remoteConfig.data && !remoteConfig.data.success))
          return "warn" as const;
        return null;
      })()
    : null;

  const syncMessage =
    remoteConfig.data?.message ?? (remoteConfig.isError ? "连接 Gateway 失败" : "");

  return (
    <aside
      className={cn(
        "fixed top-0 right-0 bottom-0 w-[500px] bg-white z-30 flex flex-col shadow-[-8px_0_32px_rgba(0,0,0,0.08)] transition-transform duration-[250ms] ease-in-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="font-semibold text-[17px]">{isEdit ? "编辑 Bot" : "新建 Bot"}</h2>
          <p className="text-[12px] text-[#64748B] mt-0.5">配置 MCP、Skills 与 Gateway 连接</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E5E7EB] flex-shrink-0 px-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3.5 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
              tab === t
                ? "text-[#2563EB] border-[#2563EB]"
                : "text-[#64748B] border-transparent hover:text-[#0F172A]",
            )}
          >
            {t}
            {t === "MCP" && mcpServerCount > 0 && (
              <span className="ml-1 text-[10px] bg-[#DBEAFE] text-[#1D4ED8] rounded-full px-1.5 py-0.5 font-semibold">
                {mcpServerCount}
              </span>
            )}
            {t === "Skills" && skills.length > 0 && (
              <span className="ml-1 text-[10px] bg-[#DCFCE7] text-[#15803D] rounded-full px-1.5 py-0.5 font-semibold">
                {skills.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sync status banner — shown in MCP / Skills tabs when editing */}
      {isEdit && ["MCP", "Skills"].includes(tab) && syncBanner && (
        <SyncBanner status={syncBanner} message={syncMessage} onRefresh={handleRefreshRemote} />
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* ── 基础 ── */}
        {tab === "基础" && (
          <>
            <Field label="Bot 名称" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：CodeMaster"
                className={inputCls}
              />
            </Field>
            <Field label="头像 Emoji">
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="🤖"
                className={cn(inputCls, "text-xl")}
              />
            </Field>
            <Field label="能力描述" hint="将在群聊感知注入中展示给其他 Bot">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="擅长代码审查与 TypeScript 最佳实践..."
                className={cn(inputCls, "resize-none")}
              />
            </Field>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <label htmlFor="is_active" className="text-[14px] text-[#0F172A]">
                启动时自动建立 WS 连接
              </label>
            </div>
          </>
        )}

        {/* ── MCP ── */}
        {tab === "MCP" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-[#0F172A] font-medium">MCP 服务器配置</p>
                <p className="text-[11px] text-[#94A3B8] mt-0.5">
                  通过 WS 推送后将在 Gateway 中启用对应工具
                </p>
              </div>
              {mcpServerCount > 0 && (
                <span className="text-[11px] font-semibold text-[#1D4ED8] bg-[#DBEAFE] px-2 py-0.5 rounded-[20px] border border-[#BFDBFE]">
                  {mcpServerCount} 个 server
                </span>
              )}
            </div>

            <div className="relative">
              <textarea
                value={mcpJson}
                onChange={(e) => handleMcpChange(e.target.value)}
                rows={14}
                spellCheck={false}
                className={cn(
                  inputCls,
                  "resize-none font-mono text-[12px] leading-relaxed",
                  mcpJsonError
                    ? "border-red-400 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
                    : "",
                )}
              />
              {mcpJsonError && (
                <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                  <XCircle size={11} /> {mcpJsonError}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-[12px] text-[#1E40AF] space-y-1.5">
              <p className="font-medium">配置格式示例：</p>
              <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap opacity-80">{`{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}`}</pre>
            </div>
          </>
        )}

        {/* ── Skills ── */}
        {tab === "Skills" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-[#0F172A] font-medium">技能列表</p>
                <p className="text-[11px] text-[#94A3B8] mt-0.5">
                  用于群聊感知注入，让其他 Bot 了解此 Bot 的能力
                </p>
              </div>
              <button
                onClick={() => setSkills([...skills, { name: "", description: "" }])}
                className="text-[13px] text-[#2563EB] hover:underline flex items-center gap-1 flex-shrink-0"
              >
                <Plus size={13} /> 添加技能
              </button>
            </div>

            {skills.length > 0 ? (
              <div className="space-y-3">
                {skills.map((s, i) => (
                  <div
                    key={i}
                    className="flex gap-2 items-start bg-[#FAFAFA] rounded-lg border border-[#E5E7EB] p-3"
                  >
                    <div className="flex-1 space-y-2">
                      <input
                        value={s.name}
                        onChange={(e) => {
                          const n = [...skills];
                          n[i] = { ...n[i], name: e.target.value };
                          setSkills(n);
                        }}
                        placeholder="技能名称（如：代码审查）"
                        className={inputCls}
                      />
                      <input
                        value={s.description}
                        onChange={(e) => {
                          const n = [...skills];
                          n[i] = { ...n[i], description: e.target.value };
                          setSkills(n);
                        }}
                        placeholder="一行简要描述"
                        className={inputCls}
                      />
                    </div>
                    <button
                      onClick={() => setSkills(skills.filter((_, j) => j !== i))}
                      className="w-7 h-7 mt-1 rounded-[7px] flex items-center justify-center text-[#94A3B8] hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-[#94A3B8]">
                <p className="text-[13px]">暂无技能，点击上方「添加技能」</p>
              </div>
            )}
          </>
        )}

        {/* ── 连接 ── */}
        {tab === "连接" && (
          <>
            {/* Protocol mode badge */}
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium border",
                isHttpMode
                  ? "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]"
                  : "bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]",
              )}
            >
              <Info size={13} />
              {isHttpMode
                ? "HTTP 模式：使用 OpenAI 兼容 API（需在 OpenClaw 配置中启用 chatCompletions）"
                : "WS 模式：使用 Gateway WebSocket 协议（推荐）"}
            </div>

            <Field
              label="Gateway 地址"
              required
              hint="WS 模式：ws://host:port/ws 或 wss://host:port/ws  |  HTTP 模式：http://host:port"
            >
              <input
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="ws://localhost:18789/ws"
                className={cn(inputCls, "font-mono text-[13px]")}
              />
            </Field>

            <Field label="Agent ID" hint="目标 OpenClaw Agent 名称，留空使用默认 main">
              <input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="main"
                className={cn(inputCls, "font-mono text-[13px]")}
              />
            </Field>

            <Field
              label="鉴权 Token"
              hint="对应 OPENCLAW_GATEWAY_TOKEN 或 gateway.auth.token，留空则无鉴权"
            >
              <input
                value={wsToken}
                onChange={(e) => setWsToken(e.target.value)}
                type="password"
                placeholder="留空则不鉴权"
                className={inputCls}
              />
            </Field>

            {isEdit && (
              <>
                {/* Test connection */}
                <div className="space-y-2">
                  <button
                    onClick={handleTest}
                    disabled={testMut.isPending}
                    className="flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:underline disabled:opacity-50"
                  >
                    <Wifi size={14} /> {testMut.isPending ? "测试中..." : "一键测试连接"}
                  </button>
                  {testResult && (
                    <div
                      className={cn(
                        "flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg border",
                        testResult.success
                          ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]"
                          : "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]",
                      )}
                    >
                      {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      <span>
                        {testResult.message}
                        {testResult.success && testResult.rttMs !== undefined && (
                          <span className="ml-1.5 font-mono text-[12px] opacity-75">
                            · {testResult.rttMs} ms
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-[#F1F5F9]" />

                {/* Apply config to Gateway */}
                <div className="space-y-3">
                  <div>
                    <p className="text-[13px] font-medium text-[#0F172A]">推送配置到 Gateway</p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
                      验证 Gateway 连通性后，将配置写入{" "}
                      <code className="font-mono bg-[#F1F5F9] px-1 rounded">
                        ~/.openclaw/openclaw.json
                      </code>
                      ， 重启 OpenClaw 后生效
                    </p>
                  </div>
                  <button
                    onClick={handleApplyConfig}
                    disabled={applyMut.isPending || isPending}
                    className={cn(
                      "flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-lg text-[14px] font-medium transition-colors border",
                      applyMut.isPending
                        ? "bg-[#F1F5F9] text-[#94A3B8] border-[#E5E7EB] cursor-not-allowed"
                        : "bg-[#0F172A] text-white border-[#0F172A] hover:bg-[#1E293B]",
                    )}
                  >
                    <Upload size={15} />
                    {applyMut.isPending ? "推送中..." : "应用配置到 Gateway"}
                  </button>
                  {applyResult && (
                    <div
                      className={cn(
                        "flex flex-col gap-1.5 text-[13px] px-3 py-2.5 rounded-lg border",
                        applyResult.success
                          ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]"
                          : "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {applyResult.success ? (
                          <CheckCircle size={14} className="mt-0.5 flex-shrink-0" />
                        ) : (
                          <XCircle size={14} className="mt-0.5 flex-shrink-0" />
                        )}
                        <span>{applyResult.message}</span>
                      </div>
                      {applyResult.configPath && (
                        <div className="flex items-center gap-1.5 text-[11px] opacity-80 pl-5">
                          <FolderOpen size={11} className="flex-shrink-0" />
                          <span className="font-mono truncate">{applyResult.configPath}</span>
                        </div>
                      )}
                      {applyResult.needsRestart && (
                        <div className="flex items-center gap-1.5 text-[11px] bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] px-2 py-1 rounded ml-5">
                          <RotateCcw size={10} className="flex-shrink-0" />
                          重启 OpenClaw 后新配置生效
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[#E5E7EB] flex justify-end gap-2 flex-shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-[#E5E7EB] text-[14px] text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={isPending || !name || !gatewayUrl}
          className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
        >
          {isPending ? "保存中..." : isEdit ? "保存修改" : "创建 Bot"}
        </button>
      </div>
    </aside>
  );
}

// ── Sync status banner ──────────────────────────────────────────────────────

interface SyncBannerProps {
  status: "loading" | "ok" | "warn";
  message: string;
  onRefresh: () => void;
}

function SyncBanner({ status, message, onRefresh }: SyncBannerProps) {
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 px-6 py-2 bg-[#F8FAFC] border-b border-[#E5E7EB] text-[12px] text-[#64748B]">
        <RefreshCw size={12} className="animate-spin flex-shrink-0" />
        <span>正在从 Gateway 读取当前配置…</span>
      </div>
    );
  }

  if (status === "ok") {
    return (
      <div className="flex items-center justify-between gap-2 px-6 py-2 bg-[#F0FDF4] border-b border-[#BBF7D0]">
        <div className="flex items-center gap-1.5 text-[12px] text-[#15803D]">
          <CloudDownload size={12} className="flex-shrink-0" />
          <span>{message || "已从 Gateway 同步配置"}</span>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 text-[11px] text-[#15803D] hover:underline flex-shrink-0"
        >
          <RefreshCw size={11} /> 重新读取
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-6 py-2 bg-[#FFFBEB] border-b border-[#FDE68A]">
      <div className="flex items-center gap-1.5 text-[12px] text-[#92400E]">
        <AlertTriangle size={12} className="flex-shrink-0" />
        <span>{message || "无法连接 Gateway，显示本地缓存配置"}</span>
      </div>
      <button
        onClick={onRefresh}
        className="flex items-center gap-1 text-[11px] text-[#92400E] hover:underline flex-shrink-0"
      >
        <RefreshCw size={11} /> 重试
      </button>
    </div>
  );
}

// ── Shared styles ───────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-white outline-none focus:border-[#93C5FD] focus:shadow-[0_0_0_3px_rgba(147,197,253,0.25)] transition-all";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium text-[#0F172A]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {hint && <p className="text-[11px] text-[#94A3B8] leading-[1.6]">{hint}</p>}
      {children}
    </div>
  );
}
