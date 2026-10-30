## Context

改动前，Markdown 正文经 `MarkdownCodeBlock` 渲染围栏代码，手工组合语言标题、复制和换行按钮；`MarkdownCode` 在已有源文包装节点内着色，以保留批注映射。引用文件则由 `FilePreviewSheet` 读取并管理快照，`PreviewSource` 使用 CodeText 显示行号、链接指定行的背景和目标行滚动，并注册文件批注。

shadcn 已提供 CodeBlock、Header、Title、Actions、Content 和 Line 组合组件。相关权威来源为 [Code Block 文档](https://ui.shadcn.com/docs/components/base/code-block) 和 [Base 版源码](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/code-block.tsx)。源码中的 `cn-code-block-*` 类依赖匹配样式；Content 的字符串行号分支会移除一个末尾 LF，Line 会为无内容行补充换行，因此直接替换 DOM 不足以证明批注坐标保持正确。

本变更独立于现有 `upgrade-review-to-file-review`，不执行其任务或修改其产物。规划完成后，用户已明确要求实施本变更。

## Goals / Non-Goals

**Goals:**

- 两个 Markdown 内部入口共享固定来源的 shadcn Code Block 展示组件，减少自有头部、行布局和行背景样式。
- 保留正文代码块的语言标签、默认换行和宿主复制，以及抽屉既有行号、行高亮、定位与空态。
- 保持正文源文与文件快照的精确批注、草稿、定位、显式提交及修正语义。
- 在不增加调用参数的情况下保持现有 Markdown 与公开 CodeBlock 调用可用。

**Non-Goals:**

- file-review、多文件导航、公开 CodeBlock API 改造、DiffView/Git review 重构及 CodeText 全局删除。
- 新增正文围栏参数、高亮语法、行号开关 UI、代码块文件名语法或代码编辑能力。
- Markdown 解析器迁移、替换现有语法高亮引擎、增加语法包或运行时外网加载。
- 修改文件读取、图片/Mermaid、快照存储、批注事件结构、服务端接口或事件限额。
- 全量 shadcn 版本或主题升级、重新设计抽屉外壳、移动端专项适配。

## Decisions

### 实施前的人类决定

2026-10-31 实施前已读取 Paneon Choose 实例 21 的 `answers-submitted` 事件 9。用户选择：采用 shadcn 默认外观；正文不显示行号、抽屉显示；正文默认换行、抽屉默认横向滚动。三项均确认本设计的默认值，无额外选项说明。实施按这些选择执行，批注与复制语义仍按下述约束保留。

### 将上游组合组件作为内部底座

在 UI 内部引入一份固定来源的 Code Block primitives，可用单独内部模块和局部命名避免与公开 `CodeBlock({code, language, className})` 冲突；不从 `src/ui/index.ts` 增加导出，也不把内部接入方法写进 Skill 公共用法。

实施时记录实际采用的上游 commit/registry 来源、代码与必要样式摘要、许可证和适配说明。采用与当前 Base/Neutral 基线匹配的 Code Block 样式，不复制只有 `cn-code-block-*` 占位类的源码后再自行设计另一套皮肤。已有依赖足以承担布局与高亮；若实际发现新增依赖或全局主题迁移不可避免，先据证据调整设计，不隐式扩大变更。

实施采用上游提交 `b8d7baa15b1dca5716f13153e63795fc3d741f6b` 的 Base Code Block 和 `style-nova.css` 中对应规则，来源、SHA-256 与局部适配见 `src/ui/upstream.json`。内部组件位于 `code-block-primitives.tsx`，配套样式单独保存在 `code-block-primitives.css`；文件逐行与异步高亮注册接入位于 `file-source-code.tsx`。

相比继续扩展 CodeText 的样式，这条路径直接复用上游组合与可访问性；相比把上游整个组件族立即变成公共 API，它不引入当前任务之外的迁移负担。CodeText 继续服务未在范围内的现有调用者。

### 正文头部和内容复用上游，交互语义由现有适配层保留

正文组合结构为：

```text
MarkdownCodeBlock（内部适配）
└─ 上游 CodeBlock
   ├─ CodeBlockHeader
   │  ├─ CodeBlockTitle（现有语言标签与图标）
   │  └─ CodeBlockActions（现有复制与换行控件）
   └─ CodeBlockContent（wrap 状态、原文映射和语法着色）
```

正文继续默认 `wrap=true`、不显示行号。代码区域横向滚动时头部位置不变；换行按钮保留受控状态、aria-pressed、键盘操作及中英文说明。复制继续取现有代码子节点对应的代码字符串，不复制标题或按钮文本，不借重构改变已有解析后文本中的 CRLF、空白和末尾换行行为。

`CodeBlockActions` 内沿用现有通过 browserAction 调用宿主的复制控件，保留 pending、禁用、键盘焦点和成功/失败 toast。上游 CopyButton 的直接剪贴板调用不进入这条路径；仅传入一个 onClick 不足以替换其内部调用，不允许出现双重复制或空 catch。复用上游头部结构不要求采用不兼容的复制副作用。

清理 `styles.css` 中被组件替代的手写圆角、头部、pre 布局与行背景规则，只保留隔离 github-markdown-css 与必要布局的规则。采用上游默认视觉；现有颜色 token、深浅主题及正文以外区域不得被局部规则覆盖。

### 引用文件复用行号与已有行高亮，不新增一个重复头部

FilePreviewSheet 仍负责读取、快照、文件标题、复制路径、关闭、宽度和焦点。PreviewSource 改用同一上游 Content/Line 显示文件内容，继续显示行号；文件头部仍使用现有 SheetHeader，不在内容区再叠加 CodeBlockHeader。

保持现有 href 解析及一基行号范围，把 `#Lx-Ly` 中的闭区间映射到 `CodeBlockLine variant="highlighted"`，保留可定位行标识。无锚点时没有行高亮；终点超过实际行数时沿用现有截断显示，起点超界时沿用范围外提示，不生成虚构文件行。打开后仍把目标行滚动到视口约三分之一位置。

PreviewSource 保留语言推断、原文范围适配、注册及卸载清理；Empty 空态和 FilePreviewSheet 的加载/读取错误呈现保持。它不承担另一套行号或行背景样式，也不移动文件读取职责。

### 高亮暂复用现有基础，新增精确的逐行适配

继续使用 `useCodeHighlighting` 及现有已打包语法和主题。正文保留 MarkdownCode 对 `data-source-leaf` 包装和作者自定义 rehype 内容的处理；文件预览仍以完整文件源文作为批注依据。逐行组织与上游 Line 的衔接由内部适配层完成，不为每一行单独创建完整高亮请求。

仅在需要行号/行高亮时使用逐行结构。处理正文映射节点时保留或精确拆分每段 `data-source-offsets`，不可把原节点全部扁平化成普通字符串后丢失来源。文件显示的 CRLF/孤立 CR 归一化继续映射回原始 UTF-16 字符串。所有传给批注注册的 Text 节点必须与原文边界一一对应；装饰行号、头部和操作控件不进入映射。

不得直接依赖上游字符串行号分支的末尾 LF 删除或空行补字符来确定批注文本。适配层显式保留原文与显示分段的关系，覆盖中间/连续/末尾空行、最后一行无换行及解析器生成的最终换行。DOM 变化和异步着色完成后更新注册，不根据 quote 全文搜索来猜位置。

### 保持可定制 Markdown 的边界

Mermaid 围栏仍交给原有 Mermaid；行内代码保留现有处理。作者覆盖 `components.pre`、`components.code` 或通过 rehype 添加自定义标记的场景沿用现有控制边界，不强行转成上游逐行组件或覆盖作者的高亮。

frontmatter 无效 YAML/关闭识别等路径若复用 MarkdownCodeBlock，只随共享内部展示变化，不改变解析、源文显示、报错或批注坐标。

### 先证明行为保持，再完成替换

复用现有 `markdown-highlighting`、`file-references`、frontmatter 和批注验收，补齐上游逐行结构带来的边界用例。测试关注原文范围、复制文本、目标行、草稿及事件，而不是只断言用了某个组件名称。验收结束后删除当前范围内失去用途的手写实现，不保留旧渲染分支作为静默降级；范围外 CodeText 与 DiffView 调用不重构。

## Risks / Trade-offs

- [上游逐行布局改变 Text 节点和换行] → 保留独立原文，验证普通/连续/末尾空行、CRLF、孤立 CR、Unicode、嵌套引用和跨行选区；映射失败必须定位原因，不能回退到近似偏移。
- [样式类需要生成的上游配套样式] → 核对完整 registry 产物及主题来源，只纳入本组件需要的匹配样式；记录固定摘要，避免全局升级。
- [github-markdown-css 覆盖新组件] → 通过局部容器边界和必要选择器隔离，回归正文、链接抽屉及其他控件的深浅主题。
- [复制绕过宿主或失败不可见] → 保留 browserAction、pending/focus 和可观察错误处理，验证只执行一次宿主复制且失败保留用户反馈。
- [视觉重构误伤批注生命周期] → 用真实 UI 验证正文/文件批注保存、关闭重开、快照定位、磁盘变更后定位/提交和完整修正，保持 ref/sourceRef 及事件结构。
- [整理扩展成公共组件重做] → 内部 primitives 不公开；公开 CodeBlock、DiffView 和 file-review 留在各自后续工作范围。

## Migration Plan

实施先引入并记录固定上游组件与样式，再替换正文头部/容器，接着替换抽屉行号与行高亮并验证原文映射，最后清理重复样式和完成相关回归。无需调用方输入迁移、数据库迁移或旧事件转换。

现有 `upgrade-review-to-file-review` 不作为依赖，也不在本变更里修订；未来推进该提案时，应以本变更实施后的实际公共能力重新评估其 CodeBlock 任务，不能假设内部复用已经公开了新 API。

若实现验证失败，应以最小复现定位并修复；交付前撤回未通过的组件替换可保持现有可用版本，不引入运行时自动降级或双实现长期并存。本次实施不包含归档、发布或版本更新。

## Open Questions

无待定产品决策。上游固定版本、样式产物和逐行适配位置已记录；它们不构成增加正文高亮语法或修改公开 API 的授权。
