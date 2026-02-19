# WorkAny `src` 组件设计分析与最佳实践沉淀

> 目标：基于当前 `src/` 实际实现，沉淀可长期维护、可迭代的组件设计经验，而不是抽象空话。

## 0. 分析（现状是什么）

### 0.1 目录分层与职责边界

当前前端已形成较清晰分层：

- `src/app`：应用壳与路由（`main.tsx`、`router.tsx`、`pages/*`）。
- `src/components`：按业务域拆分 UI（`task`、`settings`、`artifacts`、`layout`、`shared`、`ui`）。
- `src/shared`：跨页面共享能力（`db`、`hooks`、`providers`、`lib`）。
- `src/config`：配置与国际化资源。

这说明项目已经采用了“应用层编排 + 领域组件 + 共享基础设施”的设计思路，方向是对的。

### 0.2 组件组织上的优点

1. **按业务域组织，而非按技术类型平铺**
   - 如 `components/settings/tabs/*`、`components/artifacts/*`、`components/task/*`，对业务认知友好。
2. **Barrel Export 使用一致**
   - 例如 `components/artifacts/index.ts`、`components/layout/index.ts`、`components/settings/index.ts`。
3. **跨页面能力下沉到 `shared`**
   - 如 `useAgent`、`settings`、`useVitePreview`、`language/theme provider`，减少页面重复逻辑。
4. **容器与展示有一定区分**
   - 页面层负责数据加载和交互，部分展示逻辑在子组件（如 `ChatInput`、`ArtifactPreview`）。
5. **可扩展性意识较强**
   - 通过 `types.ts`、`constants.tsx`、统一 `SettingsModal` 的 category 切换，为新增 tab/功能预留空间。

### 0.3 当前主要风险点（重点）

1. **超大组件（可维护性风险）**
   - `TaskDetail.tsx`、`task/RightSidebar.tsx`、`settings/tabs/SkillsSettings.tsx`（以及部分设置 tab）承担过多职责。
2. **映射逻辑重复**
   - 文件类型到 artifact 类型、图标映射等逻辑在多个文件重复，后续改动容易不一致。
3. **UI 组件直接请求后端**
   - 如多个组件直接 `fetch` API，导致 API 协议耦合到视图层，测试与替换成本上升。
4. **调试日志密度较高**
   - `console.log` 分散在关键路径，生产排障有帮助，但噪音和性能开销需要治理策略。
5. **边界存在历史兼容痕迹**
   - 存在兼容导出与潜在并行实现（如不同目录下同名能力），容易让新同学理解成本变高。

---

## 1. 设计（目标形态）

### 1.1 推荐的前端组件分层模型

建议在现有基础上进一步收敛为三层：

1. **Page 容器层（编排）**
   - 负责路由参数、数据装配、流程控制。
   - 不直接包含复杂 UI 细节和大量工具函数。
2. **Feature 组件层（业务）**
   - 按业务域拆分：`task`、`settings`、`artifacts`。
   - 每个 feature 内部再分 `containers + components + hooks + services + types`。
3. **Shared 基础层（复用）**
   - `shared/hooks`、`shared/lib`、`shared/db`、`components/ui`。
   - 保持纯净、稳定，避免反向依赖 feature 代码。

### 1.2 单向依赖约束

推荐强制约束：

- `app/pages` -> `components/*` -> `shared/*`
- `components/ui` 只能依赖基础工具，不依赖业务模块
- 业务 feature 之间尽量通过 `types` 和 `service` 协作，避免互相深度调用内部实现

---

## 2. 计划（落地路线）

### Phase 1（低风险、收益快）

- 抽离重复的类型映射和图标映射到 `shared/lib/*`。
- 把组件内 `fetch` 下沉到 feature service。
- 清理明显无效或过时的兼容层（先标记，再迁移）。

### Phase 2（结构优化）

- 拆分超大组件：按“状态管理 hook + 纯展示组件”模式重构。
- 细化 settings 大 tab（每个 tab 内再拆 section 组件）。

### Phase 3（质量体系）

- 补充组件/Hook 单测与集成测试。
- 为关键流程建立“行为回归清单”（任务创建、继续对话、产物预览、设置同步）。

---

## 3. 任务拆解（可执行清单）

1. **抽公共映射**
   - 建立 `shared/lib/artifact-mapping.ts`，统一 extension/type/icon 规则。
2. **抽 API 客户端**
   - 在 `shared/lib/api` 下补充按域客户端（skills/files/preview/task）。
3. **拆 `TaskDetail`**
   - `useTaskDetailController`（状态与副作用）
   - `TaskDetailLayout`（纯布局）
   - `TaskHeader/TaskMessagePanel/TaskPreviewPanel`（子块）
4. **拆 `task/RightSidebar`**
   - `WorkspaceSection`、`ArtifactsSection`、`ToolsSection`、`SkillsSection`
5. **拆 `SkillsSettings`**
   - Installed 列表、Import 流程、Settings 配置分离。
6. **建立边界规范**
   - 在文档与 lint 约束中固化 import 边界和文件命名约定。

---

## 4. 任务执行（最佳实践细则）

### 4.1 组件设计最佳实践

- 单个组件聚焦一个职责，建议控制在“可一屏读完”。
- 超过约 300 行优先考虑拆分；超过 500 行必须评估拆分。
- 页面组件不承载过多业务算法，算法放 hook/service。

### 4.2 Hook 设计最佳实践

- Hook 负责“状态与副作用编排”，组件负责“渲染与交互绑定”。
- Hook 返回值用明确接口类型，避免 `any` 和隐式结构。
- 长流程（如 agent 会话）优先状态机化或分阶段 reducer 化。

### 4.3 API 访问最佳实践

- 组件禁止直接拼 URL；统一走 API 模块。
- API 模块统一处理错误格式、重试策略、超时与日志。
- 让 UI 只消费“业务化结果”，不感知底层协议细节。

### 4.4 复用与扩展最佳实践

- 保留域内 `index.ts`，对外只暴露稳定公共 API。
- 跨域复用必须先进入 `shared`，避免私有实现被随意引用。
- 类型、常量、转换函数同源维护，减少多处重复实现。

### 4.5 可观测性最佳实践

- 关键日志加前缀和上下文（任务 ID、会话 ID）。
- 生产日志按级别可配置，避免全量 debug 输出。
- 对网络失败与权限失败给用户友好提示，不只打控制台日志。

---

## 5. 测试（建议最小集）

### 5.1 单元测试

- `artifact` 类型识别与映射函数。
- `useAgent` 的关键状态迁移（run/stop/background restore）。
- `settings` 读写与同步逻辑。

### 5.2 组件测试

- `ChatInput`：提交、附件、粘贴图片、停止按钮。
- `ArtifactPreview`：不同类型分支渲染与模式切换。
- `SettingsModal`：分类切换与保存回调。

### 5.3 端到端回归

- 新建任务 -> 运行 -> 预览产物 -> 停止 -> 继续对话。
- 设置模型/技能/MCP 切换后的生效验证。

---

## 6. 验收（完成标准）

满足以下条件可判定“组件设计优化有效”：

1. 关键页面主文件显著瘦身，复杂逻辑迁移到 hook/service。
2. extension/type/icon 规则单一来源，无重复定义。
3. 组件层不再直接散落 `fetch` 调用。
4. 新增一个 settings 子功能时，只需在既有扩展点增量接入。
5. 关键流程具备基础自动化回归能力。

---

## 7. 一句话总结

当前 `src` 组件架构基础扎实（分域清晰、共享层明确），下一步重点是**控制组件体积、收敛重复逻辑、加强边界与测试**，这样才能把“能跑”升级到“长期优雅可维护”。
