## Why

公开 CodeBlock 目前仅提供高亮文本，面板作者仍需自行补齐复制、换行、头部和批注接入。用户已确认以少量语义 props 提供完整代码阅读体验，并明确本轮只实现独立公开组件。

## What Changes

- 公开完整的 `CodeBlockProps<TRef>`：`code`、`language`、`title`、`lineNumbers`、`defaultWrap`、`highlightedLines`、`annotationTarget`、`className`。
- 内置 shadcn 头部、复制、换行切换、逻辑行高亮；行号默认关闭、换行默认开启。
- 接入现有页面批注会话，复制与批注以传入的原始 code 为权威。
- **BREAKING**：CodeBlock 增加头部、默认换行；className 从旧 pre 转至根容器，既有面板针对 pre 的样式需要确认。
- 不修改 Markdown、文件抽屉、DiffView 的实现或接入，不公开组合零件。

## Capabilities

### New Capabilities

- `public-code-block`: 独立 CodeBlock 的完整公开 API、阅读交互和原文批注。

### Modified Capabilities

- `code-first-panels`: 更新原有代码文本组件要求，明确默认换行及可切换的横向滚动。

## Impact

影响 src/ui/code-block.tsx、公开类型声明、CodeBlock 浏览器回归、示例和 authoring 文档；复用已有 shadcn 内部零件、高亮和页面批注机制。不新增依赖、文件读取、运行时端点或业务提交策略。此前未提交的 Markdown 工作保留原状，不在本 change 中迁移其他消费者。
