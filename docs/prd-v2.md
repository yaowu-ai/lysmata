# OpenClaw Native 桌面应用需求文档

**项目名称**：OpenClaw Native  
**版本**：v2.2（多Bot管理 + 群聊扩展）  
**状态**：已整合完成  
**作者**：Grok 设计团队  
**更新日期**：2026 年 2 月 19 日

---

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 功能需求](#2-功能需求)
- [3. 非功能需求](#3-非功能需求)
- [4. 技术栈与系统架构](#4-技术栈与系统架构)
- [5. 数据库设计](#5-数据库设计)
- [6. UI/UX 设计原则](#6-uiux-设计原则)
- [7. 开发与交付计划](#7-开发与交付计划)
- [8. 风险与依赖](#8-风险与依赖)
- [9. 附录](#9-附录)

> **v2.2 更新摘要**：新增 §2.5 多Bot管理、§2.6 群聊模式、§2.7 Bot连接配置，更新 §4.3 端口策略，扩展 §5 数据库设计至6张核心表，更新 §6 UI设计原则以覆盖三栏布局与Bot管理页交互规范。

---

## 1. 项目概述

### 1.1 项目背景

OpenClaw（原 Clawdbot/Moltbot）是一款开源的本地自主 AI 代理框架，其核心为 Gateway 服务，支持多消息渠道集成、LLM 驱动的任务执行、技能扩展以及持久化记忆系统。  
本项目旨在基于 **Tauri + React + Hono + SQLite** 技术栈，将 OpenClaw 核心功能转化为一款**跨平台原生桌面应用**，为用户提供现代、流畅、高性能、隐私优先的图形化操作界面与运行环境，实现真正的「本地 Agent Command Center」。

### 1.2 项目目标

- 构建一款轻量级、本地优先的 Agent 管理平台；
- 对标 2026 年最新 Agent Desktop 设计趋势（OpenAI Codex Desktop + Claude Artifacts）；
- 实现与原有 OpenClaw 框架的**无缝数据兼容与功能交互**；
- 提供多代理并行、实时 Artifact 预览与迭代闭环的优秀体验；
- 确保应用启动快、内存低、跨平台一致。

### 1.3 目标用户

- AI 开发者与研究者；
- 需要长期运行自主代理的个人与团队；
- 重视数据隐私与本地控制的用户。

---

## 2. 功能需求

### 2.1 核心功能模块

| 模块                | 主要功能描述                                                           | 优先级 |
| ------------------- | ---------------------------------------------------------------------- | ------ |
| 仪表盘 (Dashboard)  | 多代理状态监控、并行任务队列、性能指标图表、实时活动时间线、快捷操作   | 高     |
| 聊天中心 (Chat)     | 多线程会话、流式响应、@技能 / 命令补全、工具调用预览、语音输入         | 高     |
| Artifact 预览窗格   | 右侧独立可拖拽窗格，支持 Preview/Code/History 切换、实时交互与迭代反馈 | 高     |
| 技能市场 (Skills)   | 浏览、安装、配置、热重载 ClawHub 技能，本地编辑与权限管理              | 高     |
| 记忆浏览器 (Memory) | 全文搜索、标签管理、编辑、压缩、可视化生成 Artifact                    | 高     |
| 配置中心 (Settings) | LLM 提供商、消息渠道、系统钥匙串、安全策略、Onboarding 向导            | 高     |
| 日志监控 (Logs)     | 实时日志流、错误统计、Agent 心跳、Artifact 生成记录                    | 中     |
| 系统托盘与快捷      | 快速唤醒、状态显示、语音唤醒、多代理切换                               | 高     |

### 2.2 Artifact 机制

- Agent 生成可渲染内容（代码、网页、React 组件、SVG、图表、Dashboard 等）时自动或手动创建 Artifact；
- 右侧提供独立、可拖拽宽度、可折叠、可全屏的预览窗格；
- 支持多 Tab 切换（实时 Preview / 源代码编辑 / 历史版本）；
- 实现完整迭代闭环：用户可直接基于当前 Artifact 发出“继续优化”指令。

### 2.3 多代理与并行任务

- 支持同时运行多个独立 Agent（Session 完全隔离）；
- 仪表盘实时展示各代理状态、心跳与任务进度；
- 借鉴 Codex Desktop 并行任务管理与变更审查模式。

### 2.5 多 Bot 管理

| 功能点        | 描述                                                             | 优先级 |
| ------------- | ---------------------------------------------------------------- | ------ |
| Bot 列表      | 卡片列表展示所有 Bot（名称/Emoji头像/描述/连接状态）             | 高     |
| Bot 创建/编辑 | 右侧抽屉（4 Tab）：基础信息 / Skills / MCP / 连接配置            | 高     |
| Bot 删除      | 删除前检查是否有活跃会话，给出二次确认                           | 高     |
| 连接测试      | 每个 Bot 独立测试 OpenClaw WS 连通性，实时反馈状态               | 高     |
| 连接状态监控  | `connected` / `disconnected` / `error` / `connecting` 四态指示灯 | 中     |

**Bot 配置四 Tab 详细说明**：

- **基础**：名称（必填）、头像 Emoji、能力描述（用于群聊感知注入）
- **Skills**：技能列表（手动录入，格式：技能名 + 一行描述），用于主 Bot 感知协作方能力
- **MCP**：MCP 配置 JSON 编辑器（格式校验，高亮显示）
- **连接**：OpenClaw WS URL（必填，格式 `ws://`）、鉴权 Token（可选）、一键测试连接按钮

---

### 2.6 群聊模式

**核心概念**：

- 一个会话可包含 1~N 个 Bot；单 Bot 会话即私聊，多 Bot 会话即群聊
- 群聊中每个 Bot 有主/辅角色：**主 Bot（is_primary=true）** 感知全局上下文，辅助 Bot 仅在被 @ 时响应
- 主 Bot 在群聊头部展示「👑 皇冠」标识

**消息路由规则**：

| 消息类型                   | 路由目标        | 说明                                                  |
| -------------------------- | --------------- | ----------------------------------------------------- |
| 无 @ 提及                  | 主 Bot          | 主 Bot 感知所有 Bot 的能力描述，可自主决定是否 @ 协作 |
| `@BotName`                 | 指定 Bot        | 仅该 Bot 响应，其余静默                               |
| 主 Bot 在回复中 `@BotName` | 被 @ 的辅助 Bot | 自动触发协作链式响应                                  |

**群聊 Bot 感知注入格式**（自动注入到转发给 OpenClaw 的消息中）：

```
[群聊上下文] 当前群聊中还有以下 Bot 可以协作：
- @CodeMaster: 擅长代码审查与 TypeScript/Python 最佳实践
- @Researcher: 擅长学术文献检索与多语言摘要
如需协作，请在回复中使用 @BotName。
```

**新建群聊流程**：

1. 点击「新建对话」→ 选择「群聊」模式
2. 多选参与 Bot
3. 设置会话名称
4. 指定主 Bot（默认第一个加入的 Bot 为主 Bot）

---

### 2.7 Bot 连接配置

每个 Bot 对应一个独立的 **OpenClaw Agent 实例**，通过 WebSocket 长连接通信。

**连接生命周期**：

- Hono Sidecar 启动时为所有 `is_active=true` 的 Bot 自动建立 WS 连接
- 连接断开时自动重连（指数退避，最多 5 次）
- 连接失败时标记 Bot 状态为 `error`，UI 展示明确错误信息
- **无 LLM 降级**：Bot 未连接时返回明确错误，不静默失败

**连接配置字段**：

| 字段                | 类型    | 说明                                                  |
| ------------------- | ------- | ----------------------------------------------------- |
| `openclaw_ws_url`   | string  | OpenClaw WebSocket 地址，如 `ws://localhost:18789/ws` |
| `openclaw_ws_token` | string? | Bearer Token（可选，用于鉴权）                        |
| `connection_status` | enum    | `connected` / `disconnected` / `error` / `connecting` |

---

### 2.4 与原 OpenClaw 核心的交互需求（重点章节）

#### 2.4.1 交互架构

- **Hono Sidecar** 作为原 OpenClaw Gateway 的**完整兼容重实现**，暴露完全一致的 HTTP REST + WebSocket 接口（默认端口 18789，可配置）；
- Tauri Rust Core 负责 Sidecar 的启动、停止、重启、健康监控与生命周期管理；
- React 前端通过 `fetch` / TanStack Query / WebSocket / Tauri `invoke` 与后端交互。

#### 2.4.2 具体交互要求

1. **配置同步**：启动时自动读取原 `~/.openclaw/config.toml` 或 `config.json`，并双向同步至 SQLite；
2. **数据迁移**：首次启动提供“一键迁移向导”，将原 Markdown 会话、记忆、技能转换为 SQLite 格式，同时支持反向导出回 Markdown；
3. **会话与消息**：所有聊天、工具调用通过 Hono `/sessions`、`/messages` 接口实现，消息格式完全兼容；
4. **技能执行**：复用原技能代码，工具调用 JSON 格式保持不变，高权限工具（浏览器、Shell、文件）通过 Rust → Hono RPC 桥接；
5. **记忆系统**：SQLite 为主存储，提供 Markdown 兼容层查询与导入；
6. **渠道适配器**：直接集成原 Telegram、Discord、WebChat 等适配器代码；
7. **LLM 调用**：Hono 统一代理所有 LLM 请求，配置与原 Gateway 完全一致。

#### 2.4.3 流程要求

- 启动流程：Tauri 启动 → 自动启动/检查 Hono Sidecar → 迁移检测 → WebSocket 连接；
- 错误处理：Sidecar 崩溃时 Rust 自动重启并发出系统通知；
- 离线模式：支持纯本地 Ollama + SQLite 独立运行；
- 版本兼容：支持 OpenClaw v1.x / v2.x 数据格式。

---

## 3. 非功能需求

### 3.1 性能指标

- 应用启动时间 ≤ 2 秒（Release 模式）；
- 常驻内存 ≤ 150 MB；
- Artifact 预览渲染延迟 ≤ 300 ms；
- Sidecar 通信延迟 ≤ 50 ms。

### 3.2 兼容性

- 支持 Windows 10/11、macOS 12+、Linux（AppImage / deb / rpm）；
- 深色/浅色主题自动跟随系统。

### 3.3 安全性

- API 密钥使用系统钥匙串存储；
- SQLite 数据库采用 SQLCipher 加密；
- Hono 服务仅监听 127.0.0.1；
- Artifact 在沙箱环境中运行；
- 所有文件操作通过 Tauri 权限控制。

### 3.4 可扩展性

- 支持插件系统（Tauri 插件 + Hono middleware）；
- 未来支持 WebGPU 本地推理。

---

## 4. 技术栈与系统架构

### 4.3 端口策略（固定，不散落代码中）

| 环境 | 前端         | Hono API |
| ---- | ------------ | -------- |
| 开发 | 1420         | 2026     |
| 生产 | 静态资源内嵌 | 2620     |

`src/config/index.ts` 统一管理，**禁止在其他文件硬编码端口号**：

```ts
export const API_PORT = import.meta.env.PROD ? 2620 : 2026;
export const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
```

---

### 4.1 技术栈

- **桌面框架**：Tauri v2 (Rust Core)
- **前端**：React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui + Framer Motion + TanStack Query + Zustand + Monaco Editor
- **本地服务**：Hono (Bun 编译为 Tauri Sidecar)
- **数据库**：SQLite + Drizzle ORM
- **原生插件**：tauri-plugin-shell、notification、autostart、fs、http、global-shortcut 等

### 4.2 系统架构

```
用户 ←→ React UI (Tauri Window)
       ↓ (HTTP / WS / Tauri invoke)
Tauri Rust Core
   ├── Hono Sidecar 管理器
   ├── 原生能力桥接 (Shell、Browser、Notification)
   └── 安全与文件管理
        ↓
Hono Gateway (完全兼容原 OpenClaw API)
     ↓
SQLite (加密) + 文件系统 (Markdown 兼容层)
     ↓
外部 LLM / 消息渠道适配器
```

---

## 5. 数据库设计

迁移由 `src-tauri/src/lib.rs` 通过 `tauri-plugin-sql` 管理，追加式版本迁移，**禁止修改已发布迁移**。

### 5.1 Bot 管理表

#### `bots`

| 字段                | 类型          | 说明                         |
| ------------------- | ------------- | ---------------------------- |
| `id`                | TEXT PK       | UUID                         |
| `name`              | TEXT NOT NULL | Bot 名称                     |
| `avatar_emoji`      | TEXT          | 头像 Emoji，默认 🤖          |
| `description`       | TEXT          | 能力描述（群聊感知注入用）   |
| `skills_config`     | TEXT (JSON)   | Skills 列表                  |
| `mcp_config`        | TEXT (JSON)   | MCP 配置                     |
| `openclaw_ws_url`   | TEXT NOT NULL | OpenClaw WS 地址             |
| `openclaw_ws_token` | TEXT          | 鉴权 Token                   |
| `connection_status` | TEXT          | connected/disconnected/error |
| `is_active`         | INTEGER       | 0/1，是否参与自动连接        |
| `created_at`        | TEXT          | ISO8601                      |
| `updated_at`        | TEXT          | ISO8601                      |

### 5.2 会话与消息表

#### `conversations`

| 字段         | 类型          | 说明               |
| ------------ | ------------- | ------------------ |
| `id`         | TEXT PK       | UUID               |
| `title`      | TEXT NOT NULL | 会话标题           |
| `type`       | TEXT          | `single` / `group` |
| `created_at` | TEXT          | ISO8601            |
| `updated_at` | TEXT          | ISO8601            |

#### `conversation_bots`（多对多关联）

| 字段              | 类型    | 说明                     |
| ----------------- | ------- | ------------------------ |
| `conversation_id` | TEXT FK |                          |
| `bot_id`          | TEXT FK |                          |
| `is_primary`      | INTEGER | 1=主Bot，0=辅助Bot       |
| `join_order`      | INTEGER | 加入顺序（默认排序依据） |

#### `messages`

| 字段               | 类型          | 说明                            |
| ------------------ | ------------- | ------------------------------- |
| `id`               | TEXT PK       | UUID                            |
| `conversation_id`  | TEXT FK       |                                 |
| `sender_type`      | TEXT          | `user` / `bot`                  |
| `bot_id`           | TEXT? FK      | 发送方 Bot ID（user 时为 null） |
| `content`          | TEXT NOT NULL | 消息内容                        |
| `mentioned_bot_id` | TEXT?         | @ 提及的 Bot ID                 |
| `created_at`       | TEXT          | ISO8601                         |

### 5.3 原有核心表（保留）

核心表包括：`agents`、`sessions`、`memories`、`skills`、`artifacts`、`tools_log`、`configs`、`logs`、`migration_logs`。  
所有敏感字段加密，关键表建立索引以保证查询性能。

---

## 6. UI/UX 设计原则

### 6.1 整体风格

- 对标 **Codex Desktop + shadcn/ui** 浅色主题：白色主面板、F7F7F8 背景、E5E7EB 边框
- 字体：Inter（西文）+ 系统 sans-serif 回退
- 图标：Lucide React，统一 16px/20px 规格
- 圆角：卡片 12px，按钮 8px，输入框 8px，头像 50%（圆形）
- 阴影：极克制，仅 card hover / drawer / modal 场景使用

### 6.2 三栏布局

- **左侧导航**（64px）：Logo + 图标导航（Bot管理 / 聊天 / 设置）+ Tooltip
- **中间主内容**（可变宽）：当前页面内容区
- **右侧扩展**（可选，480px）：抽屉 / Artifact 窗格 / 详情面板

### 6.3 Bot 管理页交互规范

- 状态指示灯：connected=绿色光晕，disconnected=灰色，error=红色光晕，connecting=琥珀色脉冲
- 卡片 hover 时轻微抬升（box-shadow 增强）
- 抽屉从右侧滑入（translateX 动画 250ms ease），背景蒙层淡入
- Tab 切换：活跃 Tab 下划线滑动动画

### 6.4 聊天页交互规范

- 主 Bot 皇冠标识：👑 金色徽章，叠加在头像右上角
- @mention 触发：输入 `@` 字符后弹出 Bot 列表 Popover（键盘导航 + 鼠标点击）
- Bot 消息：左对齐，头像 + 名称 + 消息气泡（浅灰背景）
- 用户消息：右对齐，蓝色气泡
- 流式输出：末尾闪烁光标指示符
- 群聊头部：所有参与 Bot 的头像横排，主 Bot 有皇冠徽章

### 6.5 已交付原型

- `docs/ui-bot-management.html`：Bot 管理页可运行原型（含 4Tab 抽屉交互）
- `docs/ui-chat.html`：聊天页可运行原型（含群聊/@mention 交互）

---

## 7. 开发与交付计划

1. 项目脚手架搭建与 Hono Sidecar 开发
2. React UI 实现（优先聊天 + Artifact 窗格）
3. 数据库迁移工具与 OpenClaw 兼容层开发
4. 集成测试与性能优化
5. 跨平台打包、自动更新与发布

---

## 8. 风险与依赖

- 主要风险：Hono Sidecar 与原 OpenClaw Gateway 接口兼容性；
- 缓解措施：编写完整接口映射表与自动化测试用例；
- 外部依赖：Tauri v2、Bun、OpenClaw 开源仓库最新代码。

---

## 9. 附录

- 参考项目：OpenAI Codex Desktop（2026）、Claude Artifacts 官方示例；
- 已交付物：多页交互界面 HTML 原型、架构图、SQLite 迁移脚本模板、Hono 路由示例。

**文档结束**
@
