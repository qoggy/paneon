# Skill-only usage guidance

## Result and scope

按用户最新指令「只要 skill 就行，不要其他的 agent 指导」，删除独立的 `docs/agent-guide.md`，将仍有用的运行/API 内容收进产品 skill。未改业务页面、SDK/UI、编译器、package/tsconfig、项目 memory 或中央设计/任务文档。PR 资源由另一工作单元交付，本报告不宣称其已完成或验收，也没有链接不存在的 PR 文件。

- SKILL.md 只保留主要流程、真实页面目录和按需引用：标准页直接使用数据，不要求生成 TSX；自定义/一次性展示才编写源码。
- references/cli.md 维护命令输入/结果、版本范围、参数文件创建快照、实例生命周期、events/ack、请求上限和 debug。
- references/authoring.md 维护完整 TSX、serverAction、只读 CLI/HTTP 示例、query 与页面状态、shadcn 组件、Markdown 扩展/Mermaid 和临时凭据 API。原指南的开发验收命令未搬入使用者 skill；现有 package scripts/tests 继续承担开发验证。
- references/feedback.md 提供可复制完整页面，包含 Provider/hook、对象/文字、adapter 和默认控件；说明语义校验、准确原文、提交失败、标准页完整更正与自定义策略的边界。复杂 Markdown/diff 直接引用已交付 skill 适配器，不复制状态机。
- examples/README.md 仅作为开发能力样例目录，指出产品资源所在 skill，不再维护另一套使用者 agent 流程。
- 按已确认 CLI 安装入口方向，移除“寻找 npm 包并手工复制”作为最终产品安装流程的文字。如实标注安装命令尚未实现，没有捏造命令或新增安装器；未来 update 不在此工作单元实现。

使用了 paneon-memory 和 skill-dev：只读项目相关约定，按需拆分 CLI、编写代码和反馈三条路径；未改全局记忆。

## Verification

2026-10-21，在独立 worktree、Node.js 24、基线 19b9486 上完成：

- npm ci --prefer-offline --no-audit --no-fund 通过；未改变 lockfile。
- fresh worktree 首次 npm run build 在 typecheck 阶段失败：现有 tsconfig.node.json 经 tests 引入 skill schemas，而 paneon/sdk 声明指向尚不存在的 dist，引发 TS2307。该问题已报告主 agent；本组没有改配置或声称已修复。先运行现有 build:cli/build:ui 生成声明后，完整 npm run build 通过（typecheck/CLI/UI/web）。
- 临时脚本 `/tmp/paneon-guide-check.mjs` 从 Markdown 提取代码，通过真实 compilePanel 完整 typecheck、浏览器和服务端 bundle：authoring-complete、feedback-complete、server-actions、query-states、markdown-mermaid、credential 六组全部通过。片段补入明确的组件/依赖上下文，临时 fixtures 和构建输出已删除，没有新增产品测试页或持久脚本。CLI/API 动作未实际调用外部系统；本项不声称浏览器交互验收或业务接口测试。
- 检查整个 skill 的 Markdown 和 examples README：11 份文件、48 个相对链接/锚点全部存在；不存在对独立 agent-guide 的依赖，删除的文件确实不存在。
- skill-dev quick_validate.py skills/paneon 通过。
- 本组全部 Markdown 文件 Prettier 检查及 git diff --check 通过。

只交付本地提交，不推送、不自行合入或清理 worktree。安装命令实施、PR 集成、最终主 agent 验收及用户 Sentinel 体验由中央任务继续跟踪，不在这里勾选已完成。

## Changed files

合入后的完整路径如下（实现 worktree 为 /Users/yuguo/.codex/worktrees/skill-guides/paneon）：

- /Users/yuguo/IdeaProjects/paneon/docs/agent-guide.md（删除）
- /Users/yuguo/IdeaProjects/paneon/examples/README.md
- /Users/yuguo/IdeaProjects/paneon/skills/paneon/SKILL.md
- /Users/yuguo/IdeaProjects/paneon/skills/paneon/references/authoring.md
- /Users/yuguo/IdeaProjects/paneon/skills/paneon/references/cli.md
- /Users/yuguo/IdeaProjects/paneon/skills/paneon/references/feedback.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/reports/guides.md
