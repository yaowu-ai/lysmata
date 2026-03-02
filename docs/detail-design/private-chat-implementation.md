# 私聊功能代码实现梳理

> 文档记录时间：2026-03-02
> 覆盖范围：US-03-01 ～ US-03-06 私聊功能的完整前后端实现状态，包含数据流、核心文件、数据库 Schema、已实现与未实现功能详解。

---

## 目录

1. [三层架构数据流](#1-三层架构数据流)
2. [核心文件清单](#2-核心文件清单)
3. [数据库 Schema](#3-数据库-schema)
4. [已实现功能详解](#4-已实现功能详解)
   - 4.1 US-03-01：发起私聊
   - 4.2 US-03-02 AC1/AC3：流式接收 Bot 响应
   - 4.3 US-03-03 AC1/AC3：历史消息加载与持久化
   - 4.4 US-03-06 AC1：hover 删除图标
5. [未实现功能清单](#5-未实现功能清单)
6. [关键算法：流式 SSE 无缝乐观更新](#6-关键算法流式-sse-无缝乐观更新)
7. [类型定义速查](#7-类型定义速查)

---

## 1. 三层架构数据流

```
┌──────────────────────────────────────────────────────────┐
│                  前端（React + Vite）                      │
│                   src/  [port 1420]                       │
│                                                           │
│  PrivateChatPage.tsx                                      │
│    ├── ConversationSidebar.tsx  ← 会话列表 + 搜索框(占位) │
│    ├── BotMessage.tsx           ← 消息气泡渲染             │
│    ├── MessageInput.tsx         ← 输入框 + @提及           │
│    └── NewConversationDialog    ← 新建对话弹窗             │
│                                                           │
│  Hooks 层                       状态层                    │
│    useConversations             chat-store（Zustand）     │
│    useMessages                    activeConversationId    │
│    useSendMessageStream                                   │
│    usePushStream（SSE）                                   │
└───────────────────────┬──────────────────────────────────┘
                        │  HTTP REST + SSE（fetch / EventSource）
                        │  API_BASE_URL = http://127.0.0.1:PORT
                        ▼
┌──────────────────────────────────────────────────────────┐
│              Sidecar API（Bun + Hono）                    │
│                src-api/  [127.0.0.1:PORT]                │
│                                                           │
│  api/conversations.ts     ConversationService            │
│  api/messages.ts          MessageRouter                  │
│    GET  /messages                                        │
│    POST /messages         （非流式，备用）                 │
│    GET  /messages/stream  （SSE 流式，主路径）             │
│    GET  /messages/push-stream  （Bot 主动推送 SSE）        │
│    GET  /messages/:msgId                                 │
│                                                          │
│  shared/db.ts（SQLite WAL 模式）                          │
└──────────────────────────────────────────────────────────┘
```

**两条实时数据流：**

| 流 | 发起方 | 端点 | Hook | 用途 |
|---|---|---|---|---|
| 用户发消息（请求-响应） | 前端 | `GET /messages/stream?content=...` | `useSendMessageStream` | 用户主动发消息，SSE 流式返回 Bot 回复 |
| Bot 主动推送 | Bot → Gateway → Sidecar | `GET /messages/push-stream` | `usePushStream` | Bot 定时任务/事件主动发消息给用户 |

---

## 2. 核心文件清单

### 前端（`src/`）

| 文件路径 | 职责 |
|---|---|
| `src/pages/Chat/PrivateChatPage.tsx` | 私聊页主容器，组合 Sidebar + 消息区 + 输入框；管理流式状态 `streamingContent`、`isSending` |
| `src/pages/Chat/ConversationSidebar.tsx` | 会话列表侧边栏；hover 删除按钮；搜索框（UI 占位，**无绑定逻辑**） |
| `src/pages/Chat/BotMessage.tsx` | 渲染单条消息：用户消息（右对齐蓝色）、Bot 消息（左对齐）、approval 卡片、system_event 卡片 |
| `src/pages/Chat/MessageInput.tsx` | 多行输入框；`@提及` Bot 下拉选择；IME 防冲突；Enter 发送 |
| `src/pages/Chat/NewConversationDialog.tsx` | 新建对话弹窗；选择 Bot、填写标题；调用 `useCreateConversation` |
| `src/shared/hooks/useConversations.ts` | TanStack Query hooks：`useConversations`、`useCreateConversation`、`useDeleteConversation` |
| `src/shared/hooks/useMessages.ts` | TanStack Query hooks：`useMessages`、`useSendMessageStream`（核心流式逻辑） |
| `src/shared/hooks/usePushStream.ts` | EventSource 订阅 `/push-stream`，Bot 主动推消息时更新缓存 |
| `src/shared/store/chat-store.ts` | Zustand store：`activeConversationId`（当前激活会话 ID） |
| `src/shared/types/index.ts` | `Conversation`、`Message`、`Bot`、`ConversationBot` 等全局类型 |

### Sidecar API（`src-api/src/`）

| 文件路径 | 职责 |
|---|---|
| `src-api/src/app/api/conversations.ts` | REST 路由：`GET /`、`POST /`、`DELETE /:id`、Bot 关联管理 |
| `src-api/src/app/api/messages.ts` | REST + SSE 路由：消息列表、流式发送（含 keepalive）、push-stream、单条消息 |
| `src-api/src/core/conversation-service.ts` | 会话 CRUD；`findAll()` 按 `updated_at DESC` 排序；级联删除会话关联 Bot |
| `src-api/src/shared/db.ts` | SQLite 初始化（WAL + FK）；schema `ensureSchema`；增量迁移（`ALTER TABLE` 幂等） |

---

## 3. 数据库 Schema

```sql
-- 会话表（私聊 type='single'，群聊 type='group'）
CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'single',   -- 'single' | 'group'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL                     -- 排序依据，消息发送后更新
);

-- 会话-Bot 关联表（多对多，支持群聊多 Bot）
CREATE TABLE conversation_bots (
  conversation_id TEXT NOT NULL,
  bot_id          TEXT NOT NULL,
  is_primary      INTEGER NOT NULL DEFAULT 0,  -- 1 = 主 Bot
  join_order      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (conversation_id, bot_id)
);

-- 消息表
CREATE TABLE messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL,
  sender_type      TEXT NOT NULL,              -- 'user' | 'bot'
  bot_id           TEXT,                       -- 发送者为 bot 时填充
  content          TEXT NOT NULL,
  mentioned_bot_id TEXT,                       -- @提及的目标 Bot
  message_type     TEXT DEFAULT 'text',        -- 'text' | 'approval' | 'system_event'
  metadata         TEXT,                       -- JSON，审批参数等复杂 payload
  created_at       TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_conv_bots_conversation ON conversation_bots(conversation_id);
```

> **迁移机制**：`ensureSchema` 通过 `PRAGMA table_info` 检测列是否存在，再执行 `ALTER TABLE ADD COLUMN`，支持零停机滚动迁移。

---

## 4. 已实现功能详解

### 4.1 US-03-01：发起私聊

**入口路径**：
1. 左侧导航点击"私聊"模块 → `PrivateChatPage` 渲染
2. `ConversationSidebar` 右上角 `+` 按钮 → `setDialogOpen(true)` → `NewConversationDialog`（`mode="single"`）
3. 弹窗中选择 Bot、填写标题 → `useCreateConversation.mutate(...)` → `POST /conversations`
4. `onSuccess` 触发 `invalidateQueries(convKeys.all)` → 列表自动刷新
5. `onCreated(conv.id)` → `setActiveConversationId` → 新会话立即激活

**列表排序**（`conversation-service.ts:26`）：
```sql
SELECT * FROM conversations ORDER BY updated_at DESC
```
每次发消息后 sidecar 更新 `updated_at`，保持最新对话置顶。

---

### 4.2 US-03-02 AC1/AC3：流式接收 Bot 响应

**触发路径**（`PrivateChatPage.tsx:139-155`）：
```
用户点击发送
  → onSend(content)
  → setStreamingContent("")  // 显示 loading 三点动画
  → sendStream(content, chunk => setStreamingContent(chunk))
  → 每个 chunk 更新气泡内容 + 蓝色 animate-pulse 光标
  → 收到 { done: true, botMsg } 帧
  → 写入 React Query 缓存
  → setStreamingContent(null)  // 清除流式气泡，真实消息已就位
```

**Sidecar 流式端点** (`messages.ts:48-168`)：
- 每 5 秒发送 `: keepalive\n\n` 防止 Tauri webview 超时
- `MessageRouter.route()` 调用 Gateway WS，chunk 回调发送 `data: {"chunk":"..."}` SSE 帧
- 完成后发送 `data: {"done":true,"botMsg":{...}}` 帧，包含已持久化的消息记录
- 客户端离开时 `cancel()` 触发 `AbortController.abort()` 中断 WS 调用

---

### 4.3 US-03-03 AC1/AC3：历史消息加载与持久化

**加载逻辑**（`useMessages.ts:10-16`）：
```typescript
useQuery({
  queryKey: msgKeys.list(conversationId),   // ['messages', convId]
  queryFn: () => apiClient.get<Message[]>(`/conversations/${conversationId}/messages`),
  enabled: !!conversationId,                // 切换会话时自动触发
})
```

**Bot 主动推消息**（`usePushStream.ts`，挂载于 `PrivateChatPage:29`）：
1. `EventSource` 连接 `/push-stream`
2. 收到 `{ msgId }` 事件 → 先插入空占位 Message（避免列表跳动）
3. `fetchSingleMessage(msgId)` 获取完整内容 → 替换占位
4. 失败时 fallback 到 `invalidateQueries` 全量刷新

---

### 4.4 US-03-06 AC1：hover 删除图标

**实现位置**（`ConversationSidebar.tsx:58-83`）：

```tsx
<div className="group relative ...">
  {/* 会话标题 */}
  {onDelete && (
    <button
      onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
      className="absolute right-2 opacity-0 group-hover:opacity-100 ..."
    >
      <Trash2 size={12} />
    </button>
  )}
</div>
```

Tailwind `group` + `group-hover:opacity-100` 实现父容器 hover 时子元素显现，`e.stopPropagation()` 防止触发 `onSelect`。

---

## 5. 未实现功能清单

| 用户故事 | AC | 缺失原因 | 相关代码位置 |
|---|---|---|---|
| US-03-02 | AC2：流式期间可中断 | 前端 `MessageInput.tsx` 无"停止"按钮；`useSendMessageStream` 未暴露 AbortController | 后端 `messages.ts:59,154` 已有 AbortController，仅缺前端触发 |
| US-03-03 | AC2：滚动到顶分页加载 | `GET /messages` 无 `limit/offset` 查询参数；前端无 Intersection Observer 触发逻辑 | `conversations.ts:16`、`useMessages.ts:13` |
| US-03-04 | AC1：右侧 Bot 信息面板 | `PrivateChatPage.tsx` 布局中无第三列；`Bot.skills_config` 字段存在但未渲染 | `PrivateChatPage.tsx:52-171` |
| US-03-04 | AC2：面板折叠状态持久化 | 面板本身不存在；持久化可用 `localStorage` 或扩展 `chat-store` | — |
| US-03-04 | AC3：点击技能跳转详情 | 无技能详情页；`src/pages/` 无对应路由 | — |
| US-03-05 | AC1：搜索框实时过滤 | `ConversationSidebar.tsx:44` 的 `<input>` 无 value/onChange；过滤逻辑需在 `PrivateChatPage` 或 Sidebar 内实现 | `ConversationSidebar.tsx:42-48` |
| US-03-05 | AC2：搜索结果高亮关键词 | 依赖 AC1 先实现；高亮可用字符串分割 + `<mark>` 标签 | — |
| US-03-06 | AC2：删除前确认提示 | `ConversationSidebar.tsx:72` 直接调用 `onDelete`，无 `window.confirm` 或自定义弹窗 | `ConversationSidebar.tsx:72-75`、`PrivateChatPage.tsx:31-37` |
| US-03-06 | AC3：删除后切换最近会话 | `PrivateChatPage.tsx:34` `onSuccess` 仅执行 `setActiveConversationId(null)`；需改为从 `convs` 数组中选取排除已删除项后的第一条 | `PrivateChatPage.tsx:31-37` |

---

## 6. 关键算法：流式 SSE 无缝乐观更新

`useSendMessageStream`（`useMessages.ts:87-188`）采用"双写缓存"策略，消除流式结束后的视觉空隙：

```
① 发送前：写入乐观用户消息（optimisticId）到 React Query 缓存
         ↓
② 流式中：每个 chunk 更新 PrivateChatPage 的 streamingContent state
         前端渲染"流式气泡"（蓝色左边框 + animate-pulse 光标）
         ↓
③ 流结束：服务端发送 { done: true, botMsg } 帧
         前端 cache 写操作：
           - 过滤掉 optimisticId
           - 重新插入真实 userMsg（保持 optimisticId 直到后台刷新替换）
           - 插入真实 botMsg（防重判断：hasBotMsg 检查）
         ↓
④ 气泡清除：setStreamingContent(null) — 此时真实消息已在缓存中
            前端无空隙直接显示真实 botMsg 气泡
         ↓
⑤ 后台刷新：void invalidateQueries() — 用真实 DB 记录替换 optimisticId
            用户无感知
```

**防重机制**：步骤③检查 `old.some(m => m.id === botMsg.id)`，防止并发 invalidate 已拉取到真实消息时重复插入。

---

## 7. 类型定义速查

所有类型定义位于 `src/shared/types/index.ts`：

```typescript
// 会话
interface Conversation {
  id: string;
  title: string;
  type: 'single' | 'group';     // 私聊 = 'single'
  created_at: string;
  updated_at: string;
  bots?: ConversationBot[];      // 关联 Bot 列表（含 is_primary）
}

// 消息
interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'user' | 'bot';
  bot_id?: string;
  content: string;
  mentioned_bot_id?: string;
  message_type?: 'text' | 'approval' | 'system_event';
  metadata?: string;             // JSON 字符串，审批参数等
  created_at: string;
  bot?: Bot;                     // 前端 join 后附加
}

// Bot（与私聊关联的核心字段）
interface Bot {
  id: string;
  name: string;
  avatar_emoji: string;
  skills_config: SkillConfig[];  // 技能列表（US-03-04 待展示）
  connection_status: ConnectionStatus;
  openclaw_ws_url: string;
  openclaw_agent_id: string;
}
```

> **注意**：`Conversation.bots` 是前端类型，sidecar 的 `ConversationService` 返回 `ConversationWithBots`（bots 字段为 `ConversationBotRow[]`，`is_primary` 是 `number` 而非 `boolean`），前端接收时需注意类型转换。
