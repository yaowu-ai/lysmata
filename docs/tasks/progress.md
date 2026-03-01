# 任务进度记录

**项目：** Lysmata（OpenClaw 桌面伴侣）
**记录日期：** 2026-03-01
**当前分支：** main

---

## 已完成工作

### 设计与文档

| 产出物 | 路径 | 状态 |
|--------|------|------|
| UI 设计稿（向导页） | `design/ui-onboarding.html` | ✅ 已完成（900×640，含 Skip/Re-enter） |
| PRD | `docs/prd-v2.1.md` | ✅ 已有 |
| 设计语言规范 | `docs/design-language.md` | ✅ 已有 |
| 用户故事文档 | `docs/user-stories/` | ✅ 已完成（8 模块 42 条 US） |
| 实现计划 | `docs/plans/2026-03-01-onboarding-wizard.md` | ✅ 已完成 |

### US-01 Onboarding Wizard 实现（已全部完成）

最近 6 个 commit（全部在 main 分支）：

```
bd81588  fix(onboarding): remove useEffect for submit registration to pass lint
2722de0  feat(onboarding): add IntroView, EnvCheckView, InstallingView, InstallSuccessView
ed177a6  feat(onboarding): build wizard shell with stepper, footer, and routing guard
c7fa2f9  feat(onboarding): add /onboarding route with first-launch guard
f7d51ab  feat(onboarding): add wizard state store with step navigation
88c0d03  feat: redesign onboarding wizard and add user stories docs
```

#### 新增文件清单

```
src/shared/store/wizard-store.ts              ← Zustand 状态机（11步流程）
src/shared/hooks/useOnboardingInstall.ts      ← SSE install 流 hook
src/pages/Onboarding/WizardPage.tsx           ← 主壳（900×640）
src/pages/Onboarding/WizardStepper.tsx        ← 6步进度条
src/pages/Onboarding/WizardFooter.tsx         ← 按钮组（取消/上一步/跳过/下一步）
src/pages/Onboarding/views/IntroView.tsx      ← 欢迎页 + 已安装快捷入口
src/pages/Onboarding/views/EnvCheckView.tsx   ← 环境预检三项状态灯
src/pages/Onboarding/views/InstallingView.tsx ← 进度条 + 终端日志
src/pages/Onboarding/views/InstallSuccessView.tsx ← 安装成功 + 稍后再说
src/pages/Onboarding/views/GatewayConfigView.tsx  ← step1 Gateway 表单
src/pages/Onboarding/views/ProviderConfigView.tsx ← step2 三 Tab Provider
src/pages/Onboarding/views/ChannelConfigView.tsx  ← step3 可跳过占位
src/pages/Onboarding/views/SkillsConfigView.tsx   ← step4 可跳过占位
src/pages/Onboarding/views/HooksConfigView.tsx    ← step5 可跳过占位
src/pages/Onboarding/views/ReviewView.tsx         ← step6 diff + 跳过汇总
src/pages/Onboarding/views/DoneView.tsx           ← 完成页 + 重入向导按钮
```

#### 修改文件清单

```
src/main.tsx                                  ← 新增 /onboarding 路由 + 首次启动守卫
src/pages/SettingsPage.tsx                    ← 新增"重新运行配置向导"入口
src-api/src/core/openclaw-config-file.ts      ← 新增 updateGatewayConfig()
src-api/src/app/api/openclaw-install.ts       ← 新增 POST /gateway-config 路由
```

#### US-01 用户故事验收状态

| US | 描述 | 验收 |
|----|------|------|
| US-01-01 | 零终端一键安装（SSE 流 + 进度条） | ✅ |
| US-01-02 | 环境预检三项状态灯 | ✅ |
| US-01-03 | 已安装用户跳过安装直接配置 | ✅ |
| US-01-04 | 可视化 Gateway 配置（写入 openclaw.json） | ✅ |
| US-01-05 | LLM Provider 三 Tab + 模板快填 | ✅ |
| US-01-06 | 跳过可选步骤 + Review 页汇总 | ✅ |
| US-01-07 | 完成页重新运行向导 + Settings 入口 | ✅ |
| US-01-08 | 安装成功后稍后再说先进主界面 | ✅ |

---

## 待完成工作

以下模块对应的用户故事（US-02 ~ US-08）**尚未开发**，用户故事文档已在 `docs/user-stories/` 中写好，可直接作为开发依据。

### US-02：Bot 管理（`docs/user-stories/us-02-bot-management.md`）

| US | 描述 | 优先级 |
|----|------|--------|
| US-02-01 | Bot 卡片列表展示（名称/Emoji/状态灯） | P0 |
| US-02-02 | 创建/编辑 Bot（4 Tab 抽屉表单） | P0 |
| US-02-03 | 删除 Bot（有活跃会话时二次确认） | P0 |
| US-02-04 | 连接测试（实时反馈 WebSocket 连通） | P0 |
| US-02-05 | 实时连接状态监控（connected/error 等四态） | P1 |
| US-02-06 | Bot 详情状态页（心跳、presence、节点） | P1 |

**相关现有代码：**
- `src/pages/BotManagement/` — BotManagementPage、BotCard、BotFormDrawer、BotStatusPage 已有基础实现
- `src/shared/hooks/useBots.ts` — TanStack Query hooks 已有
- `src-api/src/app/api/bots.ts` — CRUD API 已有

> **注意：** Bot 管理页面已有基础实现，此 US 主要是对照用户故事做功能对齐和 UI 完善。

---

### US-03：私聊会话（`docs/user-stories/us-03-private-chat.md`）

| US | 描述 | 优先级 |
|----|------|--------|
| US-03-01 | 发起私聊（选 Bot + 新建会话） | P0 |
| US-03-02 | 流式消息响应（SSE 打字机效果） | P0 |
| US-03-03 | 历史消息加载（无限滚动） | P0 |
| US-03-04 | 消息气泡（用户/Bot 区分，Markdown 渲染） | P1 |
| US-03-05 | 会话侧边栏（会话列表 + 新建） | P1 |
| US-03-06 | 消息发送状态（发送中/已发/失败） | P1 |

**相关现有代码：**
- `src/pages/Chat/PrivateChatPage.tsx` — 已有基础实现
- `src/shared/hooks/useMessages.ts` / `useConversations.ts` — 已有

---

### US-04：群聊（`docs/user-stories/us-04-group-chat.md`）

| US | 描述 | 优先级 |
|----|------|--------|
| US-04-01 | 创建群聊（选多个 Bot） | P1 |
| US-04-02 | 主 Bot 路由机制 | P1 |
| US-04-03 | @Bot 定向发送 | P1 |
| US-04-04 | Bot 回复徽章（哪个 Bot 回复的） | P1 |

**相关现有代码：**
- `src/pages/Chat/GroupChatPage.tsx` — 已有基础骨架

---

### US-05 ~ US-08（较低优先级）

| 模块 | 用户故事文档 | 优先级 |
|------|-------------|--------|
| Artifact 预览 | `docs/user-stories/us-05-artifact.md` | P1 |
| Skills 市场 | `docs/user-stories/us-06-skills.md` | P1 |
| 配置中心完善 | `docs/user-stories/us-07-settings.md` | P0 |
| 系统托盘 | `docs/user-stories/us-08-system-tray.md` | P1 |

---

## 新会话接续指引

在新会话中继续开发时，建议使用以下提示语快速恢复上下文：

```
我在开发 Lysmata 项目（路径：/Users/zouyanjian/other-try/openclaw/demo/lysmata）。

当前进度：
- US-01 Onboarding Wizard 已全部完成（见 docs/tasks/progress.md）
- 下一步：实现 US-02 Bot 管理 或 US-03 私聊会话

请先阅读：
1. docs/tasks/progress.md（本文件，了解整体进度）
2. docs/user-stories/us-02-bot-management.md（或对应模块的用户故事）
3. docs/plans/2026-03-01-onboarding-wizard.md（参考实现风格）
4. CLAUDE.md（项目架构说明）

然后为下一个模块制定实现计划。
```

---

## 技术决策备忘

| 决策 | 说明 |
|------|------|
| 向导路由 | `/onboarding` 在 `AppLayout` 外，避免 SSE 全局流干扰 |
| 首次启动检测 | `localStorage.onboarding_completed` flag，Settings 页可清除以重入 |
| 提交注册模式 | `onRegisterSubmit(fn)` 同步调用（非 useEffect），避免 lint 问题 |
| Gateway 配置写入 | `updateGatewayConfig()` → `~/.openclaw/openclaw.json` 直接读写 |
| LLM Provider 保存 | `PUT /settings/llm` → `updateLlmSettings()` → 同一配置文件 |
| Sidecar 端口 | 开发环境 `http://localhost:3000`，`API_BASE_URL` 在 `src/config/index.ts` |
