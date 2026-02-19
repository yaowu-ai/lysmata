# Tauri 与 React 集成说明（职责边界版）

> 面向“新项目复用”的文档：明确哪些能力应放在 `Tauri/Rust`，哪些应放在 `React/TS`，以及两者如何协作。

## 1. 集成总览

在这个项目里，整体是一个“三层协作”模型：

- `React (src/)`：负责 UI、交互、状态与业务编排
- `Hono API (src-api/)`：负责业务服务接口、任务执行编排
- `Tauri (src-tauri/)`：负责桌面容器、系统能力、SQLite 迁移、生产 sidecar 生命周期

最关键原则：**React 不直接依赖 Rust 业务逻辑，优先通过 HTTP 调用 API；Tauri 主要解决“桌面原生能力与运行时托管”。**

---

## 2. 启动链路（开发/生产）

### 2.1 开发模式

1. `tauri dev` 启动桌面窗口
2. Tauri 指向 `http://localhost:1420` 前端开发服务
3. API 服务由 `pnpm dev:api` 单独运行在 `2026`
4. React 通过 `API_BASE_URL` 调用 Hono API

对应配置：

- `src-tauri/tauri.conf.json`
  - `build.devUrl = "http://localhost:1420"`
  - `build.beforeDevCommand = "pnpm dev"`
- `src/config/index.ts`
  - 开发端口 `2026`

### 2.2 生产模式

1. Tauri 打包前端静态资源（`dist`）
2. Tauri 启动时在 Rust 中拉起 API sidecar（二进制）
3. sidecar 监听 `2620`
4. React（生产）通过 `http://localhost:2620` 调用 API

对应实现：

- `src-tauri/src/lib.rs`（`#[cfg(not(debug_assertions))]` 分支）
  - sidecar 名称：`workany-api`
  - 注入环境变量：`PORT=2620`, `NODE_ENV=production`
  - 退出时回收 sidecar 进程
- `src/config/index.ts`
  - 生产端口 `2620`

---

## 3. 职责边界：哪些放 Tauri，哪些放 React

## 应放在 Tauri/Rust 的能力

- **系统能力接入**：文件系统、shell、窗口管理、权限控制
- **数据库迁移与初始化**：SQLite schema 版本、迁移脚本统一收敛
- **生产运行时托管**：API sidecar 启动/停止、异常恢复、进程清理
- **安全边界**：capabilities 权限白名单（最小权限）

本项目对应位置：

- 插件注册与迁移：`src-tauri/src/lib.rs`
- 权限策略：`src-tauri/capabilities/default.json`
- 打包与二进制绑定：`src-tauri/tauri.conf.json` 的 `bundle.externalBin`

## 应放在 React/TypeScript 的能力

- **界面与交互**：页面、组件、表单、消息流呈现
- **业务编排与状态管理**：用户操作流程、会话状态、错误提示
- **API 调用与容错**：请求重试、超时、前端 fallback
- **跨环境适配逻辑**：Tauri 环境使用 SQLite，浏览器环境回退 IndexedDB

本项目对应位置：

- API 端口策略：`src/config/index.ts`
- 数据访问封装：`src/shared/db/database.ts`
- 业务调用编排：`src/shared/hooks/useAgent.ts`

## 应放在 Hono API 的能力（避免前端过重）

- **业务规则执行**：任务、Agent、Sandbox 等服务编排
- **统一接口协议**：`/health`、`/agent`、`/sandbox`、`/preview`、`/providers`
- **配置加载与多 provider 管理**：集中读取环境变量/配置文件

本项目对应位置：

- API 入口：`src-api/src/index.ts`
- 路由聚合：`src-api/src/app/api/index.ts`
- 配置系统：`src-api/src/config/loader.ts`

---

## 4. 数据层边界（重点）

本项目的数据接入采用“**前端统一数据网关 + Tauri 负责迁移**”：

- Rust 侧：定义 SQLite migrations（保证 schema 演进一致）
- React 侧：通过 `@tauri-apps/plugin-sql` 执行查询（Tauri 环境）
- Browser 回退：若不在 Tauri 环境，自动切到 IndexedDB

这样做的好处：

- 新项目能同时支持“桌面模式”和“纯 Web 调试模式”
- 数据结构演进由 Rust 控制，避免多端 schema 漂移

---

## 5. 新项目可直接复用的决策模板

以下决策可以直接照搬：

- **端口策略**
  - Dev API: `2026`
  - Prod API: `2620`
  - Vite: `1420`
- **通信方式**
  - React <-> Hono：HTTP
  - Tauri <-> API：sidecar 进程托管
- **数据库策略**
  - 迁移在 Rust
  - 读写封装在前端 `shared/db`
  - Web fallback 到 IndexedDB

---

## 6. 反模式（建议避免）

- 在 React 组件中直接拼接 SQL 或直接访问 Tauri API（应走 `shared/db` 封装）
- 把业务规则写进 Rust（Rust 层应聚焦运行时和系统能力）
- 生产环境仍依赖外部 API 服务手工启动（应由 sidecar 托管）
- 在 capabilities 中开过宽权限（应按最小权限开白名单）

---

## 7. 最小落地检查清单（迁移到新项目时）

- `pnpm dev:api` + `pnpm dev:app` 可同时工作
- 开发模式 API 请求命中 `2026`
- 生产模式 API 请求命中 `2620`（由 sidecar 提供）
- 首次启动能自动创建 SQLite 表
- 关闭应用后 sidecar 进程可被清理
- 纯浏览器运行时可回退 IndexedDB，不影响基本调试

---

## 8. 一句话架构结论

把 Tauri 当作“桌面运行时与系统能力层”，把 React 当作“业务体验层”，把 Hono 当作“业务服务层”；三者通过清晰边界协作，项目可维护性和可迁移性最高。
