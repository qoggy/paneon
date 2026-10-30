## 1. 固定上游组件与样式

- [x] 1.1 确定采用的 shadcn Base Code Block commit/registry 及配套样式，记录来源、摘要、许可证和必要适配；确认不要求全量主题升级或新增依赖。
- [x] 1.2 将必要的 CodeBlock/Header/Title/Actions/Content/Line 作为共享内部 primitives 接入，使用现有工具、主题和图标，保持公开 Markdown/CodeBlock exports 与 props 不变。

## 2. 正文代码块组合

- [x] 2.1 让 MarkdownCodeBlock 复用上游头部、标题、操作区与内容容器，保留语言标签、默认 wrap=true、不显示行号及滚动时头部固定；不新增正文围栏语法或控件。
- [x] 2.2 保留 browserAction 复制、原代码文本、pending/disabled/focus、双语 tooltip/toast 和错误可观察性；验证成功、失败和重复激活，不引入第二次直接剪贴板调用。
- [x] 2.3 调整必要的局部样式边界，删除已被上游组合替代的头部/外框样式；验证 github-markdown-css 不覆盖组件默认样式，其他文档内容不受影响。

## 3. 文件行展示与原文适配

- [x] 3.1 将 PreviewSource 的内容替换为同一上游 Content/Line，复用行号和 variant 行高亮；保留语言推断、#Lx-Ly、边界提示和自动滚动，不重复文件头部或重做 Sheet 外壳。
- [x] 3.2 实现必要的内部逐行适配，复用现有完整代码高亮与源文映射，精确保留或拆分映射包装；排除装饰节点，保持注册/卸载及异步高亮后的重新绑定。
- [x] 3.3 验证 CRLF、孤立 CR、中文、emoji、重复文本、连续/末尾空行、无末尾换行和 Markdown 合成换行的原文边界、选区及复制行为，禁止近似定位或静默回退。

## 4. 批注与定制路径回归

- [x] 4.1 在现有 Markdown 高亮/批注验收中验证跨行批注、换行切换、定位和主题变化；确认头部与行号不进入文本坐标，保存草稿不隐式提交，完整修正语义保持。
- [x] 4.2 在文件引用验收中验证锚点/无锚点/超界、空文件/读取错误、相对 sourcePath、关闭重开及磁盘变化后的快照定位和提交，确认 ref/sourceRef 与事件结构不变。
- [x] 4.3 回归 Mermaid、行内代码、components.pre/code 覆盖、自定义 rehype、未知语言、frontmatter 字面代码路径，以及深浅主题、中英文和桌面键盘/焦点行为。

## 5. 清理与交付验证

- [x] 5.1 清理本范围内不再使用的自研行布局、行背景和重复适配，不修改范围外 CodeText/DiffView/Git review，不添加内部模块的公共用法或改动 file-review 提案。
- [x] 5.2 运行相关单元测试和 Markdown/file-reference/frontmatter 浏览器验收、类型检查、构建、格式检查及 diff 检查；验证离线打包资源齐全，记录有证据的结果后再进入后续归档，不在本任务发布版本。

## 验证记录

2026-10-31，按 Paneon 实例 21、事件 9 的三个选择实施，结果如下：

- `npm run build` 通过，包含 CLI/UI/Web 构建和全部配置的类型检查。
- `node --test` 运行 file-annotations、file-references、table-review-markdown、markdown-frontmatter、markdown-standalone、markdown-resources、sdk-file-annotations 七个相关文件，33/33 通过。本地监听用例在允许绑定 loopback 的环境运行。
- `node tests/browser/markdown-highlighting.mjs` 通过：头部/语言、换行/横向滚动、宿主复制成功/失败及 pending 焦点、双语/主题、作者自定义渲染、Mermaid、CRLF 源文批注与定位。新增外部请求检查通过，代码、主题和图表均使用本地打包资源。
- `node tests/browser/file-references.mjs` 通过：原有路径、读取错误、行范围、焦点、快照、定位和提交，以及新增 CRLF/孤立 CR、连续/末尾空行、无末尾换行、重复文本第二处至 EOF 的精确批注。
- `node tests/browser/markdown-frontmatter.mjs` 通过：38 组 YAML 场景与 BOM/CRLF/Unicode 坐标、提交/修正/定位。
- 改动文件 Prettier 检查、`git diff --check`、OpenSpec 严格校验通过；`npm run lint` 为 0 errors、55 warnings，警告均在本次未修改的文件。修改的 UI 文件单独 lint 无警告。
- 长行复现确认 GitHub Markdown 的 unlayered pre/code 规则覆盖组件布局，已用局部高优先级 `revert-layer` 隔离并回归通过。
- 最小新旧对照确认 Chrome 原生 `Selection.toString()` 对行网格末尾空行的归一化一致，DOM Range 保留完整原文；未扩展为原生复制行为改造，测试以精确 Range 和实际提交坐标验证批注。纯空白文件验证完整展示，不要求没有可见文字锚点的浮动批注按钮。
- 外观截图：`/tmp/paneon-markdown-highlighting-evidence/light.png`、`/tmp/paneon-markdown-highlighting-evidence/dark.png`。临时选区复现实例 22 已关闭，源码保留在 `/tmp/paneon-code-selection-repro/panel.tsx`。

本变更已实现并验证；未归档、未发布，未改动 `upgrade-review-to-file-review`。

## 独立审查与修正

- 2026-10-31 使用用户指定的 `conduct workflow run run-kiro` 独立审查，运行 ID `run-kiro-20261031-012254`，原始评分 B、无 Critical、2 项 Warning、3 项 Info。审查开始与完成的 10 个代码/测试文件摘要一致。
- Warning 1 已通过真实 Tab 导航复现并修复：FileSourceCode 直接使用 Content 而没有 Root 的焦点环，导致 pre 可聚焦但无可见指示。补充内侧 focus-visible ring，保留键盘操作，不增加运行时校验或业务分支。
- Warning 2 确认 CodeText 的旧行号分支无调用方，但本次按任务 5.1 的明确范围保留，不扩展为 CodeText 重构。Info 1 已在 upstream.json 说明旧 Root slot 与 Header 内 Actions 的适配；其他可选或理论建议不引入额外代码、断言或回退。
- 修正后 `npm run build`、修改 UI 文件 lint、相关文件格式/diff 检查及完整 file-references 浏览器验收通过。焦点用例先失败（shadow/outline 均 none）后通过（可见 inset ring），文件高亮、快照和批注回归同时通过。
- 原始完整报告：`/tmp/paneon-markdown-code-audit-20261031/kiro-report.md`。主代理逐项复核及 Focus 决策说明：`/tmp/paneon-markdown-code-audit-20261031/assessment.md`。焦点截图：`/tmp/paneon-md-audit-focus-evidence/file-code-keyboard-focus.png`。
