# OpenClaw 交互通讯详细设计文档

> 文档记录时间：2026-02-24
> 覆盖范围：Lysmata 与 OpenClaw Gateway 之间所有通讯层的完整交互逻辑，包括 WebSocket 协议、HTTP API、SSE 推送、消息路由、状态管理及相关代码清单。

---

## 目录

1. [总体架构](#1-总体架构)
2. [WebSocket 通讯（Gateway 协议 v3）](#2-websocket-通讯gateway-协议-v3)
   - 2.1 设备身份（Ed25519 确定性身份）
   - 2.2 握手流程
   - 2.3 Wire 帧格式
   - 2.4 `agent` RPC — 发送消息并接收流式回复
   - 2.5 心跳保活
   - 2.6 重连机制
   - 2.7 连接池管理
3. [HTTP 通讯（OpenAI 兼容接口）](#3-http-通讯openai-兼容接口)
4. [用户发消息完整流程](#4-用户发消息完整流程)
5. [Bot 主动推送消息流程](#5-bot-主动推送消息流程)
6. [全局事件流程](#6-全局事件流程)
7. [SSE 频道设计](#7-sse-频道设计)
8. [HTTP REST API 接口表](#8-http-rest-api-接口表)
9. [核心数据类型定义](#9-核心数据类型定义)
10. [审批流程](#10-审批流程)
11. [聊天功能相关代码清单](#11-聊天功能相关代码清单)

---

## 1. 总体架构

Lysmata 采用三层结构，各层之间通过不同协议通讯：

```
┌─────────────────────────────────────────────────────────┐
│                  前端（React + Vite）                     │
│                   src/  [port 1420]                      │
│                                                          │
│  页面层           Hooks 层            状态层              │
│  Chat/           useMessages         chat-store          │
│  PrivateChat     usePushStream       app-store           │
│  GroupChat       useGlobalStream     (Zustand)           │
│  BotMessage      useConversations                        │
│  MessageInput    useSendMessageStream                    │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTP REST + SSE (EventSource)
                       │  API_BASE_URL = http://127.0.0.1:PORT
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Sidecar API（Bun + Hono）                    │
│                src-api/  [127.0.0.1:PORT]                │
│                                                          │
│  路由层              核心层               共享层           │
│  api/messages        message-router      db.ts (SQLite)  │
│  api/bots            push-relay          sse.ts          │
│  api/conversations   openclaw-proxy      gateway-logger  │
│  api/settings        bot-service                         │
│  api/health          conversation-service                │
└──────────────────────┬──────────────────────────────────┘
                       │  WebSocket (ws:// / wss://)
                       │  或 HTTP (OpenAI 兼容)
                       ▼
┌─────────────────────────────────────────────────────────┐
│            OpenClaw Gateway（外部进程）                   │
│                                                          │
│  协议 v3 WebSocket                                       │
│  - Ed25519 设备认证                                       │
│  - RPC req/res 模式                                      │
│  - 流式 agent event                                      │
│  - 服务端推送 push event                                  │
└─────────────────────────────────────────────────────────┘
```

### 双模式适配器

`OpenClawProxy`（`src-api/src/core/openclaw-proxy.ts`）根据 URL 前缀自动选择适配器：

| Bot 配置的 URL 前缀     | 使用适配器          | 协议                        |
| ----------------------- | ------------------- | --------------------------- |
| `ws://` 或 `wss://`     | `GatewayWSAdapter`  | OpenClaw Gateway WS 协议 v3 |
| `http://` 或 `https://` | `OpenAIHttpAdapter` | OpenAI 兼容 HTTP API        |

---

## 2. WebSocket 通讯（Gateway 协议 v3）

### 2.1 设备身份（Ed25519 确定性身份）

每个 Gateway URL 对应一个固定的 Ed25519 设备身份，进程重启后保持不变。

**生成算法**（`src-api/src/core/gateway/device-identity.ts`）：

```
seed（32字节）  = SHA256("openclaw-device-v1:" + gatewayUrl)
privateKey     = PKCS#8 DER（ED25519_PKCS8_PREFIX[12字节] + seed[32字节]）
publicKey对象  = 从 privateKey 导出
rawKey（32字节）= SPKI DER 导出后跳过前 12 字节前缀
publicKey 字段 = base64url(rawKey)      ← 注意：不含 SPKI DER 头
device.id      = SHA256(rawKey).hex()
```

> **关键约束**：Gateway 期望 `publicKey` 字段是原始 32 字节密钥的 base64url 编码，**不是** SPKI DER 格式（44字节）。如果发送 SPKI DER，Gateway 会在其前面再加 12 字节前缀，导致 DER 解析失败，返回"device signature invalid"。

### 2.2 握手流程

```
Client（Sidecar）                        Gateway
     |                                      |
     |  WebSocket CONNECT                   |
     |  Origin: http://host:port            |
     |  (从 ws URL 推导，通过本地源检查)       |
     |------------------------------------->|
     |                                      |
     |  event: connect.challenge            |
     |  { "type":"event",                   |
     |    "event":"connect.challenge",      |
     |    "payload":{"nonce":"<uuid>"} }    |
     |<-------------------------------------|
     |                                      |
     |  [若 3s 内未收到 challenge，            |
     |   使用自生成 nonce 作为 fallback]       |
     |                                      |
     |  req: connect                        |
     |  { "type":"req",                     |
     |    "id":"<uuid>",                    |
     |    "method":"connect",               |
     |    "params":{                        |
     |      "minProtocol":3,                |
     |      "maxProtocol":3,                |
     |      "client":{                      |
     |        "id":"openclaw-control-ui",   |
     |        "version":"1.0.0",            |
     |        "platform":"desktop",         |
     |        "mode":"ui"                   |
     |      },                              |
     |      "role":"operator",              |
     |      "scopes":["operator.read",      |
     |        "operator.write",             |
     |        "operator.admin"],            |
     |      "auth":{"token":"..."},         |
     |      "locale":"zh-CN",               |
     |      "userAgent":"lysmata/1.0.0",    |
     |      "device":{                      |
     |        "id":"<sha256hex>",           |
     |        "publicKey":"<base64url>",    |
     |        "signature":"<base64url>",    |
     |        "signedAt":<ms>,             |
     |        "nonce":"<uuid>"             |
     |      }                              |
     |    }                                |
     |  }                                  |
     |------------------------------------->|
     |                                      |
     |  res: connect（hello-ok）             |
     |  { "type":"res",                     |
     |    "id":"<同上uuid>",                 |
     |    "ok":true,                        |
     |    "payload":{                       |
     |      "policy":{                      |
     |        "tickIntervalMs":30000,       |
     |        "maxPayload":26214400,        |
     |        "maxBufferedBytes":52428800   |
     |      }                              |
     |    }                                |
     |  }                                  |
     |<-------------------------------------|
     |  [握手完成]                           |
     |  [按 policy.tickIntervalMs 启动        |
     |   心跳定时器，默认 30000ms]            |
```

**签名 payload 格式**（`buildSignaturePayload`）：

```
v2|{deviceId}|openclaw-control-ui|ui|operator|operator.read,operator.write,operator.admin|{signedAtMs}|{token}|{nonce}
```

签名算法：`Ed25519_sign(privateKey, Buffer.from(payload))`，结果 base64url 编码。

**超时配置**：

| 常量                       | 值         | 说明                                   |
| -------------------------- | ---------- | -------------------------------------- |
| `CHALLENGE_TIMEOUT_MS`     | 3,000 ms   | 等待 challenge 的超时，超时后 fallback |
| `HANDSHAKE_TIMEOUT_MS`     | 10,000 ms  | 整个握手流程的超时                     |
| `RPC_TIMEOUT_MS`           | 30,000 ms  | 单次 RPC 调用超时                      |
| `STREAM_TIMEOUT_MS`        | 120,000 ms | 流式回复的总超时                       |
| `DEFAULT_TICK_INTERVAL_MS` | 15,000 ms  | policy 中未返回时的心跳间隔默认值      |

### 2.3 Wire 帧格式

所有帧均为 JSON 文本，通过 WebSocket 消息传输。共三种类型：

**请求帧（Client → Gateway）**

```json
{
  "type": "req",
  "id": "<uuid>",
  "method": "<method>",
  "params": { ... }
}
```

**响应帧（Gateway → Client）**

```json
{
  "type": "res",
  "id": "<同请求的uuid>",
  "ok": true,
  "payload": { ... },
  "error": { "code": "ERR_CODE", "message": "说明" }
}
```

**事件帧（Gateway → Client，服务端主动推送）**

```json
{
  "type": "event",
  "event": "<事件名称>",
  "seq": 1088,
  "stateVersion": { "presence": 28, "health": 482 },
  "payload": { ... }
}
```

`seq` 为全局单调递增序号；`stateVersion` 为增量同步版本号（部分事件携带）。

### 2.4 `agent` RPC — 发送消息并接收流式回复

这是 Chat 功能的核心协议。整个交互分为三个阶段：

#### 阶段一：发送请求（OUT）

```json
{
  "type": "req",
  "id": "e287cbcf-6e01-45e2-b6c5-1871a89aa4ec",
  "method": "agent",
  "params": {
    "agentId": "main",
    "message": "用户消息内容（可能含群聊上下文前缀）",
    "sessionKey": "5ad7920e-256f-41fb-9713-2b519b5ab730",
    "deliver": false,
    "idempotencyKey": "cf60dd52-d18d-4912-9e4e-230545f94333"
  }
}
```

| 参数             | 说明                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| `agentId`        | Bot 配置中的 `openclaw_agent_id`，默认为 `"main"`                         |
| `message`        | 用户消息；群聊时由 `MessageRouter` 注入上下文前缀                         |
| `sessionKey`     | Lysmata 对话的 `conversation_id`，用于 Gateway 侧隔离每个对话的上下文记忆 |
| `deliver`        | `false`（不触发 Gateway 侧的外部消息投递）                                |
| `idempotencyKey` | 本次调用唯一标识，同时作为 `runId`（Gateway 原路回传）                    |

#### 阶段二：立即响应（IN）

Gateway 接受请求后立即返回，**不等待 LLM 生成完成**：

```json
{
  "type": "res",
  "id": "e287cbcf-6e01-45e2-b6c5-1871a89aa4ec",
  "ok": true,
  "payload": {
    "runId": "cf60dd52-d18d-4912-9e4e-230545f94333",
    "status": "accepted",
    "acceptedAt": 1771656839510
  }
}
```

`runId` 与请求中的 `idempotencyKey` 相同。Sidecar 在 `activeRuns` Map 中以 `runId` 为键注册回调，等待后续流式事件。

#### 阶段三：流式事件序列（IN，均为 `event` 帧，`event: "agent"`）

```
① lifecycle.start — run 开始，标志 LLM 开始处理
{
  "type": "event", "event": "agent",
  "seq": 1088,
  "payload": {
    "runId":      "cf60dd52-d18d-4912-9e4e-230545f94333",
    "stream":     "lifecycle",
    "data":       { "phase": "start", "startedAt": 1771656839545 },
    "sessionKey": "agent:main:5ad7920e-256f-41fb-9713-2b519b5ab730",
    "seq":        1,
    "ts":         1771656839545
  }
}

② assistant chunks — 可多次，LLM 每生成一段文字推送一帧
{
  "type": "event", "event": "agent",
  "seq": 1090,
  "payload": {
    "runId":      "cf60dd52-d18d-4912-9e4e-230545f94333",
    "stream":     "assistant",
    "data": {
      "text":  "Hello，大王！👋\n\n周六下午快三点了",  ← 累积全文（从头到当前）
      "delta": "Hello，大王！👋\n\n周六下午快三点了"   ← 本帧新增部分
    },
    "sessionKey": "agent:main:5ad7920e-256f-41fb-9713-2b519b5ab730",
    "seq": 2
  }
}
{
  "payload": {
    "stream": "assistant",
    "data": {
      "text":  "Hello，大王！👋\n\n...有什么突发奇想？🐧",  ← 更新后的累积全文
      "delta": "有什么突发奇想？🐧"                        ← 本帧新增
    },
    "seq": 3
  }
}

③ lifecycle.end — run 结束，Sidecar 在此触发 onDone() 回调
{
  "type": "event", "event": "agent",
  "seq": 1095,
  "payload": {
    "runId":  "cf60dd52-d18d-4912-9e4e-230545f94333",
    "stream": "lifecycle",
    "data":   { "phase": "end", "endedAt": 1771656844352 },
    "seq":    4
  }
}
```

**`lifecycle` 的所有 phase 值**：

| phase   | 含义         | Sidecar 行为                       |
| ------- | ------------ | ---------------------------------- |
| `start` | LLM 开始处理 | 仅记录日志                         |
| `end`   | 回复完成     | 调用 `onDone()` → 解除 Promise     |
| `error` | LLM 出错     | 调用 `onError(err)` → 拒绝 Promise |

#### 关键实现细节

**`text` vs `delta` 字段的区别**：

- `data.text` = **累积全文**，每帧都是从对话开始到当前的完整 Bot 回复
- `data.delta` = **本帧增量**，仅当前帧新增的文字

Sidecar 使用 `text` 字段（赋值 `replyContent = chunk`，非追加），因为这样即使帧乱序或丢失也能得到正确的最终结果。`delta` 字段虽然存在但**当前被忽略**。

**两类 run 的区分**：

| 类型               | 识别方式                       | 处理逻辑                                                                                              |
| ------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 客户端发起的 run   | `runId` 在 `activeRuns` Map 中 | 每帧调用 `onChunk(text)`；`lifecycle.end` 调用 `onDone()`                                             |
| Bot 主动推送的 run | `runId` 不在 `activeRuns` 中   | 缓冲 `text` 到 `pushRuns[runId]`；`lifecycle.end` 后整体触发 `onPushEvent({type:'message', content})` |

```
收到 agent event
  │
  ├─ stream === 'assistant'
  │     └─ activeRuns.has(runId)?
  │           ├─ YES → onChunk(data.text)            // 实时推给前端 /stream SSE
  │           └─ NO  → pushRuns.set(runId, data.text) // 缓存推送 run 的文本
  │
  └─ stream === 'lifecycle'
        └─ data.phase
              ├─ 'start' → 仅日志
              ├─ 'end'
              │     ├─ activeRuns.has(runId)? → onDone()
              │     └─ pushRuns.has(runId)?   → onPushEvent({type:'message', content})
              └─ 'error'
                    └─ activeRuns.has(runId)? → onError(err)
```

### 2.5 心跳保活

握手完成后，Sidecar 按 `policy.tickIntervalMs`（实际观测值 30,000ms）定时向 Gateway 发送 `health` RPC 维持连接活跃：

```json
{ "type": "req", "id": "<uuid>", "method": "health", "params": {} }
```

> 注意：这里发送的是 `health` 方法（Sidecar 侧的保活 ping），不是 `heartbeat`。`heartbeat` 是 Gateway 推送的业务级心跳事件（代表 Agent 的健康检查结果）。

Gateway 也会按 `tickIntervalMs` 主动推送 `tick` 事件作为服务端保活：

```json
{ "type": "event", "event": "tick", "payload": { "ts": 1771656874674 } }
```

### 2.6 重连机制（指数退避）

任何非主动断开都会触发自动重连：

```
WebSocket error / close（非 intentional）
  ↓
teardown(url, entry, err, intentional=false)
  1. clearInterval(heartbeatTimer)
  2. 所有 activeRuns → onError(err)
  3. 所有 pendingRequests → 回调错误 res
  4. 所有 readyWaiters → reject(err)
  5. pool.delete(url)
  ↓
scheduleReconnect(url, token, attempt=0)
  delay = min(1000 × 2^attempt, 30000) ms
  attempt 0 → 1s
  attempt 1 → 2s
  attempt 2 → 4s
  ...
  attempt 5 → 30s（上限）
  attempt > 10 → 放弃，不再重试
  ↓
connectWS(url, token)
  成功 → 从 pushHandlerRegistry 恢复 onPushEvent
  失败 → scheduleReconnect(url, token, attempt+1)
```

`reconnectingUrls: Set<string>` 防止多个并发重连互相干扰。

### 2.7 连接池管理

```typescript
pool: Map<url, PoolEntry>; // 每个 Gateway URL 一个连接
pushHandlerRegistry: Map<url, handler>; // 持久化推送处理器，重连后自动恢复
reconnectingUrls: Set<url>; // 防止并发重连
```

`getOrCreateWSConnection(url, token)` 的连接复用逻辑：

```
pool.has(url)?
  ├─ YES
  │    └─ ws.readyState === OPEN && entry.ready?
  │          ├─ YES → 直接返回 entry（复用连接）
  │          ├─ NO（CONNECTING 或 not ready）→ 加入 readyWaiters，等待握手完成
  │          └─ NO（CLOSED/CLOSING）→ pool.delete(url)，进入 NO 分支
  └─ NO → connectWS(url, token)（新建连接）
```

---

## 3. HTTP 通讯（OpenAI 兼容接口）

当 Bot 的 `openclaw_ws_url` 以 `http://` 或 `https://` 开头时，使用 `OpenAIHttpAdapter`。

**`sendMessage` 流程**（`src-api/src/core/gateway/http-adapter.ts`）：

```
POST {baseUrl}/v1/chat/completions
Headers:
  Content-Type: application/json
  x-openclaw-agent-id: {agentId}
  Authorization: Bearer {token}   （有 token 时）

Body:
{
  "model": "openclaw:{agentId}",
  "stream": true,
  "messages": [{ "role": "user", "content": "..." }]
}
```

**流式响应解析**（OpenAI SSE 格式）：

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":", world"}}]}
data: [DONE]
```

> **与 WS 模式的重要差异**：HTTP 模式的 `delta.content` 是**真正的增量文字**（每次只有新增部分）。WS 模式的 `data.text` 是累积全文。两个适配器对外暴露相同的 `onChunk(text)` 接口，但 HTTP 模式会累积成全文调用 `onChunk`（这部分逻辑在调用侧）。

**连接测试**：`GET {baseUrl}/v1/models`，返回 200 则认为连接成功。

---

## 4. 用户发消息完整流程

```
用户在 MessageInput 输入文字，按 Enter 或点击发送
  ↓
PrivateChatPage / GroupChatPage
  setIsSending(true)
  setStreamingContent('')   ← UI 显示"三点跳动"等待动画
  ↓
useSendMessageStream(conversationId)(content, onChunk)
  ↓
  ① 乐观插入用户消息到 React Query cache（立即显示）
  ↓
  ② fetch GET /conversations/{id}/messages/stream?content={encoded}
     （注意：用 GET 方式传参，非 POST body）
  ↓
Sidecar: GET /conversations/:id/messages/stream
  ↓
MessageRouter.route(conversationId, userContent, onChunk)
  │
  ├─ [DB] INSERT messages (sender_type='user', content=userContent)
  │
  ├─ [路由] 解析 @BotName 提及
  │    ├─ 有提及 → 在 conversation_bots 中查找匹配 bot.name
  │    └─ 无提及 → 取 is_primary=1 的 bot
  │
  ├─ [群聊增强] conv.type === 'group'
  │    └─ enrichedContent = "[群聊上下文] 当前群聊中还有以下 Bot 可以协作：\n"
  │                        + "- @BotA: 描述A\n- @BotB: 描述B\n"
  │                        + "如需协作，请在回复中使用 @BotName。\n\n"
  │                        + originalContent
  │
  ├─ OpenClawProxy.sendMessage(url, token, agentId, enrichedContent, onChunk, conversationId, abortCtrl.signal)
  │    └─ WS模式: GatewayWSAdapter.sendMessage(signal)
  │         ├─ getOrCreateWSConnection()
  │         ├─ rpc(entry, 'agent', {message, agentId, sessionKey, deliver:false, idempotencyKey})
  │         ├─ 等待 res.ok → 获取 runId
  │         └─ entry.activeRuns.set(runId, {onChunk, onDone, onError})
  │              ↓ （Gateway 推送 agent events）
  │              stream=assistant → onChunk(data.text)  [每帧调用]
  │                   ↓
  │              Sidecar onChunk 回调:
  │                   replyContent = chunk           ← 赋值（非追加）
  │                   sseOnChunk(chunk, botId)
  │                        ↓
  │                   ReadableStream enqueue("data: {\"chunk\":\"...\"}\\n\\n")
  │                        ↓
  │                   前端 fetch reader 收到数据
  │                        ↓
  │                   onChunk(text) → setStreamingContent(text)
  │                        ↓
  │                   UI 流式显示 Bot 回复（蓝色左边框气泡 + 闪烁光标）
  │              stream=lifecycle, phase=end → onDone()
  │
  ├─ [DB] INSERT messages (sender_type='bot', bot_id, content=replyContent, mentioned_bot_id)
  ├─ [DB] UPDATE conversations SET updated_at
  │
  └─ broadcast(conversationId, {msgId, type:'message'})
       └─ push-stream 订阅者收到通知（去重，usePushStream 检查 id 是否已存在）
  ↓
Sidecar SSE stream 发送 "data: [DONE]\n\n"，关闭流
  ↓
前端 useSendMessageStream finally 块:
  ① 将 optimisticUserMsg + optimisticBotMsg 写入 cache（防止 UI 闪烁）
  ② invalidateQueries(['messages', conversationId])（后台刷新真实 DB 数据）
  ↓
setStreamingContent(null)  ← 清除流式气泡
setIsSending(false)
```

**错误处理**：

- `stream` 端点发送 `data: {"error":"..."}\n\n` 然后关闭
- 前端 `finally` 块无论成功失败都清理状态

---

## 5. Bot 主动推送消息流程

Bot 可以主动（非用户触发）向对话发送消息，例如定时提醒、外部事件通知等。

```
Gateway 内部触发 agent run（无客户端请求）
  ↓
Gateway 推送 agent event（event帧，stream='assistant'）
  runId 不在 Sidecar 的 activeRuns 中
  ↓
connection-pool.handleEvent()
  stream=assistant → entry.pushRuns.set(runId, data.text)   ← 缓冲累积文本
  stream=lifecycle, phase=end
    → content = pushRuns.get(runId)
    → pushRuns.delete(runId)
    → entry.onPushEvent({
        type: 'message',
        sessionId: payload.sessionId,  ← 即 conversationId
        agentId: payload.agentId,
        content
      })
  ↓
PushRelay.handlePush(event, botId)  [event.type === 'message']
  ↓
  ├─ convExists(sessionId)?  ← 验证对话确实存在于 DB
  │
  ├─ [DB] INSERT messages (conversation_id=sessionId, sender_type='bot',
  │       bot_id, content, message_type='text')
  │
  └─ broadcast(conversationId, {
         msgId,
         conversationId,
         type: 'message'
       })
  ↓
前端 usePushStream (EventSource)
  onmessage 收到 {msgId, conversationId, type:'message'}
  ↓
  ① qc.setQueryData(['messages', conversationId], old =>
        [...old, {id: msgId, sender_type:'bot', content:'', ...}])
     ← 立即插入空占位符，避免列表跳动
  ↓
  ② fetchSingleMessage(conversationId, msgId)
     GET /conversations/{id}/messages/{msgId}
  ↓
  ③ qc.setQueryData(['messages', conversationId], old =>
        old.map(m => m.id === msgId ? realMsg : m))
     ← 用真实消息替换占位符
     （若占位符已被并发 invalidate 清除，则追加真实消息到末尾）
```

---

## 6. 全局事件流程

Gateway 持续推送各种全局状态事件，前端通过全局 SSE 流接收并更新 Zustand store。

```
Gateway WS 推送各类 event 帧
  ↓
connection-pool.handleEvent(entry, ev)
  ↓
entry.onPushEvent(PushEvent)
  ↓
OpenClawProxy.setPushHandler 注册的回调
  ↓
PushRelay.handlePush(event, botId)
  └─ 非会话事件 → broadcast('global', {type, botId, payload/metadata})
  ↓
Sidecar SSE 端点 GET /bots/global-stream
  ↓
前端 useGlobalStream (EventSource，AppLayout 挂载时建立)
  ↓
事件分发（switch data.type）：

  tick              → 忽略（心跳保活信号）

  system_presence   → setBotStatus(botId, {presence: metadata})
                      invalidateQueries(botKeys.all)

  presence          → setBotStatus(botId, {presence: payload})
                      invalidateQueries(botKeys.all)

  health            → setBotStatus(botId, {health: payload})
                      （包含 uptimeMs、channels、agents、sessions 等）

  heartbeat         → setBotStatus(botId, {lastHeartbeat: payload})

  shutdown          → setBotStatus(botId, {isShutdown: true})
                      invalidateQueries()（全部失效）

  node_pair_requested → addBotNodeRequest(botId, payload)

  node_pair_resolved  → resolveBotNodeRequest(botId, payload.nodeId)

  cron              → setBotStatus(botId, {lastCronAt: now})
                      invalidateQueries(botKeys.all)
                      [Sidecar 侧额外：若 action=finished 且有 summary，
                       写入该 Bot 关联的所有对话并 broadcast 对话频道]
```

---

## 7. SSE 频道设计

Sidecar 维护一个全局 SSE 订阅注册表，按频道（`channelId`）分组：

```typescript
sseClients: Map<channelId, Set<ReadableStreamDefaultController>>;
```

### 频道划分

| channelId          | 订阅端点                                       | 前端 Hook         | 事件类型                                                        |
| ------------------ | ---------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| `'global'`         | `GET /bots/global-stream`                      | `useGlobalStream` | tick、presence、health、heartbeat、shutdown、node*pair*\*、cron |
| `<conversationId>` | `GET /conversations/{id}/messages/push-stream` | `usePushStream`   | message、approval、chat、exec_finished、exec_denied             |

### `createPushSseResponse` 实现（`src-api/src/shared/sse.ts`）

```typescript
createPushSseResponse(channelId: string): Response
  ↓
  new ReadableStream({
    start(ctrl) {
      // 1. 启动 25s 心跳，防止代理/浏览器超时断开
      heartbeat = setInterval(() => ctrl.enqueue(": heartbeat\n\n"), 25000)

      // 2. 注册订阅者
      cleanup = PushRelay.registerClient(channelId, ctrl)
    },
    cancel() {
      clearInterval(heartbeat)
      cleanup()  // 从 sseClients 移除，Set 为空时删除 channelId
    }
  })

Response Headers:
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
```

### SSE 帧格式

**数据帧**（`broadcast` 发送）：

```
data: {"msgId":"...","conversationId":"...","type":"message"}
\n
\n
```

**心跳帧**（定时发送，防超时）：

```
: heartbeat
\n
\n
```

---

## 8. HTTP REST API 接口表

所有端点均在 `http://127.0.0.1:{PORT}` 上，通过 CORS 允许前端（`http://localhost:1420`、`tauri://localhost`）访问。

### Messages（消息）

| 方法  | 路径                                                        | 说明                         | 请求                | 响应                                               |
| ----- | ----------------------------------------------------------- | ---------------------------- | ------------------- | -------------------------------------------------- |
| GET   | `/conversations/:id/messages`                               | 获取对话全部消息             | —                   | `Message[]`（按 created_at ASC）                   |
| POST  | `/conversations/:id/messages`                               | 发送消息（非流式，等待完成） | `{content: string}` | `Message`（Bot 回复）                              |
| `GET` | `/conversations/:id/messages/stream`                        | 发送消息（流式 SSE）         | `?content=...`      | SSE stream（带 `: keepalive` 和 `done:true` JSON） |
| GET   | `/conversations/:id/messages/push-stream`                   | 订阅 Bot 推送消息            | —                   | SSE stream（长连接）                               |
| GET   | `/conversations/:id/messages/:msgId`                        | 获取单条消息                 | —                   | `Message`                                          |
| POST  | `/conversations/:id/messages/approvals/:approvalId/resolve` | 解析审批请求                 | `{botId, approved}` | `{success: boolean}`                               |

**`/stream` SSE 帧格式**：

```
data: {"chunk":"累积全文"}    ← 每次 Bot 生成一段文字
data: {"chunk":"..."}        ← 可多次
data: {"done":true,"botMsg":{...}} ← 流正常结束，包含最终入库的 Message 记录
data: {"error":"消息"}       ← 出错时
: keepalive                  ← 每 5s 发送的注释帧，防止前端或代理空闲超时
```

### Bots（Bot 管理）

| 方法   | 路径                        | 说明                                      |
| ------ | --------------------------- | ----------------------------------------- |
| GET    | `/bots`                     | 获取所有 Bot                              |
| GET    | `/bots/global-stream`       | 订阅全局状态事件（SSE 长连接）            |
| GET    | `/bots/:id`                 | 获取单个 Bot                              |
| POST   | `/bots`                     | 创建 Bot                                  |
| PUT    | `/bots/:id`                 | 更新 Bot                                  |
| DELETE | `/bots/:id`                 | 删除 Bot                                  |
| GET    | `/bots/:id/remote-config`   | 读取远程配置（~/.openclaw/openclaw.json） |
| POST   | `/bots/:id/test-connection` | 测试 Gateway 连接（完整握手后断开）       |
| POST   | `/bots/:id/apply-config`    | 写入 LLM 配置到 openclaw.json             |

### Conversations（对话管理）

| 方法   | 路径                                     | 说明                         | 请求                                    |
| ------ | ---------------------------------------- | ---------------------------- | --------------------------------------- |
| GET    | `/conversations`                         | 获取所有对话（含 bots 关联） | —                                       |
| GET    | `/conversations/:id`                     | 获取单个对话                 | —                                       |
| POST   | `/conversations`                         | 创建对话                     | `{title, type, botIds[], primaryBotId}` |
| DELETE | `/conversations/:id`                     | 删除对话                     | —                                       |
| POST   | `/conversations/:id/bots`                | 向对话添加 Bot               | `{botId}`                               |
| DELETE | `/conversations/:id/bots/:botId`         | 从对话移除 Bot               | —                                       |
| PATCH  | `/conversations/:id/bots/:botId/primary` | 设置主 Bot                   | —                                       |

### Settings & Health

| 方法 | 路径            | 说明                                        |
| ---- | --------------- | ------------------------------------------- |
| GET  | `/settings/llm` | 读取 LLM 全局设置                           |
| PUT  | `/settings/llm` | 更新 LLM 全局设置                           |
| GET  | `/health`       | 健康检查，返回 `{status:'ok', db:'ok', ts}` |

---

## 9. 核心数据类型定义

### Message

```typescript
interface Message {
  id: string; // UUID
  conversation_id: string; // 所属对话 ID
  sender_type: "user" | "bot"; // 发送者类型
  bot_id?: string; // Bot 发送时的 Bot ID
  content: string; // 消息正文
  mentioned_bot_id?: string; // 被 @ 提及的 Bot ID（路由依据）
  message_type?: "text" | "approval" | "system_event";
  metadata?: string; // JSON string，approval 和 system_event 的附加数据
  created_at: string; // ISO-8601
  bot?: Bot; // 关联的 Bot 对象（查询时 JOIN）
}
```

`message_type` 说明：

| 值             | 来源                                        | 前端渲染                    |
| -------------- | ------------------------------------------- | --------------------------- |
| `text`         | 用户消息、Bot 文字回复                      | 普通气泡                    |
| `approval`     | Gateway `exec.approval.requested` 事件      | 审批卡片（含允许/拒绝按钮） |
| `system_event` | exec_finished / exec_denied / cron.finished | 带图标的系统事件卡片        |

### Bot

```typescript
interface Bot {
  id: string;
  name: string;
  avatar_emoji: string;
  description: string;
  skills_config: SkillConfig[]; // Bot 的技能配置列表
  mcp_config: string; // JSON string，MCP 工具配置
  llm_config: LlmConfig | null; // 本地 LLM 覆盖配置
  openclaw_ws_url: string; // Gateway URL（ws:// 或 http://）
  openclaw_ws_token?: string; // Gateway 认证 token
  openclaw_agent_id: string; // Agent ID，默认 "main"
  connection_status: "connected" | "disconnected" | "error" | "connecting";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### Conversation

```typescript
interface Conversation {
  id: string;
  title: string;
  type: "single" | "group";
  created_at: string;
  updated_at: string;
  bots?: ConversationBot[]; // 关联的 Bot 列表
}

interface ConversationBot {
  conversation_id: string;
  bot_id: string;
  is_primary: boolean; // 主 Bot（路由默认目标）
  join_order: number; // 加入顺序
  bot?: Bot;
}
```

### PushEvent（Gateway → Sidecar 的内部类型）

```typescript
type PushEvent =
  | { type: "message"; sessionId: string; agentId: string; content: string }
  | { type: "approval"; sessionId?: string; agentId?: string; metadata: Record<string, unknown> }
  | { type: "system_presence"; metadata: Record<string, unknown> }
  | { type: "tick" }
  | { type: "chat"; payload: ChatPayload }
  | { type: "presence"; payload: PresencePayload }
  | { type: "health"; payload: HealthPayload }
  | { type: "heartbeat"; payload: HeartbeatPayload }
  | { type: "shutdown" }
  | { type: "node_pair_requested"; payload: NodePairRequestedPayload }
  | { type: "node_pair_resolved"; payload: NodePairResolvedPayload }
  | { type: "cron"; payload: CronPayload }
  | { type: "exec_finished"; sessionId?: string; payload: ExecFinishedPayload }
  | { type: "exec_denied"; sessionId?: string; payload: ExecDeniedPayload };
```

### BotStatusInfo（Zustand app-store）

```typescript
interface BotStatusInfo {
  health?: HealthPayload; // 最新 health 快照
  lastHeartbeat?: HeartbeatPayload; // 最新 heartbeat 结果
  presence?: PresencePayload; // 最新 presence 状态
  pendingNodeRequests: NodePairRequestedPayload[]; // 待处理的 node 配对请求
  lastCronAt?: string; // 最后一次 cron 事件时间
  isShutdown: boolean; // Gateway 是否已关闭
  updatedAt: string; // 最后更新时间（ISO-8601）
}
```

### 数据库 Schema（SQLite）

```sql
-- Bot 配置
CREATE TABLE bots (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  avatar_emoji       TEXT NOT NULL DEFAULT '🤖',
  description        TEXT NOT NULL DEFAULT '',
  skills_config      TEXT NOT NULL DEFAULT '[]',    -- JSON array
  mcp_config         TEXT NOT NULL DEFAULT '{}',    -- JSON object
  openclaw_ws_url    TEXT NOT NULL,
  openclaw_ws_token  TEXT,
  openclaw_agent_id  TEXT NOT NULL DEFAULT 'main',  -- Migration 2 新增
  connection_status  TEXT NOT NULL DEFAULT 'disconnected',
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- 对话
CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'single',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 对话-Bot 关联（多对多）
CREATE TABLE conversation_bots (
  conversation_id TEXT NOT NULL,
  bot_id          TEXT NOT NULL,
  is_primary      INTEGER NOT NULL DEFAULT 0,
  join_order      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (conversation_id, bot_id)
);

-- 消息
CREATE TABLE messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL,
  sender_type      TEXT NOT NULL,
  bot_id           TEXT,
  content          TEXT NOT NULL,
  mentioned_bot_id TEXT,
  message_type     TEXT DEFAULT 'text',             -- Migration 3 新增
  metadata         TEXT,                            -- Migration 3 新增
  created_at       TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_conv_bots_conversation ON conversation_bots(conversation_id);
CREATE INDEX idx_bots_active ON bots(is_active);
```

---

## 10. 审批流程

当 Bot 执行需要用户确认的操作时，触发审批流程：

```
Bot 尝试执行需确认的命令
  ↓
Gateway 推送 event: exec.approval.requested
{
  "event": "exec.approval.requested",
  "payload": {
    "sessionKey": "<conversationId>",
    "agentId": "main",
    "runId": "<uuid>",
    "command": "shell",
    "reason": "需要执行: rm -rf ...",
    "call": { "command": "...", "args": {...} }
  }
}
  ↓
connection-pool.handleEvent()
  → onPushEvent({
      type: 'approval',
      sessionId: payload.sessionKey,
      agentId: payload.agentId,
      metadata: payload
    })
  ↓
PushRelay.handlePush(event, botId)  [event.type === 'approval']
  ↓
  [DB] INSERT messages (
    message_type = 'approval',
    content = '需要执行审批',
    metadata = JSON.stringify(metadata)   ← 含 command、args、runId 等
  )
  ↓
  broadcast(conversationId, {msgId, type: 'approval'})
  ↓
前端 usePushStream 收到 {msgId, type:'approval'}
  → fetchSingleMessage → 加载审批消息
  ↓
BotMessage 渲染 message_type === 'approval'
  → 展示审批卡片：命令名 + 参数 JSON + 允许/拒绝按钮
  ↓
用户点击「允许」或「拒绝」
  ↓
useResolveApproval(conversationId).mutate({
  approvalId: metadata.id,   ← approval 的唯一 ID
  botId: bot.id,
  approved: true/false
})
  ↓
POST /conversations/:id/messages/approvals/:approvalId/resolve
  Body: { botId, approved }
  ↓
Sidecar: OpenClawProxy.resolveApproval(url, token, approvalId, approved)
  ↓
GatewayWSAdapter → rpc(entry, 'exec.approval.resolve', { id: approvalId, approved })
  ↓
Gateway 收到审批决定，继续或中止命令执行
  ↓
Gateway 推送 exec.finished 或 exec.denied 事件
  → PushRelay 持久化 system_event 消息 + broadcast 到对话频道
  → BotMessage 展示命令结果卡片（✅ 或 🚫）
```

---

## 11. 聊天功能相关代码清单

### 前端页面层（`src/pages/Chat/`）

---

#### `src/pages/Chat/PrivateChatPage.tsx`

**功能**：私聊主页面，布局 = 左侧对话侧边栏 + 右侧消息流 + 底部输入框。

**核心实现**：

```
useConversations()              → 获取全部对话，过滤 type === 'single'
useBots()                       → 获取所有 Bot（用于显示头像）
useChatStore()                  → 读取 activeConversationId
useMessages(activeId)           → 加载历史消息列表
useSendMessageStream(activeId)  → 获取流式发送函数
usePushStream(activeId)         → 订阅 Bot 推送，切换对话时自动重订阅
useDeleteConversation()         → 删除对话后清空 activeId
```

**`streamingContent` 状态机**：

| 值               | 含义                  | UI 表现                       |
| ---------------- | --------------------- | ----------------------------- |
| `null`           | 无流式进行中          | 不显示流式气泡                |
| `''`（空字符串） | 已发送，等待 Bot 首字 | 三点跳动动画                  |
| 非空字符串       | Bot 正在输出中        | 蓝色左边框气泡 + 末尾闪烁光标 |

**发送流程**：

```
onSend(content)
  setIsSending(true)
  setStreamingContent('')
  await sendStream(content, chunk => setStreamingContent(chunk))
  finally:
    setStreamingContent(null)
    setIsSending(false)
```

---

#### `src/pages/Chat/GroupChatPage.tsx`

**功能**：群聊主页面，在私聊基础上增加右侧群组信息面板。

**与私聊的主要差异**：

1. 过滤条件：`conv.type === 'group'`
2. `MessageInput` 传入全部 `convBots`（而非单个），支持多 Bot @提及
3. 右侧面板（`<aside>`）展示参与 Bot 列表，标注主 Bot（👑）和连接状态
4. 底部"感知注入"预览块：展示群聊上下文注入的格式示例
5. `BotMessage` 的 `isPrimary` 由 `m.bot_id === primaryBotId` 判断

---

#### `src/pages/Chat/BotMessage.tsx`

**功能**：统一消息气泡渲染组件，处理四种渲染场景。

**Props**：

```typescript
interface Props {
  message: Message; // 含可选的 bot 关联对象
  isPrimary?: boolean;
}
```

**渲染分支**：

```
message.sender_type === 'user'
  → 右对齐蓝底白字气泡（#2563EB）

message.message_type === 'text'（默认）
  → 左对齐气泡
    isPrimary=true  → 蓝色左边框（border-l-[3px] border-[#2563EB]）
    isPrimary=false → 灰底（bg-[#F1F5F9]）

message.message_type === 'approval'
  → 审批卡片（白底 border）
    ├─ 头部：⚠️ 执行审批请求
    ├─ 命令 + 参数 JSON（代码块）
    └─ 按钮：允许（绿色）/ 拒绝（红色）
       resolvedState: 'pending' → 显示按钮
       resolvedState: 'approved'/'rejected' → 显示已处理状态

message.message_type === 'system_event'
  └─ SystemEventCard(metadata, content)
       metadata.result 存在 → ✅ 命令执行完成（绿色卡片，含命令和输出）
       metadata.reason 存在 → 🚫 命令执行被拒绝（红色卡片，含拒绝原因）
       metadata.summary 存在 → 🕐 定时任务完成（灰色卡片，含摘要）
       其他              → ⚙️ 通用系统事件
```

---

#### `src/pages/Chat/MessageInput.tsx`

**功能**：消息输入框，支持 `@` 提及 Bot、多行输入、IME 安全发送。

**关键实现**：

```
detectMention(v, cursorPos)
  正则: /@(\w*)$/ 匹配光标前的 @ 符号
  有匹配 → setMention({query, start}) 打开弹窗
  无匹配 → setMention(null) 关闭弹窗

insertMention(bot)
  before = value.slice(0, mention.start)
  after  = value.slice(cursorPos)
  newVal = `${before}@${bot.name} ${after}`
  关闭弹窗，恢复焦点，移动光标到 @Name 末尾

isComposingRef（IME 防误发）
  onCompositionStart → isComposingRef.current = true
  onCompositionEnd   → isComposingRef.current = false
  Enter 发送时检查: !isComposingRef.current 才真正发送
  （防止中文拼音选词时 Enter 键误触发发送）

routingHint（路由提示）
  value.match(/@(\w+)/) → 查找 bots 中匹配的 Bot
  有匹配 → "→ 将路由至 @BotName"（绿色）
  无匹配 → "→ 默认路由至主Bot"（灰色）

autoResize(el)
  el.style.height = 'auto'
  el.style.height = min(el.scrollHeight, 100) + 'px'
```

**键盘快捷键**：

| 按键                          | 行为                              |
| ----------------------------- | --------------------------------- |
| `Enter`（无 Shift，非 IME）   | 发送消息                          |
| `Shift+Enter`                 | 换行                              |
| `@`                           | 输入后自动检测，打开 Bot 提及弹窗 |
| `↑` / `↓`                     | 弹窗中切换焦点 Bot                |
| `Enter` / `Tab`（弹窗打开时） | 插入选中的 @Bot                   |
| `Escape`                      | 关闭弹窗                          |

---

#### `src/pages/Chat/ConversationSidebar.tsx`

**功能**：对话列表侧边栏，私聊和群聊页面共用同一组件。

**Props**：

```typescript
interface Props {
  title: string; // "私聊" 或 "群聊"
  subtitle: string; // 副标题说明
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete?: (id: string) => void;
  isLoading?: boolean;
}
```

**功能**：对话列表展示，激活态高亮（`bg-[#EFF6FF]`），hover 显示删除按钮（`Trash2`），搜索框（UI 仅展示，暂未接入过滤逻辑）。

---

#### `src/pages/Chat/NewConversationDialog.tsx`

**功能**：新建对话对话框，根据 `mode` 支持私聊（单选 Bot）和群聊（多选 Bot + 设主 Bot）。

**核心逻辑**：

```
mode === 'single'
  → 单选 Bot（radio 样式）
  → 对话名留空 → "与 BotName 的对话"

mode === 'group'
  → 多选 Bot（checkbox 样式），至少需要 2 个
  → 选满 2 个后显示"设置主 Bot"下拉框
  → 对话名留空 → "BotA·BotB 群"

handleCreate()
  → createMut.mutateAsync({title, type, botIds, primaryBotId})
  → POST /conversations
  → 成功后 onCreated(conv.id) → setActiveConversationId(conv.id)
  → onClose()
```

---

### 前端 Hooks 层（`src/shared/hooks/`）

---

#### `src/shared/hooks/useMessages.ts`

**导出**：

| 函数                                        | 说明                                               |
| ------------------------------------------- | -------------------------------------------------- |
| `useMessages(conversationId)`               | TanStack Query，`GET /conversations/{id}/messages` |
| `useSendMessage(conversationId)`            | 非流式发送，含乐观更新，失败自动回滚               |
| `useSendMessageStream(conversationId)`      | 流式发送（主要使用）                               |
| `useResolveApproval(conversationId)`        | 审批解析，`POST /approvals/:id/resolve`            |
| `fetchSingleMessage(conversationId, msgId)` | 单条消息拉取（供 usePushStream 使用）              |

**`useSendMessageStream` 详细流程**：

```typescript
return async (content, onChunk) => {
  // 1. 乐观插入
  qc.setQueryData(['messages', convId], old => [...old, optimisticUserMsg])

  // 2. 建立 SSE 流
  const res = await fetch(`/conversations/${convId}/messages/stream?content=...`)
  const reader = res.body.getReader()

  // 3. 逐行读取
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decode(value)
    for each line starting with 'data: ':
      if raw === '[DONE]': break
      onChunk(parsed.chunk)   → 更新 UI 流式显示
      lastChunk = parsed.chunk

  // 4. finally: 写缓存 + 后台刷新
  } finally {
    if (lastChunk) {
      qc.setQueryData(['messages', convId], old => [
        ...old.filter(m => m.id !== optimisticId),
        realUserMsg,
        // 这里在未收到 done(botMsg) 的兜底情况下 fallback 使用 optimisticMsg
        optimisticBotMsg(lastChunk)
      ])
    } else {
      // 没有任何 chunk (例如 cancel)，只保留 userMsg
      qc.setQueryData(['messages', convId], old => [
        ...old.filter(m => m.id !== optimisticId),
        realUserMsg,
      ])
    }
    void qc.invalidateQueries(['messages', convId])  // 不 await，异步刷新
  }
}
```

---

#### `src/shared/hooks/usePushStream.ts`

**功能**：订阅当前对话的 Bot 主动推送消息，`conversationId` 变化时自动重订阅。

**占位符策略**（避免列表跳动）：

```
收到 SSE 事件 {msgId}
  ↓
① 立即插入占位符 Message（id=msgId, content='', sender_type='bot'）
   → UI 立即显示消息位置，内容为空
  ↓
② fetchSingleMessage(conversationId, msgId)（异步）
  ↓
③ 收到真实消息后：
   - 占位符还在列表中 → map 替换（渲染完整内容）
   - 占位符已被 invalidate 清除 → 检查列表中是否已有该 id
     - 已有 → 不处理（invalidate 带来的刷新已包含该消息）
     - 没有 → 追加到末尾（防止消息丢失）
```

---

#### `src/shared/hooks/useGlobalStream.ts`

**功能**：全局 Bot 状态事件订阅，在 `AppLayout` 组件挂载时建立，整个 App 生命周期内只建立一次。

**EventSource URL**：`/bots/global-stream`

**事件处理表**：

| 事件类型              | Zustand 操作                             | React Query 操作                 |
| --------------------- | ---------------------------------------- | -------------------------------- |
| `tick`                | —                                        | —                                |
| `system_presence`     | `setBotStatus(botId, {presence})`        | `invalidateQueries(botKeys.all)` |
| `presence`            | `setBotStatus(botId, {presence})`        | `invalidateQueries(botKeys.all)` |
| `health`              | `setBotStatus(botId, {health})`          | —                                |
| `heartbeat`           | `setBotStatus(botId, {lastHeartbeat})`   | —                                |
| `shutdown`            | `setBotStatus(botId, {isShutdown:true})` | `invalidateQueries()`（全部）    |
| `node_pair_requested` | `addBotNodeRequest(botId, payload)`      | —                                |
| `node_pair_resolved`  | `resolveBotNodeRequest(botId, nodeId)`   | —                                |
| `cron`                | `setBotStatus(botId, {lastCronAt})`      | `invalidateQueries(botKeys.all)` |

---

#### `src/shared/hooks/useConversations.ts`

| 函数                      | 方法   | 路径                 | 缓存 key                              |
| ------------------------- | ------ | -------------------- | ------------------------------------- |
| `useConversations()`      | GET    | `/conversations`     | `['conversations']`                   |
| `useConversation(id)`     | GET    | `/conversations/:id` | `['conversations', id]`               |
| `useCreateConversation()` | POST   | `/conversations`     | 成功后 invalidate `['conversations']` |
| `useDeleteConversation()` | DELETE | `/conversations/:id` | 成功后 invalidate `['conversations']` |

---

### 前端状态管理层（`src/shared/store/`）

---

#### `src/shared/store/chat-store.ts`

**功能**：管理当前激活的对话 ID（全局单一状态）。

```typescript
interface ChatStore {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
}
```

切换对话时，`PrivateChatPage` / `GroupChatPage` 的 `useEffect` 会清空 `streamingContent` 和 `isSending`。

---

#### `src/shared/store/app-store.ts`

**功能**：管理每个 Bot 的实时状态快照（由 `useGlobalStream` 的 SSE 事件驱动更新）。

```typescript
interface AppStore {
  sidecarReady: boolean; // Sidecar API 是否可用
  botStatuses: Record<string, BotStatusInfo>; // 按 botId 索引的实时状态
  setBotStatus(botId, patch): void; // 合并更新（不存在时自动初始化）
  addBotNodeRequest(botId, req): void;
  resolveBotNodeRequest(botId, nodeId): void;
  // ... 全局 fallback 字段（无 botId 时使用）
}
```

> **类型同步注意**：`BotStatusInfo` 中的 payload 类型（`HealthPayload`、`PresencePayload` 等）是从 `src-api/src/core/gateway/types.ts` **手动复制**的，两端需保持同步。

---

### 后端 Sidecar API 层（`src-api/src/`）

---

#### `src-api/src/app/api/messages.ts`

**路由注册**（挂载在 `/conversations/:conversationId/messages`）：

| 端点                                  | 实现                                                     |
| ------------------------------------- | -------------------------------------------------------- |
| `GET /`                               | `MessageRouter.listMessages(id)`                         |
| `POST /`                              | `MessageRouter.route(id, content, noop)`，等待完成后返回 |
| `GET /stream`                         | `ReadableStream` + `MessageRouter.route`，逐块 enqueue   |
| `GET /push-stream`                    | `createPushSseResponse(conversationId)`                  |
| `GET /:msgId`                         | `MessageRouter.getMessage(msgId)`                        |
| `POST /approvals/:approvalId/resolve` | `OpenClawProxy.resolveApproval(...)`                     |

**`/stream` 端点实现细节**：

```typescript
GET /stream?content=...
  ↓
new Response(new ReadableStream({
  async start(ctrl) {
    const enc = new TextEncoder()
    let closed = false;

    // 心跳防止浏览器空闲超时 (8~10秒无输出会被 WebView 关闭)
    const keepaliveTimer = setInterval(() => {
      if (!closed) ctrl.enqueue(enc.encode(': keepalive\n\n'))
    }, 5000)

    try {
      const botMsg = await MessageRouter.route(convId, content, (chunk, botId) => {
        if (!closed) ctrl.enqueue(enc.encode(`data: ${JSON.stringify({chunk})}\n\n`))
      }, abortCtrl.signal)

      if (!closed) ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, botMsg })}\n\n`))
    } catch (err) {
      if (!closed) ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`))
    } finally {
      clearInterval(keepaliveTimer)
      closed = true
      ctrl.close()
    }
  },
  cancel() {
    // 监听客户端连接断开，中断等待
    abortCtrl.abort();
  }
}), { headers: { 'Content-Type': 'text/event-stream' } })
```

---

#### `src-api/src/core/message-router.ts`

**核心函数 `route`** 的完整实现逻辑：

```
route(conversationId, userContent, onChunk)
  ↓
  [验证] ConversationService.findById(conversationId) → 不存在抛 notFound
  ↓
  [持久化] INSERT INTO messages (sender_type='user', content=userContent, ...)
  ↓
  [路由决策]
    userContent.match(/@(\S+)/)
      有提及 → 遍历 conv.bots → 找 bot.name.toLowerCase() === mention
      无提及 → conv.bots.find(b => b.is_primary === 1)
    找不到任何 Bot → 抛 ApiError(422)
  ↓
  [群聊上下文注入] conv.type === 'group' && otherBots.length > 0
    enrichedContent = "[群聊上下文] 当前群聊中还有以下 Bot 可以协作：\n"
                    + otherBots.map(b => `- @${b.name}: ${b.description || b.name}`).join('\n')
                    + "\n如需协作，请在回复中使用 @BotName。\n\n"
                    + userContent
  ↓
  [转发] OpenClawProxy.sendMessage(url, token, agentId, enrichedContent, chunk => {
    replyContent = chunk   ← 赋值（取最后一帧的累积全文）
    onChunk(chunk, botId)  ← 传给 /stream SSE 端点
  }, conversationId)
  ↓
  [持久化] INSERT INTO messages (sender_type='bot', bot_id, content=replyContent, mentioned_bot_id)
  [更新时间] UPDATE conversations SET updated_at
  ↓
  [通知] broadcast(conversationId, {msgId, type:'message'})
  ↓
  return botMessage
```

---

#### `src-api/src/core/push-relay.ts`

**事件路由表**：

| 事件类型              | 路由目标                                    | 持久化                                 |
| --------------------- | ------------------------------------------- | -------------------------------------- |
| `tick`                | `broadcast('global', {type:'tick', botId})` | 否                                     |
| `system_presence`     | `broadcast('global', ...)`                  | 否                                     |
| `presence`            | `broadcast('global', ...)`                  | 否                                     |
| `health`              | `broadcast('global', ...)`                  | 否                                     |
| `heartbeat`           | `broadcast('global', ...)`                  | 否                                     |
| `shutdown`            | `broadcast('global', ...)`                  | 否                                     |
| `node_pair_requested` | `broadcast('global', ...)`                  | 否                                     |
| `node_pair_resolved`  | `broadcast('global', ...)`                  | 否                                     |
| `cron`                | `broadcast('global', ...)` + 条件持久化     | 仅 action=finished 且有 summary        |
| `message`             | `broadcast(conversationId, ...)`            | 是（type=text）                        |
| `approval`            | `broadcast(conversationId, ...)`            | 是（type=approval）                    |
| `chat`                | 有 sessionKey → 对话频道；无 → global       | 有 sessionKey 时是（type=text）        |
| `exec_finished`       | 有 sessionId → 对话频道；无 → global        | 有 sessionId 时是（type=system_event） |
| `exec_denied`         | 有 sessionId → 对话频道；无 → global        | 有 sessionId 时是（type=system_event） |

---

#### `src-api/src/core/openclaw-proxy.ts`

**双模式路由**：

```typescript
isWsUrl(url)  →  url.startsWith('ws://') || url.startsWith('wss://')

sendMessage(url, ...)    → isWsUrl ? GatewayWSAdapter : OpenAIHttpAdapter
testConnection(url, ...) → isWsUrl ? GatewayWSAdapter : OpenAIHttpAdapter
setPushHandler(url, ...) → 仅 GatewayWSAdapter（HTTP 模式无推送能力）
resolveApproval(url, ...) → WS RPC exec.approval.resolve（仅 WS 模式）
applyConfig(url, ...)    → 写 ~/.openclaw/openclaw.json（Gateway 不支持配置 RPC）
getConfig(url, ...)      → 读 ~/.openclaw/openclaw.json（同上）
```

---

#### `src-api/src/core/gateway/ws-adapter.ts`

| 函数/方法                             | 说明                                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| `connectWS(url, token)`               | 建立 WS + 完整握手，写入 pool，绑定持久化帧处理器                  |
| `getOrCreateWSConnection(url, token)` | 连接池复用逻辑（见第 2.7 节）                                      |
| `GatewayWSAdapter.sendMessage`        | RPC `agent` + 注册 `activeRuns` + 返回 Promise（流完成时 resolve） |
| `GatewayWSAdapter.setPushHandler`     | 写 `pushHandlerRegistry` + 同步更新已有连接的 `onPushEvent`        |
| `GatewayWSAdapter.testConnection`     | 独立握手后立即 teardown（不复用 pool）                             |
| `GatewayWSAdapter.closeAll`           | Sidecar 关闭时清空所有连接                                         |

---

#### `src-api/src/core/gateway/connection-pool.ts`

| 函数                                     | 说明                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| `sendFrame(ws, frame)`                   | JSON 序列化 + WS send + 写日志                       |
| `handleFrame(entry, data)`               | 分发：`res` → pendingRequests；`event` → handleEvent |
| `handleEvent(entry, ev)`                 | 处理所有 event 类型（见第 2.4 节流程图）             |
| `rpc(entry, method, params)`             | 发送 req 帧，Promise 化等待 res 帧（30s 超时）       |
| `teardown(url, entry, err, intentional)` | 清理连接，非 intentional 则触发重连                  |
| `scheduleReconnect(url, token, attempt)` | 指数退避重连调度                                     |

---

#### `src-api/src/core/gateway/http-adapter.ts`

**`OpenAIHttpAdapter.sendMessage`**：

```
POST {baseUrl}/v1/chat/completions
  body: { model: "openclaw:{agentId}", stream: true, messages: [{role:'user', content}] }
  ↓
读取 SSE 流，逐行解析 "data: ..." 帧
  → choices[0].delta.content 有内容 → onChunk(deltaText)
  → data === '[DONE]' → return
```

> **注意**：HTTP 模式的 `onChunk` 接收的是**增量 delta**，与 WS 模式的**累积 text** 不同。调用方（`MessageRouter`）通过 `replyContent = chunk` 赋值取最终值，HTTP 模式下最终值是最后一个 delta（不完整）。若需要完整文本，HTTP 模式应改为追加而非赋值——这是当前实现的一个潜在问题点。

---

#### `src-api/src/core/gateway/device-identity.ts`

| 函数                       | 说明                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `getOrCreateIdentity(url)` | 进程内缓存；SHA256 派生确定性 seed；提取 raw 32 字节公钥；返回 `{id, privateKey, publicKeyBase64Url}` |
| `base64UrlEncode(buf)`     | base64 → 替换 `+/-`, `//_`, 去掉 `=` 填充                                                             |

---

#### `src-api/src/shared/sse.ts`

| 函数                               | 说明                                                          |
| ---------------------------------- | ------------------------------------------------------------- |
| `createPushSseResponse(channelId)` | 创建 SSE Response，启动 25s 心跳，注册订阅者，`cancel` 时清理 |

---

#### `src-api/src/shared/db.ts`

- 使用 `bun:sqlite`（Bun 内建，无需安装额外依赖）
- 单例模式：全局只有一个 `Database` 实例
- WAL 模式 + 外键约束开启
- `ensureSchema` 包含 3 个迁移版本（幂等）：
  - v1：建表
  - v2：`bots` 表新增 `openclaw_agent_id` 列
  - v3：`messages` 表新增 `message_type` 和 `metadata` 列

---

#### `src-api/src/shared/gateway-logger.ts`

**功能**：将所有 Gateway WS 流量写入 NDJSON 日志文件（调试用）。

| 函数                                    | 说明                                                    |
| --------------------------------------- | ------------------------------------------------------- |
| `logIncoming(url, raw)`                 | 记录入站帧（解析后按类型结构化）                        |
| `logOutgoing(url, frame)`               | 记录出站帧（agent 方法只记录 key 字段，不记录消息内容） |
| `logPushEvent(url, eventType, details)` | 记录 handleEvent 解析后的 PushEvent                     |
| `logSystem(url, message, extra?)`       | 记录连接生命周期事件                                    |

日志文件路径：`logs/gateway.log`（或 `GATEWAY_LOG_PATH` 环境变量）。
实时查看：`tail -f logs/gateway.log | jq .`

---

_文档完 — 2026-02-24_
