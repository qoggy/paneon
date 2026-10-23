## Why

Git 面板目前将 snapshots、listings 和 histories 放在后台 session Map 中。批注校验及后续读取依赖这些 Map，导致后台进程无法作为可丢弃执行环境；组件调用方还要理解整页内部状态。用户希望组件可独立复用，Diff 核心输入是两个字符串，分支/提交/改动组件接受仓库和版本等明确 props 并封装 Git serverAction。

## What Changes

- 让 Git 读取请求显式携带仓库、版本、路径和分页上下文，移除必需的后台 session/snapshot/listing/history 状态。
- 将分支列表、Commit 图和改动文件读取组合为可复用组件/配套数据层，明确 props 和选择回调；面板只负责组合。
- 浏览器保留当次展示数据，批注携带其来源、原文证据和坐标，后台以纯函数校验完整请求后提交事件。
- 保留现有性能成果，Git 面板交互、UI 和布局保持不变；不开发 panel 休眠、进程池或其他资源管理功能。
- **BREAKING**：首版未发布，直接调整 Git 内部请求/结果和场景事件结构，不增加旧 session 接口兼容层；通用 annotations/comment/replacesEventId 语义保留。

## Capabilities

### New Capabilities

- `stateless-git-review`: 可独立组合的 Git 组件、显式 Git 读取请求、浏览器拥有的批注原文及无旧后台状态提交。

### Modified Capabilities

无。本 change 专门实施 Git 面板改造；资源生命周期设计仍待评审，不由本任务实施。共享 Diff 改动不得破坏 PR 和其他使用方。

## Impact

仓库 paneon，分支 0.0.x，基线 a32404d8d97fef89fa0eb86f3e76bf1c00081aea。实现放独立 worktree；主工作区的 shutdown、runtime logging、resource lifecycle 设计及 memory 改动不得夹带。
