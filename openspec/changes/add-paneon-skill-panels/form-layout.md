# Form layout correction — B46

## 需要你处理的事项

无。B46为既有实现记录；B64已确认采用居中单列，用户授权派 subagent 实现。

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

## B64 — Responsive form width proposal

状态：用户已确认「居中单列」，授权派 subagent 实现。仓库 paneon，分支 0.0.x，基线 cb51f8a02f080feb70dfe3f4d08469af23dc0351。用户反馈通栏表单及字段过宽，希望有合适的自适应排布。

根因：form/panel.tsx直接使用Page，继承src/ui/layout.tsx的max-w-6xl（72rem）和较大外边距；文本、数字、textarea都沿用Field中的w-full。即使只有短值，控件也会铺满通用页面。应修正form页局部容器和不同控件的宽度，不修改公共Page/Input，也不让agent新增布局配置。

推荐「居中单列」：表单局部最大宽度约36–40rem，左右居中；容器比上限窄时占满可用宽度，保留16–24px边距。标题、表单说明、字段和提交操作对齐同一内容边界。标签在控件上方，字段保持输入顺序，字段组间距约20–24px。不在超宽屏继续放大，不自动猜测字段是否有关联或重新分组。

- 文本/textarea填满限定后的内容列，长内容自然换行。textarea保留正常伸缩和滚动，不截断输入。
- 数字输入使用约8–10rem的较短宽度，限制视觉尺寸而非数字位数/业务值；超长输入仍可编辑和查看。
- select默认约14–18rem，max-width不超过当前内容列，清除按钮继续紧贴；长值有完整可访问名称与既有选项列表，不扩展到整屏。
- radio/multiselect保留内容宽度，短选项同排、空间不足换行；checkbox/switch与标签同排，不拉伸。
- 提交按钮保持内容宽度并与表单左边界对齐。描述和错误属于对应字段，可换行，不因宽度新增截断或校验。

备选「紧凑配置式」：桌面采用约7rem的左标签列与右控件列，总宽约44rem；每个字段仍独占一行，长文本标签可换行。窄容器（建议32rem以下）改为标签在上、控件在下。布尔行无需复制一份左标签，沿控件列放控件和其标签；提交同样对齐控件列。它适合字段名短、配置项多的页面，但长题目/描述的阅读和移动端风格不如默认单列统一，因此作为备选。

两方案都依据实际panel可用容器宽度响应，不用设备名称或字段数量决定布局。不新增必填layout/span/width参数，不用字符串长度推测业务语义，不做自动双列配对或改变Tab/屏幕阅读顺序。theme/language的未来方案只提供主题与文字，不负责改变表单宽度。

本轮实现仅采用居中单列，不实现备选紧凑配置式。原schema、字段类型、required/default、清除/键盘、提交/更正/失败草稿均不变，不新增限制。拟实施文件：

- skills/paneon/assets/panels/form/panel.tsx
- skills/paneon/references/form.md
- openspec/changes/add-paneon-skill-panels/form-layout.md

验收实际宽容器、常规桌面、窄侧栏和390px/320px；短值不过度拉伸，长标签/说明/选项/错误不重叠或横溢，控件仍完整可操作；两种主题与语言下布局自然扩展。预览仅供设计评审，不代表产品已经修改。

## B64 implementation ownership

独立 form-responsive-width worktree，仅修改 form/panel.tsx、references/form.md、本文，以及独立的 tests/browser/form-responsive.mjs（如需专用 fixture 使用新文件）。不得修改共用 skill-pages.mjs/skill-pages-fixture.mjs，选择页任务独占前者；可以原样运行既有全套回归。不得改公共 Page/Input/CSS、schema 或其他页面。只交付隔离基线之后的增量与验证证据；主 agent 负责最终验收合入，不 push。

## B64 implementation and verification — 2026-10-22

已在独立 `form-responsive-width` worktree 完成居中单列实现。隔离基线为 `6ce2ddc6d09da3564e0d3f9668fab9f68694fccb`，该基线包含当前选择页草稿与 B61 依赖，不能作为本任务增量重复交付或合入；本次只交付基线之后的表单改动。主 agent 后续独立验收。

实现全部位于 form 的组合层：Page 最大 40rem（含内边距），桌面左右 24px、窄容器 16px；FieldGroup 间距 24px。text/textarea 填满内容列；number 使用 9rem 的视觉宽度并保留原数值编辑能力；select 连同清除区最多 18rem，内容列不足时继续收缩。Select 弹层单独限制为 iframe 可用宽度并允许长选项换行，因为 portal 不继承主内容列的换行样式。布尔内容区允许收缩，长标签/说明/错误可换行。字段顺序、上方标签、短选项换行、清除相邻和左对齐内容宽提交按钮保持既有语义。未改公共组件、样式、schema、业务校验或提交状态逻辑。

独立 `tests/browser/form-responsive.mjs` 复用共享 fixture 的启动入口，提供本任务自己的长文本参数，不修改共享脚本/fixture。Chrome 五种实际测量：

| 浏览器/容器场景                 | iframe 内宽 | 表单外宽 | 内容列 | 数字框 | 选择框 |
| ------------------------------- | ----------: | -------: | -----: | -----: | -----: |
| 1440px 浏览器，正常宿主         |      1086px |    640px |  592px |  144px |  252px |
| 2560px 浏览器，测试宿主解除上限 |      2494px |    640px |  592px |  144px |  252px |
| 1440px 浏览器，360px iframe     |       358px |    358px |  326px |  144px |  252px |
| 390px 浏览器                    |       356px |    356px |  324px |  144px |  252px |
| 320px 浏览器                    |       286px |    286px |  254px |  144px |  218px |

五种场景居中偏差均为 0，字段间距均为 24px；清除按钮宽 32px、与选择框相隔 4px且同排；短 radio/multiselect 同排，提交按钮宽约 113px且左对齐。混合中文/英文、无空格长标签/说明/选项及验证错误无可见控件越界或页面横溢。宽屏测试只在测试宿主临时解除其容器上限，产品宿主未修改。顶部和操作区截图已自行查看，长布尔标签旁的控件保持默认大小，底部提交区可操作。

验证证据（本机临时目录，不作为源码提交）：

- `npm run build`：通过，含 CLI/UI/web 构建与全部 TypeScript 检查；日志 `/private/tmp/paneon-b64-build.log`。
- `node --test tests/skill-pages.test.ts`：6/6 通过；日志 `/private/tmp/paneon-b64-schema.log`。
- 限定文件 ESLint / Prettier：通过。
- 独立 Chrome：`PANEON_TEST_ARTIFACTS=/private/tmp/paneon-b64-evidence node tests/browser/form-responsive.mjs`；日志 `/private/tmp/paneon-b64-responsive.log`，几何 `/private/tmp/paneon-b64-evidence/form-responsive-measurements.json`，截图同目录 `form-{desktop-1440,wide-2560,sidebar-360,mobile-390,mobile-320}{,-actions}.png`。弹层最终截图 `form-mobile-320-select-options.png` 已查看；320px 真实数字边界错误换行为两行（使用原有 min 校验，仅测试参数）。还验证长 select 选项弹层完整可用、required 清除、必填 false/0、输入原文、失败草稿、完整更正及 replacesEventId。
- 共享 choose/form Chrome 原样通过：日志 `/private/tmp/paneon-b64-regression.log`，截图 `/private/tmp/paneon-b64-regression/`；包含 keyboard、清除只影响对应字段、pending 防重复、失败/更正和 CLI events/ack。
- 独立 npm 安装包的共享 choose/form Chrome 通过：日志 `/private/tmp/paneon-b64-package.log`，截图 `/private/tmp/paneon-b64-package/`。

当前未提供主题/语言配置，本次验证的是现有主题及混合中英文内容，未把未来主题/语言方案当作已实现功能。本任务不 push、不合入主 checkout、不删除 worktree；交付后在等主 agent 验收。

## B64 parent acceptance

主 agent 已检查仅页面局部宽度/换行改动，真实 Chrome 1440/2560px、360px iframe、390/320px及完整表单交互均通过；最终独立 npm 安装包 choose/form 通过。新几何脚本对旧宿主 main 的定位已调整为按实际宿主结构执行；产品源码不需兜底。

统一验收证据见 verification.md 的 B61–B65 主验收章节。
