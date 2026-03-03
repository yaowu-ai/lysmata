# US-01：安装向导 & 配置向导

**模块**：Onboarding
**对应设计**：`design/ui-onboarding.html`、`docs/prd-v2.1.md`
**对应实现**：`src/pages/Onboarding/`、`src/shared/store/wizard-store.ts`

> **向导完整流程**（与 `WIZARD_FLOW` 保持一致）：
>
> ```
> intro → env → installing → install-success
>   → step1(Gateway) → step2(Provider) → step3(Channel)
>   → step4(Skills) → step5(Hooks) → step6(Review) → done
> ```
>
> **说明**：
> - install 阶段（intro / env / installing / install-success）：不显示顶部 Stepper，显示 Footer 取消按钮
> - config 阶段（step1–step6）：显示顶部 Stepper 和右上角 ✕ 退出按钮，Footer 显示上一步 / 下一步 / 跳过
> - done 阶段：不显示 Footer，仅显示完成操作按钮
> - Agent 创建步骤属于 US-09 模块，在向导中的入口定义见 **US-09-08**

---

## 一、冷启动触发

### US-01-00：应用启动时自动判断是否显示向导

**作为** 新用户，
**我希望** 首次打开 Lysmata 时自动进入安装向导，后续启动则直接进入主界面，
**以便** 首次体验有引导，日常使用不受打扰。

**优先级**：P0
**实现状态**：✅ 已实现（`localStorage` key `onboarding_completed`）
**验收标准（AC）**：

- AC1：应用启动时检查 `localStorage.getItem("onboarding_completed")`，若不存在则路由至 `/onboarding`，若存在则路由至 `/bots`
- AC2：向导完成（点击"进入主界面"）或中途退出（点击 ✕ / "稍后再说"）均调用 `markOnboardingComplete()`，写入该 key
- AC3：开发调试期间，可通过 `localStorage.removeItem("onboarding_completed")` 重置向导状态

---

## 二、安装阶段

### US-01-01：欢迎页 & 安装入口

**作为** 非技术用户，
**我希望** 在 Lysmata 欢迎页看到清晰的两条路径：全新安装 或 跳过直接配置，
**以便** 根据自己的实际情况选择，而不是被迫走完整的安装流程。

**优先级**：P0
**实现状态**：✅ 已实现（`IntroView.tsx`）
**验收标准（AC）**：

- AC1：欢迎页（intro）居中显示 OpenClaw 品牌 Logo、标题"欢迎使用 OpenClaw"和副文本说明
- AC2：显示主按钮"开始安装 OpenClaw"（蓝色实心），点击后跳转至 env 步骤
- AC3：显示次按钮"已安装 OpenClaw，直接配置 →"（Ghost 边框样式），点击后直接跳至 step1(Gateway)，跳过全部安装步骤
- AC4：页面底部显示说明文字："安装过程无需终端操作，约 1–2 分钟完成"
- AC5：intro 步骤不显示顶部 Stepper；Footer 仅显示"取消"按钮（点击调用 `markOnboardingComplete()` 并跳转 `/bots`）

---

### US-01-02：环境预检与状态反馈

**作为** AI 开发者，
**我希望** 在安装前看到系统环境（Node.js、权限、网络）的检测结果，
**以便** 提前发现问题，避免安装中途失败。

**优先级**：P0
**实现状态**：✅ 已实现（`EnvCheckView.tsx`，调用 `GET /openclaw/check-environment`）
**验收标准（AC）**：

- AC1：进入 env 步骤后自动调用 `GET /openclaw/check-environment`，并发检测三项：Node.js 版本（≥ v18.0）、系统权限（守护进程执行权限，macOS 为 pass，其他平台为 warn）、网络连接（检测 curl 可用性）
- AC2：每项检测用状态点直观呈现：绿色（pass）、黄色呼吸闪烁（checking / warn）、红色（fail）；右侧显示详细描述文字
- AC3：检测失败（fail）的项目给出具体原因，如"未检测到 curl，请安装后重试"
- AC4：接口调用失败时，全部项目显示 fail 状态，detail 显示"API 连接失败"
- AC5：Footer 显示"上一步"和"一键安装"按钮；**"一键安装"按钮始终可点击**（当前实现不依赖检测结果禁用按钮，检测结果仅作告知）

---

### US-01-03：正在安装

**作为** 非技术用户，
**我希望** 安装过程中看到实时进度和日志，知道系统在做什么，
**以便** 不因长时间等待感到焦虑，且遇到错误时能看到原因。

**优先级**：P0
**实现状态**：✅ 已实现（`InstallingView.tsx` + `useOnboardingInstall.ts`，SSE 流式接收 `GET /openclaw/install`）
**验收标准（AC）**：

- AC1：进入 installing 步骤后立即通过 `EventSource` 连接 `GET /openclaw/install`，开始接收流式事件；事件字段包含 `log`（日志行）、`progress`（0–100）、`message`（状态标签）、`success`（布尔）、`error`（错误信息）
- AC2：页面上方显示进度条（百分比数字 + 蓝色填充条），下方显示深色背景（`#1E293B`）终端日志滚动区，字体 monospace，日志实时追加；含"失败 / 错误 / error"关键字的行以红色显示
- AC3：Footer 全部按钮禁用（`nextDisabled: true`，无上一步、无取消），防止安装中途跳出
- AC4：`isDone` 为 true 时延迟 800ms 后自动调用 `onSuccess()`，跳转至 install-success 步骤
- AC5：`isError` 为 true 时，日志区下方显示红色错误横幅，内容为 `errorMsg`；⚠️ 当前实现不提供重试按钮（错误后需刷新页面重新开始）
- AC6：SSE 连接被服务器关闭（收到 `success` 或 `error` 事件）后 `EventSource` 自动关闭；组件卸载时同样关闭连接，防止内存泄漏

---

### US-01-04：安装成功页

**作为** 非技术用户，
**我希望** 安装完成后看到明确的成功提示，并决定立即配置还是先去探索主界面，
**以便** 按自己的节奏继续。

**优先级**：P0
**实现状态**：✅ 已实现（`InstallSuccessView.tsx`）
**验收标准（AC）**：

- AC1：显示绿色对勾圆形图标、标题"安装成功！"和说明文字"OpenClaw 核心组件已成功部署至你的系统"
- AC2：主按钮"立即配置 →"（蓝色实心），点击后跳转至 step1(Gateway)
- AC3：次按钮"稍后再说，先去主界面"（Ghost 边框样式），点击后调用 `markOnboardingComplete()` 并导航至 `/bots`
- AC4：install-success 步骤不显示顶部 Stepper，不显示 Footer 按钮栏（安装阶段特有布局）

---

## 三、配置阶段（step1–step6）

> 进入配置阶段后：
> - 顶部显示 Stepper（6 个 config step 的进度指示器）及右上角 ✕ 退出按钮
> - Footer 始终显示"上一步"（step1 时隐藏）、"下一步" / "应用配置"（step6）和"取消"按钮
> - ✕ 或"取消"均调用 `markOnboardingComplete()` + 导航至 `/bots`

---

### US-01-05：Gateway 配置（step1）

**作为** AI 开发者，
**我希望** 通过表单界面配置 Gateway 的绑定方式、监听端口和认证模式，
**以便** 不需要手动编辑 JSON 配置文件。

**优先级**：P0
**实现状态**：✅ 已实现（`GatewayConfigView.tsx`，`POST /openclaw/gateway-config`，`GET /settings/gateway` 预填）
**验收标准（AC）**：

- AC1：步骤徽章显示"step 1 / 6 · 必填"（蓝色），不显示"跳过此步"按钮
- AC2：表单包含两个并排字段：
  - **绑定地址**（`bind`）：`<select>` 下拉，选项为 `loopback（仅本地 127.0.0.1）` 和 `lan（局域网共享 0.0.0.0）`，默认 `loopback`
  - **监听端口**（`port`）：数字输入框，默认 `18789`，字段说明"若有冲突请修改"
- AC3：**认证模式**（`authMode`）：`<select>` 下拉，选项为 `None（本地无感，推荐）` 和 `Token（需鉴权）`，默认 `none`；选择 `token` 时展开 Auth Token 明文输入框（必填）
- AC4：页面挂载时调用 `GET /settings/gateway`；若接口返回成功，将 `port`、`bind`、`authMode`、`authToken` 预填至表单，并显示蓝色提示横幅"已加载当前配置，你可以在此基础上修改"；接口失败或返回空时使用默认值，不显示横幅
- AC5：页面加载时（`isLoading` 为 true）显示骨架屏（`animate-pulse` 灰色块），接口返回后渲染表单
- AC6：点击"下一步"时调用 `POST /openclaw/gateway-config`，body 为 `{ port, bind, authMode, authToken? }`（`authMode === "none"` 时不传 `authToken`）；成功后进入 step2

---

### US-01-06：LLM Provider 配置（step2）

**作为** AI 开发者，
**我希望** 通过卡片选择内置 Provider 并填写 API Key，或通过表单配置自定义 Provider，
**以便** 无需了解底层 JSON schema 即可激活大模型服务。

**优先级**：P0
**实现状态**：✅ 已实现（`ProviderConfigView.tsx`，`PUT /settings/llm`，`GET /settings/llm` 预填）
**验收标准（AC）**：

- AC1：步骤徽章显示"step 2 / 6 · 必填"（蓝色），不显示"跳过此步"按钮
- AC2：页面分三个 Tab：**内置 Provider**（默认）、**自定义 Provider**、**Marketplace 🛒**
- AC3：内置 Provider Tab 以 4 列卡片网格展示 OpenAI、AI、Groq、Moonshot，每张卡片含 emoji 图标、名称和默认 Model ID；点击卡片高亮选中（蓝色边框）；卡片下方展示对应的 API Key 密码输入框（`type="password"`），获得焦点时若显示掩码占位符则自动清空以便重新输入
- AC4：自定义 Provider Tab 顶部提供快填模板按钮（ollama / vllm / lmstudio / moonshot）；表单字段包含 Provider ID（必填）、显示名称（选填）、Base URL（必填）、API Key（选填，说明"支持环境变量引用，本地服务可留空"）、Model ID（必填）、API 类型下拉（`OpenAI Compatible` / `AI Compatible`）；必填字段验证失败时显示红色边框
- AC5：Marketplace Tab 展示占位页，含"lysmata Marketplace"入口卡片和"浏览大模型服务"按钮
- AC6：页面挂载时调用 `GET /settings/llm`；若已有配置，根据 `defaultModel.primary`（格式为 `{providerId}/{modelId}`）判断：匹配内置 Provider 则自动选中对应卡片，并在 API Key 框显示掩码占位符 `•••••••••••`（不明文回显）；匹配自定义 Provider 则切换至"自定义"Tab 并预填各字段
- AC7：页面加载时（`isLoading`）显示骨架屏（灰色 Provider 卡片网格占位）
- AC8：点击"下一步"时调用 `PUT /settings/llm`；若 API Key 字段值等于掩码占位符 `•••••••••••`，则该字段不传（不覆盖后端已有值）；必填字段缺失时抛出验证错误，显示红色边框，不进入下一步

---

### US-01-07：Channel 配置（step3）

**作为** AI 开发者，
**我希望** 在 Channel 配置步骤通过 Toggle 开关启用 / 禁用客户端通道，
**以便** 直观管理哪些客户端可以接入 Gateway。

**优先级**：P1
**实现状态**：⚠️ 部分实现（`ChannelConfigView.tsx`，Toggle 切换仅为本地状态，**不写入后端**）
**验收标准（AC）**：

- AC1：步骤徽章显示"step 3 / 6 · 可跳过"（灰色），Footer 右侧显示"跳过此步"链接按钮
- AC2：默认展示两个通道：`Lysmata 桌面端`（Token: `sk-lysmata-desktop-local`，默认开启）和 `VS Code 插件`（Token: `sk-vscode-extension`，默认关闭）；每条目右侧有蓝 / 灰色 Toggle
- AC3：列表下方提供"+ 添加新 Channel"按钮（⚠️ 点击暂无实际行为，新增逻辑未实现）
- AC4：点击"下一步"**不发送任何请求**，直接进入 step4；Channel 的持久化配置在设置中心完成

---

### US-01-08：Skills 配置（step4）

**作为** AI 开发者，
**我希望** 在 Skills 配置步骤看到推荐技能列表并可一键安装，
**以便** 快速赋予 Agent 常用能力。

**优先级**：P1
**实现状态**：⚠️ 部分实现（`SkillsConfigView.tsx`，安装按钮无实际逻辑，**不写入后端**）
**验收标准（AC）**：

- AC1：步骤徽章显示"step 4 / 6 · 可跳过"（灰色）
- AC2：以 2 列网格展示推荐技能卡片（System Execution / Web Search / File Reader），每张卡片含 emoji 图标、名称、描述；已安装技能显示"已安装 ✓"灰色标签，未安装显示"点击安装"按钮（⚠️ 点击暂无实际安装行为）
- AC3：网格末位为"浏览 ClawHub"入口卡片（虚线边框），点击可跳转社区技能库（⚠️ 跳转未实现）
- AC4：点击"下一步"**不发送请求**，直接进入 step5；技能管理的完整功能在 US-06 中定义

---

### US-01-09：Hooks 配置（step5）

**作为** AI 开发者，
**我希望** 在 Hooks 配置步骤通过 Toggle 启用 / 禁用拦截器，
**以便** 可视化管理请求钩子，无需手动编辑配置文件。

**优先级**：P1
**实现状态**：⚠️ 部分实现（`HooksConfigView.tsx`，Toggle 仅为本地状态，**不写入后端**）
**验收标准（AC）**：

- AC1：步骤徽章显示"step 5 / 6 · 可跳过"（灰色）
- AC2：默认展示一条 Hook："全局日志拦截器"（path: `/hooks/global-logger.js`，默认开启）；右侧有 Toggle
- AC3：列表下方提供"注册新 Hook"按钮（⚠️ 点击暂无实际行为）
- AC4：页面底部显示蓝色提示横幅："Hooks 支持热重载，变更后无需重启 Gateway 即可生效"
- AC5：点击"下一步"**不发送请求**，直接进入 step6(Review)

---

### US-01-10：确认配置（step6 Review）

**作为** AI 开发者，
**我希望** 在最终步骤看到已配置项的摘要，并选择是否在完成时立即重启 Gateway，
**以便** 确认配置正确后一键应用，而不是一个个步骤地核对。

**优先级**：P0
**实现状态**：✅ 已实现（`ReviewView.tsx`，调用 `GET /settings/gateway` + `GET /settings/llm`，`POST /settings/gateway-restart`）
**验收标准（AC）**：

- AC1：步骤徽章显示"step 6 / 6 · 检查与应用"（蓝色）；Footer 主按钮文字为"应用配置"（不是"下一步"），不显示"跳过此步"
- AC2：页面挂载时同时调用 `GET /settings/gateway` 和 `GET /settings/llm`，加载期间显示"读取配置中..."（`animate-pulse`）；加载完成后在深色代码块（`#1E293B` 背景，monospace 字体）中以 `+ key: value` 格式展示已保存的配置摘要：
  - `gateway.port`、`gateway.bind`、`gateway.auth.mode`（来自 gateway 接口）
  - `agents.defaults.model.primary`、`models.providers`（来自 llm 接口）
- AC3：若存在已跳过的步骤，在代码块下方显示黄色警告框，列出已跳过步骤名称，提示"可在「设置」中随时配置"
- AC4：页面下方显示"重启 Gateway" Toggle（橙色，默认开启）；说明文字"核心参数变更需要重启服务以生效"
- AC5：点击"应用配置"时，若 Toggle 开启则调用 `POST /settings/gateway-restart`；调用完成后进入 done 步骤

---

## 四、完成阶段

### US-01-11：向导完成页（Done）

**作为** 用户，
**我希望** 完成配置向导后看到清晰的成功反馈和下一步操作入口，
**以便** 流畅地过渡到实际使用。

**优先级**：P0
**实现状态**：✅ 已实现（`DoneView.tsx`）
**验收标准（AC）**：

- AC1：显示绿色渐变圆形图标（对勾）、标题"已就绪 🎉"、说明文字"Gateway 配置已应用并成功重启。你现在可以开始创建 Bot 并开始对话了。"
- AC2：主按钮"进入主界面"（蓝色实心），点击后调用 `markOnboardingComplete()` 并导航至 `/bots`
- AC3：次按钮"重新运行配置向导"（灰色下划线文字，带刷新图标），点击后调用 `resetSkips()` + `goToStep("step1")`，从 step1 重新开始配置流程（**不重复安装步骤**）
- AC4：done 步骤不显示 Footer 按钮栏（`WizardPage` 中 `step.id === "done"` 时隐藏 Footer）

---

## 五、横切关注点

### US-01-12：可选步骤的跳过行为

**作为** 希望快速上手的用户，
**我希望** 在 Channel、Skills、Hooks 步骤可以点击"跳过此步"，
**以便** 先用最基础的配置启动，后续再按需补充。

**优先级**：P1
**实现状态**：✅ 已实现（`wizard-store.ts` `skipCurrentStep()`，Stepper 展示跳过状态）
**验收标准（AC）**：

- AC1：step3、step4、step5 的步骤徽章显示"可跳过"，Footer 右侧显示"跳过此步"链接按钮；step1、step2、step6 不显示"跳过此步"
- AC2：点击"跳过此步"后，`skippedSteps` 记录该步骤 id，顶部 Stepper 该圆圈显示"–"并变为灰色，自动前进至下一步
- AC3：step6(Review) 的黄色警告框汇总所有已跳过步骤名称，提示用户可在设置中补充
- AC4：重新运行向导时（点击 Done 页"重新运行"或从设置入口进入），调用 `resetSkips()` 清空跳过记录

---

### US-01-13：中途退出向导

**作为** 用户，
**我希望** 在配置向导任意步骤中途退出，回到主界面，
**以便** 先处理其他事情，之后再回来继续配置。

**优先级**：P1
**实现状态**：✅ 已实现（`WizardPage.tsx` `handleExitWizard()`）
**验收标准（AC）**：

- AC1：配置阶段（step1–step6）的 Header 右上角显示 ✕ 按钮，Footer 显示"取消"按钮，两者行为相同
- AC2：点击 ✕ 或"取消"时，调用 `markOnboardingComplete()`（防止下次启动再次弹出向导）并导航至 `/bots`；**不弹出确认对话框**（当前实现为直接跳转）
- AC3：退出不回滚已提交的配置（Gateway、LLM 等已 POST / PUT 的数据保留在后端）
- AC4：**语义说明**：此处调用 `markOnboardingComplete()` 仅防止重弹，不代表配置已完整完成；用户可在设置中心随时修改已保存的配置

---

### US-01-14：重进向导时预填已有配置

**作为** 已完成过初始化配置的用户，
**我希望** 重新进入配置向导时，各步骤自动读取并展示当前系统的实际配置值，
**以便** 在原有配置基础上修改，而不是每次都从默认值重头填写。

**优先级**：P0
**实现状态**：✅ 已实现（step1 和 step2 均已实现预填逻辑）
**验收标准（AC）**：

- AC1：GatewayConfigView（step1）挂载时调用 `GET /settings/gateway`；成功时将 `port`、`bind`、`authMode`、`authToken` 预填至表单，并显示蓝色"已加载当前配置"横幅；接口失败时退化为默认值
- AC2：ProviderConfigView（step2）挂载时调用 `GET /settings/llm`；根据 `defaultModel.primary`（格式 `{providerId}/{modelId}`）自动选中对应 Provider 卡片或切换至自定义 Tab，API Key 显示掩码占位符 `•••••••••••`（不明文回显）
- AC3：ReviewView（step6）挂载时调用 `GET /settings/gateway` + `GET /settings/llm`，将实际已保存的值动态生成配置摘要，**不显示硬编码占位符**
- AC4：页面加载期间显示骨架屏或"读取配置中..."动画，接口返回后再渲染表单，避免初始值闪烁
- AC5：重新提交时，API Key 字段若值等于掩码占位符 `•••••••••••`，则不传该字段（`keyToSave = undefined`），不覆盖后端已有值

---

## 六、与其他模块的关联

### US-01-15：向导中创建首个 Agent（引用 US-09-08）

**作为** 首次安装的用户，
**我希望** 在配置向导中可选地完成第一个本地 Agent 的创建与 Gateway 绑定，
**以便** 无需离开向导、打开终端即可让 Agent 上线。

**优先级**：P0
**实现状态**：❌ 未实现（依赖 US-09-08 的后端接口，需同步扩展 `WIZARD_FLOW` 插入新 step）

> 完整需求定义见 **US-09-08**（向导中 Agent 创建步骤）。
>
> **本故事仅记录与 US-01 的接口约定**：
> - 新 step 位于 step1(Gateway) 之后、step2(Provider) 之前，`wizard-store.ts` 中需新增 step id（如 `step1b`），后续 config step 的 `configIndex` 依次后移，步骤总数从 6 变为 7
> - 步骤徽章标注"推荐"（`skippable: true`，非"必填"）
> - step1(Gateway) 提交成功后，后端返回的 Gateway WebSocket 地址（`ws://127.0.0.1:{port}/ws`）需传递给 step1b，以预填 `openclaw agents bind --gateway` 参数
> - `GatewayConfigView` 等已有步骤中硬编码的 `step X / 6` 文案需改为动态计算（基于 `configIndex` 和 config 步骤总数）
> - 插入新 step 后，ReviewView 的配置摘要应新增 Agent 相关行（Agent ID、workspace、绑定 Gateway URL）
