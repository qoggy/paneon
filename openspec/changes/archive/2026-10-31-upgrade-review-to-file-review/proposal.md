## Why

现有 review 一次只能审阅一份 Markdown，无法直接把方案、代码和配置作为一组成果交付并收集反馈。升级为 file-review 后，用户可以在保留原始文件关系的同一页面阅读、跨文件批注并统一提交；单篇文档仍保持简洁的阅读体验。

## What Changes

- **BREAKING**：用 `assets/panels/file-review/panel.tsx`、definition id `file-review` 和 `file-review-submitted` 替换旧 `review` 入口、id 和事件，不保留旧输入或入口别名。
- 接受可选标题及非空文件路径字符串数组 `files: string[]`；相对路径基于面板 cwd 解析，文件树和标题使用传入路径，不要求 Git、文件 id、展示别名或内容内联。
- 多文件采用左侧文件导航、右侧预览，支持目录/平铺切换、目录匹配文件数、父路径提示、路径搜索和可调整分栏，工具栏保留分组、展开和折叠，文件单击打开；单文件默认隐藏文件树。
- `.md` / `.markdown` 使用现有 Markdown 组件，其他 UTF-8 文本复用现已公开的 CodeBlock，显式开启行号和初始横向滚动；现有语法不支持的文本使用纯文本模式。
- 复用现有 CodeBlock 的批注注册、原文映射、复制和换行能力，通过页面批注 adapter 恢复文件预览并定位，不增加 CodeBlock props 或 ref handle，不迁移 Markdown 的内容渲染。
- 按需读取并保留浏览器内的原文快照，支持跨文件批注、定位、统一提交及完整修正；公开事件按文件嵌套批注，只携带实际绝对路径、快照和批注内容，不暴露批注 id、fileIndex 或内部 ref，不重复完整文件。
- 路径栏文字复用现有选区批注交互；对外只新增 `{path: {quote}}` target，正文 target 与其余提交结构不变，不增加 pathText 或 displayPath。
- 首版仅支持只读 UTF-8 文本及明确文件清单，不包含目录扫描、编辑、自动监听更新、图片/PDF/二进制主预览或新增语法包。

## Capabilities

### New Capabilities

- `file-review`：明确文件清单的导航、类型预览、快照保留、多文件精确批注与统一提交。

### Modified Capabilities

- `paneon-agent-skill`：将单份 Markdown review 契约替换为 file-review，更新入口发现、输入输出说明和迁移约定。

## Impact

- 后续实现涉及 `skills/paneon/assets/panels/review/` 到 `file-review/` 的替换、Skill 入口表及 reference、review 相关 fixtures 和测试。
- 复用共享 Tree、FileReviewSplit、Markdown、CodeBlock、批注及提交基础能力；公共 UI API 保持不变。CodeBlock 已有能力由 `public-code-block` 主规格覆盖，不在本提案重复声明为新能力。
- 文件读取通过现有 serverAction，复用有界 UTF-8 文本读取规则；不新增 runtime 文件 HTTP 接口、服务端快照仓库或第三方依赖。
- Git review 和 Diff review 的业务行为及事件保持原状；若提取共享辅助函数，须验证无回归。
- Markdown 与 CodeBlock 已共用私有 CodeBlockFrame，分别保留内容渲染和批注映射；CodeText 仅供 DiffView 使用，无人使用的行号、整行高亮和 onReady 已删除，本提案不恢复这些分支或公开内部组合零件。
