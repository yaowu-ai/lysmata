# US-03：私聊会话

**模块**：Private Chat
**对应设计**：`design/ui-private-chat.html`、`docs/prd-v2.md §2.1`

---

## 实现状态总览

| 用户故事 | AC | 状态 | 关键实现位置 |
|---|---|---|---|
| US-03-01 | AC1：进入私聊入口 | ✅ 已实现 | `NewConversationDialog.tsx` + 左侧导航 |
| US-03-01 | AC2：新对话自动创建并列表展示 | ✅ 已实现 | `useCreateConversation` mutation + `POST /conversations` |
| US-03-01 | AC3：会话列表倒序排列 | ✅ 已实现 | `ConversationService.findAll()` `ORDER BY updated_at DESC` |
| US-03-02 | AC1：逐 token 追加 + 光标动画 | ✅ 已实现 | `useSendMessageStream` + `streamingContent` 状态 |
| US-03-02 | AC2：流式期间可中断 | ❌ 未实现 | 前端无 AbortController 接入，后端 cancel() 已就绪 |
| US-03-02 | AC3：输出完成光标消失 | ✅ 已实现 | `done: true` 信号写入 React Query 缓存后清除气泡 |
| US-03-03 | AC1：加载历史消息 | ✅ 已实现 | `useMessages` + `GET /conversations/:id/messages` |
| US-03-03 | AC2：滚动到顶分页加载 | ❌ 未实现 | API 全量返回，无 `limit/offset` 参数 |
| US-03-03 | AC3：历史消息持久化 | ✅ 已实现 | SQLite `messages` 表 + WAL 模式 |
| US-03-04 | AC1：右侧 Bot 信息面板 | ❌ 未实现 | 无独立右侧面板，仅 Header 显示头像/名称 |
| US-03-04 | AC2：面板可折叠持久化 | ❌ 未实现 | 面板本身不存在 |
| US-03-04 | AC3：点击技能跳转详情 | ❌ 未实现 | 面板不存在，技能详情页也无 |
| US-03-05 | AC1：搜索框实时过滤 | ❌ 未实现 | 搜索框无 `value`/`onChange` 绑定 |
| US-03-05 | AC2：搜索结果高亮关键词 | ❌ 未实现 | 搜索逻辑本身未实现 |
| US-03-06 | AC1：hover 显示删除图标 | ✅ 已实现 | `ConversationSidebar.tsx` `group-hover:opacity-100` |
| US-03-06 | AC2：删除前确认提示 | ❌ 未实现 | 点击直接删除，无确认弹窗 |
| US-03-06 | AC3：删除后切换最近会话 | ❌ 未实现 | `onSuccess` 仅置 `activeId` 为 null，未切换至其他会话 |
| US-03-07 | AC1：常规 Markdown 元素渲染 | ❌ 未实现 | `BotMessage.tsx` 仅 `whitespace-pre-wrap` 纯文本输出 |
| US-03-07 | AC2：代码块语法高亮 + 行内代码 | ❌ 未实现 | 无 Markdown 渲染库，无语法高亮库 |
| US-03-07 | AC3：GFM 表格渲染 | ❌ 未实现 | 同上 |
| US-03-07 | AC4：流式输出期间实时 Markdown 渲染 | ❌ 未实现 | 流式气泡 `streamingContent` 同样为纯文本 |
| US-03-07 | AC5：用户消息气泡保持纯文本 | — 无需实现 | 用户侧不需要 Markdown 渲染 |

---

### US-03-01：发起与 Bot 的私聊会话

**作为** 用户，
**我希望** 选择一个 Bot 并发起私聊，
**以便** 与指定 Bot 进行一对一的 AI 对话。

**优先级**：P0
**验收标准（AC）**：

- AC1：Bot 管理页或左侧导航可快速进入私聊 — ✅ 已实现（`NewConversationDialog.tsx` 对话框 + 左侧导航 + 路由跳转）
- AC2：新对话自动创建会话记录，显示在左侧会话列表 — ✅ 已实现（`useCreateConversation` → `POST /conversations` → `onSuccess` 触发 `invalidateQueries`）
- AC3：会话列表按最近消息时间倒序排列 — ✅ 已实现（`ConversationService.findAll()` 执行 `ORDER BY updated_at DESC`）

---

### US-03-02：流式接收 Bot 响应

**作为** 用户，
**我希望** Bot 的回复以流式逐字输出的方式显示，
**以便** 获得实时反馈感，而不是等待全部内容加载完成。

**优先级**：P0
**验收标准（AC）**：

- AC1：Bot 消息逐 token 追加到气泡，末尾显示光标闪烁动画 — ✅ 已实现（`useSendMessageStream` 每次 `onChunk` 回调更新 `streamingContent` state，`PrivateChatPage.tsx:118` 渲染蓝色 `animate-pulse` 光标）
- AC2：流式输出期间发送按钮变为"停止"图标，点击可中断生成 — ❌ 未实现（`MessageInput.tsx` 按钮在 `disabled` 时仅禁用而非变为停止图标；前端未接入 `AbortController`，后端 `messages.ts:154` 的 `cancel()` 钩子已就绪但无前端触发路径）
- AC3：输出完成后光标消失，消息气泡最终化 — ✅ 已实现（流结束后服务端发送 `{ done: true, botMsg }` 帧，前端将真实消息写入 React Query 缓存后执行 `setStreamingContent(null)` 清除流式气泡）

---

### US-03-03：查看历史消息

**作为** 用户，
**我希望** 在对话界面向上滚动查看当前会话的完整历史记录，
**以便** 回顾之前的对话内容。

**优先级**：P0
**验收标准（AC）**：

- AC1：打开已有会话时加载历史消息 — ✅ 已实现（`useMessages(activeId)` 通过 `GET /conversations/:id/messages` 全量获取，切换会话时自动触发）
- AC2：滚动到顶部时自动加载更早的消息（分页加载） — ❌ 未实现（API 无 `limit/offset` 分页参数，一次返回所有消息；前端无滚动触发逻辑）
- AC3：重新打开应用后历史消息持久保存 — ✅ 已实现（消息写入 SQLite `messages` 表，WAL 模式保证持久性，重启后自动加载）

---

### US-03-04：在右侧面板查看 Bot 信息

**作为** 用户，
**我希望** 在聊天界面右侧看到当前对话 Bot 的详细信息，
**以便** 了解其已安装技能、连接状态和配置摘要。

**优先级**：P1
**验收标准（AC）**：

- AC1：右侧面板显示 Bot 头像、名称、连接状态、已激活技能列表 — ❌ 未实现（`PrivateChatPage.tsx` 仅在顶部 Header 区域展示头像和名称，无独立右侧面板；`Bot.skills_config` 字段存在但未展示）
- AC2：面板可折叠，折叠状态持久化 — ❌ 未实现（面板本身不存在）
- AC3：点击技能名称可跳转至技能详情 — ❌ 未实现（面板不存在，且项目中无技能详情页面）

---

### US-03-05：搜索历史会话

**作为** 用户，
**我希望** 通过关键词搜索所有历史会话，
**以便** 快速找到之前讨论过的内容。

**优先级**：P1
**验收标准（AC）**：

- AC1：会话列表顶部有搜索框，输入后实时过滤会话标题和内容摘要 — ❌ 未实现（`ConversationSidebar.tsx:44-47` 的 `<input>` 无 `value`/`onChange` 绑定，仅为 UI 占位符）
- AC2：搜索结果高亮匹配关键词 — ❌ 未实现（搜索过滤逻辑本身未实现）

---

### US-03-06：删除会话

**作为** 用户，
**我希望** 删除不再需要的会话，
**以便** 保持会话列表整洁。

**优先级**：P1
**验收标准（AC）**：

- AC1：右键会话项或 hover 时出现删除图标 — ✅ 已实现（`ConversationSidebar.tsx:77` 使用 Tailwind `group-hover:opacity-100` 实现 hover 显隐，`Trash2` 图标在激活时变红）
- AC2：删除前弹出确认提示 — ❌ 未实现（`ConversationSidebar.tsx:72-75` 点击按钮直接调用 `onDelete(conv.id)`，`PrivateChatPage.tsx:32` 直接执行 `deleteMut.mutate(id)`，无确认弹窗或二次确认逻辑）
- AC3：删除后若当前查看该会话，则切换到最近的其他会话 — ❌ 未实现（`PrivateChatPage.tsx:34` `onSuccess` 回调仅执行 `setActiveConversationId(null)`，页面变为空白状态而非自动选中下一条会话）

---

### US-03-07：消息卡片 Markdown 渲染

**作为** 用户，
**我希望** Bot 的回复消息以格式化的方式显示，
**以便** 清晰阅读包含代码、表格、列表等结构化内容的回复，而不是看到满屏的星号和反引号。

**优先级**：P1
**背景**：当前 `BotMessage.tsx:213` 对 `text` 类型消息气泡使用 `whitespace-pre-wrap` 直接输出原始字符串 `{message.content}`。LLM 产生的回复通常包含大量 Markdown 语法（如 `**加粗**`、` ``` ` 代码块、`| 表格 |`），无解析渲染时用户看到的是原始符号，可读性极差。

**验收标准（AC）**：

- AC1：Bot `text` 类型消息气泡支持渲染常规 Markdown 元素 — ❌ 未实现
  - 覆盖元素：`**加粗**`、`*斜体*`、`# 标题`（h1-h3）、`- 无序列表`、`1. 有序列表`、`> 引用块`、`---` 分隔线、`[链接](url)`
  - 渲染区域限定为 Bot 消息气泡内容区（`BotMessage.tsx:211-218` 的 `text` 分支）
  - 样式须与气泡背景色（`#F0F7FF` / `#F1F5F9`）协调，标题字号不超过气泡宽度
  - 用户消息气泡（`sender_type === "user"`）保持纯文本输出，不做 Markdown 解析

- AC2：代码块以语法高亮形式渲染，行内代码使用等宽字体 — ❌ 未实现
  - 围栏代码块（` ```lang ... ``` `）：深色背景（参考 `#1E293B`），按语言类型高亮关键字，右上角显示语言标签和复制按钮
  - 行内代码（`` `code` ``）：浅色圆角背景（参考 `#F1F5F9`），等宽字体，字号略小于正文
  - 复制按钮点击后文字临时变为"已复制"，1.5 秒后复原

- AC3：GFM 表格（GitHub Flavored Markdown Table）正确渲染为带样式的 HTML 表格 — ❌ 未实现
  - 表头行加粗并带底部边框，奇偶行区分背景色（斑马纹）
  - 横向内容过多时气泡内出现横向滚动条，不撑破气泡最大宽度（75%）
  - 对齐语法（`:---`、`:---:`、`---:`）控制列对齐方向

- AC4：流式输出期间实时渲染 Markdown，光标跟随内容末尾 — ❌ 未实现
  - `PrivateChatPage.tsx:116-119` 流式气泡的 `{streamingContent}` 同样以 Markdown 渲染，而非纯文本
  - 渲染库须能容忍不完整的 Markdown 片段（如尚未闭合的 ` ``` ` 块）而不崩溃或产生大面积样式错误
  - 光标（`animate-pulse` 蓝色竖线）始终紧跟最后一个字符，在 Markdown 渲染后仍位置正确

**实现建议（供参考）**：

| 关注点 | 建议方案 |
|---|---|
| Markdown 解析 + 渲染 | `react-markdown`（支持流式增量渲染，生态成熟）|
| GFM 扩展（表格、删除线、任务列表） | `remark-gfm` 插件 |
| 语法高亮 | `rehype-highlight`（基于 highlight.js）或 `rehype-prism-plus` |
| 流式不完整片段容错 | `react-markdown` 内置容错；避免用 `marked` 等需完整文档的方案 |
| 样式隔离 | Tailwind CSS `prose` 类（`@tailwindcss/typography` 插件）限定在气泡内，防止样式溢出 |

**AC5（不需要实现）**：用户消息气泡保持原始文本，不做 Markdown 解析 — 用户输入通常为自然语言，渲染 Markdown 语法符号反而影响阅读；`BotMessage.tsx:106-118` 用户消息分支可维持现状。
