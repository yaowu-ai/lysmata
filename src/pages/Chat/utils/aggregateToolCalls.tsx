import type { ThoughtChainItemType } from "@ant-design/x/es/thought-chain/interface";
import type { AgentEvent, Message } from "../../../shared/types";

/** Union item consumed by ChatBody to render either a chat bubble or a ThoughtChain. */
export type ChatItem =
  | { kind: "message"; message: Message }
  | { kind: "chain"; key: string; items: ThoughtChainItemType[] };

interface ToolCallRef {
  item: ThoughtChainItemType;
  lang?: string;
}

const toolIconMap: Record<string, string> = {
  read: "📖",
  readfile: "📖",
  edit: "✏️",
  write: "✏️",
  bash: "⚡",
  exec: "⚡",
  shell: "⚡",
  think: "🤔",
  thinking: "🤔",
  search: "🔎",
  grep: "🔎",
  glob: "🔎",
};

function pickIcon(name: string): string {
  const k = name.toLowerCase();
  if (toolIconMap[k]) return toolIconMap[k];
  for (const [prefix, icon] of Object.entries(toolIconMap)) {
    if (k.startsWith(prefix)) return icon;
  }
  return "🔧";
}

function summarizeArgs(args: unknown): string {
  if (args == null) return "";
  if (typeof args === "string") return args.length > 80 ? args.slice(0, 77) + "..." : args;
  if (typeof args === "object") {
    const obj = args as Record<string, unknown>;
    if (typeof obj.path === "string") return obj.path;
    if (typeof obj.file === "string") return obj.file;
    if (typeof obj.query === "string") return obj.query;
    if (typeof obj.command === "string") return obj.command;
    try {
      const s = JSON.stringify(obj);
      return s.length > 80 ? s.slice(0, 77) + "..." : s;
    } catch {
      return "[object]";
    }
  }
  return String(args);
}

function argsContent(args: unknown): string {
  if (args == null) return "";
  try {
    return typeof args === "string" ? args : JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function resultContent(result: unknown, error?: string): string {
  if (error) return `Error: ${error}`;
  if (result == null) return "";
  try {
    return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function parseMetadata(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function makeCallItem(key: string, toolName: string, args: unknown): ThoughtChainItemType {
  const summary = summarizeArgs(args);
  return {
    key,
    icon: <span>{pickIcon(toolName)}</span>,
    title: summary ? `${toolName}: ${summary}` : toolName,
    description: undefined,
    content: argsContent(args) || undefined,
    status: "loading",
    collapsible: true,
  };
}

function applyResult(item: ThoughtChainItemType, result: unknown, error?: string): void {
  item.status = error ? "error" : "success";
  const resultText = resultContent(result, error);
  if (resultText) {
    // Prefer showing result over args on success; for errors, keep both.
    item.content = error ? `${(item.content as string) ?? ""}\n\n${resultText}`.trim() : resultText;
  }
}

/** Aggregate persisted messages for rendering: group tool_call/tool_result runs. */
export function aggregateMessages(messages: Message[]): ChatItem[] {
  const out: ChatItem[] = [];
  let chain: ThoughtChainItemType[] = [];
  const byCallId = new Map<string, ToolCallRef>();
  let chainSeq = 0;

  const flush = () => {
    if (chain.length === 0) return;
    out.push({ kind: "chain", key: `chain-${chainSeq++}`, items: chain });
    chain = [];
    byCallId.clear();
  };

  for (const m of messages) {
    if (m.message_type === "tool_call") {
      const meta = parseMetadata(m.metadata);
      const toolName =
        (typeof meta.toolName === "string" && meta.toolName) ||
        (typeof meta.name === "string" && meta.name) ||
        (typeof meta.tool === "string" && meta.tool) ||
        "tool";
      const callId =
        (typeof meta.callId === "string" && meta.callId) ||
        (typeof meta.call_id === "string" && meta.call_id) ||
        m.id;
      const args = meta.args ?? meta.input ?? meta.params;
      const item = makeCallItem(`tc-${m.id}`, toolName, args);
      chain.push(item);
      byCallId.set(callId, { item });
      continue;
    }
    if (m.message_type === "tool_result") {
      const meta = parseMetadata(m.metadata);
      const callId =
        (typeof meta.callId === "string" && meta.callId) ||
        (typeof meta.call_id === "string" && meta.call_id) ||
        "";
      const ref = byCallId.get(callId);
      const error = typeof meta.error === "string" ? meta.error : undefined;
      const result = meta.result ?? meta.output ?? m.content;
      if (ref) {
        applyResult(ref.item, result, error);
      } else {
        // Orphan result — render as its own node.
        chain.push({
          key: `tr-${m.id}`,
          icon: <span>🔧</span>,
          title: "tool result",
          status: error ? "error" : "success",
          content: resultContent(result, error) || undefined,
          collapsible: true,
        });
      }
      continue;
    }
    // Non-tool message — close any pending chain before the message.
    flush();
    out.push({ kind: "message", message: m });
  }
  flush();
  return out;
}

/** Build in-flight ThoughtChain items from AgentEvents streamed on /stream. */
export function aggregateEvents(events: AgentEvent[]): ThoughtChainItemType[] {
  const items: ThoughtChainItemType[] = [];
  const byCallId = new Map<string, ThoughtChainItemType>();
  let fallbackSeq = 0;

  for (const ev of events) {
    if (ev.type === "tool_call") {
      const key = ev.callId ?? `inflight-${fallbackSeq++}`;
      const item = makeCallItem(key, ev.toolName, ev.args);
      items.push(item);
      if (ev.callId) byCallId.set(ev.callId, item);
      continue;
    }
    if (ev.type === "tool_result") {
      if (ev.callId && byCallId.has(ev.callId)) {
        applyResult(byCallId.get(ev.callId)!, ev.result, ev.error);
      } else {
        items.push({
          key: `tr-inflight-${fallbackSeq++}`,
          icon: <span>🔧</span>,
          title: "tool result",
          status: ev.error ? "error" : "success",
          content: resultContent(ev.result, ev.error) || undefined,
          collapsible: true,
        });
      }
      continue;
    }
    // Other events (presence / heartbeat / etc.) are not rendered in ThoughtChain.
  }
  return items;
}
