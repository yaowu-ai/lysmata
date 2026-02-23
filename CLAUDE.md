# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

Lysmata 是一个 Tauri v2 桌面应用，用于管理多个连接到 OpenClaw Gateway 的 Bot，支持私聊/群聊。架构上分三层：Tauri Rust 壳 + React 前端 + Bun/Hono sidecar API。

## 常用命令

```bash
# 开发
bun run dev          # 启动前端 Vite 开发服务器 (port 1420)
bun run dev:api      # 启动 sidecar API（热重载）
bun run dev:all      # 同时启动前端 + API

# 构建
bun run build        # tsc + vite build（前端）
bun run build:sidecar  # 将 Hono sidecar 编译为二进制
bun run build:dmg    # 打包 macOS .dmg 安装包（含 sidecar 编译）

# 代码质量
bun run lint         # ESLint 检查
bun run lint:fix     # ESLint 自动修复
bun run format       # Prettier 格式化
bun run format:check # Prettier 检查
```

> `build:dmg` 的 `beforeBuildCommand` 会自动先执行 `build:sidecar`，无需手动分步。

## 架构概览

### 三层结构

```
src/          # React 前端（Vite + TypeScript）
src-api/      # Bun/Hono sidecar（独立 workspace，打包为外部二进制）
src-tauri/    # Tauri Rust 壳（负责启动 sidecar、窗口管理）
```

### 前端结构（`src/`）

- `pages/` — 按功能分页：`BotManagement/`（Bot 列表/表单/状态）、`Chat/`（私聊/群聊）、`SettingsPage.tsx`
- `components/` — 共享布局：`AppLayout`（挂载全局 SSE 流）、`LeftNav`
- `shared/api-client.ts` — 统一 fetch 封装，指向本地 sidecar
- `shared/tauri-bridge.ts` — Tauri `invoke` 封装
- `shared/store/` — Zustand stores（见下方状态管理）
- `shared/hooks/` — TanStack Query hooks + SSE hook
- `shared/types/` — 跨层共享的 TypeScript 类型

### Sidecar API 结构（`src-api/src/`）

- `index.ts` — Hono app 入口，注册所有路由
- `app/api/` — REST 路由：`bots`, `conversations`, `messages`, `settings`, `health`
- `core/bot-service.ts`, `conversation-service.ts` — 业务逻辑
- `core/openclaw-proxy.ts` — WebSocket 代理，连接外部 OpenClaw Gateway
- `core/push-relay.ts` — 将 Gateway 推送事件中继给前端 SSE 订阅者
- `shared/db.ts` — SQLite（`app.db`）

### 状态管理

两套状态并行：

**TanStack Query**（服务端状态）— bots、conversations、messages 的缓存与失效，hooks 在 `src/shared/hooks/`。

**Zustand**（客户端实时状态）— 两个 store：
- `app-store.ts`：sidecar 状态、每个 bot 的实时快照 `botStatuses: Record<string, BotStatusInfo>`（health、presence、heartbeat、pendingNodeRequests、isShutdown）
- `chat-store.ts`：当前激活的 `activeConversationId`

### 实时数据流

`AppLayout` 挂载时通过 `useGlobalStream` hook 订阅 `/bots/global-stream` SSE 端点。Gateway 推送的事件（presence、health、heartbeat、shutdown、node_pair_requested/resolved、cron）经 sidecar 的 `push-relay.ts` 中继后，在前端分发到 Zustand store 更新和 React Query 缓存失效。

### 类型同步注意事项

`src/shared/store/app-store.ts` 顶部注释明确说明：`BotStatusInfo` 等 payload 类型是从 `src-api/src/core/gateway/types.ts` 手动复制的，修改 Gateway 类型时需同步更新两处。
