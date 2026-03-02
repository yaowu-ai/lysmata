import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import type { Conversation } from "../../shared/types";
import { cn } from "../../shared/lib/utils";

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

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.indexOf(query);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-inherit rounded-sm px-0">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function ConversationSidebar({
  title,
  subtitle,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isLoading,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = searchQuery
    ? conversations.filter((c) => c.title.includes(searchQuery))
    : conversations;

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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索..."
            className="w-full pl-7 pr-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FAFAFA] outline-none focus:border-[#93C5FD] transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <p className="text-[13px] text-[#94A3B8] text-center py-6">加载中...</p>
        ) : filtered.length === 0 ? (
          <p className="text-[13px] text-[#94A3B8] text-center py-6">
            {searchQuery ? "无匹配对话" : "暂无对话"}
          </p>
        ) : (
          filtered.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-0.5",
                conv.id === activeId ? "bg-[#EFF6FF]" : "hover:bg-[#F1F5F9]",
              )}
              onClick={() => onSelect(conv.id)}
            >
              <div className="text-[13px] font-medium truncate pr-5">
                <Highlight text={conv.title} query={searchQuery} />
              </div>
              <div className="text-[11px] text-[#94A3B8] mt-0.5">
                {conv.type === "group" ? "群聊" : "私聊"}
              </div>
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  title="删除对话"
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[#94A3B8] hover:text-red-500 hover:bg-red-50 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
