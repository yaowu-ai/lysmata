以下为 **lysmata** 产品中针对 OpenClaw 的**安装向导**与**配置向导**的完整、闭环、可直接落地的方案。该方案严格遵循官方序列，确保用户在 5 分钟内完成从零到可用，同时实现商业闭环（LLM Marketplace）。所有配置采用 **Hybrid 执行策略**（简单字段 → CLI `openclaw config set` / `configure --section`；复杂 Provider → 安全 JSON 合并写入），彻底避免用户直接编辑 JSON 或使用 Monaco Editor。

### 1. 产品定位回顾
- **lysmata**：轻量 OpenClaw 桌面伴侣应用（Tauri v2 实现，体积 <10 MB）。
- **核心目标**：一键安装 + 可视化向导，让 90% 用户 5 分钟内完成 Gateway 启动、LLM 激活、Channel 连接并开始使用。
- **技术栈映射**（已完全适配）：
  - 前端：React 18 + shadcn/ui + Framer Motion + TanStack Query + Zustand。
  - 执行层：Tauri v2（tauri-plugin-shell + fs + notification + autostart）。
  - 辅助：Hono Sidecar（Bun 编译）、SQLite + Drizzle ORM（进度/历史记录）、Zod（表单校验）。

### 2. 安装向导（Installation Wizard）—— 单窗口一键式
**目标**：零终端操作，自动完成官方脚本执行、Node.js 检测、Daemon 安装。

**用户流程（共 3 步）**：
1. **环境检测**：启动 lysmata 自动扫描 Node.js、权限、WSL2（Windows）。界面显示绿/黄/红状态灯。
2. **一键安装**：点击“开始安装”按钮。
   - 执行逻辑（Tauri Shell）：运行官方一键脚本（`curl -fsSL https://openclaw.ai/install.sh | bash` 或 PowerShell 等价）。
   - 实时反馈：Framer Motion 进度条 + 日志滚动区（Hono WebSocket 推送行级解析，如 “Node installed”、“Onboarding started”）。
   - 安全：操作前显示完整命令预览 + 风险提示。
3. **安装完成**：自动跳转至**配置向导**。发送桌面通知 + 记录安装快照（SQLite）。

**后置动作**：执行 `openclaw doctor` 诊断，自动修复可处理问题；可选启用 autostart（Gateway 开机自启）。

**时长**：1–2 分钟（视网络）。

### 3. 配置向导（Visual Onboarding Wizard）—— 6 步模块化引导
**设计原则**：单窗口 Stepper（shadcn/ui + Framer Motion 过渡动画），支持 QuickStart（默认，4–5 步）与 Advanced 模式；每步对应一个 OpenClaw Section；Minimal 优先保障快速上手。

**完整 6 步流程**（严格参考官方 Quickstart 序列）：

**步骤 1：Gateway 配置**  
- 界面：简洁表单（端口默认 18789、绑定地址、认证模式、Daemon 开关）。  
- 执行：`openclaw config set gateway.*` 或 `configure --section gateway`。  
- 验证：实时状态检查。  
- 重启提示：若变更核心参数，步骤 6 自动处理。

**步骤 2：LLM Provider 配置**（重点简化）  
- **Tab 切换**（突出 lysmata Marketplace）：
  - **内置 Provider**：卡片选择（Anthropic、OpenAI、Groq 等）+ API Key 输入 → `openclaw config set agents.defaults.model.primary=...` + `models set`。
  - **自定义 Provider**（极简表单，无 JSON 编辑器）：
    - 字段（shadcn/ui + Zod 校验）：
      - Provider ID（内部标识）
      - 显示名称
      - Base URL
      - API Key（支持 `${ENV_VAR}`）
      - Model ID
      - Model 显示名称
      - API 类型（OpenAI Compatible / Anthropic Compatible 下拉）
      - （折叠）Context Window + “设为默认模型”开关
    - 一键模板按钮（Ollama、vLLM、LM Studio、Moonshot 等）。
  - **lysmata Marketplace**（独立 Tab，商业增强）：商品卡片 → 购买 → 自动填充表单 → 一键激活。
- 执行：内置 → CLI；自定义/Marketplace → 自动生成官方 `mode: "merge"` JSON → 备份 + 安全写入 `~/.openclaw/openclaw.json` → `openclaw doctor --fix` + `models status`。
- 热重载：多数情况无需重启。

**步骤 3：Channel 配置**  
- 界面：多选卡片 + Token/白名单表格（拖拽支持）。  
- 执行：`configure --section channels` 或 `config set channels.*`。

**步骤 4：Skills 配置**  
- 界面：ClawHub 推荐网格（搜索 + 一键安装）。  
- 执行：`npx clawhub@latest install <slug>` + `config set skills.*`。

**步骤 5：Hooks 配置**  
- 界面：启用开关 + 映射表格（路径 → Agent）。  
- 执行：`config set hooks.*`（热重载）。

**步骤 6：总结与应用（Review & Apply）**  
- 界面：完整 diff 预览 + 风险检查 + “是否重启 Gateway” 开关。  
- 执行：批量 CLI + `openclaw doctor --fix` + 可选 `openclaw gateway restart`。  
- 完成动作：自动打开 Dashboard（`openclaw dashboard`）、发送测试消息、显示“已就绪”通知 + LLM 额度仪表盘。

**向导增强特性**：
- 中途保存/恢复（SQLite）。
- 每步 CLI 命令预览 + notification 提醒。
- 全局快捷键唤起（global-shortcut）。
- 回滚：一键恢复备份。

### 4. 安全、兼容性与性能保障
- **安全**：API Key 使用 Tauri keyring + 环境变量引用；所有写入前备份；操作需用户确认。
- **兼容**：100% 遵循官方 schema，支持热重载；用户随时可切换官方 CLI。
- **性能**：启动 <1s，内存 <80 MB；离线支持（缓存模板）。

### 5. 实施路线图
- **Phase 1**：安装向导 + 步骤 1–2（Gateway + LLM Provider 极简表单 + Marketplace）。
- **Phase 2**：步骤 3–6 + Hybrid 执行引擎。
- **Phase 3**：测试、通知、自动更新 + 社区 Recipes 集成。

此方案已形成**闭环、可直接开发**的完整文档，彻底解决用户痛点（零终端、无 JSON 编辑）。各位同事，以上为最终版。如需补充代码模板（React 表单、Rust Shell Wrapper、Hono 端点）或生成 UI 原型图，请随时指示。我们可立即进入开发验证阶段。会议至此圆满收官，感谢团队协作！