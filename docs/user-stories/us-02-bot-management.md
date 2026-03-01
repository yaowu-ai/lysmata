# US-02：Bot 管理

**模块**：Bot Management
**对应设计**：`design/ui-bot-management.html`、`docs/prd-v2.md §2.5`

---

### US-02-01：查看所有 Bot 列表

**作为** AI 开发者，
**我希望** 在主界面以卡片列表形式看到所有已创建的 Bot，
**以便** 快速掌握各 Bot 的状态和基本信息。

**优先级**：P0
**验收标准（AC）**：

- AC1：每张卡片显示：Bot 名称、Emoji 头像、能力描述、连接状态徽章；卡片中部以 mono 字体展示 Gateway URL；卡片底部信息条展示 LLM provider/model（Cpu 图标）、MCP server 数量（Puzzle 图标）、Skills 前 3 条名称（Zap 图标）；当存在挂起节点请求时，Activity 按钮右上角显示红色数字角标
- AC2：连接状态以四态指示（connected 绿 / disconnected 灰 / connecting 黄脉冲动画 / error 红）
- AC3：列表支持搜索过滤，按名称/描述实时筛选（输入框聚焦时自动展宽，无结果时显示提示和"清除搜索"按钮）

---

### US-02-02：创建新 Bot

**作为** AI 开发者，
**我希望** 通过右侧抽屉表单创建新的 Bot，
**以便** 连接不同的 OpenClaw Gateway 实例或配置专属技能组合。

**优先级**：P0
**验收标准（AC）**：

- AC1：点击"+ 新建 Bot"按钮，右侧滑入抽屉（带半透明遮罩）
- AC2：抽屉包含四个 Tab，顺序为：**基础 / MCP / Skills / 连接**
- AC3：基础 Tab 含名称（必填，最长 32 字符）、Emoji 头像（点击循环切换）、能力描述（可选 textarea）、激活状态开关（`is_active`，默认开启）
- AC4：连接 Tab 含 Gateway WebSocket 地址（必填，支持 ws:// / wss:// / http:// / https://）、Agent ID（默认 `main`）、鉴权 Token（password 类型，可选，留空则不发送 Authorization 头）
- AC5：保存时校验必填字段（名称、Gateway 地址），缺失时自动切到对应 Tab 并聚焦输入框；成功后抽屉关闭，列表自动刷新

---

### US-02-03：编辑已有 Bot

**作为** AI 开发者，
**我希望** 点击 Bot 卡片上的编辑按钮进入编辑状态，
**以便** 修改 Bot 的名称、描述、连接参数或技能配置。

**优先级**：P0
**验收标准（AC）**：

- AC1：点击卡片上的编辑（Pencil）按钮滑入相同右侧抽屉，所有字段预填已有数据；抽屉底部左侧显示"删除此 Bot"危险操作按钮
- AC2：修改保存后卡片信息通过 React Query 缓存失效机制实时更新
- AC3：编辑模式打开时自动从 Gateway 拉取远程配置（`GET /bots/:id/remote-config`），在 MCP 和 Skills Tab 顶部展示三态同步横幅：加载中（黄）/ 已同步（绿）/ 存在远端差异（橙色 warning）
- AC4：连接 Tab 提供"推送配置到 Gateway"功能（`POST /bots/:id/apply-config`），成功后显示写入路径（`configPath`）和是否需要重启 Gateway 的提示

---

### US-02-04：删除 Bot

**作为** AI 开发者，
**我希望** 删除不再需要的 Bot，
**以便** 保持列表整洁。

**优先级**：P0
**验收标准（AC）**：

- AC1：点击删除时弹出二次确认对话框（模态遮罩，含 Bot 名称和不可撤销提示）
- AC2：若 Bot 有活跃会话（查询 `GET /bots/:id/conversations-count`），确认框展示橙色警告横幅："该 Bot 存在进行中的对话，删除后相关对话记录将保留，但 Bot 将无法继续响应"
- AC3：确认删除后从列表移除（`DELETE /bots/:id` 级联删除 conversation_bots）

---

### US-02-05：测试 Bot 连接

**作为** AI 开发者，
**我希望** 对每个 Bot 单独执行连接测试，
**以便** 确认 Gateway 地址和认证配置正确。

**优先级**：P0
**验收标准（AC）**：

- AC1：Bot 卡片上有 Wifi 图标测试按钮；编辑抽屉连接 Tab 内有"测试连接"文字按钮
- AC2：点击后卡片按钮 disabled + 半透明；抽屉内按钮文字变为"测试中…"；同时 Bot connection_status 切换为 connecting（脉冲动画）
- AC3：连接成功时抽屉内显示绿色结果框，包含成功消息和 RTT 延迟（如 `· 42 ms`，以 mono 字体展示）
- AC4：连接失败时显示红色结果框和具体错误消息

---

### US-02-06：实时监控 Bot 连接状态

**作为** 研究者，
**我希望** Bot 列表实时反映每个 Bot 的连接状态变化，
**以便** 不需要手动刷新即可感知断线或重连。

**优先级**：P1
**验收标准（AC）**：

- AC1：AppLayout 挂载时通过 `useGlobalStream` hook 订阅 `GET /bots/global-stream` SSE 端点，接收 Gateway 推送的 presence、health、heartbeat、shutdown、node_pair_requested/resolved、cron 等事件
- AC2：事件按 botId 精确路由写入 Zustand `app-store`（`botStatuses` 字段），卡片状态指示灯无感刷新；connecting 状态以 `animate-pulse` 脉冲动画标识
- AC3：Bot Gateway 关闭（shutdown 事件）时触发浏览器桌面通知（`window.Notification`），首次使用时自动申请权限；通知标题"Bot 已断线"，正文含 Bot 名称与 Emoji

---

### US-02-07：查看 Bot 状态详情

**作为** AI 开发者，
**我希望** 查看单个 Bot 的运行时详细状态，
**以便** 诊断连接、健康、心跳、节点配对等问题。

**优先级**：P1
**验收标准（AC）**：

- AC1：Bot 卡片上 Activity 按钮点击后跳转到 `/bots/:id/status` 独立状态详情页；当存在挂起节点请求（pendingNodeRequests）时，按钮右上角显示红色数字角标
- AC2：详情页展示 6 张信息卡片：连接状态（Agent ID、is_shutdown）、系统健康（运行时长、节点数、限制配置）、心跳状态（上次心跳时间）、在线状态（online 布尔、设备数、会话数）、待配对节点（逐条列出 nodeId/requestId）、定时任务（上次触发时间）
- AC3：详情页数据来源于 SSE 全局流经 Zustand store 写入的实时快照，与列表页共享同一数据源
