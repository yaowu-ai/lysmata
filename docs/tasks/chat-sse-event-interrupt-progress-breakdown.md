# Chat SSE / 中断 / 计划进度机制任务拆解

**日期**：2026-04-29  
**范围**：`chat/private`（主），`chat/group`（同步 stop 行为）  
**目标**：按 `docs/chat-area/sse-response.md` 落地统一 SSE 事件、可中断机制、计划/进度处理，并兼容 OpenAI HTTP completions + OpenClaw WebSocket。

---

## 0. 交付定义（Definition of Done）

满足以下条件即完成：

1. `/messages/stream` 输出统一事件契约（并保留 legacy 兼容窗口）。
2. OpenAI HTTP 与 OpenClaw WS 对同类请求产出“等价事件序列”（类型/顺序/终态语义一致）。
3. 前端可消费并展示：文本流 + process 事件（至少 thinking/tool/todos）。
4. Stop 行为一致：前端即时停止、后端可取消、状态可区分 stopped vs error。
5. 无消息重复/丢失/闪失回归（optimistic + done 持久化 + invalidation 链路正常）。

---

## 1. Phase 1 - 冻结统一事件契约（类型与顺序）

### 1.1 任务
- [ ] 定义 canonical SSE envelope（建议）：`{ v, type, runId, conversationId, messageId?, seq, ts, payload }`
- [ ] 定义事件族：
  - 文本：`message_created` `text_start` `text_delta` `text_end`
  - 过程：`process`（`kind` 包含 `thinking/tool_call/tool_result/todos/task/confirmation/authorization_required/plan/progress`）
  - 终态：`complete` `status:done` `error`
- [ ] 定义顺序和幂等规则：`message_created -> text/process* -> terminal`，用 `runId+seq` 去重

### 1.2 关键文件
- `src-api/src/core/gateway/types.ts`
- `src/shared/types/index.ts`

### 1.3 验收
- [ ] 前后端共享类型可编译通过
- [ ] 类型层面能表达文档要求的全部事件

---

## 2. Phase 2 - 后端协议归一化（WS/HTTP 对齐）

### 2.1 任务
- [ ] 将 router 的流回调从“仅 chunk”提升为“事件驱动”（保留 chunk 兼容包装）
- [ ] WS 路径补齐 process 事件上抛（不再只日志）
- [ ] HTTP 路径补齐：
  - [ ] 保持累计文本契约（onChunk = accumulated）
  - [ ] 透传 `AbortSignal` 到 fetch/read
  - [ ] 发出与 WS 等价的 text/process/terminal 事件
- [ ] 对齐终态语义（completed/stopped/error）

### 2.2 关键文件
- `src-api/src/core/message-router.ts`
- `src-api/src/core/gateway/connection-pool.ts`
- `src-api/src/core/gateway/ws-adapter.ts`
- `src-api/src/core/gateway/http-adapter.ts`

### 2.3 验收
- [ ] WS 与 HTTP 的事件序列在测试样例中一致
- [ ] 中断信号在两条协议都可生效

---

## 3. Phase 3 - `/messages/stream` 升级（新契约优先 + 旧契约兼容）

### 3.1 任务
- [ ] `/stream` 改为输出 canonical 事件
- [ ] 保留兼容窗口：继续支持旧 `{chunk}/{done}/{error}` 解析路径
- [ ] 添加 SSE `id`（建议 `runId:seq`）
- [ ] 保留 keepalive 机制
- [ ] 中断时输出明确 stopped 终态

### 3.2 关键文件
- `src-api/src/app/api/messages.ts`
- `src-api/src/shared/sse.ts`

### 3.3 验收
- [ ] 老前端逻辑不立刻崩（兼容有效）
- [ ] 新前端逻辑可完整消费 canonical 事件

---

## 4. Phase 4 - 前端 Hook 迁移（先数据流，后复杂 UI）

### 4.1 任务
- [ ] `useSendMessageStream` 改事件驱动解析（保留 legacy fallback）
- [ ] 用 `message_created` 绑定 assistant 草稿生命周期
- [ ] 将 process 事件统一接入 `useStreamEvents`
- [ ] 保持现有 optimistic cache 与 done 回填策略

### 4.2 关键文件
- `src/shared/hooks/useMessages.ts`
- `src/shared/hooks/useStreamEvents.ts`
- `src/pages/Chat/ChatContainer.tsx`

### 4.3 验收
- [ ] 文本流显示连续且无回退
- [ ] inflight events 可进入现有渲染链路
- [ ] 不出现消息重复插入

---

## 5. Phase 5 - 中断状态机与竞态处理

### 5.1 任务
- [ ] 引入 run 状态机：`active -> stopping -> terminal`
- [ ] Stop 立即 abort，本地转 `stopping`，保留已生成文本
- [ ] 处理晚到事件（late chunk/done）幂等丢弃
- [ ] `stopped` 与 `error` UI 语义分离
- [ ] group 模式同步 stop 行为（与 private 一致）

### 5.2 关键文件
- `src/pages/Chat/ChatContainer.tsx`
- `src/shared/hooks/useMessages.ts`
- `src/pages/Chat/GroupChatPage.tsx`
- `src-api/src/app/api/messages.ts`

### 5.3 验收
- [ ] 三个时刻 stop（首 token 前/中途/接近结束）都稳定
- [ ] 无“停止后又恢复转圈”或“误报 error”

---

## 6. Phase 6 - 计划/进度 UI（分批上屏）

### 6.1 第一批（P0）
- [ ] 展示 `thinking`
- [ ] 展示 `tool_call` / `tool_result`
- [ ] 展示 `todos`（含 paused/finished 收敛规则）

### 6.2 第二批（P1）
- [ ] `task`（有/无 taskId 分流）
- [ ] `confirmation`（仅绑定最新 assistant run）
- [ ] `authorization_required`（按 platform 去重与清理）

### 6.3 关键文件
- `src/pages/Chat/ChatBody.tsx`
- `src/pages/Chat/ThoughtChainBubble.tsx`
- `src/pages/Chat/SystemEventBubble.tsx`
- `src/pages/Chat/ApprovalBubble.tsx`

### 6.4 验收
- [ ] 过程事件可读，不挤占主消息阅读
- [ ] stopped/complete/error 后卡片状态收敛正确

---

## 7. Phase 7 - Push/Global 流对齐（非阻塞主链路）

### 7.1 任务
- [ ] push/global 先保持兼容，仅追加可选字段（runId/seq/type）
- [ ] 后续再逐步收敛到 canonical envelope
- [ ] 确保 push placeholder-hydration 不回归

### 7.2 关键文件
- `src-api/src/core/push-relay.ts`
- `src/shared/hooks/usePushStream.ts`
- `src/shared/hooks/useGlobalStream.ts`

### 7.3 验收
- [ ] 全局状态流（health/presence/heartbeat）无行为变化
- [ ] push 消息无重复/丢失

---

## 8. Phase 8 - 清理兼容层与文档收口

### 8.1 任务
- [ ] 删除 legacy `{chunk}/{done}/{error}` 路径
- [ ] 清理旧类型别名与过时分支
- [ ] 更新协议文档与前后端接入说明

### 8.2 验收
- [ ] 仅保留 canonical SSE 契约
- [ ] 相关测试与手测 checklist 全绿

---

## 9. 测试与验证清单（每阶段复用）

### 9.1 自动化
- [ ] 后端单测：事件映射、序列顺序、终态互斥、abort 生效
- [ ] 前端单测：解析器兼容双协议、状态机、late event 丢弃
- [ ] 集成测试：WS/HTTP 协议序列对比

### 9.2 手测
- [ ] `bun run dev:all`
- [ ] private/group：发送、停止、重发、切会话
- [ ] 断网重连 + SSE 重连场景
- [ ] process 事件渲染与收敛

---

## 10. 推荐执行顺序

1. Phase 1 → 2（先把契约与后端归一化打牢）
2. Phase 3 → 4（接口输出 + 前端 hook 迁移）
3. Phase 5（中断状态机与竞态）
4. Phase 6（计划/进度 UI）
5. Phase 7 → 8（全流对齐与清理）

> 原则：每个 Phase 都要“可运行、可验证、可回退”，避免一次性改大面。