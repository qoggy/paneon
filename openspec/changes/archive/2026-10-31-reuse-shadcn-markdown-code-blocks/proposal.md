## Why

Markdown 正文代码块和引用文件预览分别维护头部、代码布局与行样式，已有 shadcn Code Block 能够承担这些通用展示职责。先统一 Markdown 内部的代码展示底座，可以减少重复实现，并在后续 file-review 工作之前验证上游组件与精确批注的兼容性。

## What Changes

- 采用固定来源的 shadcn Base 版 Code Block 组合组件及其匹配样式，作为 Markdown 内部的共享展示底座。
- 正文围栏代码块复用上游头部、标题、操作区和内容容器，保留语言标签、复制、换行开关及现有默认行为。
- 引用文件抽屉的内容区复用上游行号与逐行高亮，将已有 `#Lx-Ly` 映射为行高亮，并保留目标行自动滚动。
- 保留正文源文映射、引用文件快照和 sourceRef 语义；高亮、换行、复制和批注定位均不得改变原始文本坐标。
- 保留宿主 browserAction 复制路径、异步反馈和可观察的错误处理，不直接采用上游忽略复制失败的行为。
- 本次仅整理 Markdown 内部：正文代码块仍默认不显示行号，抽屉仍显示行号；不增加正文围栏高亮语法、新公共 props 或 file-review 功能。

## Capabilities

### New Capabilities

- `markdown-code-block-presentation`：正文代码块与引用文件内容共享 shadcn 展示组件，保持原文、批注、交互默认值和读取边界。

### Modified Capabilities

无。现有公开 Markdown、CodeBlock、文件读取及批注协议要求保持有效；本提案新增内部展示组合和行为保持的验收约束，不替换现有主规格中的能力。

## Impact

- 实现涉及 `src/ui/markdown-code-block.tsx`、`src/ui/file-preview.tsx`，以及内部共享组件、文件源文逐行适配和局部样式；正文继续复用现有 MarkdownCode 的映射与高亮。
- 上游来源、版本、摘要和适配说明记录于 `src/ui/upstream.json`，保留许可证；处理匹配的 Code Block 样式，不升级全量 shadcn 主题。
- 使用现有高亮基础设施，不增加高亮语言、运行时下载或第三方依赖，不改变公开 CodeBlock API、DiffView 或 Git review 行为。
- 回归正文代码批注、Markdown 引用文件、frontmatter 原文代码块及作者自定义渲染路径，覆盖深浅主题、中英文和桌面键盘交互。
- 本变更独立于 `upgrade-review-to-file-review`：不修改该提案、不实施其中任务。主规格同步、归档、发布及版本更新不在本次实施范围内。
