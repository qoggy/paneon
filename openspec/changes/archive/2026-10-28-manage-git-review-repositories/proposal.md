## Why

Git review 的仓库列表只能由 AI 启动时配置，人无法自行增删。需要让人直接管理本次审阅的本地仓库，同时保证未提交意见不丢失、已提交意见不被后续更正意外撤回。

## What Changes

- 提供绝对路径输入和“浏览…”目录选择入口，验证真实 Git 工作树并去重。
- **BREAKING**：仓库路径仅接受绝对路径，不再按 cwd 解析相对路径。
- 当前仓库不可移除；非当前仓库存在未提交新增、修改或删除的批注时不可移除。
- 仓库列表只保存在当前浏览器会话；重新加入仓库读取当前内容。
- 批注事件携带真实仓库路径，对初始配置与人工添加的仓库使用同一结构；移除不撤回已提交意见。

## Capabilities

### New Capabilities

- `git-review-repository-management`: 会话内仓库添加、目录选择、去重和有条件移除。

### Modified Capabilities

- `paneon-agent-skill`: Git review 的绝对路径输入与自足批注来源约定。

## Impact

影响 Git review 面板、server actions、批注来源和校验、技能引用文档、自动化及浏览器测试。复用现有 UI 组件，不新增依赖，不修改正在进行的批注编辑器改造。
