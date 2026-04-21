import { Prompts, Welcome } from "@ant-design/x";
import type { Bot } from "../../shared/types";

interface Props {
  bot?: Bot | null;
  hasConversation: boolean;
  onPromptClick?: (prompt: string) => void;
}

function buildPrompts(bot?: Bot | null) {
  const desc = bot?.description?.trim();
  const name = bot?.name ?? "Bot";
  if (desc) {
    return [
      { key: "intro", label: `介绍一下你能做什么` },
      { key: "list", label: `列出 ${name} 目前挂载的 MCP / 技能` },
      { key: "test", label: "跑一个 hello world 验证连通性" },
    ];
  }
  return [
    { key: "hello", label: "你好，你能做什么？" },
    { key: "help", label: "给我一些典型使用建议" },
    { key: "test", label: "发一条测试消息验证连通性" },
  ];
}

export function ChatEmpty({ bot, hasConversation, onPromptClick }: Props) {
  if (!hasConversation) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Welcome title="开始一段对话" description="在左侧选择一个对话，或点击 + 新建一个" />
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
      <Welcome
        icon={<div className="text-5xl leading-none">{bot?.avatar_emoji ?? "🤖"}</div>}
        title={bot?.name ? `Hi, 我是 ${bot.name}` : "Hi"}
        description={bot?.description || "准备好了，发消息试试"}
      />
      <Prompts
        items={buildPrompts(bot)}
        wrap
        onItemClick={(info) => {
          const label =
            typeof info.data.label === "string" ? info.data.label : String(info.data.label ?? "");
          if (label && onPromptClick) onPromptClick(label);
        }}
      />
    </div>
  );
}
