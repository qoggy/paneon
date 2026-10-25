## Why

Agent 需要通过可操作的界面与人交流、展示信息并接收反馈。Paneon 当前只有 CLI 和 React 工程骨架，尚不能运行 AI 编写的交互面板，也不能在 agent 停止后保留人的操作供下次读取。

## What Changes

- CLI 按对象分为 panel 和 server 两组；通过 `paneon panel run` 加载本地 TypeScript/TSX 面板源码、按需启动服务并返回浏览器访问地址，已有面板通过 `paneon panel inspect` 获取当前服务的普通访问链接，无需重新创建；浏览器访问不引入登录或链接有效期，通过 loopback、Host/Origin 检查拒绝跨站操作；普通 agent 通过命令行即可使用。
- CLI 帮助、提示、错误说明和框架诊断统一使用英文，用户提供的数据原样保留；显式 `--debug` 开启当前命令的框架调试信息，写入 stderr，不污染 stdout JSON。
- 每个面板默认自动 reload；agent 可在运行时通过 `--watch` / `--no-watch` 选择是否监听源码变化，手动 reload 始终可用；源码更新复用 Vite/React 现有能力，不自建热更新机制或保留旧执行环境等待调用完成。
- 提供 React SDK 和基于 shadcn/ui 的默认组件及布局；第一期直接沿用 shadcn 官方默认主题和组件样式，不另定 Paneon 视觉规范，让 AI 用代码组合界面和行为，通常无需编写样式。组件范围包含 Button、Input、Label、Field、Card、RadioGroup、Checkbox、Textarea、Select、Badge、Alert、Spinner、Table、Pagination、Tabs、Dialog、AlertDialog、Accordion、Collapsible、Tooltip、DropdownMenu、Popover、Switch、CodeBlock、Markdown，并提供 Page、Section、Stack、StatusBadge 组合及组件族必要的配套导出。
- 支持在同一份面板源码中声明服务端动作；编译时分离浏览器组件与本地动作，运行时通过类型化代理通信。
- 支持逐控件选择“直接执行本地动作”或“记录事件交给 AI”；直接动作是面板作者编写的普通本地函数。
- 提供独立于 agent 生命周期的本地服务，持续承载面板、本地函数调用和运行状态通知。
- 持久化人机交互事件与消费位置，支持正在等待的 agent 接收事件，以及手动恢复后的 agent 增量读取。
- 面板通过 `requires.paneon` 声明依赖的 Paneon 包版本范围；CLI、SDK、组件与服务同包发布，不再维护独立 SDK 契约编号。版本满足后仍执行类型检查和编译，不自动安装旧版本或改写源码。
- 保存源码、可导入的普通 TypeScript 模块及版本范围声明为本地复用面板定义；运行记录与源码解耦。
- 提供示例和 agent 使用指南，验证真实的源码加载、点击、本地函数返回、查询刷新和跨进程事件读取闭环；CLI 和 HTTP 调用仅作为面板作者代码的使用示例。
- 提供可复制修改的 TSX 页面组合示例，并增加至少一个真实 CLI/OpenAPI 接入示例，选用 gh CLI 的仓库/PR 操作面板；业务调用留在示例代码中，核心不绑定这些工具。

## Capabilities

### New Capabilities

- `code-first-panels`：本地 TSX 面板、默认组件、源码复用与浏览器/服务端代码边界。
- `local-panel-runtime`：CLI 命令、本地服务、面板实例生命周期、浏览器通信和状态推送。
- `panel-actions`：直接动作、交给 AI 的动作、通用本地函数调用、返回值/错误反馈与查询刷新。
- `durable-agent-events`：持久化事件、增量读取、显式确认与跨会话恢复。

### Modified Capabilities

无。当前仓库没有已有 capability specs。

## Impact

- 仓库：`paneon`；开发分支：`0.0.x`；基线：`9f2685d829d37b655f85a80ecb2533107e8f6782`。
- 扩展现有 Commander CLI、React 入口、Vite 配置和 TypeScript 构建；新增 SDK、编译器、本地运行时、持久化和示例模块。
- 沿用 Node.js 24、TypeScript、React、Tailwind CSS、Vite 和现有 `node:test`；引入 Fastify、Zod、shadcn/ui 所需组件依赖、CodeBlock 所需的 Shiki 高亮依赖、Markdown 所需的 react-markdown/remark-gfm/github-markdown-css、SQLite 驱动及 semver 范围校验库。面板运行所需编译依赖随产品分发。
- 新增本地 HTTP/消息桥和 SSE 协议、`paneon/sdk` / `paneon/ui` 包导出、运行目录及数据库结构。
- 本变更不接入真实企业发布系统，不执行预发部署，不发布 npm 包或推送代码；本次开发按 distributed-development 要求在验收后本地集成并 commit。验收覆盖纯函数、示例作者自行接入的本地 CLI 和 HTTP 服务，验证通用调用能力。
- MCP、特定 agent 的嵌入与自动唤醒、通用自由 HTML 原型批注、云托管和共享密钥库不在本次变更范围。
- Paneon 不提供业务调度、监控、日志采集/存储、重试或业务结果持久化；不内置 CLI 执行器、CLI 适配协议或业务任务系统。以上行为由面板作者的代码及其依赖自行决定。
