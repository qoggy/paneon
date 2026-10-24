# 批注入口与编辑框精简

## 状态

主 Agent 已完成代码审查及独立针对性验证，验收通过。基线提交：104290920bffb214ba1255c6502932d15904edee。

## 用户确认的范围

- 去掉默认的 Select objects / 选择对象入口，正文统一通过普通划选后批注，整段同样划选。
- 批注编辑框去掉可见的标题（添加批注、Annotation N）和已选位置数量；删除使用低调的图标。
- 保留整体批注、取消、保存和明确的提交批注操作。
- description 不做；不新增段落悬停入口、添加位置入口或其他交互。
- 遵守 focus：不增加输入校验、异常中断、限制或额外确认流程。

## 已核实代码与实现边界

- src/ui/feedback-surface.tsx：FeedbackSelectionControls 的 allowObjectSelection 当前默认 true；FeedbackToolbar 使用默认值。因此应让默认工具栏不出现对象选择，已有显式选择能力可通过现有参数 opt-in，不删除底层对象引用、SDK 或事件结构。
- 同文件约 230–253 行显示编辑框标题和 Selected {count} locations，移除这些可见块，保留 dialog/textarea 的无障碍名称、现有 placeholder、错误展示及保存/取消语义。
- 同文件约 260 行删除按钮已经是 Trash2 + ghost icon-sm + title/aria-label，复用即可，不需要再次造样式或为旧截图添加兼容逻辑。
- src/ui/feedback-selection.ts、feedback-store.ts 现有原生选区收集、源坐标映射及临时编辑状态是权威路径，不更改引用/坐标/事件契约。
- skills/paneon/assets/panels/review/panel.tsx 的 DocumentSelection、shared/markdown-feedback.tsx 的选择此段仅在 select 模式存在；默认不进入该模式即可，不新增替代入口。
- 表格近期已独立隐藏对象选择（allowObjectSelection=false），有自有的行列选择控件；不能为了本次精简删除这些能力。Git/PR 与其他默认工具栏一样移除通用对象模式入口；已有页面自有操作和引用契约不变。
- tests/browser/annotation-editor-fixture.txt objects 场景已改为显式 opt-in 验证底层能力；默认场景使用实际 FeedbackToolbar，验证无 Select objects、普通划选整段仍能批注。

## 验收

- 默认工具栏无选择对象/结束选择；整体批注、保存与提交仍能正常用。
- 划选文字和完整段落，打开无标题/无位置计数的编辑框，保存后编号可重开、取消不修改旧值、图标删除正常。
- 空批注原有语义保留，复制、链接、表单控件及选区来源保持原行为；保存不等于提交，纠正提交保持原契约。
- 明暗主题、中英文、窄屏各做有针对性的浏览器验证；优先复用 annotation-editor 及相关测试，避免无关全量扩测。
- 文档更新默认交互说明；只修改当前行为直接涉及的说明，保留 opt-in API 的正确说明。
- 报告改动路径、验证证据和是否新增校验。若新增校验确有必要，先报告主 Agent，不自行加。

## 交付约束

仅在隔离 worktree 开发，不触碰主目录未提交的 choose/resource-lifecycle 工作。不要 commit/push，不更新全局安装、不停止服务、不 reload 用户实例。主 Agent 验收后合入并 commit。

## 实现结果

- `FeedbackSelectionControls.allowObjectSelection` 默认改为 false；`FeedbackToolbar` 透传同名可选参数，供自定义页面明确 opt-in，所有 builtin 默认调用保持不传参。
- 编辑框移除可见标题与位置计数，保留 dialog/textarea 无障碍名称、placeholder、既有错误提示；删除沿用现有 Trash2 图标按钮。
- 没有更改 store、坐标映射、SDK 事件数据、空批注语义和提交/纠正协议；没有添加校验、默认回退、异常处理或确认流程。
- 使用文档明确默认划选与对象选择 opt-in；独立对象能力测试 fixture 显式启用对象选择。Markdown Review 的旧整篇对象模式回归改为默认整体批注，文字引用精度检查保留。

## 验证证据

- `npm run build` 通过（含 typecheck）：`/tmp/paneon-annotation-simplify-build.log`。
- 修改生产代码及 annotation-editor 测试的 ESLint、Prettier 检查通过。
- 反馈相关单元测试 11/11：`/tmp/paneon-annotation-simplify-unit.log`。
- `annotation-editor.mjs` 通过，实际默认 FeedbackToolbar 无对象模式入口；原生鼠标划选整段源坐标准确，编号重开、取消旧值、空文本保存、图标删除、保存与提交隔离保持。覆盖 light/dark × en/zh-CN 及 360px 窄屏，页面错误为零。结果与截图：`/tmp/paneon-annotation-editor-evidence/`，日志 `/tmp/paneon-annotation-simplify-browser.log`。
- `feedback.mjs` 通过：原生/键盘划选、emoji/UTF-16/映射引用、复制/普通交互、显式对象组、保存/取消/删除、提交失败与 events/ack：`/tmp/paneon-annotation-simplify-feedback.log`。
- `table-layout.mjs` 通过：表格自有行列操作、分页、原文坐标、纠正提交、窄屏：`/tmp/paneon-annotation-simplify-table.log`。
- `table-review.mjs` 通过：真实 Markdown Review 的划选、跨格式/链接连续引用、行内/块代码、整体批注与精确定位；表格相关断言亦通过：`/tmp/paneon-annotation-simplify-review.log`。
- `diff-toolbar.mjs` 通过：独立 diff fixture 的显式对象能力、源 CRLF、模式切换与390px布局保持：`/tmp/paneon-annotation-simplify-diff-toolbar.log`。

- `diff-boundaries.mjs`、`diff-reading.mjs` 均通过：连续差异导航、sticky裁剪、独立滚动、指针/键盘/取消/resize、模式切换保持比例、收起状态和Command+A，覆盖明暗/语言/窄屏：`/tmp/paneon-annotation-simplify-diff-boundaries.log`、`/tmp/paneon-annotation-simplify-diff-reading.log`。

## 验收范围说明

本次没有运行完整浏览器套件。旧 `git-review`、`github-pr`、`git-review-chrome`、`explanations` 等浏览器脚本中仍有直接点击默认“选择对象”的既有步骤；这些步骤依赖本次已移除的交互，不应通过恢复 builtin 入口来满足。本次已验证默认公共工具栏、真实 Markdown Review、表格自有选择及独立显式 opt-in 场景；上述 Git/PR 专用旧模式测试需后续围绕默认文字划选更新后再声称完整通过。

## 主 Agent 验收

- 独立复跑 typecheck、反馈单元测试 11/11、annotation-editor 浏览器验收，均通过；后者覆盖四种主题语言、360px、完整段落源坐标、空批注、保存/取消/重开/删除以及保存与提交隔离，页面错误为零。
- 代码审查确认只有默认对象入口和可见编辑框信息改变；没有新增产品校验、失败分支、限制或确认流程，删除沿用现有图标。
- 补正 Review、Git、PR、并发示例指南中已失效的默认“选择对象”指引，保留公共指南中显式 opt-in 的说明。
- 没有改写主工作区并行进行的 choose、README、项目记忆或资源生命周期改动。
- 本次范围验收通过；上文列出的旧 Git/PR 对象模式浏览器脚本尚未迁移，不代表全量套件通过。没有同步全局 skill 安装或重载用户实例。
