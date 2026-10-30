# Public Code Block Specification

## Purpose

Provide a complete standalone CodeBlock with built-in reading controls, logical line presentation and exact source annotations through the existing page session.

## Requirements

### Requirement: Expose one complete public CodeBlock API

系统 SHALL 公开 CodeBlock 与 CodeBlockProps<TRef>，仅包含 code:string、language?:string、header?:boolean|string、lineNumbers?:boolean、defaultWrap?:boolean、highlightedLines?:{start:number;end:number}、annotationTarget?:TRef、className?:string。code SHALL 为唯一必填属性，header SHALL 默认为 true，lineNumbers SHALL 默认为 false，defaultWrap SHALL 默认为 true。header SHALL 替换原 title 属性，不提供独立 title 或 showHeader 参数。className SHALL 作用于整个代码块根容器。内部 shadcn 组合零件 SHALL 保持私有。

#### Scenario: Render with minimal input

- **WHEN** 作者仅传入 code
- **THEN** 代码块以纯文本呈现，显示默认标题、复制和换行操作，不显示行号，默认开启换行，不自动启用批注

### Requirement: Provide built-in reading controls

CodeBlock SHALL 内置标题、复制和换行控制。header 省略或为 true 时 SHALL 显示语言名称，未指定语言时 SHALL 显示 Plain Text；header 为字符串时 SHALL 使用该字符串作为标题。header=false 时 SHALL 不渲染标题栏及标题，复制与换行操作 SHALL 作为代码块右上角的悬浮操作，在悬停或键盘焦点位于代码块内时显示。操作区 SHALL 排除在代码批注坐标之外。复制 SHALL 通过已有宿主能力复制原始 code，保留换行、缩进和末尾空白；pending SHALL 保留焦点并避免重复激活，成功/失败 SHALL 提供已有 toast 呈现，失败 SHALL 记录错误。defaultWrap SHALL 仅初始化挂载状态，用户 SHALL 能切换换行而不改变原文。切换 header SHALL NOT 重置换行选择、源文身份或批注草稿。

#### Scenario: Configure the header with one value

- **WHEN** 作者分别省略 header、传入 true、标题字符串或 false
- **THEN** 依次呈现默认语言标题、默认语言标题、自定义标题或无标题栏的代码块，不需要空对象，也不能同时传独立 title 与关闭开关

#### Scenario: Use floating controls without a title bar

- **WHEN** header=false，用户悬停代码块或通过键盘进入其内容与操作按钮
- **THEN** 悬浮复制和换行操作可见、可使用，复制保留原始 code，代码与批注坐标不包含操作区

#### Scenario: Change the header while retaining feedback

- **WHEN** 用户已切换换行并保存代码批注，随后 header 在字符串、true 与 false 之间变化
- **THEN** 换行选择、原文和草稿保持，已有批注仍可通过公共页面会话精确定位与显式提交

#### Scenario: Copy original content

- **WHEN** 用户复制含 CRLF、孤立 CR、Unicode 和尾部空白的代码
- **THEN** 剪贴板获得原始 code，不包含标题、行号或按钮文本

#### Scenario: Toggle initial wrapping

- **WHEN** defaultWrap=false 的代码块挂载，用户随后开启换行，再修改 defaultWrap
- **THEN** 初始长行横向滚动，用户开启后显示折行，后续 prop 修改不重置用户选择

### Requirement: Present logical lines without changing source identity

CodeBlock SHALL 提供可选逻辑行号和单个闭区间的 highlightedLines，以 code 第 1 行起计，包含 start 与 end；视觉折行 SHALL NOT 增加行号。关闭行号时行高亮 SHALL 继续生效。代码展示 SHALL 保留空白行及末尾换行；允许 DOM 使用 LF 展示原始 CRLF/CR，但复制与批注 SHALL 仍指向原始 code。高亮 SHALL NOT 隐式滚动页面。

#### Scenario: Highlight without numbers

- **WHEN** lineNumbers=false 且 highlightedLines={start:2,end:3}
- **THEN** 第 2、3 个逻辑行高亮，不显示或复制行号，折行不会改变高亮范围

### Requirement: Join the existing page annotation session

提供 annotationTarget 时 CodeBlock SHALL 注册原始 code 和准确的 DOM 文本映射，引用 SHALL 原样作为批注 ref。批注 SHALL 复用 usePageAnnotations 的编辑、定位、草稿与显式提交机制，SHALL NOT 自行提交事件或引入独立批注界面。偏移 SHALL 为原始 code 的 UTF-16 边界，不包含标题、工具栏或行号。高亮完成或显示内容变化时 SHALL 更新注册，旧批注失效处理 SHALL 沿用现有会话机制。

#### Scenario: Annotate across tokens and raw newlines

- **WHEN** 页面启用批注，用户跨 token、Unicode、重复文本及规范化显示的 CRLF/CR 保存并显式提交
- **THEN** 每个目标的 quote SHALL 等于 code.slice(start,end)，ref SHALL 等于传入的 annotationTarget，保存草稿不自动提交

#### Scenario: Keep two identical snippets distinct

- **WHEN** 两个代码块内容相同但 annotationTarget 不同
- **THEN** 选择和定位 SHALL 关联对应代码块，不根据第一个匹配文本猜测位置

### Requirement: Keep this change limited to standalone CodeBlock

本 change SHALL 不改变 Markdown、文件抽屉或 DiffView 的实现与接入，不扩充文件读取、执行、编辑、下载或任意渲染插槽。

#### Scenario: Preserve existing renderers

- **WHEN** 本 change 实施并执行已有 Markdown、文件抽屉、DiffView 回归
- **THEN** 它们继续使用原有入口与原文映射，不因独立 CodeBlock 升级而迁移
