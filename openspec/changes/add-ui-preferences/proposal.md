## Why

用户需要统一设置 Paneon 的主题和界面语言，并通过明确的管理导航进入设置。原有文档已记录实现、验收与后续导航调整，但缺少 proposal 和 delta specs，导致此目录虽被 list 列出，却未进入 validate --all 的 change 校验。

## What Changes

- 提供用户级 light/dark 与 en/zh-CN 偏好，默认 light/en，统一保存到 ~/.paneon/config.json；CLI config get/set 和网页设置复用同一链路。
- 实时更新宿主、iframe、公共组件和标准页面的 Paneon 自带文案/主题；保留业务原文、草稿、批注、查询与事件语义。
- 管理界面采用面板 / 服务 / 设置三个顶部导航，路由为 /、/server、/settings；设置是独立页面，即时保存。
- 服务页只读展示真实 health 数据；具体 /panels/:instanceId 不加入管理导航。
- 本次整理补齐已有设计的 OpenSpec 表达，不新增功能、产品决策或验收结论；原设置弹窗已由同一 change 内的 settings-navigation-design.md 覆盖。

## Capabilities

### New Capabilities

- `ui-preferences`: 用户级主题/语言持久化、跨页面同步及业务状态保持。
- `management-navigation`: 管理页导航、独立设置页与只读服务状态。

### Modified Capabilities

无。基础能力仍在未归档 change 中；这里记录已确认的扩展，不重写其他 change 的初版要求。

## Impact

已有实现涉及 CLI/config、runtime preferences、公共 UI Provider、宿主 bridge、标准页面字典及管理界面路由，不增加业务数据库或项目级配置。设计与验收沿用 design.md、settings-navigation-design.md、verification.md 和 settings-navigation-tasks.md；任务统一由 tasks.md 统计。本文和 specs 于 2026-10-25 补齐，不表示重新执行了历史验证。
