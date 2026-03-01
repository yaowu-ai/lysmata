# US-05：Artifact 预览

**模块**：Artifact
**对应设计**：`design/ui-artifact-demo.html`、`docs/prd-v2.md §2.2`

---

### US-05-01：自动识别并生成 Artifact

**作为** 用户，
**我希望** 当 Bot 返回可渲染内容（代码、网页、图表）时，
**以便** 系统自动在右侧预览窗格中展示，而不是仅显示文本。

**优先级**：P1
**验收标准（AC）**：
- AC1：Bot 输出包含 HTML、React 组件、SVG、Markdown 时自动触发 Artifact 面板
- AC2：右侧面板以动画滑入，聊天区自适应压缩宽度
- AC3：消息气泡中显示"已生成 Artifact"缩略卡片，点击可聚焦 Artifact 面板

---

### US-05-02：在 Preview / Code / History 之间切换

**作为** AI 开发者，
**我希望** 在 Artifact 面板顶部 Tab 切换预览、源码和历史版本，
**以便** 既能看效果也能检查代码，并在版本间对比差异。

**优先级**：P1
**验收标准（AC）**：
- AC1：面板顶部固定三个 Tab：Preview / Code / History
- AC2：Code Tab 显示高亮源码，支持复制全部
- AC3：History Tab 列出所有历史迭代版本，点击可还原

---

### US-05-03：基于 Artifact 发起迭代指令

**作为** 用户，
**我希望** 在 Artifact 正在展示时，直接在聊天框发送"修改背景色为深色"等指令，
**以便** Bot 能理解当前 Artifact 上下文并生成更新版本。

**优先级**：P1
**验收标准（AC）**：
- AC1：Artifact 激活状态下，输入框提示"针对当前 Artifact 发送修改指令"
- AC2：Bot 收到指令后更新 Artifact 内容，History Tab 新增一个版本条目
- AC3：更新后 Preview Tab 实时刷新

---

### US-05-04：全屏查看 Artifact

**作为** 用户，
**我希望** 将 Artifact 全屏展开，
**以便** 更清晰地查看复杂网页或图表。

**优先级**：P2
**验收标准（AC）**：
- AC1：Artifact 面板右上角有全屏按钮
- AC2：全屏后主聊天区隐藏，按 Esc 或点击关闭退出全屏
