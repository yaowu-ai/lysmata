# OpenClaw Chat 优化设计文档

日期：2026-02-23
范围：性能优化 + 事件展示完整性 + 流式输出体验

## 背景

当前存在六个核心问题：

1. `system_event` 类型消息（exec_finished、exec_denied、cron）无差异化渲染，metadata 信息丢失
2. 前端未接入 `GET /stream` 流式端点，用户看不到逐字打字效果
3. `usePushStream` 每条新消息触发全量 `invalidateQueries`，消息多时越来越慢
4. `useGlobalStream` 的 `useEffect` 依赖 9 个 Zustand setter，存在不必要的依赖噪音
5. Gateway WS 断线后无自动重连，断线期间所有 push 事件丢失
6. 全局事件（cron/presence/health）在 Chat 界面完全不可见

## 方案选择

采用**方案 A（最小改动）**：在现有架构上精准修复，不引入新的状态层。

- 流式临时状态放在组件本地 `useState`（纯 UI 状态，不需要跨组件共享）
- 增量更新通过新增单条消息端点实现，不改变 SSE 协议格式
- 重连逻辑封装在 `connection-pool.ts` 内部，对上层透明

## 改动设计

### 一、Gateway WS 自动重连（`gateway/connection-pool.ts`）

`teardown` 增加 `intentional: boolean` 参数，区分主动关闭和意外断线：

- `intentional = true`：Bot 删除、`shutdown` 事件触发，不重连
- `intentional = false`：网络中断、WS error，启动指数退避重连

重连策略：
- 起步延迟 1s，每次翻倍，上限 30s
- 最多重试 10 次，超过后放弃
- 重连成功后自动从 `pushHandlerRegistry` 恢复 `onPushEvent` 回调

`shutdown` 事件调用 `teardown(url, entry, err, true)`，不触发重连。

### 二、新增单条消息查询端点（`app/api/messages.ts`）

```
GET /conversations/:conversationId/messages/:msgId
```

供 `usePushStream` 增量更新时拉取单条完整消息（含 bot 关联数据）。

### 三、`useGlobalStream` 稳定化（`shared/hooks/useGlobalStream.ts`）

用 `useRef` 持有 `useAppStore.getState`，在 `onmessage` 回调里按需读取 setter，`useEffect` 依赖数组简化为 `[qc]`。

效果：EventSource 连接在应用生命周期内只建立一次，不因 store 引用变化重建。

### 四、`usePushStream` 增量更新（`shared/hooks/usePushStream.ts`）

收到 SSE `{ msgId, conversationId, type }` 后：

1. `setQueryData`：在消息列表末尾追加占位消息（`id: msgId, pending: true`）
2. `fetch GET /messages/:msgId`：拉取单条完整消息
3. `setQueryData`：替换占位为完整消息

消息列表不再整体重新拉取，每条新消息只触发一次单条请求。

### 五、流式输出（`shared/hooks/useMessages.ts` + Chat 页面）

新增 `useSendMessageStream` hook，替代 `useSendMessage` 的非流式调用：

```
用户发送
  → 乐观插入用户消息（setQueryData）
  → fetch GET /stream?content=encodeURIComponent(content)
  → 读取 ReadableStream chunks
  → 每个 chunk 调用 onChunk(text) 回调
  → 收到 [DONE] 后 invalidateQueries 拉取最终消息
```

`PrivateChatPage` 和 `GroupChatPage` 管理本地 `streamingContent: string | null` 状态：

- `null`：无进行中的流，不渲染临时气泡
- `''`：流已开始无内容，渲染三点跳动动画
- 有内容：渲染带光标闪烁的文本气泡

### 六、`BotMessage` system_event 渲染（`pages/Chat/BotMessage.tsx`）

`message_type === 'system_event'` 时，通过 `metadata` 字段区分三种子类型：

**exec_finished**（metadata 含 `result` 字段）：
- 绿色标题"✅ 命令执行完成"
- 显示命令名和输出内容（超长可折叠）

**exec_denied**（metadata 含 `reason` 字段）：
- 红色标题"🚫 命令执行被拒绝"
- 显示拒绝原因

**cron**（metadata 含 `summary` 字段）：
- 蓝灰色标题"🕐 定时任务完成"
- 显示任务摘要和相对时间

## 改动文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src-api/src/core/gateway/connection-pool.ts` | 修改 | teardown intentional 参数 + scheduleReconnect |
| `src-api/src/app/api/messages.ts` | 修改 | 新增 GET /:msgId 端点 |
| `src/shared/hooks/useGlobalStream.ts` | 修改 | useRef 稳定化，依赖数组简化 |
| `src/shared/hooks/usePushStream.ts` | 修改 | 增量 setQueryData 替代 invalidateQueries |
| `src/shared/hooks/useMessages.ts` | 修改 | 新增 useSendMessageStream hook |
| `src/pages/Chat/BotMessage.tsx` | 修改 | system_event 三种子类型渲染 |
| `src/pages/Chat/PrivateChatPage.tsx` | 修改 | 接入流式，管理 streamingContent |
| `src/pages/Chat/GroupChatPage.tsx` | 修改 | 同 PrivateChatPage |

## 实现顺序

以下可并行：①③⑤⑥
④ 依赖 ②，⑦ 依赖 ⑤⑥

```
① connection-pool.ts 重连逻辑
② messages.ts 新增 GET /:msgId
③ useGlobalStream 稳定化
④ usePushStream 增量更新（等 ②）
⑤ useSendMessageStream
⑥ BotMessage system_event 渲染
⑦ PrivateChatPage + GroupChatPage 接入流式（等 ⑤⑥）
```

## 不在本次范围

- GroupChatPage 的 @mention 路由逻辑
- approval 渲染逻辑
- DB schema
- Tauri 壳
