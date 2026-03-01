# OpenClaw Native — 设计语言规范

**版本**：v1.0  
**更新日期**：2026-02-19  
**适用范围**：Tauri + React + TailwindCSS + shadcn/ui 技术栈  
**原型来源**：`design/` 目录下 4 个 HTML 原型文件

---

## 目录

1. [Design Tokens](#1-design-tokens)
2. [版式系统](#2-版式系统)
3. [间距与圆角](#3-间距与圆角)
4. [阴影系统](#4-阴影系统)
5. [核心组件规范](#5-核心组件规范)
6. [动效规范](#6-动效规范)
7. [页面布局模式](#7-页面布局模式)
8. [与 React 技术栈的对应关系](#8-与-react-技术栈的对应关系)

---

## 1. Design Tokens

所有 Token 来自原型 `:root` CSS 变量，与 TailwindCSS `theme.extend` 一一映射（见第 8 节）。

### 1.1 语义色板

| Token             | 值        | 用途                             |
| ----------------- | --------- | -------------------------------- |
| `--bg`            | `#F7F7F8` | 应用级背景（页面底色）           |
| `--surface`       | `#FFFFFF` | 卡片、面板、侧边栏等表面层       |
| `--border`        | `#E5E7EB` | 默认分割线、输入框边框           |
| `--text`          | `#0F172A` | 主文字（标题、正文）             |
| `--text-muted`    | `#64748B` | 次要文字（副标题、标签、占位符） |
| `--primary`       | `#2563EB` | 品牌主色（按钮、链接、选中态）   |
| `--primary-hover` | `#1D4ED8` | 主色悬停态                       |
| `--success`       | `#16A34A` | 成功状态                         |
| `--warning`       | `#D97706` | 警告状态                         |
| `--error`         | `#DC2626` | 错误状态                         |

### 1.2 背景色阶

从主背景到交互层的完整色阶，用于区分层次：

| 色值      | 语义用途                       |
| --------- | ------------------------------ |
| `#F7F7F8` | 应用根背景                     |
| `#FAFAFA` | 次级背景（表格行、hover 填充） |
| `#F8FAFC` | 输入框背景                     |
| `#F1F5F9` | Hover 状态背景                 |
| `#EFF6FF` | 选中/Active 状态背景（蓝色系） |
| `#F0F7FF` | 主 Bot 消息气泡背景            |
| `#FFFBEB` | 警告色背景（感知注入区块）     |
| `#F0FDF4` | 成功色背景（活跃指示器）       |
| `#FEF2F2` | 错误色背景（错误消息气泡）     |
| `#FFFFFF` | 纯白（卡片、弹层、导航）       |

### 1.3 文字色阶

| 色值      | 用途                       |
| --------- | -------------------------- |
| `#0F172A` | 主正文、标题               |
| `#64748B` | 辅助文字（`--text-muted`） |
| `#94A3B8` | 占位符、次级辅助           |
| `#CBD5E1` | 时间戳、极弱提示           |
| `#E2E8F0` | 代码块内文字               |

### 1.4 边框色阶

| 色值      | 用途                   |
| --------- | ---------------------- |
| `#E5E7EB` | 默认边框（`--border`） |
| `#D1D5DB` | 次级边框、分割线       |
| `#93C5FD` | 输入框聚焦边框         |
| `#BFDBFE` | 主色系浅边框（徽章）   |
| `#BBF7D0` | 成功色边框             |
| `#FDE68A` | 警告色边框             |
| `#FECACA` | 错误色边框             |

### 1.5 Avatar 渐变色

头像背景使用 5 套渐变，按 Bot 角色类型分配，CSS class 命名为 `av-{color}`：

| Class       | 渐变值                                      | 适用场景        |
| ----------- | ------------------------------------------- | --------------- |
| `av-blue`   | `linear-gradient(135deg, #DBEAFE, #BFDBFE)` | 代码类 Bot      |
| `av-green`  | `linear-gradient(135deg, #DCFCE7, #BBF7D0)` | 研究/数据类 Bot |
| `av-purple` | `linear-gradient(135deg, #EDE9FE, #DDD6FE)` | 分析/可视化 Bot |
| `av-amber`  | `linear-gradient(135deg, #FEF3C7, #FDE68A)` | 设计类 Bot      |
| `av-rose`   | `linear-gradient(135deg, #FFE4E6, #FECDD3)` | 安全类 Bot      |

### 1.6 连接状态色

Bot 连接状态对应 4 种颜色，贯穿所有 UI 场景：

| 状态           | 颜色      | 光晕阴影                                      |
| -------------- | --------- | --------------------------------------------- |
| `connected`    | `#10B981` | `0 0 0 2px rgba(16,185,129,0.2)`              |
| `connecting`   | `#F59E0B` | `0 0 0 3px rgba(245,158,11,0.25)`（脉冲动画） |
| `disconnected` | `#94A3B8` | 无                                            |
| `error`        | `#EF4444` | `0 0 0 2px rgba(239,68,68,0.2)`               |

---

## 2. 版式系统

### 2.1 字体栈

```css
/* 西文正文：Inter，回退到系统字体 */
font-family:
  "Inter",
  system-ui,
  -apple-system,
  sans-serif;

/* 代码、等宽场景：JetBrains Mono */
font-family: "JetBrains Mono", "Fira Code", monospace;
```

Google Fonts 引入：

```html
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

> **注意**：中文字符统一回退到系统 sans-serif（PingFang SC / Microsoft YaHei），不单独引入中文字体以保证性能。

### 2.2 字号阶梯

| 用途                           | 字号 | 字重            |
| ------------------------------ | ---- | --------------- |
| 超小标签（时间戳、角标）       | 10px | 400 / 500       |
| 小型辅助文字（Badge、标注）    | 11px | 500 / 600       |
| 次要正文（描述、副标题）       | 12px | 400 / 600       |
| 正文（列表项、输入框）         | 13px | 400 / 500 / 600 |
| 主正文（消息气泡、表单）       | 14px | 400 / 500       |
| 小标题（侧边栏标题、面板标题） | 15px | 500 / 600       |
| 页面标题（H2）                 | 17px | 600             |
| 卡片主数字（统计数据）         | 20px | 600 / 700       |
| 大标题（H1）                   | 24px | 700             |

### 2.3 行高

| 场景     | 行高      |
| -------- | --------- |
| 紧凑标签 | 1.4       |
| 普通正文 | 1.5       |
| 消息气泡 | 1.65      |
| 代码块   | 1.6 ~ 1.7 |

### 2.4 字母间距

- 全大写小标题（`HLABEL`）：`letter-spacing: 0.06em`，搭配 `text-transform: uppercase`
- 普通文字：默认值，不额外设置

---

## 3. 间距与圆角

### 3.1 间距系统

基准：**4px 倍数**。React 项目通过 TailwindCSS `spacing` 配置直接使用。

| 值   | Tailwind 类 | 典型用途                     |
| ---- | ----------- | ---------------------------- |
| 2px  | `p-0.5`     | 极细 inline 间距             |
| 4px  | `p-1`       | Badge 内边距纵向、图标间距   |
| 6px  | `p-1.5`     | 按钮图标间距                 |
| 8px  | `p-2`       | 次级按钮内边距、列表项间距   |
| 10px | `p-2.5`     | 输入框内边距                 |
| 12px | `p-3`       | 卡片内边距（小）、会话列表项 |
| 14px | `p-3.5`     | 右侧面板内边距               |
| 16px | `p-4`       | 标准模块内边距、侧边栏标题   |
| 18px | `p-[18px]`  | 按钮横向内边距               |
| 20px | `p-5`       | 聊天区主内边距               |
| 24px | `p-6`       | 对话框内边距、Toast 距边缘   |

### 3.2 圆角规则

| 场景          | 圆角值 | Tailwind 类         |
| ------------- | ------ | ------------------- |
| 头像（圆形）  | `50%`  | `rounded-full`      |
| 徽章 / Pill   | `20px` | `rounded-[20px]`    |
| 对话框 / 抽屉 | `14px` | `rounded-[14px]`    |
| 卡片 / 面板   | `12px` | `rounded-xl` (12px) |
| 按钮（默认）  | `8px`  | `rounded-lg` (8px)  |
| 输入框        | `8px`  | `rounded-lg`        |
| 图标按钮      | `7px`  | `rounded-[7px]`     |
| 代码块        | `7px`  | `rounded-[7px]`     |
| Toast         | `10px` | `rounded-[10px]`    |
| 小型 Badge    | `4px`  | `rounded`           |
| 滚动条滑块    | `3px`  | `rounded-[3px]`     |

---

## 4. 阴影系统

阴影使用极克制原则：仅在**层级分离**场景使用，4 个等级：

| 等级 | 场景                       | CSS 值                         |
| ---- | -------------------------- | ------------------------------ |
| 0    | 默认状态（边框替代阴影）   | 无                             |
| 1    | 卡片 hover 状态            | `0 4px 16px rgba(0,0,0,0.08)`  |
| 2    | 下拉菜单、@mention 弹窗    | `0 8px 24px rgba(0,0,0,0.10)`  |
| 3    | 抽屉、右侧面板             | `-8px 0 32px rgba(0,0,0,0.08)` |
| 4    | 全局弹层（Dialog / Modal） | `0 20px 60px rgba(0,0,0,0.15)` |

**Logo / 品牌主色阴影**：`0 2px 8px rgba(37,99,235,0.30)`  
**输入框聚焦光晕**（Ring）：`0 0 0 3px rgba(147,197,253,0.25)`

---

## 5. 核心组件规范

### 5.1 导航栏（Nav）

**布局**：左侧固定竖排，支持折叠/展开。

| 状态 | 宽度  | 过渡                                    |
| ---- | ----- | --------------------------------------- |
| 折叠 | 64px  | `width 0.26s cubic-bezier(0.4,0,0.2,1)` |
| 展开 | 220px | 同上                                    |

**CSS Class 命名**：

```
.nav-btn          — 导航项按钮（flex 横排，完整宽度）
  .nav-icon-wrap  — 图标容器（36×36px，8px radius）
  .nav-label      — 标签文字（折叠时 opacity:0 + max-width:0）
  .nav-btn.active — 选中态（#EFF6FF 背景，#2563EB 文字/图标）
  .nav-btn:hover  — 悬停（#F1F5F9 背景）
```

**图标规格**：Lucide React，16 × 16px（导航）/ 18 × 18px（功能图标）。

---

### 5.2 按钮（Button）

三种类型，对应 shadcn/ui 的 `variant` 参数：

**Primary（主要）**

```css
background: #2563EB;  color: #fff;
padding: 9px 18px;    border-radius: 8px;
font-size: 14px;      font-weight: 500;
hover: background: #1D4ED8;
transition: background 0.15s;
```

**Ghost（次要）**

```css
background: transparent;  color: #64748B;
border: 1px solid #E5E7EB;
padding: 9px 18px;         border-radius: 8px;
hover: background: #F8FAFC;  color: #0F172A;
```

**Icon（图标按钮）**

```css
width: 28px ~ 34px;   height: 28px ~ 34px;
border-radius: 7px;   background: transparent;
color: #94A3B8;
hover: background: #F1F5F9;  color: #475569;
```

**Send（发送按钮，特殊）**

```css
width: 34px;  height: 34px;  border-radius: 8px;
background: #2563EB;
hover: background: #1D4ED8;
active: transform: scale(0.93);
```

---

### 5.3 头像（Avatar）

**规格**：

| 使用场景            | 尺寸 |
| ------------------- | ---- |
| 消息气泡旁头像      | 34px |
| 成员列表            | 32px |
| 会话列表叠加头像    | 24px |
| 新建对话框 Bot 选项 | 26px |
| Bot 管理卡片        | 48px |
| 私聊右侧 Profile 卡 | 56px |
| 大型展示场景        | 68px |

**样式规则**：

- 形状：`border-radius: 50%`（圆形）
- 背景：5 种渐变色，`av-{color}` class（见 §1.5）
- 内容：Bot Emoji，`font-size` 为头像尺寸的 50% 左右
- 叠加显示时：后一个 `margin-left: -8px`，`border: 2px solid #fff`（或当前背景色）

**皇冠徽章（主 Bot 标识）**：

```css
.crown-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fef3c7;
  border: 1.5px solid #fde68a;
  font-size: 8px;
  z-index: 1;
}
```

---

### 5.4 状态指示点（Status Dot）

```
.dot                  — 基础圆点（border-radius: 50%; display: inline-block;）
.dot-connected        — background: #10B981; 光晕: 0 0 0 2px rgba(16,185,129,0.2)
.dot-disconnected     — background: #94A3B8; 无光晕
.dot-error            — background: #EF4444; 光晕: 0 0 0 2px rgba(239,68,68,0.2)
.dot-connecting       — background: #F59E0B; 光晕: 0 0 0 3px rgba(245,158,11,0.25) + pulse 动画
```

常用尺寸：列表中 `7px`，头像叠加 `9px`，独立展示 `11px`。  
定位：通过 `position: absolute; bottom: 0; right: 0` 叠加在头像右下角。

---

### 5.5 徽章与标签（Badge / Pill）

**通用 Pill 样式**：

```css
display: inline-flex;
align-items: center;
padding: 2px 8px ~3px 10px;
border-radius: 20px;
font-size: 11px ~12px;
font-weight: 500 ~600;
```

**消息路由徽章**（群聊专用），CSS class：

| Class        | 背景      | 文字颜色  | 边框      | 含义        |
| ------------ | --------- | --------- | --------- | ----------- |
| `rb-primary` | `#EFF6FF` | `#1D4ED8` | `#BFDBFE` | 主 Bot 响应 |
| `rb-mention` | `#DCFCE7` | `#15803D` | `#BBF7D0` | 被 @ 提及   |
| `rb-chain`   | `#EDE9FE` | `#6D28D9` | `#DDD6FE` | 链式响应    |

**连接状态徽章**：

| 状态     | 背景      | 文字颜色  |
| -------- | --------- | --------- |
| 已连接   | `#DCFCE7` | `#15803D` |
| 未连接   | `#F1F5F9` | `#64748B` |
| 连接错误 | `#FEF2F2` | `#B91C1C` |
| 连接中   | `#FEF3C7` | `#92400E` |

**Bot 角色标签**：

| 角色     | 背景      | 文字颜色  | 边框      |
| -------- | --------- | --------- | --------- |
| 👑 主Bot | `#FEF3C7` | `#92400E` | `#FDE68A` |
| 辅助     | `#F1F5F9` | `#64748B` | `#E5E7EB` |

---

### 5.6 聊天气泡（Chat Bubble）

三种类型，方向感由圆角实现（省略角对应发言方向）：

**用户消息（右对齐）**

```css
.bubble-user {
  background: #2563eb;
  color: #fff;
  border-radius: 12px 0 12px 12px; /* 右上角省略 */
  padding: 11px 14px;
  font-size: 14px;
  line-height: 1.65;
}
```

**Bot 消息（左对齐）**

```css
.bubble-bot {
  background: #f1f5f9;
  color: #0f172a;
  border-radius: 0 12px 12px 12px; /* 左上角省略 */
  padding: 11px 14px;
  font-size: 14px;
  line-height: 1.65;
}
```

**主 Bot 消息（左对齐，强调）**

```css
.bubble-primary {
  background: #f0f7ff;
  color: #0f172a;
  border-radius: 0 12px 12px 12px;
  border-left: 3px solid #2563eb; /* 品牌色左边框区分 */
  padding: 11px 14px;
  font-size: 14px;
  line-height: 1.65;
}
```

**错误消息**

```css
background: #fef2f2;
color: #b91c1c;
border: 1px solid #fecaca;
border-radius: 0 12px 12px 12px;
```

**流式输出光标**：消息末尾插入 `<span class="cblink">` 元素（见 §6 动效）。

---

### 5.7 输入框（Input / Textarea）

**单行输入**：

```css
background: #FAFAFA ~ #F8FAFC;
border: 1px solid #E5E7EB;  border-radius: 8px;
padding: 8px 12px;  font-size: 14px;
focus: border-color: #93C5FD;
       box-shadow: 0 0 0 3px rgba(147,197,253,0.25);
transition: border-color 0.15s, box-shadow 0.15s;
```

**聊天输入区（Textarea 容器）**：

```css
/* 外层容器 */
background: #F8FAFC;
border: 1.5px solid #E5E7EB;  border-radius: 12px;
padding: 11px 14px;
focus-within: border-color: #93C5FD;
              box-shadow: 0 0 0 3px rgba(147,197,253,0.2);

/* Textarea 自身 */
border: none;  outline: none;  background: transparent;
font-size: 14px;  line-height: 1.6;  resize: none;
max-height: 100px;  overflow-y: auto;
```

---

### 5.8 卡片（Card）

```css
background: #fff;
border: 1px solid #E5E7EB;
border-radius: 12px;
padding: 16px ~ 20px;
transition: box-shadow 0.16s, transform 0.16s;

hover:
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  transform: translateY(-1px);  /* 轻微抬升 */
```

**Bot 管理卡片选中态**：

```css
border-color: #93c5fd;
box-shadow: 0 4px 12px rgba(37, 99, 235, 0.1);
```

---

### 5.9 对话框（Dialog）

```css
/* 遮罩 */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.25);
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}

/* 对话框主体 */
.dialog-box {
  background: #fff;
  border-radius: 14px;
  width: 440px ~480px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  padding: 24px;
  /* 入场动画 */
  transform: translateY(8px) scale(0.98);
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
.dialog-overlay.open .dialog-box {
  transform: translateY(0) scale(1);
}
```

---

### 5.10 右侧抽屉（Drawer）

```css
position: fixed;  top: 0;  right: 0;  bottom: 0;
width: 480px;
background: #fff;
box-shadow: -8px 0 32px rgba(0,0,0,0.08);
z-index: 30;
transform: translateX(100%);
transition: transform 0.25s ease;

.open: transform: translateX(0);
```

---

### 5.11 Toast 提示

```css
/* 基础 */
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  z-index: 999;
  transform: translateY(16px);
  opacity: 0;
  transition:
    transform 0.22s ease,
    opacity 0.22s ease;
  pointer-events: none;
}
.toast.show {
  transform: translateY(0);
  opacity: 1;
}

/* 变体 */
.toast-success {
  background: #fff;
  color: #15803d;
  border-left: 4px solid #16a34a;
}
.toast-error {
  background: #fff;
  color: #b91c1c;
  border-left: 4px solid #dc2626;
}
```

---

### 5.12 代码块（Code Block）

```css
.msg-code {
  background: #1e293b;
  color: #e2e8f0;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px ~12.5px;
  padding: 10px 13px;
  border-radius: 7px;
  line-height: 1.6 ~1.7;
  overflow-x: auto;
  white-space: pre;
  margin-top: 7px;
}
```

---

### 5.13 标签页（Tabs）

```css
/* 容器：下边框分隔 */
border-bottom: 1px solid #e5e7eb;
display: flex;

/* 各 Tab 按钮 */
padding: 9px 14px;
font-size: 13px;
font-weight: 500;
border: none;
background: transparent;
cursor: pointer;
color: #64748b;
border-bottom: 2px solid transparent;
transition:
  color 0.14s,
  border-color 0.14s;

/* 选中态 */
.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
}
```

---

### 5.14 滚动条

```css
::-webkit-scrollbar {
  width: 5px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
```

---

## 6. 动效规范

### 6.1 过渡时长阶梯

| 时长  | 适用场景                     |
| ----- | ---------------------------- |
| 100ms | 即时反馈（按钮 active 缩放） |
| 120ms | 快速 hover（颜色、背景）     |
| 150ms | 边框颜色、字色切换           |
| 160ms | 卡片 hover shadow            |
| 200ms | 弹层出现、Tab 切换           |
| 220ms | Toast、对话框入场            |
| 250ms | 抽屉滑入                     |
| 260ms | 导航栏折叠/展开              |

### 6.2 缓动函数

| 函数                           | 用途                                    |
| ------------------------------ | --------------------------------------- |
| `cubic-bezier(0.4, 0, 0.2, 1)` | 标准 Material Motion，用于面板/导航展开 |
| `ease`                         | 通用过渡（悬停、弹层）                  |
| `ease-in-out`                  | 循环动画（打字点、脉冲）                |
| `step-end`                     | 光标闪烁                                |
| `linear`                       | 加载旋转                                |

### 6.3 Keyframe 动画

```css
/* 流式输出光标闪烁 */
@keyframes cblink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
.cblink {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: #0f172a;
  border-radius: 1px;
  animation: cblink 1.1s step-end infinite;
  vertical-align: text-bottom;
  margin-left: 2px;
}

/* 打字指示器（三点跳动）*/
@keyframes td {
  0%,
  60%,
  100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-6px);
  }
}
.tdot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
  animation: td 1.4s ease-in-out infinite;
}
.tdot:nth-child(2) {
  animation-delay: 0.2s;
}
.tdot:nth-child(3) {
  animation-delay: 0.4s;
}

/* 活跃 Bot 脉冲 */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
.pulse-dot {
  animation: pulse 1.4s ease-in-out infinite;
}

/* 消息行淡入 */
@keyframes mfade {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.mrow {
  animation: mfade 0.2s ease;
}

/* 加载旋转 */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.spin {
  animation: spin 1s linear infinite;
}
```

---

## 7. 页面布局模式

### 7.1 四种布局对应页面

所有页面共享"左 Nav + 主内容区"骨架，根据页面类型扩展右侧面板：

```
┌───────┬─────────────────────────────────────────────────────┐
│ Nav   │              主内容区（自适应宽度）                   │
│ 64px  │                                                     │
└───────┴─────────────────────────────────────────────────────┘
```

**布局 A — Bot 管理页**

```
Nav(64) ─ Bot 列表(flex:1) ─ [右侧抽屉 480px，fixed 定位]
```

**布局 B — 私聊页**

```
Nav(64) ─ 会话列表(260) ─ 聊天区(flex:1) ─ Bot 信息面板(280)
```

**布局 C — 群聊页**

```
Nav(64) ─ 会话列表(260) ─ 聊天区(flex:1) ─ 群组信息面板(280)
```

**布局 D — Artifact 页**

```
Nav(64) ─ 会话列表(260) ─ 聊天区(flex:1) ─ Artifact 面板(480)
```

### 7.2 布局实现方式

```css
/* 根容器 */
body {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* Nav */
#left-nav {
  width: 64px;
  flex-shrink: 0;
}
#left-nav.expanded {
  width: 220px;
}

/* 会话侧边栏 */
aside.conv-sidebar {
  width: 260px;
  flex-shrink: 0;
}

/* 聊天主区域 */
main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* 右侧信息面板（常驻型）*/
aside.info-panel {
  width: 280px;
  flex-shrink: 0;
}

/* 右侧 Artifact 面板（常驻型，更宽）*/
aside.artifact-panel {
  width: 480px;
  flex-shrink: 0;
}

/* 右侧抽屉（Bot 管理，fixed 覆盖型）*/
.drawer {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 480px;
  z-index: 30;
}
```

### 7.3 Z-index 层级

| 层级     | 值  | 元素                    |
| -------- | --- | ----------------------- |
| 基础     | 0   | 普通内容、面板          |
| Nav      | 10  | 左侧导航栏              |
| Backdrop | 20  | 遮罩层（半透明黑色）    |
| Drawer   | 30  | 右侧抽屉                |
| Dialog   | 40  | 全局弹层（Modal）       |
| Popup    | 50  | @mention 弹窗、下拉菜单 |
| Tooltip  | 100 | 悬停提示                |
| Toast    | 999 | 全局 Toast 提示         |

### 7.4 响应式策略

当前原型基于桌面端固定布局，无需响应式断点。Tauri 窗口最小宽度建议设为 `900px`，确保三栏布局不压缩。

---

## 8. 与 React 技术栈的对应关系

### 8.1 Design Token → TailwindCSS 配置

将 §1 的所有 Token 注册到 `tailwind.config.ts`：

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 语义色
        bg: "#F7F7F8",
        surface: "#FFFFFF",
        border: "#E5E7EB",
        text: {
          DEFAULT: "#0F172A",
          muted: "#64748B",
          secondary: "#94A3B8",
          tertiary: "#CBD5E1",
        },
        primary: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          light: "#EFF6FF",
          border: "#BFDBFE",
        },
        success: {
          DEFAULT: "#16A34A",
          dark: "#15803D",
          bg: "#F0FDF4",
          border: "#BBF7D0",
        },
        warning: {
          DEFAULT: "#D97706",
          dark: "#92400E",
          bg: "#FFFBEB",
          border: "#FDE68A",
        },
        error: {
          DEFAULT: "#DC2626",
          dark: "#B91C1C",
          bg: "#FEF2F2",
          border: "#FECACA",
        },
        // Bot 状态色
        status: {
          connected: "#10B981",
          connecting: "#F59E0B",
          disconnected: "#94A3B8",
          error: "#EF4444",
        },
        // 代码块
        code: {
          bg: "#1E293B",
          text: "#E2E8F0",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
      fontSize: {
        "10": ["10px", { lineHeight: "1.4" }],
        "11": ["11px", { lineHeight: "1.4" }],
        "12": ["12px", { lineHeight: "1.5" }],
        "13": ["13px", { lineHeight: "1.5" }],
        "14": ["14px", { lineHeight: "1.65" }],
        "15": ["15px", { lineHeight: "1.5" }],
        "17": ["17px", { lineHeight: "1.4" }],
        "20": ["20px", { lineHeight: "1.3" }],
        "24": ["24px", { lineHeight: "1.3" }],
      },
      borderRadius: {
        pill: "20px",
        card: "12px",
        dialog: "14px",
        code: "7px",
        icon: "7px",
      },
      boxShadow: {
        "card-hover": "0 4px 16px rgba(0,0,0,0.08)",
        popup: "0 8px 24px rgba(0,0,0,0.10)",
        drawer: "-8px 0 32px rgba(0,0,0,0.08)",
        dialog: "0 20px 60px rgba(0,0,0,0.15)",
        logo: "0 2px 8px rgba(37,99,235,0.30)",
        "ring-primary": "0 0 0 3px rgba(147,197,253,0.25)",
        connected: "0 0 0 2px rgba(16,185,129,0.2)",
        "error-dot": "0 0 0 2px rgba(239,68,68,0.2)",
      },
      transitionDuration: {
        "120": "120ms",
        "160": "160ms",
        "220": "220ms",
        "250": "250ms",
        "260": "260ms",
      },
      transitionTimingFunction: {
        material: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      width: {
        "nav-collapsed": "64px",
        "nav-expanded": "220px",
        sidebar: "260px",
        "info-panel": "280px",
        "artifact-panel": "480px",
        drawer: "480px",
      },
      zIndex: {
        nav: "10",
        backdrop: "20",
        drawer: "30",
        dialog: "40",
        popup: "50",
        tooltip: "100",
        toast: "999",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

### 8.2 shadcn/ui 组件复用建议

原型中的 UI 模式与 shadcn/ui 组件的对应关系：

| 原型组件                 | shadcn/ui 组件        | 定制要点                                                          |
| ------------------------ | --------------------- | ----------------------------------------------------------------- |
| Dialog / Modal           | `Dialog`              | 修改 overlay 颜色为 `rgba(15,23,42,0.25)`；box `14px` 圆角        |
| 右侧抽屉                 | `Sheet`（side=right） | 宽度 `480px`，shadow `-8px 0 32px`                                |
| Tab 切换                 | `Tabs`                | 下划线样式（非背景块），激活色 `#2563EB`                          |
| Toast 提示               | `Sonner` / `Toast`    | 左侧彩色边框样式，`bottom-right` 位置                             |
| 下拉菜单 / @mention 弹窗 | `Popover` / `Command` | 自定义 Bot 列表项，保留键盘导航逻辑                               |
| 状态徽章                 | `Badge`               | 自定义 `variant`（connected / disconnected / error / connecting） |
| 输入框                   | `Input` / `Textarea`  | 焦点环改为 `ring-primary` shadow 而非默认 ring                    |
| 按钮                     | `Button`              | 三个 variant: `default / ghost / icon`                            |
| 卡片                     | `Card`                | hover 抬升动画，`12px` 圆角                                       |

### 8.3 CSS Class 命名原则

遵循**组件前缀 + 元素 + 状态修饰**的 BEM 轻量变体：

```
{component}-{element}         — 组件结构
{component}-{element}.{state} — 组件+状态
{component}-{variant}         — 组件变体

示例：
nav-btn          → 导航按钮
nav-btn.active   → 导航按钮 选中态
nav-icon-wrap    → 导航图标容器
nav-label        → 导航标签文字

bubble-user      → 用户消息气泡
bubble-bot       → Bot 消息气泡
bubble-primary   → 主 Bot 消息气泡

dot-connected    → 已连接状态点
dot-error        → 错误状态点

av-blue          → 蓝色头像渐变
av-amber         → 橙色头像渐变

rb-primary       → 主Bot路由徽章
rb-mention       → @提及路由徽章
rb-chain         → 链式路由徽章

toast-success    → 成功 Toast
toast-error      → 错误 Toast
```

### 8.4 全局 CSS 基础配置

在 `src/index.css` 或 `src/globals.css` 中设置：

```css
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap");

:root {
  --bg: #f7f7f8;
  --surface: #ffffff;
  --border: #e5e7eb;
  --text: #0f172a;
  --text-muted: #64748b;
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --success: #16a34a;
  --warning: #d97706;
  --error: #dc2626;
}

* {
  font-family:
    "Inter",
    system-ui,
    -apple-system,
    sans-serif;
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}

/* 统一滚动条 */
::-webkit-scrollbar {
  width: 5px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

body {
  background: var(--bg);
  color: var(--text);
}
```

### 8.5 图标规范

使用 **Lucide React**，统一两种规格：

| 用途         | 尺寸  | 调用示例                      |
| ------------ | ----- | ----------------------------- |
| 导航栏图标   | 18×18 | `<Users size={18} />`         |
| 功能操作图标 | 16×16 | `<Settings size={16} />`      |
| 按钮内嵌图标 | 14×14 | `<Plus size={14} />`          |
| 空状态插图   | 48×48 | `<MessageSquare size={48} />` |

`stroke-width` 统一使用 `2`（默认值），不单独调整。

---

_文档由原型分析自动生成，如原型更新请同步本文档。_
