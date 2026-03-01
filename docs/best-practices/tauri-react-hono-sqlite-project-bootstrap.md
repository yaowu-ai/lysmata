# Tauri + React + Hono + SQLite 新项目构建文档

> 目标：基于 `workany` 的分层思路，快速搭建一个可长期维护、可迭代的桌面应用骨架（前端 React、桌面壳 Tauri、后端 Hono、数据 SQLite）。

## 延伸阅读

- Tauri 与 React 集成细节与职责边界：`docs/tauri-react-integration-boundary.md`

## 0. 分析（为什么这样分层）

本架构将项目拆成三个明确边界：

- `src/`：React 前端（UI、状态、业务编排）
- `src-api/`：Hono API（Agent/业务服务编排、与外部服务交互）
- `src-tauri/`：Tauri + Rust（桌面能力、SQLite 初始化与迁移、Sidecar 管理）

设计原则：

- 前后端接口通过 HTTP 解耦，方便本地开发与后续服务替换
- 数据模型和迁移放在 Tauri/Rust 层统一管理，避免前端散落 SQL
- 开发/生产使用不同 API 端口，减少环境耦合

---

## 1. 设计（目标目录与职责）

建议新项目目录：

```text
my-app/
├── src/                  # React + Vite
│   ├── config/           # 前端配置（端口、环境）
│   ├── shared/           # 公共库（db/api/hooks/types）
│   └── components/       # UI 组件
├── src-api/              # Hono API 服务
│   ├── src/app/api/      # 路由层（health/agent/...）
│   ├── src/config/       # API 配置加载
│   ├── src/core/         # 业务核心能力
│   └── src/shared/       # 公共工具
├── src-tauri/            # Tauri + Rust
│   ├── src/lib.rs        # 插件注册、数据库迁移、sidecar 管理
│   ├── capabilities/     # 权限配置
│   └── tauri.conf.json   # 应用构建配置
├── package.json
└── pnpm-workspace.yaml
```

---

## 2. 计划（实施阶段）

1. 初始化 Monorepo 与基础依赖
2. 搭建 React + Vite 前端
3. 搭建 Hono API 子包（`src-api`）
4. 初始化 Tauri 并接入 SQLite 插件
5. 打通开发链路（`dev:api` + `dev:app`）
6. 增加最小业务闭环（health + session/task 落库）
7. 进行测试与验收

---

## 3. 任务拆解（按文件落地）

### 3.1 根目录 `package.json`（参考）

核心脚本（与你当前仓库一致的思路）：

- `dev:api`：启动 `src-api`（默认 `2026`）
- `dev:app`：启动 Tauri App（开发期前端端口 `1420`）
- `tauri:build`：先打包 API sidecar，再构建桌面包

建议脚本最小集：

```json
{
  "scripts": {
    "dev": "vite",
    "dev:api": "pnpm --filter my-app-api dev",
    "dev:app": "pnpm tauri dev",
    "build": "vite build",
    "build:api": "pnpm --filter my-app-api build",
    "tauri:build": "pnpm build:api && tauri build"
  }
}
```

### 3.2 `pnpm-workspace.yaml`

```yaml
packages:
  - "."
  - "src-api"
```

### 3.3 前端 API 地址策略（`src/config/index.ts`）

保持开发与生产端口切换：

```ts
export const API_PORT = import.meta.env.PROD ? 2620 : 2026;
export const API_BASE_URL = `http://localhost:${API_PORT}`;
```

### 3.4 Hono API 入口（`src-api/src/index.ts`）

至少包含：

- 中间件：`logger`、`cors`
- 路由：`/health`、`/agent`、`/sandbox`、`/preview`（可按项目删减）
- 启动端口：默认 `2026`，支持 `PORT` 环境变量覆盖

### 3.5 Tauri 配置（`src-tauri/tauri.conf.json`）

关键字段：

- `build.devUrl`: `http://localhost:1420`
- `build.beforeDevCommand`: `pnpm dev`
- `bundle.externalBin`: 引入 API sidecar 二进制（例如 `../src-api/dist/my-app-api`）

### 3.6 Rust 插件与迁移（`src-tauri/src/lib.rs`）

参考当前仓库做法：

- 注册插件：`tauri-plugin-sql`、`tauri-plugin-shell`、`tauri-plugin-fs`
- 用 `tauri_plugin_sql::Builder::default().add_migrations("sqlite:app.db", migrations)` 管理迁移
- 生产模式下拉起 sidecar（端口 `2620`）

---

## 4. 任务执行（从 0 到可运行）

## 步骤 A：初始化项目

```bash
mkdir my-app && cd my-app
pnpm init
pnpm add react react-dom react-router-dom
pnpm add -D typescript vite @vitejs/plugin-react @types/react @types/react-dom
pnpm add -D @tauri-apps/cli
pnpm add @tauri-apps/api @tauri-apps/plugin-sql @tauri-apps/plugin-shell @tauri-apps/plugin-fs
```

创建 `pnpm-workspace.yaml`（见上文）。

## 步骤 B：初始化前端（Vite）

如果你更快的方式是直接用当前仓库模板：复制 `src/`、`vite.config.ts`、`tsconfig.json` 并替换业务代码。  
若从零初始化，请保证：

- Vite 端口固定 `1420`
- `server.strictPort = true`
- 别名 `@ -> ./src`

## 步骤 C：初始化 API 子包（Hono）

```bash
mkdir -p src-api/src/app/api src-api/src/config src-api/src/shared
cd src-api
pnpm init
pnpm add hono @hono/node-server zod
pnpm add -D typescript tsx @types/node
```

`src-api/package.json` 脚本建议：

```json
{
  "name": "my-app-api",
  "type": "module",
  "scripts": {
    "dev": "node --import tsx --watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

## 步骤 D：初始化 Tauri 与 SQLite

在项目根目录执行：

```bash
pnpm tauri init
```

更新 `src-tauri/Cargo.toml`：

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-shell = "2"
tauri-plugin-fs = "2"
tauri-plugin-opener = "2"
```

然后在 `src-tauri/src/lib.rs` 中添加迁移与插件注册。

## 步骤 E：打通开发链路

根目录启动：

```bash
pnpm install
pnpm dev:api
pnpm dev:app
```

预期：

- 前端在 `http://localhost:1420`
- Hono 在 `http://localhost:2026`
- Tauri 窗口可打开并与 API 通信

---

## 5. 测试（最小可运行闭环）

### 5.1 API 健康检查

```bash
curl http://localhost:2026/health
```

返回 `200` 且有状态字段。

### 5.2 SQLite 初始化验证

- 首次启动后检查数据库文件是否创建（如 `app.db` 或 `workany.db`）
- 验证迁移中的表（如 `tasks`、`messages`）是否存在

### 5.3 前后端联调

- 前端点击“创建任务”类操作后，确认 API 收到请求
- 查询数据库确认任务写入成功

---

## 6. 验收（交付标准）

满足以下条件即可作为新项目基础模板：

- `pnpm dev:api`、`pnpm dev:app` 可稳定启动
- Tauri 开发/生产 API 端口切换生效（2026/2620）
- SQLite 迁移可重复执行且无破坏性
- 最小业务闭环（新增任务 -> 落库 -> 查询）通过
- 打包命令可输出桌面安装包（至少当前系统平台）

---

## 7. 推荐的长期维护规范

- 路由层只做参数校验与编排，业务逻辑放 `core/`
- 数据访问统一走 `shared/db`，避免组件直接写 SQL
- 迁移只追加版本，不覆盖历史版本
- 配置统一由 `config loader` 管理（文件 + 环境变量 + 运行时）
- 每次新增能力都附带最小验收脚本（`curl` 或集成测试）

---

## 8. 可直接复用的关键参数（来自当前仓库）

- 前端开发端口：`1420`（Vite）
- API 开发端口：`2026`
- API 生产端口：`2620`（Tauri sidecar）
- SQLite 连接名：`sqlite:workany.db`
- Workspace 结构：根包 + `src-api` 子包（pnpm workspace）

如果你愿意，我下一步可以直接给你产出一个“可复制粘贴的最小模板仓库清单”（包含每个关键文件的初始内容），你只需要改项目名和包名就能启动。
