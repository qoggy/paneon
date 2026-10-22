# Form layout correction — B46

用户通过两张表单截图指出：Select 下“Clear 环境”按钮撑满整行；只有两个短选项的区域/功能却纵向排列。截图还显示布尔字段标题和 checkbox/switch 分成两行。按既定反馈协作方式，在方案明确后直接派工修正。

## Root cause verified in source

form/panel.tsx 将全部字段统一放在默认 vertical Field 中；src/ui/field.tsx 的 vertical 包含 [&>*]:w-full。Select/Radio 的清除按钮放在竖向 Stack 中，未指定辅助按钮尺寸。RadioGroup 保持默认网格，multiselect 显式 space-y-2。单个 checkbox/switch 则放在独立 div 中，与前面的 FieldLabel 分离。FieldGroup 是 flex-col，底部直接 Button 也会被拉成全宽。

这些是表单 TSX 的组合布局问题，不修改 shadcn 公共组件默认样式或新增主题。输入/output schema 和业务提交语义不变。

## Required behavior

- Select 与清除操作在同一行：选择器占合理可用宽度，清除为紧贴选择器的小型 ghost/icon 操作，避免整行按钮。可用 X 图标；可访问名称保留 Clear + 字段标签，图标有可理解提示。仅在有值时出现；清除只重置对应字段，不提交、不重置其他草稿。必填字段清除后由原有校验提示，不能悄悄删除清除能力。
- Radio 与 multiselect 的短选项横向排列并允许 flex-wrap；较长标签自然换行，窄屏不强挤在一行。不要一律每个选项独占整行，也不要设无法容纳长文本的固定宽度。Radio 清除同样是小型辅助操作。
- 单个 checkbox/switch 与标签同排并正确关联，标签可点击；描述和错误提示位于关联字段下方。保持控件默认大小，不将 checkbox/switch 拉长。字段组标签、required标记、错误定位及键盘导航仍正确。
- 提交按钮恢复合适的内容宽度，放在操作行，不被 FieldGroup 撑满。保留 Submit form / Submit corrected form / Saving… 既有文案，避免与其他页“提交评论”混为一谈。
- 保留当前单列表单内容及全部控件类型、默认值、required false/zero、空字段省略、输入原文、完整更正/replacesEventId、提交中禁用/防重复、失败草稿；不扩展字段 schema 或给调用者增加布局参数。

## Ownership and dependency

新 form-ux 工作单元，基于当前主分支文档提交建立隔离 worktree。先叠加已交付 choose-ux 实现 32bc21d，作为共用 skill-pages 回归文件的最新基线；主分支尚未完成该提交的全套验收，这一依赖准备不表示验收通过。最终只提交 form 自己的改动，不重复交付 choose 或中央文档。

允许修改：

- skills/paneon/assets/panels/form/panel.tsx
- skills/paneon/references/form.md
- tests/browser/skill-pages.mjs（保留已交付 choose 断言，仅修改/新增 form 检查）
- tests/browser/skill-pages-fixture.mjs（如需长标签/窄屏 fixture）
- openspec/changes/add-paneon-skill-panels/reports/form-ux.md

不要修改 src/ui、SDK、form/schema.ts、choose 源码、其他页面或依赖；comment-core/pages 正在独占它们各自范围。中央设计/tasks/development 由主 agent 更新。

## Verification

真实 Chrome 截图包含两个短 radio、多选项、选中 select 及清除、checkbox/switch 同排和提交区；桌面/390px窄屏还加入长标签场景。实际几何验证清除按钮非整行、位于 Select 旁，短选项同一行（空间不足可换行），布尔控件标签对应、控件保持默认大小，主按钮不全宽，页面无横向溢出。

交互验证：select/radio清除只影响对应字段；空值隐藏清除；required清除后的原校验；点击checkbox/switch标签及radio键盘操作；全部既有choose/form浏览器流程和schema测试仍通过，尤其失败保留、完整更正及CLI events/ack。不删旧断言来通过。运行相关build/typecheck/lint/format和独立npm安装包的choose/form浏览器脚本。报告真实结果与截图，主 agent 后续验收/合入；不push、不自行合入或清理。

## Delivery status

已实现并通过主 agent 的源码与最终独立安装包choose/form Chrome。小清除、选项换行、布尔标签、键盘、required清除、失败与更正均通过；未修改公共shadcn组件。证据见verification.md。
