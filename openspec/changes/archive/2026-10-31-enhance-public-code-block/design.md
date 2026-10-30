## Context

公开 CodeBlock 目前委托 CodeText；Markdown 和文件抽屉已经在另一个 change 内接入 shadcn 私有零件。本 change 只升级独立公开 CodeBlock，保留其他入口的现状。

## Goals / Non-Goals

**Goals:** 完整实现确认的 8 个 props；行号默认 false、defaultWrap 默认 true；内置复制与换行操作；提供指向原始 code 的文本批注；导出 CodeBlockProps 并更新作者用法。

**Non-Goals:** 不迁移 Markdown/文件抽屉/DiffView，不清理 CodeText，不开放组合零件或任意插槽，不加入读取文件、下载、执行、编辑、折叠、虚拟列表或受控换行 API。

## Decisions

1. 直接在 CodeBlock 内组合现有私有 shadcn 零件与 Button/Tooltip，提供标题、复制和换行操作。复制复用 host browserAction，保留 pending 按钮焦点、成功/失败 toast 与错误日志。没有新复制协议、重试或权限流程。
2. `code` 保持原文权威；为了逻辑行与已有高亮一致，展示字符串将 CRLF/CR 规范为 LF，保留空行与末尾换行。DOM 文本边界通过已有纯映射工具 `fileTextSegments` 对回原始 code；它不读取文件。复制始终使用未规范化的 code。高亮状态变化后重新注册实际 DOM。
3. 私有代码内容组件负责行与 token，标号为逻辑行 1 起。highlightedLines 是单个闭区间，lineNumbers=false 时仍能高亮。defaultWrap 只初始化本次挂载的状态，用户切换不改变内容或批注。
4. 仅在 annotationTarget 非 undefined 时进入批注桥接组件；复用 annotationKey/registerText 的现有身份与文本注册机制。未开启页面会话时依照现有机制不显示批注控制；不为普通 CodeBlock 强加批注环境。JSON 身份和失效原文沿用现有批注契约，不新增 CodeBlock 专用校验。
5. title 为字符串，省略时使用语言名称；className 作用于根容器。只公开已确认的 8 个 props 与类型，不透传整套 HTML 属性或额外回调。

## Risks / Trade-offs

- DOM 规范化换行、token 拆分可能导致偏移漂移 → 用 CRLF、孤立 CR、Unicode、重复行、尾部空白的实际选区与事件断言验证原文映射。
- 初始纯文本转为高亮会替换 Text 节点 → 布局 effect 重新注册，验证高亮前后及切换内容/语言后的选区与定位。
- 新头部与默认换行改变旧外观，className 目标变化 → 文档明确迁移说明，既有显式横向滚动示例使用 defaultWrap=false。
- 内部存在多个代码入口 → 此为用户明确要求的阶段边界，本轮不以“消除重复”为由扩大迁移。

## Migration Plan

保留现有 code/language/className 调用形态，新增 props 均可省略。通过独立组件浏览器测试、构建、现有 Markdown/文件/diff 回归后交付；不自动提交、发布或归档。

## Open Questions

无阻塞问题。其他组件是否采用该组件留待用户后续决定。
