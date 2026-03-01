# OpenClaw Chat 优化实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 Gateway WS 断线无重连、push 消息全量刷新、EventSource 频繁重建、system_event 无差异渲染、缺少流式打字机效果五个问题。

**Architecture:** 最小改动原则——重连逻辑封装在 connection-pool 内部，增量更新通过新增单条消息端点实现，流式临时状态放在组件本地 useState，system_event 渲染在 BotMessage 增加分支。

**Tech Stack:** Bun + Hono（sidecar）、React 19 + TanStack Query v5 + Zustand v5（前端）、TypeScript strict 模式

---

## Task 1: Gateway WS 自动重连

**Files:**

- Modify: `src-api/src/core/gateway/connection-pool.ts:343-358`（teardown 函数）
- Modify: `src-api/src/core/gateway/ws-adapter.ts:267-275`（onerror/onclose）

**Step 1: 在 `connection-pool.ts` 末尾，`teardown` 函数之前，添加重连调度函数**

在 `teardown` 函数定义（第 343 行）之前插入：

```ts
/** Schedules an exponential-backoff reconnect for unintentional disconnects. */
function scheduleReconnect(url: string, token: string | undefined, attempt: number): void {
  if (attempt > 10) {
    GatewayLogger.logSystem(url, `reconnect: giving up after ${attempt} attempts`);
    return;
  }
  const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
  GatewayLogger.logSystem(url, `reconnect: attempt ${attempt + 1} in ${delayMs}ms`);
  setTimeout(async () => {
    if (pool.has(url)) return; // already reconnected by another path
    try {
      const { connectWS } = await import("./ws-adapter");
      const entry = await connectWS(url, token);
      const handler = pushHandlerRegistry.get(url);
      if (handler) entry.onPushEvent = handler;
      GatewayLogger.logSystem(url, `reconnect: success on attempt ${attempt + 1}`);
    } catch {
      scheduleReconnect(url, token, attempt + 1);
    }
  }, delayMs);
}
```

**Step 2: 修改 `teardown` 签名，增加 `intentional` 参数和重连触发**

将现有 `teardown` 函数替换为：

```ts
export function teardown(url: string, entry: PoolEntry, err: Error, intentional = false): void {
  GatewayLogger.logSystem(url, `teardown: ${err.message} (intentional=${intentional})`);
  if (entry.heartbeatTimer) clearInterval(entry.heartbeatTimer);
  entry.activeRuns.forEach((run) => run.onError(err));
  entry.activeRuns.clear();
  entry.pendingRequests.forEach((cb) =>
    cb({ type: "res", id: "", ok: false, error: { message: err.message } }),
  );
  entry.pendingRequests.clear();
  entry.readyWaiters.forEach((w) => w.reject(err));
  entry.readyWaiters.length = 0;
  entry.ready = false;
  pool.delete(url);

  if (!intentional) {
    // Extract token from pushHandlerRegistry context — token not stored in entry,
    // so reconnect without token (ws-adapter will use stored device identity)
    scheduleReconnect(url, undefined, 0);
  }
}
```

**Step 3: 在 `ws-adapter.ts` 中，`shutdown` 事件的 teardown 调用加 `intentional=true`**

找到（约第 156 行）：

```ts
teardown(entry.url, entry, new Error("Gateway shutdown"));
```

改为：

```ts
teardown(entry.url, entry, new Error("Gateway shutdown"), true);
```

同样找到 sidecar shutdown 的 teardown（约第 374 行）：

```ts
teardown(url, entry, new Error("sidecar shutdown"));
```

改为：

```ts
teardown(url, entry, new Error("sidecar shutdown"), true);
```

**Step 4: 验证 TypeScript 编译无错误**

```bash
cd /path/to/lysmata
bun run build
```

Expected: 编译成功，无 TS 错误

**Step 5: Commit**

```bash
git add src-api/src/core/gateway/connection-pool.ts src-api/src/core/gateway/ws-adapter.ts
git commit -m "feat: add exponential-backoff WS reconnect on unintentional disconnect"
```

---

## Task 2: 新增单条消息查询端点

**Files:**

- Modify: `src-api/src/core/message-router.ts`（添加 `getMessage` 方法）
- Modify: `src-api/src/app/api/messages.ts`（添加 `GET /:msgId` 路由）

**Step 1: 在 `message-router.ts` 的 `MessageRouter` 对象中，`listMessages` 之后添加 `getMessage`**

```ts
getMessage(msgId: string): Message | null {
  return getDb()
    .query<Message, [string]>(
      'SELECT * FROM messages WHERE id = ?',
    )
    .get(msgId) ?? null;
},
```

**Step 2: 在 `messages.ts` 中，`messages.get('/')` 路由之后添加单条查询路由**

```ts
messages.get("/:msgId", (c) => {
  const msg = MessageRouter.getMessage(c.req.param("msgId"));
  if (!msg) throw notFound("Message");
  return c.json(msg);
});
```

注意：此路由必须放在 `messages.get('/stream', ...)` 和 `messages.get('/push-stream', ...)` **之前**，避免路径冲突。实际上 `stream` 和 `push-stream` 是字面量路径，不会与 `:msgId` 冲突，但顺序上建议放在 `GET /` 之后、`POST /` 之前。

**Step 3: 验证编译**

```bash
bun run build
```

Expected: 无错误

**Step 4: 手动验证端点（可选，需先启动 dev:api）**

```bash
# 先用 GET /conversations/:id/messages 拿一个真实 msgId
# 再请求单条
curl http://localhost:3000/conversations/<convId>/messages/<msgId>
```

Expected: 返回单条消息 JSON

**Step 5: Commit**

```bash
git add src-api/src/core/message-router.ts src-api/src/app/api/messages.ts
git commit -m "feat: add GET /messages/:msgId single message endpoint"
```

---

## Task 3: `useGlobalStream` 稳定化

**Files:**

- Modify: `src/shared/hooks/useGlobalStream.ts`

**Step 1: 将文件改为使用 `useRef` 持有 store getState**

完整替换文件内容：

```ts
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "../../config";
import { useAppStore } from "../store/app-store";
import { botKeys } from "./useBots";

export function useGlobalStream() {
  const qc = useQueryClient();
  const storeRef = useRef(useAppStore.getState);

  useEffect(() => {
    const url = `${API_BASE_URL}/bots/global-stream`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      let data: {
        type: string;
        botId?: string;
        payload?: Record<string, unknown>;
        metadata?: Record<string, unknown>;
      };
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const {
        setPresence,
        setHealth,
        setLastHeartbeat,
        setShutdown,
        addNodeRequest,
        resolveNodeRequest,
        setBotStatus,
        addBotNodeRequest,
        resolveBotNodeRequest,
      } = storeRef.current();

      const { botId } = data;

      switch (data.type) {
        case "tick":
          break;

        case "system_presence":
          qc.invalidateQueries({ queryKey: botKeys.all });
          if (botId && data.metadata) {
            setBotStatus(botId, { presence: data.metadata });
          } else if (data.metadata) {
            setPresence(data.metadata);
          }
          break;

        case "presence":
          qc.invalidateQueries({ queryKey: botKeys.all });
          if (botId && data.payload) {
            setBotStatus(botId, { presence: data.payload });
          } else if (data.payload) {
            setPresence(data.payload);
          }
          break;

        case "health":
          if (botId && data.payload) {
            setBotStatus(botId, { health: data.payload as Parameters<typeof setHealth>[0] });
          } else if (data.payload) {
            setHealth(data.payload as Parameters<typeof setHealth>[0]);
          }
          break;

        case "heartbeat":
          if (botId && data.payload) {
            setBotStatus(botId, {
              lastHeartbeat: data.payload as Parameters<typeof setLastHeartbeat>[0],
            });
          } else if (data.payload) {
            setLastHeartbeat(data.payload as Parameters<typeof setLastHeartbeat>[0]);
          }
          break;

        case "shutdown":
          if (botId) {
            setBotStatus(botId, { isShutdown: true });
          } else {
            setShutdown(true);
          }
          qc.invalidateQueries();
          break;

        case "node_pair_requested":
          if (botId && data.payload) {
            addBotNodeRequest(botId, data.payload as Parameters<typeof addBotNodeRequest>[1]);
          } else if (data.payload) {
            addNodeRequest(data.payload as Parameters<typeof addNodeRequest>[0]);
          }
          break;

        case "node_pair_resolved":
          if (botId && data.payload?.nodeId) {
            resolveBotNodeRequest(botId, data.payload.nodeId as string);
          } else if (data.payload?.nodeId && data.payload?.status) {
            resolveNodeRequest(
              data.payload.nodeId as string,
              data.payload.status as "approved" | "rejected",
            );
          }
          break;

        case "cron":
          if (botId) {
            setBotStatus(botId, { lastCronAt: new Date().toISOString() });
          }
          qc.invalidateQueries({ queryKey: botKeys.all });
          break;

        default:
          break;
      }
    };

    es.onerror = () => {};

    return () => {
      es.close();
    };
  }, [qc]); // 只依赖 qc，EventSource 生命周期内只建立一次
}
```

**Step 2: 验证 TypeScript 编译**

```bash
bun run build
```

Expected: 无错误

**Step 3: Commit**

```bash
git add src/shared/hooks/useGlobalStream.ts
git commit -m "perf: stabilize useGlobalStream EventSource with useRef store access"
```

---

## Task 4: `usePushStream` 增量更新

**Files:**

- Modify: `src/shared/hooks/usePushStream.ts`
- Modify: `src/shared/hooks/useMessages.ts`（添加 `useMessage` 单条查询 hook）

**Step 1: 在 `useMessages.ts` 中添加单条消息查询函数**

在文件末尾添加：

```ts
export async function fetchSingleMessage(conversationId: string, msgId: string): Promise<Message> {
  return apiClient.get<Message>(`/conversations/${conversationId}/messages/${msgId}`);
}
```

**Step 2: 替换 `usePushStream.ts` 为增量更新版本**

```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "../../config";
import { msgKeys, fetchSingleMessage } from "./useMessages";
import type { Message } from "../types";

export function usePushStream(conversationId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;

    const url = `${API_BASE_URL}/conversations/${conversationId}/messages/push-stream`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      let data: { msgId?: string; conversationId?: string; type?: string };
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const { msgId } = data;
      if (!msgId || !conversationId) return;

      // 1. 先插入占位，避免列表跳动
      qc.setQueryData<Message[]>(msgKeys.list(conversationId), (old = []) => {
        if (old.some((m) => m.id === msgId)) return old; // 已存在则跳过
        return [
          ...old,
          {
            id: msgId,
            conversation_id: conversationId,
            sender_type: "bot",
            bot_id: null,
            content: "",
            mentioned_bot_id: null,
            message_type: "text",
            metadata: null,
            created_at: new Date().toISOString(),
          } as Message,
        ];
      });

      // 2. 拉取完整消息替换占位
      fetchSingleMessage(conversationId, msgId)
        .then((msg) => {
          qc.setQueryData<Message[]>(msgKeys.list(conversationId), (old = []) =>
            old.map((m) => (m.id === msgId ? msg : m)),
          );
        })
        .catch(() => {
          // 拉取失败时回退到 invalidate
          qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) });
        });
    };

    es.onerror = () => {};

    return () => {
      es.close();
    };
  }, [conversationId, qc]);
}
```

**Step 3: 确认 `Message` 类型在 `src/shared/types` 中包含 `message_type` 和 `metadata` 字段**

```bash
grep -n "message_type\|metadata" src/shared/types/index.ts
```

如果缺少，在 `Message` 接口中补充：

```ts
message_type?: string;
metadata?: string | null;
```

**Step 4: 验证编译**

```bash
bun run build
```

Expected: 无错误

**Step 5: Commit**

```bash
git add src/shared/hooks/usePushStream.ts src/shared/hooks/useMessages.ts
git commit -m "perf: replace invalidateQueries with incremental setQueryData in usePushStream"
```

---

## Task 5: `useSendMessageStream` 流式 hook

**Files:**

- Modify: `src/shared/hooks/useMessages.ts`

**Step 1: 在 `useMessages.ts` 末尾添加 `useSendMessageStream`**

```ts
/**
 * Returns an async function that sends a message via the streaming endpoint
 * (GET /stream) and calls onChunk for each text chunk received.
 * Optimistically inserts the user message before streaming starts.
 * Invalidates the message list after streaming completes.
 */
export function useSendMessageStream(conversationId: string) {
  const qc = useQueryClient();

  return async (content: string, onChunk: (text: string) => void): Promise<void> => {
    // Optimistically insert user message
    const optimisticId = `optimistic-${Date.now()}`;
    qc.setQueryData<Message[]>(msgKeys.list(conversationId), (old = []) => [
      ...old,
      {
        id: optimisticId,
        conversation_id: conversationId,
        sender_type: "user",
        content,
        bot_id: null,
        mentioned_bot_id: null,
        message_type: "text",
        metadata: null,
        created_at: new Date().toISOString(),
      } as Message,
    ]);

    try {
      const res = await fetch(
        `${API_BASE_URL}/conversations/${conversationId}/messages/stream?content=${encodeURIComponent(content)}`,
      );
      if (!res.ok || !res.body) throw new Error(`Stream error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw) as { chunk?: string; error?: string };
            if (parsed.chunk) onChunk(parsed.chunk);
          } catch {}
        }
      }
    } finally {
      // Remove optimistic message and refetch to get real IDs + bot reply
      qc.setQueryData<Message[]>(msgKeys.list(conversationId), (old = []) =>
        old.filter((m) => m.id !== optimisticId),
      );
      await qc.invalidateQueries({ queryKey: msgKeys.list(conversationId) });
    }
  };
}
```

注意：需要在文件顶部导入 `API_BASE_URL`：

```ts
import { API_BASE_URL } from "../config";
```

**Step 2: 验证编译**

```bash
bun run build
```

Expected: 无错误

**Step 3: Commit**

```bash
git add src/shared/hooks/useMessages.ts
git commit -m "feat: add useSendMessageStream hook for streaming bot replies"
```

---

## Task 6: `BotMessage` system_event 渲染

**Files:**

- Modify: `src/pages/Chat/BotMessage.tsx`

**Step 1: 在 `BotMessage.tsx` 中，`isApproval` 判断之后，添加 `isSystemEvent` 判断和渲染**

在 `const isApproval = message.message_type === 'approval';` 之后添加：

```ts
const isSystemEvent = message.message_type === "system_event";
```

在 JSX 的气泡区域，将现有的三元表达式：

```tsx
{isApproval ? (
  // approval 卡片...
) : (
  // 普通文本气泡
)}
```

改为：

```tsx
{
  isApproval ? (
    // 保持现有 approval 卡片不变
    <div className="border border-[#E2E8F0] bg-white rounded-lg shadow-sm overflow-hidden text-[13px]">
      {/* ... 现有内容不变 ... */}
    </div>
  ) : isSystemEvent ? (
    <SystemEventCard metadata={metadata} content={message.content} />
  ) : (
    <div
      className={cn(
        "rounded-[0_12px_12px_12px] px-3.5 py-2.5 text-[14px] leading-[1.65] break-words whitespace-pre-wrap",
        isPrimary ? "bg-[#F0F7FF] border-l-[3px] border-[#2563EB]" : "bg-[#F1F5F9]",
      )}
    >
      {message.content}
    </div>
  );
}
```

**Step 2: 在同文件中，组件函数之前添加 `SystemEventCard` 子组件**

```tsx
function SystemEventCard({
  metadata,
  content,
}: {
  metadata: Record<string, unknown>;
  content: string;
}) {
  // 通过 metadata 字段区分子类型
  const hasResult = "result" in metadata;
  const hasReason = "reason" in metadata && !hasResult;
  const hasSummary = "summary" in metadata;

  if (hasResult) {
    // exec_finished
    const result = metadata.result as Record<string, unknown> | undefined;
    return (
      <div className="border border-[#D1FAE5] bg-[#F0FDF4] rounded-lg overflow-hidden text-[13px]">
        <div className="px-3 py-2 font-semibold flex items-center gap-2 border-b border-[#D1FAE5]">
          <span>✅</span> 命令执行完成
        </div>
        {result && (
          <div className="p-3">
            {result.command && (
              <div className="mb-1">
                <code className="bg-[#DCFCE7] px-1.5 py-0.5 rounded text-[#166534] text-[12px]">
                  {String(result.command)}
                </code>
              </div>
            )}
            {result.output && (
              <pre className="bg-[#1E293B] text-[#E2E8F0] p-2 rounded-md overflow-x-auto text-[12px] max-h-[120px] overflow-y-auto mt-2">
                {String(result.output)}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  if (hasReason) {
    // exec_denied
    return (
      <div className="border border-[#FEE2E2] bg-[#FFF5F5] rounded-lg overflow-hidden text-[13px]">
        <div className="px-3 py-2 font-semibold flex items-center gap-2 border-b border-[#FEE2E2]">
          <span>🚫</span> 命令执行被拒绝
        </div>
        <div className="p-3 text-[#991B1B]">{String(metadata.reason || "未提供原因")}</div>
      </div>
    );
  }

  if (hasSummary) {
    // cron
    return (
      <div className="border border-[#E2E8F0] bg-[#F8FAFC] rounded-lg overflow-hidden text-[13px]">
        <div className="px-3 py-2 font-semibold flex items-center gap-2 border-b border-[#E2E8F0] text-[#475569]">
          <span>🕐</span> 定时任务完成
        </div>
        <div className="p-3 text-[#334155] whitespace-pre-wrap">{String(metadata.summary)}</div>
      </div>
    );
  }

  // 兜底：未知 system_event，显示原始 content
  return (
    <div className="border border-[#E2E8F0] bg-[#F8FAFC] rounded-lg px-3 py-2 text-[13px] text-[#64748B]">
      <span className="mr-2">⚙️</span>
      {content}
    </div>
  );
}
```

**Step 3: 验证编译**

```bash
bun run build
```

Expected: 无错误

**Step 4: Commit**

```bash
git add src/pages/Chat/BotMessage.tsx
git commit -m "feat: render system_event messages (exec_finished, exec_denied, cron) in chat"
```

---

## Task 7: PrivateChatPage 接入流式输出

**Files:**

- Modify: `src/pages/Chat/PrivateChatPage.tsx`

**Step 1: 替换 `useSendMessage` 为 `useSendMessageStream`，添加 `streamingContent` 状态**

在 imports 中，将：

```ts
import { useMessages, useSendMessage } from "../../shared/hooks/useMessages";
```

改为：

```ts
import { useMessages, useSendMessageStream } from "../../shared/hooks/useMessages";
```

在组件内，将：

```ts
const sendMut = useSendMessage(activeId ?? "");
```

改为：

```ts
const sendStream = useSendMessageStream(activeId ?? "");
const [streamingContent, setStreamingContent] = useState<string | null>(null);
const [isSending, setIsSending] = useState(false);
```

**Step 2: 替换 `handleSend` 逻辑**

将 `MessageInput` 的 `onSend` prop 改为：

```tsx
onSend={async (content) => {
  setIsSending(true);
  setStreamingContent('');
  try {
    await sendStream(content, (chunk) => setStreamingContent(chunk));
  } finally {
    setStreamingContent(null);
    setIsSending(false);
  }
}}
disabled={isSending}
```

**Step 3: 替换消息列表末尾的 loading 气泡**

将现有的：

```tsx
{
  sendMut.isPending && <div className="flex items-start gap-2.5">...三点动画...</div>;
}
```

改为：

```tsx
{
  streamingContent !== null && (
    <div className="flex items-start gap-2.5">
      <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl flex-shrink-0 mt-0.5">
        {convBot?.avatar_emoji ?? "🤖"}
      </div>
      <div className="max-w-[75%]">
        {streamingContent === "" ? (
          // 流已开始但无内容：三点动画
          <div className="bg-[#F1F5F9] rounded-[0_12px_12px_12px] px-3.5 py-2.5 flex gap-1.5 items-center">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        ) : (
          // 有内容：打字机气泡 + 光标
          <div className="bg-[#F0F7FF] border-l-[3px] border-[#2563EB] rounded-[0_12px_12px_12px] px-3.5 py-2.5 text-[14px] leading-[1.65] break-words whitespace-pre-wrap">
            {streamingContent}
            <span className="inline-block w-[2px] h-[14px] bg-[#2563EB] ml-0.5 animate-pulse align-middle" />
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 4: 验证编译**

```bash
bun run build
```

Expected: 无错误

**Step 5: Commit**

```bash
git add src/pages/Chat/PrivateChatPage.tsx
git commit -m "feat: add streaming typewriter effect in PrivateChatPage"
```

---

## Task 8: GroupChatPage 接入流式输出

**Files:**

- Modify: `src/pages/Chat/GroupChatPage.tsx`

与 Task 7 完全相同的改动模式，应用到 `GroupChatPage.tsx`。

注意 GroupChatPage 中 `convBot` 可能是多个 Bot，流式气泡的头像使用路由目标 Bot 的 emoji（如果能从 `sendStream` 返回，否则用默认 🤖）。

**Step 1-4:** 同 Task 7，将相同的 `useSendMessageStream`、`streamingContent`、`isSending` 改动应用到 `GroupChatPage.tsx`。

**Step 5: Commit**

```bash
git add src/pages/Chat/GroupChatPage.tsx
git commit -m "feat: add streaming typewriter effect in GroupChatPage"
```

---

## 验证清单

所有 Task 完成后：

```bash
# 1. 完整编译
bun run build

# 2. Lint 检查
bun run lint

# 3. 启动开发环境手动验证
bun run dev:api   # 终端 1
bun run dev       # 终端 2
```

手动验证点：

- [ ] 发送消息后出现三点动画，随后逐字显示 Bot 回复
- [ ] Bot 主动推送的消息（exec_finished/cron）以卡片形式显示
- [ ] 关闭 Gateway 后等待约 1s 自动重连（查看 sidecar 日志）
- [ ] 新消息到达时消息列表不整体闪烁（增量追加）
