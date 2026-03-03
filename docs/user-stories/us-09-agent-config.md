# US-09：Agent 配置管理

**模块**：Agent Config
**对应设计**：`design/ui-bot-management.html`
**依赖**：US-01（Onboarding）、US-07（配置中心）

> **说明**：本模块聚焦于通过 OpenClaw CLI 命令行工具管理 Agent，使 Lysmata 能够对
> `openclaw agents` 子命令进行可视化封装，让用户无需手动在终端输入命令即可完成
> Agent 的添加、绑定、查看、移除等生命周期操作。
>
> **OpenClaw CLI Agent 相关命令参考**：
> ```bash
> # 查看所有 agent
> openclaw agents list
>
> # 新增 agent（指定工作目录）
> openclaw agents add <id> --workspace <dir>
>
> # 查看所有 agent↔gateway 绑定关系
> openclaw agents bindings
>
> # 将 agent 绑定到 gateway
> openclaw agents bind --agent <id> --gateway <url> [--token <token>]
>
> # 移除 agent
> openclaw agents remove <id>
>
> # 初始化/重新配置（向导模式或非交互模式）
> openclaw configure \
>   --workspace <dir> \
>   --mode local|remote \
>   --remote-url <url> \
>   --remote-token <token> \
>   --non-interactive
> ```

---

### US-09-01：查看本地 Agent 列表

**作为** AI 开发者，
**我希望** 在 Lysmata 中查看所有已注册的本地 OpenClaw Agent，
**以便** 了解当前有哪些 Agent 可以连接和使用，而不需要打开终端执行 `openclaw agents list`。

**优先级**：P0
**实现状态**：⚠️ 未实现
**验收标准（AC）**：

- AC1：Bot 管理页或配置中心新增"本地 Agent"面板，调用后端接口（`GET /openclaw/agents`），后端执行 `openclaw agents list` 并解析输出，返回结构化列表
- AC2：列表每行显示：Agent ID、工作目录（workspace）、当前绑定的 Gateway URL（若有）、在线状态
- AC3：列表支持手动刷新（刷新图标按钮），刷新时执行重新调用 CLI 获取最新状态
- AC4：若本地未检测到 `openclaw` 可执行文件，显示提示横幅："未找到 OpenClaw CLI，请先完成安装"，并附跳转安装向导的链接

---

### US-09-02：通过界面新增 Agent

**作为** AI 开发者，
**我希望** 在 Lysmata 中通过表单新增一个 OpenClaw Agent，
**以便** 不需要在终端手动执行 `openclaw agents add` 命令。

**优先级**：P0
**实现状态**：⚠️ 未实现
**验收标准（AC）**：

- AC1："本地 Agent"面板提供"+ 新增 Agent"按钮，点击后展开或弹出表单，包含以下字段：
  - Agent ID（必填，仅允许小写字母、数字和连字符）
  - 工作目录 workspace（必填，支持手动输入路径或点击"选择目录"调用系统文件选择器；默认值 `~/.openclaw/workspace-{id}`）
- AC2：提交时后端执行 `openclaw agents add <id> --workspace <dir>`，实时将命令输出（stdout/stderr）流式回传至前端日志区
- AC3：命令执行成功（exit code 0）后，列表自动刷新，新 Agent 出现在列表中，并显示成功 Toast："Agent「{id}」已创建"
- AC4：若 Agent ID 已存在（CLI 返回错误），前端显示红色内联错误："Agent ID 已存在，请换一个名称"
- AC5：Agent ID 输入框在失焦时自动校验格式，不合法时显示红色边框和提示："仅支持小写字母、数字和连字符"

---

### US-09-03：将 Agent 绑定到 Gateway

**作为** AI 开发者，
**我希望** 在 Lysmata 中将本地 Agent 绑定到指定的 OpenClaw Gateway，
**以便** 不需要手动执行 `openclaw agents bind` 命令即可建立 Agent↔Gateway 路由关系。

**优先级**：P0
**实现状态**：⚠️ 未实现
**验收标准（AC）**：

- AC1：Agent 列表每行提供"绑定 Gateway"操作入口（链接按钮或行内展开表单），包含以下字段：
  - Gateway URL（必填；下拉自动候选已在 Lysmata 中配置的 Bot 的 Gateway 地址，也可手动输入）
  - 鉴权 Token（选填；对应 `--token` 参数）
- AC2：提交时后端执行 `openclaw agents bind --agent <id> --gateway <url> [--token <token>]`
- AC3：绑定成功后，该 Agent 行的"绑定 Gateway"列更新为新的 URL，并显示绿色成功标记
- AC4：绑定失败时（CLI 返回非零退出码）显示错误 Toast，附原始错误信息（截取 stderr 末尾 3 行）
- AC5：已绑定的 Agent 支持"重新绑定"（覆盖原有绑定）和"解除绑定"两个操作，解除绑定通过移除配置实现

---

### US-09-04：移除 Agent

**作为** AI 开发者，
**我希望** 在 Lysmata 中删除不再需要的 Agent，
**以便** 不需要手动执行 `openclaw agents remove` 命令来清理配置。

**优先级**：P1
**实现状态**：⚠️ 未实现
**验收标准（AC）**：

- AC1：Agent 列表每行提供"删除"操作（垃圾桶图标），点击后弹出二次确认对话框："确定移除 Agent「{id}」？此操作不可撤销。"
- AC2：确认后后端执行 `openclaw agents remove <id>`，成功后从列表中移除该行并显示 Toast："Agent「{id}」已移除"
- AC3：若该 Agent 当前在 Lysmata 中有关联的 Bot 连接（`openclaw_agent_id` 匹配），则确认对话框额外展示警告："以下 Bot 正在使用此 Agent：{bot名称列表}，移除后这些 Bot 将无法正常连接。"
- AC4：执行 `remove` 命令期间，该行显示 loading 状态，删除按钮禁用

---

### US-09-05：查看 Agent↔Gateway 绑定关系总览

**作为** AI 开发者，
**我希望** 在一个统一视图中查看所有 Agent 与 Gateway 之间的绑定关系，
**以便** 快速了解路由拓扑，相当于 `openclaw agents bindings` 命令的可视化呈现。

**优先级**：P1
**实现状态**：⚠️ 未实现
**验收标准（AC）**：

- AC1：配置中心（Settings）或 Agent 面板提供"绑定关系"视图，调用 `GET /openclaw/agents/bindings`，后端执行 `openclaw agents bindings` 并解析输出
- AC2：视图以表格形式展示：Agent ID、Gateway URL、Token（遮码展示，点击复制）、绑定时间（若 CLI 输出含此字段）
- AC3：表格支持一键刷新，刷新时重新执行 CLI 命令
- AC4：若当前无任何绑定，显示空状态插画和文案："暂无绑定关系，在 Agent 列表中点击「绑定 Gateway」开始配置"

---

### US-09-06：非交互式批量配置（`openclaw configure --non-interactive`）

**作为** 高级用户或 CI/CD 环境中的开发者，
**我希望** Lysmata 能够将配置中心的设置通过 `openclaw configure --non-interactive` 命令一次性写入，
**以便** 在自动化场景下无需交互式操作即可完成 Agent 初始化，也避免 Lysmata 直接手写 `openclaw.json` 产生格式错误。

**优先级**：P1
**实现状态**：⚠️ 未实现
**验收标准（AC）**：

- AC1：配置中心"Agent 配置"区域提供"一键应用配置"按钮；点击后后端将当前 Gateway 设置、workspace 路径、模式（local/remote）组合为以下命令并执行：
  ```
  openclaw configure \
    --workspace <workspace> \
    --mode <mode> \
    [--remote-url <url>] \
    [--remote-token <token>] \
    --non-interactive
  ```
- AC2：命令执行过程中以实时日志流（SSE）方式将 stdout/stderr 推送至前端展示区，用户可观察进度
- AC3：执行完成（exit code 0）后显示成功 Toast："Agent 配置已通过 CLI 写入"，并自动调用 `openclaw agents list` 刷新 Agent 列表
- AC4：执行失败时显示错误面板，展示完整 stderr 输出，并提供"复制错误信息"按钮，方便用户排查
- AC5：`--mode remote` 时，`--remote-url` 字段为必填；若未填写则按钮不可点击，并在字段下方显示红色提示

---

### US-09-07：Bot 表单中直接选择已注册 Agent

**作为** AI 开发者，
**我希望** 在新建或编辑 Bot 时，能够从下拉列表中直接选择本地已注册的 OpenClaw Agent，
**以便** 无需手动输入 Agent ID，减少输入错误。

**优先级**：P1
**实现状态**：⚠️ 未实现
**验收标准（AC）**：

- AC1：`BotFormDrawer` 的"连接"Tab 中，Agent ID 字段改为"输入 + 下拉候选"组合控件：加载时调用 `GET /openclaw/agents` 获取本地 Agent 列表，在下拉中展示 Agent ID 及其 workspace 路径作为副文本
- AC2：选中某个 Agent 后，若该 Agent 已有绑定的 Gateway URL，自动将其填入 Gateway 地址输入框（可由用户覆盖）
- AC3：若 `GET /openclaw/agents` 接口调用失败（CLI 不存在或返回空），下拉退化为普通文本输入框，行为与现有相同，并在输入框右侧显示黄色警告图标 + Tooltip："无法获取本地 Agent 列表"
- AC4：下拉列表末尾始终保留"手动输入 Agent ID"选项，允许用户跳过选择自行填写
