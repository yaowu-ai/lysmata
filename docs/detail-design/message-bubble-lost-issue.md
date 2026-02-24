# Issue：Bot 回复消息气泡丢失专项分析

> 创建时间：2026-02-24  
> 状态：**未完全修复**（根因已定位，待完成修复）  
> 涉及文件：见第 5 节

---

## 1. 问题描述

**现象**：用户在聊天窗口发送消息后，三点等待动画（`•••`）消失，但 Bot 的回复消息气泡也随之消失，聊天窗口出现"内容缺失"的状态。之后等待一段时间，消息通过后台兜底逻辑重新出现（或永远不出现）。

**触发条件**：OpenClaw Gateway 响应较慢（LLM 推理超过约 8-10 秒才输出第一个 token）时必现。

---

## 2. 系统架构回顾

```
前端 React (Tauri webview)
  └─ useSendMessageStream()          fetch GET /stream   ─┐
  └─ usePushStream()                 EventSource /push-stream
                                                           │ HTTP SSE
Sidecar (Bun/Hono)                                         │
  └─ GET /stream  ──────────────────────────────────────── ┘
       └─ MessageRouter.route()
            └─ OpenClawProxy.sendMessage()
                 └─ GatewayWSAdapter.sendMessage()
                      └─ activeRuns Map  ←→  WS connection
                                              └─ OpenClaw Gateway (LLM)
```

消息流向：
- **用户发消息路径**：前端 fetch → sidecar `/stream` SSE → WS `agent` RPC → Gateway → 流式 chunks 回传
- **Bot 主动推送路径**：Gateway WS push event → `pushRuns` 缓冲 → `onPushEvent` → `PushRelay` → SSE `/push-stream` → 前端 `usePushStream`

---

## 3. 根因完整分析

### 3.1 根因 A：`/stream` 请求被 Tauri webview 超时关闭（已确认，最根本原因）

**日志证据**（第一次复现，2026-02-24T07:14）：

```
T+0s    07:14:08.325  发送消息 "你好"，WS agent RPC accepted
T+0.3s  07:14:08.582  lifecycle.start — Bot 开始推理
        ── 9.4秒无任何 chunk ──
T+9.7s  07:14:17.959  phase=error: "client cancelled stream (browser closed/navigated away)"
        ── WS 继续，Bot 还在推理 ──
T+30s   07:14:38.858  第一个 chunk "大王" 才到达（距发送整整 30 秒）
T+30s               chunk 被 safeEnqueue → closed=true → 静默丢弃
T+30s   07:14:38.881  phase=done 日志出现，但 done 帧已被丢弃
T+30s               前端永远收不到 done 帧 → React Query cache 里无 bot 消息
```

**触发机制**：Tauri webview（WKWebView / WebView2）对没有数据流出的 `fetch` `ReadableStream` 有内置的空闲超时（实测约 8-10 秒）。当 LLM 首 token 延迟超过此阈值，前端的 `/stream` 连接被浏览器层单方面关闭。

`ReadableStream` 的 `cancel()` 回调被触发，但此时：
- `start()` 里的 `await MessageRouter.route(...)` **仍在后台继续运行**
- 只有 `closed = true` 被设置
- 所有后续 `safeEnqueue` 调用因 `if (closed) return` 被静默丢弃
- `MessageRouter.route()` 正常完成，bot 消息写入 DB，但**前端永远收不到 done 帧**

### 3.2 根因 B：push_run 路径的 `sessionId` 为空（已确认，兜底路径失效）

**日志证据**（第二次复现，2026-02-24T07:39，AbortSignal 修复后）：

```json
{"type":"push_event","event":"agent_push_deliver",
 "runId":"728a5b93-...",
 "sessionId":"",           ← 空字符串！
 "agentId":"",
 "contentLength":22,
 "sessionIdSource":"missing"}  ← sessionId 从未被捕获
```

**触发机制**：当 `cancel()` 触发 `abortCtrl.abort()` 后，run 从 `activeRuns` 移除，Gateway 继续完成的 chunks 走 push_run 路径缓冲到 `pushRuns`。

但 `pushRuns` 里的 entry 是在 `assistant` chunk 帧时才创建的，而 `payload.sessionId` 在这个版本的 Gateway 事件帧中**实际存在于 `payload.sessionKey` 字段**，代码读取的是 `payload.sessionId`（错误字段名）。

Gateway 的 `agent` 事件 payload 结构：

```json
{
  "runId": "728a5b93-...",
  "stream": "assistant",
  "data": { "text": "大王", "delta": "大王" },
  "sessionKey": "agent:main:f83a8f60-...",   ← 实际字段名是 sessionKey！
  "seq": 2
}
```

但代码里读取的是：
```typescript
// connection-pool.ts 第 ~290 行
const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined;
//                                   ^^^^^^^^^ 错误！应该是 sessionKey
```

`payload.sessionId` 始终是 `undefined`，因此 `pushRuns` entry 里的 `sessionId` 永远是空。

`lifecycle.end` 后 `onPushEvent({ type: 'message', sessionId: '', agentId: '' })` 被调用，`PushRelay.handlePush` 里：

```typescript
case 'message': {
  const { sessionId } = event;   // → ''
  if (!sessionId || !content) return;  // → 直接返回，消息被静默丢弃！
```

### 3.3 根因 C：WS 连接池每次 `/stream` 请求都冷启动（性能问题）

**日志证据**：

```
07:14:08.275  /stream 请求到达
07:14:08.287  WebSocket opened  ← WS 握手此刻才开始！
07:14:08.325  hello-ok（耗时 ~38ms）
07:14:08.325  才能发消息
```

每次发消息前都需要重新建 WS 连接 + 握手，增加了首 token 延迟，加剧了根因 A 的超时概率。正常情况下 `getOrCreateWSConnection` 应该复用已有连接，但实测每次 sidecar 重启后第一条消息都是冷启动。

### 3.4 根因 D（历史，已修复）：双路径写入同一条消息导致竞态

`message-router.ts` 之前在用户主动发消息路径里同时调用了 `broadcast()`，触发 `usePushStream` 再次写入同一条消息。两路同时触发 cache 写入 + `invalidateQueries`，在慢网络时竞态导致消息被清除。**已在本次修改中移除 `broadcast()` 调用**。

### 3.5 根因 E（历史，已修复）：`finally` 块依赖 `lastChunk` 有值才写 optimistic bot 消息

原来的 `finally` 块只在 `if (lastChunk)` 时才写 user + bot 的 optimistic 消息，当 stream 未收到任何 chunk 就断开时，user 消息气泡也会消失。**已修复为无条件保留 user 消息**。

---

## 4. 已做的修复

### 4.1 已完成并生效的修复

| 修复 | 文件 | 状态 |
|---|---|---|
| 移除 `message-router.ts` 里 `route()` 的 `broadcast()` 调用（消除双路径竞态） | `src-api/src/core/message-router.ts` | ✅ 已修复 |
| `finally` 块无条件保留 user optimistic 消息 | `src/shared/hooks/useMessages.ts` | ✅ 已修复 |
| `/stream` 结束帧携带真实 `botMsg` 对象，前端直接写入 cache 无需等待 refetch | `src-api/src/app/api/messages.ts` + `src/shared/hooks/useMessages.ts` | ✅ 已修复 |
| `AbortController` 链路：`cancel()` → `abortCtrl.abort()` → `ws-adapter` 监听 `abort` 事件 → 从 `activeRuns` 移除 run | `messages.ts` / `message-router.ts` / `openclaw-proxy.ts` / `ws-adapter.ts` | ✅ 已实现，但 push_run 兜底路径还有 Bug（见 4.2） |
| stream error 时前端展示错误气泡，不再静默无提示 | `src/pages/Chat/PrivateChatPage.tsx` + `GroupChatPage.tsx` | ✅ 已修复 |
| `pushRuns` 类型从 `Map<string, string>` 改为 `Map<string, PushRunEntry>`，在 lifecycle.start 和 assistant chunk 时捕获 sessionId | `src-api/src/core/gateway/connection-pool.ts` + `types.ts` | ✅ 已实现，但字段名仍有 Bug（见 4.2） |

### 4.2 已识别但未完成的修复

**待修复 1（阻塞 push_run 兜底路径）：`payload.sessionId` → `payload.sessionKey`**

`connection-pool.ts` 里提取 sessionId 的逻辑读取了错误字段名：

```typescript
// 当前（错误）：
const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined;

// 应改为：
const rawSessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey : undefined;
// Gateway 的 sessionKey 格式是 "agent:main:{conversationId}"
// 需要提取最后一段 UUID 作为 conversationId
const sessionId = rawSessionKey?.split(':').at(-1);
```

Gateway 的 `agent` 事件 payload 中，会话标识符字段名为 `sessionKey`，格式为 `"agent:main:{conversationId}"`，而非 `sessionId`。`conversationId` 是最后一个 `:` 后面的 UUID。

**待修复 2（根本改善，降低超时概率）：预热 WS 连接**

在 Bot 创建/激活时就提前建立 WS 连接（调用 `getOrCreateWSConnection`），而不是等到第一条消息发出时才冷启动。这可以将每次消息的 WS 握手延迟（~38ms）和握手超时风险从关键路径上移除，同时减少 LLM 等待期间累计的时间，降低 Tauri webview 超时的概率。

**待修复 3（治本）：前端 `/stream` 请求发送心跳 keepalive**

Tauri webview 的超时是因为 `/stream` 连接在 LLM 推理期间没有任何数据流出。解决方法：sidecar 在 `await MessageRouter.route()` 期间每隔 5 秒向 `/stream` 发送一个 SSE 注释帧（keepalive）：

```
: keepalive\n\n
```

SSE 注释帧（以 `:` 开头）会被 `EventSource`/`fetch` 忽略，但会刷新连接的空闲计时器，防止 Tauri/浏览器超时关闭连接。

---

## 5. 涉及的源文件清单

### Sidecar（`src-api/`）

| 文件 | 作用 | 状态 |
|---|---|---|
| `src/app/api/messages.ts` | `/stream` SSE 路由，AbortController，bubble 生命周期日志 | 已修改 |
| `core/message-router.ts` | `route(signal?)` 签名，已移除 `broadcast()` | 已修改 |
| `core/openclaw-proxy.ts` | `sendMessage(signal?)` 透传 | 已修改 |
| `core/gateway/ws-adapter.ts` | `GatewayWSAdapter.sendMessage(signal?)`，abort 监听 | 已修改 |
| `core/gateway/connection-pool.ts` | `pushRuns` 结构改造，`sessionKey` 字段提取（P0 Bug 已修复） | 已修改 ✅ |
| `core/gateway/types.ts` | 新增 `PushRunEntry` 类型 | 已修改 |
| `shared/gateway-logger.ts` | 新增 `logUserMessage`、`logStreamEvent` 方法 | 已修改 |

### 前端（`src/`）

| 文件 | 作用 | 状态 |
|---|---|---|
| `shared/hooks/useMessages.ts` | `useSendMessageStream`：optimistic user msg、done 帧写 cache | 已修改 |
| `shared/hooks/usePushStream.ts` | EventSource 订阅 push-stream，占位符替换逻辑 | 已修改 |
| `pages/Chat/PrivateChatPage.tsx` | streamError 状态，onSend finally | 已修改 |
| `pages/Chat/GroupChatPage.tsx` | 同上 | 已修改 |

---

## 6. 待修复的下一步行动

### 优先级 P0（✅ 已修复）

**修复 `connection-pool.ts` 的 `sessionKey` 提取逻辑**

```typescript
// ❌ 修复前（错误字段名）：
const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined;

// ✅ 修复后：从 sessionKey 字段里提取 conversationId
// payload.sessionKey 格式: "agent:main:{conversationId}"
const rawSessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey : undefined;
const sessionId = rawSessionKey?.split(':').at(-1) || undefined;
```

已在 `src-api/src/core/gateway/connection-pool.ts` 完成修复。push_run 兜底路径现在能正确提取 `conversationId`，写入 DB 并 broadcast，`usePushStream` 可接收并显示消息。

### 优先级 P1（治本，消除超时根因）

**在 `/stream` 推理等待期间定期发 SSE keepalive 帧**

```typescript
// src-api/src/app/api/messages.ts，start() 内
// await MessageRouter.route() 之前启动定时器

const keepaliveTimer = setInterval(() => {
  safeEnqueue(': keepalive\n\n');
}, 5000);

try {
  const botMsg = await MessageRouter.route(...);
  // ...
} finally {
  clearInterval(keepaliveTimer);
  // ...
}
```

### 优先级 P2（改善冷启动）

**Bot 激活时预热 WS 连接**

在 `BotService.getOrCreate` 或 Bot 管理页加载时调用 `GatewayWSAdapter.getOrCreateWSConnection`，使得第一条消息不需要等待握手。

---

## 7. 消息流转完整状态机

```
用户发消息
  │
  ├─→ 前端 optimistic user msg 写入 cache（立即显示）
  ├─→ setStreamingContent('') → 三点等待动画显示
  │
  └─→ fetch GET /stream ─────────────────────────────────────────────────────┐
         │                                                                     │
         │ [正常路径：LLM 首 token < Tauri 超时阈值 ~8-10s]                   │
         │                                                                     │
         ├─→ chunk 到达 → setStreamingContent(text) → 打字机动画              │
         ├─→ done 帧 { done: true, botMsg } → cache 写入 user+bot 消息        │
         ├─→ setStreamingContent(null) → 打字机消失，消息列表显示 ✅           │
         │                                                                     │
         │ [超时路径：LLM 首 token > ~8-10s]                                   │
         │                                                                     │
         └─→ cancel() ─→ abortCtrl.abort()                                    │
               │          │                                                     │
               │          └─→ ws-adapter abort 监听 ─→ activeRuns.delete(runId)│
               │                                                               │
               └─→ streamError 设置 ─→ 错误气泡显示 ⚠️                        │
                                                                               │
               [Gateway 继续完成 LLM 推理...]                                  │
                                                                               │
               chunks 到达 → isActiveRun=false → pushRuns 缓冲文本            │
               lifecycle.end → push_run 路径                                   │
                  │                                                             │
                  ├─→ sessionId='' [BUG: sessionKey 读取错误] → 消息丢弃 ❌    │
                  │                                                             │
                  └─→ [修复后] sessionId='{conversationId}'                    │
                        → PushRelay.persistMessage + broadcast                 │
                        → usePushStream EventSource 收到                       │
                        → fetchSingleMessage → cache 写入 ✅                   │
                                                                               │
            [Tauri webview 关闭连接] ──────────────────────────────────────────┘
```

---

## 8. 参考日志片段

### 8.1 超时触发场景（修复前，2026-02-24T07:14）

```
07:14:08.325  OUT user_message "你好" contentLength=2
07:14:08.582  IN  agent lifecycle.start
              ── 无 chunk 9.4 秒 ──
07:14:17.959  SYS stream_event phase=error "client cancelled stream"
              ── bot 继续推理 ──
07:14:38.858  IN  agent_chunk isActiveRun=false isPushRun=true  ← abort 修复后正确走 push_run
07:14:38.881  SYS stream_event phase=done  ← 出现，但 done 帧已被丢弃（abort 前的残留日志）
              ← sessionIdSource=missing → 消息被 PushRelay 丢弃
```

### 8.2 abort 修复后，push_run 路径仍然失败（2026-02-24T07:39）

```
07:39:51.986  SYS "agent run aborted by client cancel" runId=728a5b93
07:39:54.990  IN  agent_chunk isActiveRun=false isPushRun=true  ← 正确走 push_run ✅
07:39:55.164  IN  agent_push_deliver sessionId="" sessionIdSource="missing"  ← sessionId 为空 ❌
              → PushRelay.handlePush case 'message': sessionId='' → return（丢弃）
```

---

## 9. 历史修复记录

| 时间 | 修复内容 | commit |
|---|---|---|
| 2026-02-24 | 移除 route() 中的 broadcast()，消除双路径竞态 | 本次工作 |
| 2026-02-24 | done 帧携带 botMsg，直接写 cache 消除 refetch 空窗 | 本次工作 |
| 2026-02-24 | AbortController 链路，cancel() 中断 WS run | 本次工作 |
| 2026-02-24 | pushRuns 改为 PushRunEntry，尝试捕获 sessionId | 本次工作（字段名有 bug）|
| 2026-02-24 | stream error 时前端显示错误气泡 | 本次工作 |
| 历史 | optimistic user msg 修复（lastChunk 条件问题） | 历史 commit |
| 历史 | usePushStream 占位符防重复逻辑 | 历史 commit |
