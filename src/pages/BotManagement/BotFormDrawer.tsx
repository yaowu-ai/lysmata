import { useEffect, useState } from 'react';
import { X, Plus, Trash2, Wifi, CheckCircle, XCircle, Info } from 'lucide-react';
import { useCreateBot, useUpdateBot, useTestBotConnection } from '../../shared/hooks/useBots';
import type { Bot, SkillConfig } from '../../shared/types';
import { cn } from '../../shared/lib/utils';

const TABS = ['基础', 'Skills', 'MCP', '连接'] as const;
type Tab = (typeof TABS)[number];

interface Props {
  open: boolean;
  bot: Bot | null;
  onClose: () => void;
}

export function BotFormDrawer({ open, bot, onClose }: Props) {
  const isEdit = !!bot;
  const createMut = useCreateBot();
  const updateMut = useUpdateBot(bot?.id ?? '');
  const testMut = useTestBotConnection();

  const [tab, setTab] = useState<Tab>('基础');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🤖');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [mcpJson, setMcpJson] = useState('{}');
  const [gatewayUrl, setGatewayUrl] = useState('ws://localhost:18789/ws');
  const [agentId, setAgentId] = useState('main');
  const [wsToken, setWsToken] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (bot) {
      setName(bot.name);
      setEmoji(bot.avatar_emoji);
      setDescription(bot.description);
      const s = Array.isArray(bot.skills_config)
        ? bot.skills_config
        : JSON.parse(bot.skills_config as unknown as string);
      setSkills(s);
      setMcpJson(typeof bot.mcp_config === 'string' ? bot.mcp_config : JSON.stringify(bot.mcp_config, null, 2));
      setGatewayUrl(bot.openclaw_ws_url);
      setAgentId(bot.openclaw_agent_id ?? 'main');
      setWsToken(bot.openclaw_ws_token ?? '');
      setIsActive(!!bot.is_active);
    } else {
      setName(''); setEmoji('🤖'); setDescription(''); setSkills([]);
      setMcpJson('{}'); setGatewayUrl('ws://localhost:18789/ws');
      setAgentId('main'); setWsToken(''); setIsActive(true);
    }
    setTab('基础');
    setTestResult(null);
  }, [bot, open]);

  async function handleSave() {
    const payload = {
      name,
      avatar_emoji: emoji,
      description,
      skills_config: skills,
      mcp_config: (() => { try { return JSON.parse(mcpJson); } catch { return {}; } })(),
      openclaw_ws_url: gatewayUrl,
      openclaw_agent_id: agentId || 'main',
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

  const isPending = createMut.isPending || updateMut.isPending;
  const isHttpMode = gatewayUrl.startsWith('http://') || gatewayUrl.startsWith('https://');

  return (
    <aside
      className={cn(
        'fixed top-0 right-0 bottom-0 w-[480px] bg-white z-30 flex flex-col shadow-[-8px_0_32px_rgba(0,0,0,0.08)] transition-transform duration-[250ms] ease-in-out',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="font-semibold text-[17px]">{isEdit ? '编辑 Bot' : '新建 Bot'}</h2>
          <p className="text-[12px] text-[#64748B] mt-0.5">配置 OpenClaw Gateway 连接信息</p>
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
              'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors',
              tab === t
                ? 'text-[#2563EB] border-[#2563EB]'
                : 'text-[#64748B] border-transparent hover:text-[#0F172A]',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {tab === '基础' && (
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
                className={cn(inputCls, 'text-xl')}
              />
            </Field>
            <Field label="能力描述" hint="将在群聊感知注入中展示给其他 Bot">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="擅长代码审查与 TypeScript 最佳实践..."
                className={cn(inputCls, 'resize-none')}
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

        {tab === 'Skills' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-[#64748B]">技能列表（用于群聊感知注入）</p>
              <button
                onClick={() => setSkills([...skills, { name: '', description: '' }])}
                className="text-[13px] text-[#2563EB] hover:underline flex items-center gap-1"
              >
                <Plus size={13} /> 添加技能
              </button>
            </div>
            {skills.map((s, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <input
                    value={s.name}
                    onChange={(e) => { const n = [...skills]; n[i] = { ...n[i], name: e.target.value }; setSkills(n); }}
                    placeholder="技能名称"
                    className={inputCls}
                  />
                  <input
                    value={s.description}
                    onChange={(e) => { const n = [...skills]; n[i] = { ...n[i], description: e.target.value }; setSkills(n); }}
                    placeholder="一行描述"
                    className={inputCls}
                  />
                </div>
                <button
                  onClick={() => setSkills(skills.filter((_, j) => j !== i))}
                  className="w-7 h-7 mt-1 rounded-[7px] flex items-center justify-center text-[#94A3B8] hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {skills.length === 0 && (
              <p className="text-[13px] text-[#94A3B8] text-center py-4">暂无技能，点击上方添加</p>
            )}
          </>
        )}

        {tab === 'MCP' && (
          <Field label="MCP 配置 JSON" hint="填写 MCP 服务器配置">
            <textarea
              value={mcpJson}
              onChange={(e) => setMcpJson(e.target.value)}
              rows={12}
              spellCheck={false}
              className={cn(inputCls, 'resize-none font-mono text-[12px] leading-relaxed')}
            />
          </Field>
        )}

        {tab === '连接' && (
          <>
            {/* Protocol mode badge */}
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium border',
              isHttpMode
                ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                : 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]',
            )}>
              <Info size={13} />
              {isHttpMode
                ? 'HTTP 模式：使用 OpenAI 兼容 API（需在 OpenClaw 配置中启用 chatCompletions）'
                : 'WS 模式：使用 Gateway WebSocket 协议（推荐，默认开启）'}
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
                className={cn(inputCls, 'font-mono text-[13px]')}
              />
            </Field>

            <Field
              label="Agent ID"
              hint="目标 OpenClaw Agent 名称，留空使用默认 main"
            >
              <input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="main"
                className={cn(inputCls, 'font-mono text-[13px]')}
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
              <div className="space-y-2">
                <button
                  onClick={handleTest}
                  disabled={testMut.isPending}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:underline disabled:opacity-50"
                >
                  <Wifi size={14} /> {testMut.isPending ? '测试中...' : '一键测试连接'}
                </button>
                {testResult && (
                  <div
                    className={cn(
                      'flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg border',
                      testResult.success
                        ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                        : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]',
                    )}
                  >
                    {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {testResult.message}
                  </div>
                )}
              </div>
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
          {isPending ? '保存中...' : isEdit ? '保存修改' : '创建 Bot'}
        </button>
      </div>
    </aside>
  );
}

const inputCls =
  'w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-white outline-none focus:border-[#93C5FD] focus:shadow-[0_0_0_3px_rgba(147,197,253,0.25)] transition-all';

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
