# Lysmata X.com Build in Public 营销计划

> 生成时间：2026-03-10｜基于代码库真实状态制定

## 项目现状速览

| 指标 | 数据 |
|------|------|
| 项目启动日 | 2026-02-16 |
| 今天（公开日） | 2026-03-10，第 23 天 |
| 总提交数 | 109 次 |
| 活跃开发日 | 16 天 |
| 最高产日 | Feb 23（单日 37 次提交） |

### 已完成功能

- ✅ Bot Management（CRUD、搜索、删除确认、连接测试、实时状态灯）
- ✅ Private Chat（SSE 流式打字机、无限滚动、Markdown 渲染）
- ✅ Group Chat（流式响应、基础框架）
- ✅ LLM Settings（多 Provider、模型选择、ProviderFormDrawer）
- ✅ Onboarding Wizard（11 步，环境检测 + 一键安装 + Gateway/Provider 配置）
- ✅ 全局 SSE 实时流（bot 健康/心跳/在线状态）
- ✅ 本地 SQLite 持久化（数据不出机器）
- ✅ macOS .dmg 打包 + GitHub Actions CI/CD
- ✅ WebSocket 指数退避重连
- ✅ Agent 管理（Settings 页）

### 进行中 / 计划中

- 🔄 Group Chat polish（@mention 路由、bot 回复徽章）
- 🔄 Artifact 预览（真实渲染）
- ⏳ Skills 市场
- ⏳ 系统托盘
- ⏳ Windows/Linux 构建

---

## 核心叙事

**主线**：最近一直在外面加班，老婆和孩子想试用 OpenClaw，但安装和配置阻碍了他们——于是在加班间隙做了 Lysmata。

**节奏**：今天（Mar 10）是"公开日"，先回顾 23 天的真实构建旅程，再带着社区一起看后续实时进展。

---

## 发帖规则

- **频率**：公开日 3 条，Mar 11-16 每天 1-2 条，Mar 17-23 每天 1 条
- **语言**：英文为主，触达国际 OpenClaw 社区
- **标签**：`#BuildInPublic` `#OpenClaw` `#OpenSource` `#Tauri`
- **风格**：真实的构建者日记，有数据、有故事、有人情味

---

## 两周日历总览

### 第一周：公开 + 回顾真实构建历程

| 日期 | 文件 | 主题 | 对应真实事件 |
|------|------|------|------|
| Mar 10 | `01-going-public.md` | Origin story | 今天推到 GitHub |
| Mar 10 | `02-23-days-in-numbers.md` | 23天数字回顾 | 109次提交快照 |
| Mar 10 | `03-what-it-does.md` | 功能演示线程 | 产品能力全景 |
| Mar 11 | `01-first-weekend.md` | 第一个周末 | Feb 19-20，架构搭建 |
| Mar 11 | `02-why-tauri-bun.md` | 技术选型 | 为什么不用 Electron |
| Mar 12 | `01-the-big-day.md` | 最高产一天 | Feb 23，37次提交 |
| Mar 12 | `02-streaming-chat.md` | 流式聊天技术 | SSE 打字机实现 |
| Mar 13 | `01-onboarding-wizard.md` | 11步向导 | Mar 1，为家人设计 |
| Mar 14 | `01-private-chat.md` | 私聊全落地 | Mar 2，US-03 完成 |
| Mar 15 | `01-ci-cd-dmg.md` | CI/CD + .dmg | Mar 6，自动打包 |
| Mar 16 | `01-architecture-deep-dive.md` | 架构复盘 | 三层设计原理 |
| Mar 16 | `02-week1-summary.md` | 第一周总结 | 公开周回顾 |

### 第二周：实时进展更新

| 日期 | 文件 | 主题 |
|------|------|------|
| Mar 17 | `01-realtime-sse-stream.md` | SSE 全局流技术深度 |
| Mar 18 | `01-group-chat-progress.md` | Group Chat 改进进展 |
| Mar 19 | `01-family-story.md` | 家庭使用故事 |
| Mar 19 | `02-non-tech-user-view.md` | 非技术用户视角 |
| Mar 20 | `01-artifact-preview.md` | Artifact 渲染进展 |
| Mar 21 | `01-skills-marketplace.md` | Skills 市场路线图 |
| Mar 22 | `01-open-contributions.md` | 欢迎贡献者 |
| Mar 23 | `01-v010-milestone.md` | v0.1.0 里程碑 |
| Mar 23 | `02-thank-you.md` | 感谢社区 |
