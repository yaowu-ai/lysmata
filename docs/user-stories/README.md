# Lysmata 用户故事文档

**产品**：Lysmata（OpenClaw 桌面伴侣）
**版本对应**：PRD v2.2 + v2.1（安装/配置向导）
**更新日期**：2026-03-01

---

## 目录结构

| 文件                                                 | 模块                | 优先级 |
| ---------------------------------------------------- | ------------------- | ------ |
| [us-01-onboarding.md](./us-01-onboarding.md)         | 安装向导 & 配置向导 | P0     |
| [us-02-bot-management.md](./us-02-bot-management.md) | Bot 管理            | P0     |
| [us-03-private-chat.md](./us-03-private-chat.md)     | 私聊会话            | P0     |
| [us-04-group-chat.md](./us-04-group-chat.md)         | 群聊                | P1     |
| [us-05-artifact.md](./us-05-artifact.md)             | Artifact 预览       | P1     |
| [us-06-skills.md](./us-06-skills.md)                 | 技能市场            | P1     |
| [us-07-settings.md](./us-07-settings.md)             | 配置中心            | P0     |
| [us-08-system-tray.md](./us-08-system-tray.md)       | 系统托盘 & 快捷入口 | P1     |

## 用户角色定义

- **AI 开发者**：熟悉 LLM API，希望本地管理多个 Agent，重视效率和可控性
- **研究者**：长期运行自主代理，关注任务进度、日志和数据隐私
- **普通用户**：非技术背景，依赖向导和 Marketplace 快速上手

## 用户故事格式

每条用户故事遵循以下格式：

```
### US-{module}-{nn}：{标题}

**作为** {用户角色}，
**我希望** {功能描述}，
**以便** {业务价值}。

**优先级**：P0 / P1 / P2
**验收标准（AC）**：
- AC1：...
- AC2：...
```

## 优先级定义

- **P0**：MVP 必须，无此功能产品无法使用
- **P1**：核心功能，影响主要使用场景
- **P2**：增强功能，提升体验但非必须
