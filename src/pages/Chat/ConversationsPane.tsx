import { Conversations } from "@ant-design/x";
import type { ItemType } from "@ant-design/x/es/conversations";
import { Modal } from "antd";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Conversation } from "../../shared/types";

interface Props {
  title: string;
  subtitle: string;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete?: (id: string) => void;
  isLoading?: boolean;
}

function timeBucket(updatedAt: string): string {
  const now = Date.now();
  const t = new Date(updatedAt).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = now - t;
  if (diff < dayMs) return "今天";
  if (diff < 2 * dayMs) return "昨天";
  if (diff < 7 * dayMs) return "本周";
  if (diff < 30 * dayMs) return "本月";
  return "更早";
}

const GROUP_ORDER: Record<string, number> = {
  今天: 0,
  昨天: 1,
  本周: 2,
  本月: 3,
  更早: 4,
};

export function ConversationsPane({
  title,
  subtitle,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isLoading,
}: Props) {
  const [query, setQuery] = useState("");

  const items = useMemo<ItemType[]>(() => {
    const filtered = query
      ? conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
      : conversations;

    // Sort by group bucket first so the "今天 / 昨天 / 本周 ..." sections
    // appear in a stable, semantic order; then by recency within each bucket.
    return [...filtered]
      .map((c) => ({ c, group: timeBucket(c.updated_at) }))
      .sort((a, b) => {
        const ga = GROUP_ORDER[a.group] ?? 999;
        const gb = GROUP_ORDER[b.group] ?? 999;
        if (ga !== gb) return ga - gb;
        return new Date(b.c.updated_at).getTime() - new Date(a.c.updated_at).getTime();
      })
      .map(({ c, group }) => ({
        key: c.id,
        label: c.title,
        group,
      }));
  }, [conversations, query]);

  return (
    <aside className="w-[260px] bg-white border-r border-[#E5E7EB] flex flex-col flex-shrink-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[#F1F5F9]">
        <div className="flex items-center justify-between mb-1">
          <div>
            <div className="text-[15px] font-semibold">{title}</div>
            <div className="text-[12px] text-[#64748B] mt-0.5">{subtitle}</div>
          </div>
          <button
            onClick={onNew}
            title="新建对话"
            className="w-8 h-8 bg-[#EFF6FF] rounded-lg flex items-center justify-center hover:bg-blue-100 transition-colors"
          >
            <Plus size={15} className="text-[#2563EB]" />
          </button>
        </div>
        <div className="relative mt-2">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#CBD5E1]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索..."
            className="w-full pl-7 pr-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FAFAFA] outline-none focus:border-[#93C5FD] transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="text-[13px] text-[#94A3B8] text-center py-6">加载中...</p>
        ) : items.length === 0 ? (
          <p className="text-[13px] text-[#94A3B8] text-center py-6">
            {query ? "无匹配对话" : "暂无对话"}
          </p>
        ) : (
          <Conversations
            items={items}
            activeKey={activeId ?? undefined}
            onActiveChange={(key) => onSelect(String(key))}
            groupable
            menu={
              onDelete
                ? (item) => ({
                    items: [
                      {
                        key: "delete",
                        label: "删除",
                        danger: true,
                        onClick: () => {
                          Modal.confirm({
                            title: "删除对话",
                            content: "确定要删除这个对话吗？删除后将无法恢复。",
                            okText: "删除",
                            okButtonProps: { danger: true },
                            cancelText: "取消",
                            onOk: () => onDelete(String(item.key)),
                          });
                        },
                      },
                    ],
                  })
                : undefined
            }
          />
        )}
      </div>
    </aside>
  );
}
