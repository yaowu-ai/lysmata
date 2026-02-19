import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useCreateConversation } from '../../shared/hooks/useConversations';
import type { Bot, ConversationType } from '../../shared/types';
import { cn } from '../../shared/lib/utils';

interface Props {
  open: boolean;
  mode: ConversationType;
  bots: Bot[];
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function NewConversationDialog({ open, mode, bots, onClose, onCreated }: Props) {
  const createMut = useCreateConversation();
  const [title, setTitle] = useState('');
  const [selectedBotId, setSelectedBotId] = useState('');
  const [selectedBotIds, setSelectedBotIds] = useState<string[]>([]);
  const [primaryBotId, setPrimaryBotId] = useState('');

  useEffect(() => {
    setTitle(''); setSelectedBotId(''); setSelectedBotIds([]); setPrimaryBotId('');
  }, [open]);

  const selectedBots = selectedBotIds.map((id) => bots.find((b) => b.id === id)!).filter(Boolean);

  async function handleCreate() {
    const botIds = mode === 'single' ? [selectedBotId] : selectedBotIds;
    if (!botIds.length) return;
    const primaryId = mode === 'single' ? selectedBotId : (primaryBotId || selectedBotIds[0]);
    const autoTitle = title.trim() || (mode === 'single'
      ? `与 ${bots.find((b) => b.id === selectedBotId)?.name ?? 'Bot'} 的对话`
      : selectedBots.map((b) => b.name).join('·') + ' 群');
    const conv = await createMut.mutateAsync({ title: autoTitle, type: mode, botIds, primaryBotId: primaryId });
    onCreated?.(conv.id);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-[rgba(15,23,42,0.25)] z-40 flex items-center justify-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-[14px] w-[480px] max-h-[80vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[17px] font-semibold">{mode === 'single' ? '新建私聊' : '新建群聊'}</h2>
            <p className="text-[13px] text-[#64748B] mt-1">{mode === 'single' ? '选择一个 Bot 开始对话' : '选择多个 Bot 开始协作'}</p>
          </div>
          <button onClick={onClose} className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] transition-colors">
            <X size={16} />
          </button>
        </div>

        <label className="text-[13px] font-medium block mb-2">
          {mode === 'single' ? '选择 Bot' : '选择参与 Bot'}{' '}
          <span className="text-[#94A3B8] font-normal">{mode === 'group' && '（可多选，至少 2 个）'}</span>
        </label>
        <div className="space-y-2 mb-5">
          {bots.map((bot) => {
            const checked = mode === 'single' ? selectedBotId === bot.id : selectedBotIds.includes(bot.id);
            return (
              <div key={bot.id}
                onClick={() => {
                  if (mode === 'single') { setSelectedBotId(bot.id); }
                  else {
                    setSelectedBotIds((ids) => ids.includes(bot.id) ? ids.filter((i) => i !== bot.id) : [...ids, bot.id]);
                    if (!primaryBotId) setPrimaryBotId(bot.id);
                  }
                }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg border-[1.5px] cursor-pointer transition-all',
                  checked ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]' : 'border-[#E5E7EB] hover:border-[#93C5FD]',
                )}
              >
                <div className="w-[26px] h-[26px] rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-sm flex-shrink-0">
                  {bot.avatar_emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13px]">{bot.name}</div>
                  <div className="text-[11px] text-[#64748B] truncate">{bot.description || bot.openclaw_ws_url}</div>
                </div>
                {checked && <span className="text-[#2563EB] text-[18px]">✓</span>}
              </div>
            );
          })}
        </div>

        {mode === 'group' && selectedBotIds.length >= 2 && (
          <div className="mb-5">
            <label className="text-[13px] font-medium block mb-2">
              设置主 Bot <span className="text-[#94A3B8] font-normal">（接收用户消息，统筹协作）</span>
            </label>
            <select value={primaryBotId} onChange={(e) => setPrimaryBotId(e.target.value)}
              className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-white outline-none focus:border-[#93C5FD] transition-colors">
              {selectedBots.map((b) => (
                <option key={b.id} value={b.id}>{b.avatar_emoji} {b.name}</option>
              ))}
            </select>
          </div>
        )}

        <label className="text-[13px] font-medium block mb-2">对话名称</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="留空自动生成" className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-white outline-none focus:border-[#93C5FD] transition-colors mb-5" />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[#E5E7EB] text-[14px] text-[#64748B] hover:bg-[#F8FAFC] transition-colors">取消</button>
          <button onClick={handleCreate} disabled={createMut.isPending || (mode === 'single' ? !selectedBotId : selectedBotIds.length < 2)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors disabled:opacity-50">
            <Plus size={14} /> 创建对话
          </button>
        </div>
      </div>
    </div>
  );
}
