<div align="center">

# 🦐 Lysmata

**Local management & configuration desktop client for [OpenClaw](https://github.com/yaowu-ai) Gateway**

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/yaowu-ai/lysmata/releases)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![Bun](https://img.shields.io/badge/Bun-runtime-fbf0df)](https://bun.sh)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**English** · [中文](README.zh.md)

</div>

---

## Table of Contents

- [What is Lysmata?](#what-is-lysmata)
- [✨ Features](#-features)
- [🏗 Architecture](#-architecture)
- [📋 Prerequisites](#-prerequisites)
- [🚀 Getting Started](#-getting-started)
- [🛠 Development Commands](#-development-commands)
- [⚙️ Configuration](#️-configuration)
- [🗂 Project Structure](#-project-structure)
- [🔏 Code signing policy](#code-signing-policy)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## What is Lysmata?

Lysmata is a cross-platform desktop application built with **Tauri v2** that lets you connect, configure, and chat with multiple **OpenClaw AI Agent Gateway** instances — all from a single, clean interface.

Think of it as a universal control panel for your OpenClaw bots: add connections, tweak LLM provider settings, and hold real-time conversations (1-on-1 or multi-bot group chats) without ever leaving your desktop.

## ✨ Features

- **Bot Management** — Add, edit, and delete multiple OpenClaw Gateway connections. Configure WebSocket endpoints, auth tokens, target agent IDs, skills (JSON), MCP, and per-bot LLM overrides. Test connections with one click.
- **Private Chat** — 1-on-1 real-time chat with any bot. Streamed responses via SSE.
- **Group Chat** — Multi-bot conversations: designate a primary bot, add participants, and route messages to specific bots via `@mention`.
- **LLM Settings** — Manage LLM providers (OpenAI, Anthropic, Google, OpenRouter, custom) and models directly in the UI. Reads and writes `~/.openclaw/openclaw.json`.
- **Real-time Events** — Global SSE stream surfaces bot health, presence, heartbeat, shutdown, and node-pair events as they happen.
- **Local Persistence** — All bots, conversations, and messages are stored in a local SQLite database (`~/.lysmata/app.db`). Nothing leaves your machine unless you send it.

## 🏗 Architecture

Lysmata follows a three-layer architecture:

```
┌─────────────────────────────────────────────────┐
│            React Frontend  (Vite 7)             │
│   TanStack Query (server state)                 │
│   Zustand (real-time / client state)            │
└──────────────────┬──────────────────────────────┘
                   │  HTTP + SSE  (localhost)
┌──────────────────▼──────────────────────────────┐
│         Hono Sidecar API  (Bun runtime)         │
│   REST endpoints · WebSocket proxy              │
│   SQLite (bun:sqlite) · Push relay              │
└──────────────────┬──────────────────────────────┘
                   │  WebSocket / HTTP
┌──────────────────▼──────────────────────────────┐
│        OpenClaw Gateway  (remote / local)       │
│   Agent RPC · Streaming responses               │
└─────────────────────────────────────────────────┘
        wrapped by Tauri v2 (Rust) desktop shell
```

The Hono sidecar is compiled to a native binary and bundled inside the Tauri app. Tauri manages its lifecycle (start/stop) automatically.

## 📋 Prerequisites

| Tool                                                  | Version | Purpose                         |
| ----------------------------------------------------- | ------- | ------------------------------- |
| [Rust](https://rustup.rs)                             | stable  | Tauri desktop shell             |
| [Bun](https://bun.sh)                                 | ≥ 1.1   | Frontend deps + sidecar runtime |
| [Xcode CLI Tools](https://developer.apple.com/xcode/) | latest  | macOS builds                    |

> Windows and Linux builds are theoretically supported by Tauri but have not been tested.

## 🚀 Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/yaowu-ai/lysmata.git
cd lysmata

# 2. Install dependencies
bun install

# 3. Start development (frontend + sidecar API simultaneously)
bun run dev:all

# 4. In a separate terminal, launch the Tauri window
bun run tauri dev
```

## 🛠 Development Commands

| Command                 | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `bun run dev`           | Start Vite frontend only (port 1420)                       |
| `bun run dev:api`       | Start Hono sidecar only (port 2026, hot reload)            |
| `bun run dev:all`       | Start frontend + sidecar simultaneously                    |
| `bun run build`         | TypeScript check + Vite production build                   |
| `bun run build:sidecar` | Compile Hono sidecar to native binary                      |
| `bun run build:dmg`     | Build macOS `.dmg` installer (auto-compiles sidecar first) |
| `bun run lint`          | Run ESLint                                                 |
| `bun run lint:fix`      | Auto-fix ESLint issues                                     |
| `bun run format`        | Prettier format all files                                  |
| `bun run format:check`  | Check Prettier formatting                                  |

## ⚙️ Configuration

### OpenClaw Config (`~/.openclaw/openclaw.json`)

Lysmata reads and writes this file for LLM provider settings. Example structure:

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

### App Data (`~/.lysmata/`)

| Path                | Description                                     |
| ------------------- | ----------------------------------------------- |
| `~/.lysmata/app.db` | SQLite database (bots, conversations, messages) |
| `~/.lysmata/logs/`  | Sidecar and gateway logs                        |

### Ports (fixed)

| Environment | Service       | Port |
| ----------- | ------------- | ---- |
| Development | Vite frontend | 1420 |
| Development | Hono sidecar  | 2026 |
| Production  | Tauri sidecar | 2620 |

## 🗂 Project Structure

```
lysmata/
├── src/               # React 19 frontend (Vite + TypeScript)
│   ├── pages/         # BotManagement/, Chat/, Settings/
│   ├── components/    # AppLayout, LeftNav
│   └── shared/        # API client, Tauri bridge, Zustand stores, hooks, types
├── src-api/           # Hono sidecar (Bun runtime)
│   └── src/
│       ├── app/api/   # REST routes: bots, conversations, messages, settings
│       └── core/      # bot-service, openclaw-proxy, push-relay, gateway/
├── src-tauri/         # Tauri v2 Rust shell
│   ├── migrations/    # SQLite schema migrations
│   └── src/lib.rs     # Sidecar startup & DB init
└── design/            # HTML UI mockups
```

## Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

### Team Roles

To ensure the integrity and security of the `lysmata` project, the following contributors are authorized for the code signing process:

- **Maintainers & Committers**:
  - [@joesmart](https://github.com/joesmart) (Project Lead)
  - [@hiXgb](https://github.com/hiXgb) (Core Developer)
  - [@p2227](https://github.com/p2227) (Core Developer)
- **Reviewers**:
  - All Maintainers listed above.
- **Approvers**:
  - [SignPath Foundation](https://signpath.org) (Automated Open Source Signing)

### Privacy policy

Lysmata does not automatically collect, track, or transmit user personal information to any external service by itself. User data remains on the local machine by default (`~/.lysmata/app.db`, `~/.lysmata/logs/`) unless the user explicitly configures and sends data to third-party services (for example, OpenClaw Gateway or LLM provider endpoints).

## 🤝 Contributing

Contributions are welcome! Whether it's a bug report, feature request, documentation improvement, or code change — all are appreciated.

### Bug Reports & Feature Requests

Please open an [issue](https://github.com/yaowu-ai/lysmata/issues) and use the appropriate template. Include as much context as possible.

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add group chat @mention autocomplete
   fix: resolve SSE reconnect loop on network drop
   docs: update configuration examples
   ```
4. Push to your fork: `git push origin feat/your-feature`
5. Open a Pull Request against `main` — describe what changed and why

### Development Setup

See [🚀 Getting Started](#-getting-started) for local environment setup.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

Copyright © 2026 [yaowu-ai](https://github.com/yaowu-ai)
