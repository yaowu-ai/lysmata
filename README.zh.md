<div align="center">

# 🦐 Lysmata

**[OpenClaw](https://github.com/yaowu-ai) Gateway 的本地管理与配置桌面客户端**

[![Version](https://img.shields.io/badge/版本-0.1.0-blue)](https://github.com/yaowu-ai/lysmata/releases)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![Bun](https://img.shields.io/badge/Bun-runtime-fbf0df)](https://bun.sh)
[![License](https://img.shields.io/badge/许可证-MIT-green)](LICENSE)

[English](README.md) · **中文**

</div>

---

## 目录

- [Lysmata 是什么？](#lysmata-是什么)
- [✨ 功能特性](#-功能特性)
- [🏗 架构](#-架构)
- [📋 环境要求](#-环境要求)
- [🚀 快速开始](#-快速开始)
- [🛠 开发命令](#-开发命令)
- [⚙️ 配置说明](#️-配置说明)
- [🗂 项目结构](#-项目结构)
- [🤝 参与贡献](#-参与贡献)
- [📄 许可证](#-许可证)

---

## Lysmata 是什么？

Lysmata 是一款基于 **Tauri v2** 构建的跨平台桌面应用，让你可以在一个简洁的界面中连接、配置并与多个 **OpenClaw AI Agent Gateway** 实例交互。

你可以把它理解为 OpenClaw Bot 的统一控制台：添加连接、调整 LLM 供应商设置，并进行实时对话（一对一私聊或多 Bot 群聊）——一切都在桌面端完成，无需打开浏览器或手动编辑配置文件。

## ✨ 功能特性

- **Bot 管理** — 添加、编辑、删除多个 OpenClaw Gateway 连接。配置 WebSocket 端点、鉴权 Token、目标 Agent ID、Skills（JSON）、MCP 以及每个 Bot 独立的 LLM 覆盖设置。一键测试连接。
- **私聊** — 与任意 Bot 进行一对一实时对话，响应通过 SSE 流式传输。
- **群聊** — 多 Bot 对话：设置主要 Bot、添加参与者，通过 `@提及` 将消息路由给指定 Bot。
- **LLM 设置** — 直接在 UI 中管理 LLM 供应商（OpenAI、Anthropic、Google、OpenRouter、自定义）和模型。读写 `~/.openclaw/openclaw.json`。
- **实时事件** — 全局 SSE 流实时呈现 Bot 健康状态、在线状态、心跳、关机通知和节点配对事件。
- **本地持久化** — 所有 Bot、对话和消息存储在本地 SQLite 数据库（`~/.lysmata/app.db`）中，数据不离机。

## 🏗 架构

Lysmata 采用三层架构：

```
┌─────────────────────────────────────────────────┐
│          React 前端  (Vite 7)                   │
│   TanStack Query（服务端状态缓存）                │
│   Zustand（实时 / 客户端状态）                   │
└──────────────────┬──────────────────────────────┘
                   │  HTTP + SSE（本地）
┌──────────────────▼──────────────────────────────┐
│         Hono Sidecar API  (Bun 运行时)           │
│   REST 接口 · WebSocket 代理                     │
│   SQLite (bun:sqlite) · 推送中继                 │
└──────────────────┬──────────────────────────────┘
                   │  WebSocket / HTTP
┌──────────────────▼──────────────────────────────┐
│      OpenClaw Gateway（远程 / 本地）              │
│   Agent RPC · 流式响应                           │
└─────────────────────────────────────────────────┘
          由 Tauri v2（Rust）桌面壳封装
```

Hono sidecar 被编译为原生二进制文件并打包进 Tauri 应用内，Tauri 自动管理其生命周期（启动 / 停止）。

## 📋 环境要求

| 工具 | 版本 | 用途 |
|------|------|------|
| [Rust](https://rustup.rs) | stable | Tauri 桌面壳 |
| [Bun](https://bun.sh) | ≥ 1.1 | 前端依赖 + Sidecar 运行时 |
| [Xcode CLI 工具](https://developer.apple.com/xcode/) | 最新版 | macOS 构建 |

> Windows 和 Linux 构建理论上由 Tauri 支持，但尚未经过测试。

## 🚀 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/yaowu-ai/lysmata.git
cd lysmata

# 2. 安装依赖
bun install

# 3. 同时启动前端 + Sidecar API
bun run dev:all

# 4. 在另一个终端启动 Tauri 窗口
bun run tauri dev
```

## 🛠 开发命令

| 命令 | 说明 |
|------|------|
| `bun run dev` | 仅启动 Vite 前端（端口 1420） |
| `bun run dev:api` | 仅启动 Hono Sidecar（端口 2026，热重载） |
| `bun run dev:all` | 同时启动前端 + Sidecar |
| `bun run build` | TypeScript 检查 + Vite 生产构建 |
| `bun run build:sidecar` | 将 Hono Sidecar 编译为原生二进制 |
| `bun run build:dmg` | 构建 macOS `.dmg` 安装包（自动先编译 sidecar） |
| `bun run lint` | 运行 ESLint |
| `bun run lint:fix` | 自动修复 ESLint 问题 |
| `bun run format` | Prettier 格式化所有文件 |
| `bun run format:check` | 检查 Prettier 格式 |

## ⚙️ 配置说明

### OpenClaw 配置文件（`~/.openclaw/openclaw.json`）

Lysmata 通过该文件读写 LLM 供应商配置，示例结构如下：

```json
{
  "models": {
    "providers": {
      "openai": {
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "sk-...",
        "models": ["gpt-4o", "gpt-4o-mini"]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai:gpt-4o"
      }
    }
  }
}
```

### 应用数据目录（`~/.lysmata/`）

| 路径 | 说明 |
|------|------|
| `~/.lysmata/app.db` | SQLite 数据库（Bot、对话、消息） |
| `~/.lysmata/logs/` | Sidecar 及 Gateway 日志 |

### 端口（固定）

| 环境 | 服务 | 端口 |
|------|------|------|
| 开发环境 | Vite 前端 | 1420 |
| 开发环境 | Hono Sidecar | 2026 |
| 生产环境 | Tauri Sidecar | 2620 |

## 🗂 项目结构

```
lysmata/
├── src/               # React 19 前端（Vite + TypeScript）
│   ├── pages/         # BotManagement/、Chat/、Settings/
│   ├── components/    # AppLayout、LeftNav
│   └── shared/        # API 客户端、Tauri Bridge、Zustand Store、Hooks、类型
├── src-api/           # Hono Sidecar（Bun 运行时）
│   └── src/
│       ├── app/api/   # REST 路由：bots、conversations、messages、settings
│       └── core/      # bot-service、openclaw-proxy、push-relay、gateway/
├── src-tauri/         # Tauri v2 Rust 壳
│   ├── migrations/    # SQLite Schema 迁移文件
│   └── src/lib.rs     # Sidecar 启动 & 数据库初始化
└── design/            # HTML UI 原型稿
```

## 🤝 参与贡献

欢迎一切形式的贡献！无论是 Bug 报告、功能建议、文档改进还是代码提交，我们都非常感谢。

### 提交 Bug 或功能建议

请前往 [Issues](https://github.com/yaowu-ai/lysmata/issues) 页面，使用对应的模板进行提交，并尽量提供详细的上下文信息。

### 发起 Pull Request

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/your-feature`
3. 按照 [约定式提交](https://www.conventionalcommits.org/zh-hans/) 规范提交代码：
   ```
   feat: 添加群聊 @提及 自动补全
   fix: 修复网络断线后 SSE 重连循环问题
   docs: 更新配置示例
   ```
4. 推送分支：`git push origin feat/your-feature`
5. 向 `main` 分支发起 Pull Request，并描述本次改动的内容和原因

### 开发环境搭建

请参阅 [🚀 快速开始](#-快速开始) 章节。

## 📄 许可证

本项目基于 [MIT 许可证](LICENSE) 开放源代码。

版权所有 © 2026 [yaowu-ai](https://github.com/yaowu-ai)

