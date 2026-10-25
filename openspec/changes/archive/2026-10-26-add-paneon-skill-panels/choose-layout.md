## 需要你处理的事项

无。

### 已确认结论

- **B63**：采用「精简题头」：问卷名、说明入口和进度合成一行，下面突出当前题目；移除重复操作提示，问卷说明按需查看，题目说明直接展示。

- **B50**：最后一题经 Next 进入独立的 Review all answers 步骤，不在最后一题下方展示汇总；Previous 可返回修改。

- **B49**：用户选择推荐的 A：宽屏并排阅读、窄屏覆盖阅读，不在选项下展开详情。

- **B47**：选择页参考用户提供的 shadcn Questionnaire 截图调整布局和样式；由主 agent 亲自实现，不派 subagent。

## Scope and evidence

仓库 paneon，分支 0.0.x，基线 412c2aa。当前选项叠加 Card / CardHeader / CardContent 的默认间距，自填区又是一张完整卡片；Page 的宽度使短问答和文字说明散得过开。只修选择页的组合布局，沿用现有 shadcn 主题、Radix 控件及 B43 已确认的作答语义。

参考：[官方 Questionnaire](https://ui.shadcn.com/docs/components/base/questionnaire) 及同页 Radix 版本。参考问卷本身的窄列、选项行、弱化说明和选中态；文档站侧栏、预览外框和浏览器外壳不属于页面。

## Page composition

- 页面居中窄列，小屏自然铺满可用宽度，长内容正常纵向滚动。问卷标题/总说明作为轻量上下文，进度、题目及题目说明组成紧凑题头。
- 固定选项改为紧凑的整行点击区域：左侧单选/多选控件，右侧名称、推荐标记和说明。选中有清晰边框和淡背景；保持默认主题变量，不改公共组件或全局 CSS。
- 每个已选项的说明仍在该项内部，以紧凑输入框呈现。详情在独立侧栏按需阅读，输入和详情操作不改变选项选择。
- 自填答案保留常驻输入和独立单选/复选语义，取消自填后保留草稿。移除大卡片、重复标题和无必要的默认提示；输入非空自动选择的行为不变。
- Previous 放左侧，Next/统一提交放右侧；所有题目（包括最后一题）均通过 Next 前进。最后一题之后独立展示完整答案汇总，只有汇总步骤提供统一提交；保留错误、失败草稿及明确更正。

## Behavior and boundaries

不改输入/输出 schema、事件、持久化、SDK 或业务能力。单选互斥、多选可同时含固定答案和自填；独立说明、跨题草稿、最后整组提交、replacesEventId 和键盘交互保持不变。不添加未要求的跳题或字母快捷键。

主 agent 直接在主工作区实现。已有五个页头相关脏文件原样保留，不修改或顺带提交。不开新的工作树，不派 subagent。

## Files

- skills/paneon/assets/panels/choose/panel.tsx
- skills/paneon/references/choose.md
- openspec/changes/add-paneon-skill-panels/choose-layout.md
- openspec/changes/add-paneon-skill-panels/choose-ux.md
- openspec/changes/add-paneon-skill-panels/design.md
- openspec/changes/add-paneon-skill-panels/tasks.md
- openspec/changes/add-paneon-skill-panels/verification.md

## Verification

复用现有 choose/form 浏览器流程并保留全部 form 回归；新增问卷宽度/居中、紧凑选项、选中样式、整行点击、输入不切换选择及左右导航的实际几何和交互检查。真实 Chrome 查看桌面/390px 截图及长标签/说明换行；执行构建、相关 schema 回归、lint/格式、OpenSpec strict 和独立安装包。提供实际可打开的选择页链接供用户体验，不将代码检查当作视觉验收。

## Delivery and acceptance

主 agent 已直接实现并验收，没有创建工作树或派 subagent。选择页使用 max-w-xl 窄列、紧凑 Card 组合、整行 label、独立说明输入、常驻自填和左右导航；首题隐藏 Previous。Markdown 上下文使用页面局部 important utility 覆盖未分层的 GitHub Markdown CSS，避免默认 16px/正文颜色压过问卷说明样式；未改全局 CSS 或公共组件。详细结果见 verification.md 的 B47 章节。

## B48 — Answer summary

用户认可B47主体布局，要求只优化最后一题的答案汇总。原实现是默认字号的strong与裸列表，题目、答案和说明没有层次。主agent直接将其改为一个轻量边框分组：小标题/已答数量、编号分行、弱化题目、突出答案、缩进淡色说明和轻量未作答状态。保留完整汇总与原提交、更正和校验逻辑；不加折叠/额外确认流程，不调整其他区域。复验现有choose/form流程并查看实际汇总截图。已完成构建、相关lint、完整choose/form Chrome回归及实际桌面/窄屏检查；已答数量按现有答案schema判断有效答案，不另建作答状态。

## B49 — Option detail reading surface

用户指出内联详情的 Markdown 标题与问卷控件冲突，提出点击后右侧专门面板阅读，随后确认推荐的 A。主 agent 直接实现，不派 subagent。

现状：选项details原生展开区内直接放Markdown，局部text-sm只改正文。所使用的GitHub Markdown样式仍将h1设为2em、h2设为1.5em，因此标题可大于外层问题，还把后续选项向下推。public UI已有Dialog但没有Sheet；shadcn官方Sheet基于Dialog，适合补充阅读内容，可参考其样式和焦点/关闭机制。

已采用 A：主问卷保持紧凑；有details的选项提供独立查看入口；宽屏打开一个有关闭按钮、独立滚动的右侧阅读区，同时仍可在左侧选择或填写。切换选项的查看入口只切换同一阅读区内容；切题关闭当前详情，避免旧题内容混淆。窄屏改为覆盖阅读层，明确关闭后回到原位置；复用已有可访问弹层能力，不手写焦点陷阱。未采用所有尺寸统一覆盖问卷的 B。

行为约束：查看不等于选中，打开/关闭不改答案或说明草稿、不发事件；完整details Markdown保留。阅读面板有明确的选项标题；只在面板内约束Markdown标题层级、段落间距及表格/代码/图片宽度，标题不抢过面板自身标题，其他Markdown页面不改。输入/事件/schema无需扩展。不增加独立的业务协议、固定框架页头或新的全局视觉主题。

实现使用 1024px 断点：桌面是非模态 aside，小屏复用已有 Radix Dialog 的焦点约束、Esc 关闭与遮罩；关闭返回原查看按钮。桌面保留左侧完整作答，关闭按钮与 Esc 均可关闭侧栏。视口跨断点时保留当前查看的选项和答案，不另建详情状态协议。Markdown 字号覆盖仅在详情正文生效，h1 不超过阅读面板标题；长文独立纵向滚动，长代码/表格在阅读区内横向滚动。

参考：https://ui.shadcn.com/docs/components/radix/sheet 。实际回归与体验链接见 verification.md 的 B49 章节。

## B50 — Separate answer review step

用户明确要求最后一题作答后经 Next 进入独立的 Review all answers。问卷所有题目统一使用 Next；进入汇总不校验作答、不自动提交事件（B61 放宽浏览限制）；最终统一提交时才完整校验，定位首道无效题。汇总只展示全部答案及统一提交，不显示题目选项或输入框；Previous 返回最后一题并保留全部草稿，可继续回退修改更早问题，再通过 Next 返回汇总。只有汇总步骤允许提交；原有防重复、失败保留和成功后明确更正语义不变。进入汇总关闭旧详情，标题获得焦点；汇总不是额外一道题，不显示 Question N+1 / N。输入与事件 schema 不变。

## B63 — Compact question header

状态：用户已确认采用「精简题头」，并授权派 subagent 实现。仓库 paneon，分支 0.0.x，基线 cb51f8a02f080feb70dfe3f4d08469af23dc0351；基于当前未提交的B47–B50选择页布局。B61自由翻题和B62默认空params是独立任务，本设计不修改它们。

用户指出题头五行（问卷标题、问卷说明、Question N/N、当前题目、通用操作提示）信息密度低且层级杂乱。当前 panel.tsx 将前两行放独立header，fieldset内再渲染后三行；外层space-y-6和标题pt-2进一步拉开距离。

已采用「精简题头」：首行左侧是弱化的问卷标题及按需出现的「说明」入口，右侧是轻量的「单选 · 1 / 2」（多选对应多选）；第二行是当前题目，字号/字重清晰高于首行。删除独立Question文字及整句默认“Select one answer or write your own.”。常驻自填输入已经表达可自填，不重复提示。首行与题目紧凑排列，题目下直接进入选项。

问卷级params.description保留全文，通过标题旁说明入口查看，复用现有Popover且支持键盘/触屏，不用仅hover的tooltip承载Markdown。仅有description时才出现入口，不删原文。题目级question.description关系到具体作答，仍在题目下方直接展示；较长时自然换行，不截断、不定死行数。题头没有题目说明时通常两行，有时三行，不把“最多两行”做成输入限制。

未采用的备选「说明直显」：同样合并问卷标题和进度、删除默认操作提示，但问卷说明直接显示在题目下。优点是不用额外点击，代价是仍占一段空间；当问卷说明是实际业务背景时更直观。

宽屏首行一行排布；窄屏标题和进度正常重排，长题目自然换行，不缩小文字或挤压右侧。汇总页沿用相同上下文首行，进度位置改为「答案汇总」，不虚构第N+1题。题目焦点、读屏进度、选项/草稿/详情/提交语义均保留；没有新校验、schema或业务行为。

拟实施文件仅：

- skills/paneon/assets/panels/choose/panel.tsx
- skills/paneon/references/choose.md
- openspec/changes/add-paneon-skill-panels/choose-layout.md

复验包括桌面/390px、长问卷名/题名、缺省/长问卷说明、题目说明、说明键盘打开和关闭，以及独立汇总和原作答交互。预览是独立设计稿，不是已修改产品的截图。

## B63 implementation ownership

独立 choose-compact-header worktree，从当前 HEAD 创建并移植当前选择页草稿、B61 自由翻题增量为隔离基线；交付只包含基线后的题头改动，不重复提交依赖。此前 B47/B49 的主 agent 亲自开发约束属于历史实现，本轮用户已明确授权派 subagent。

独占 choose/panel.tsx、references/choose.md、tests/browser/skill-pages.mjs 和本文；只调整选择页断言，保留全部 form 回归。中央 design/tasks/verification 和其他页面不在本任务范围。实现进度和实际验收证据更新在本文。最终验收与合入由主 agent 执行，不 push。

## B63 implementation and evidence

状态：独立 worktree 实现与本轮验证完成，等待主 agent 独立验收。隔离基线为 `5216477221fd0e651fcfd11be1d4cdbacaed2b70`，其中已包含 B47–B50 草稿和 B61 自由翻题依赖；本轮只交付基线后的 B63 增量，不代表 B61 已独立验收。

实现将上下文首行和当前题目放入同一个紧凑题头：弱化问卷名、可选 Description 入口、Single choice / Multiple choice · N / 总数，下面突出当前题目。沿用当前选择页的英文文案，不引入语言配置。独立 Review 使用同一上下文首行，进度改为 Answer summary；删除独立 Question 行和通用作答提示。问卷说明全文使用已有 Radix Popover，可键盘或触屏打开，Esc 关闭并返回入口焦点；长说明在弹层内滚动。没有问卷说明时不渲染入口。题目说明直接显示，长问卷名、长题名和题目说明自然换行。使用既有主题和控件，未修改 schema、公共 UI、业务校验或原作答/提交逻辑。

验证结果（2026-10-22）：

- `npm run build` 通过，包含 CLI/UI/web 构建及完整 TypeScript typecheck。日志 `/tmp/paneon-b63-build.log`。构建有已有的产物大小提示和本机 npm email 配置提示，无失败。
- `node --test tests/skill-pages.test.ts`：6/6 通过，包含 choose/form schema；日志 `/tmp/paneon-b63-schema.log`。
- scoped ESLint 通过：`choose/panel.tsx`、`tests/browser/skill-pages.mjs`；日志 `/tmp/paneon-b63-lint.log`。四个改动文件 Prettier 检查通过；日志 `/tmp/paneon-b63-format.log`。
- 真实 Chrome（Playwright `channel: chrome`）完整执行 `tests/browser/skill-pages.mjs` 通过；日志 `/tmp/paneon-b63-browser.log`。原有 form 回归完整保留。新增题头断言覆盖短上下文同行、删除旧提示、单/多选进度、独立汇总进度、无说明入口缺省、Enter/Space 打开、Esc/焦点恢复、触屏点击开关、长问卷名/题名/题目说明在桌面与 390px 不溢出，以及长问卷说明全文可滚动到底。
- 原选择页流程继续覆盖未作答 Next/Previous、未完成自填自由翻题、独立汇总、最终校验定位、单/多选与说明草稿、桌面/窄屏详情、完整提交、防重复、失败草稿、更正和新轮隔离。

截图保存在 `/tmp/paneon-b63-artifacts/`，已实际打开查看：`choose-desktop.png`、`choose-description-desktop.png`、`choose-multiple-desktop.png`、`choose-mobile.png`、`choose-long-header-desktop.png`、`choose-long-header-mobile.png`、`choose-long-description-1280.png`、`choose-long-description-390.png`、`choose-review-desktop.png`、`choose-review-mobile.png`、`choose-unanswered-review-desktop.png`、`choose-unanswered-review-mobile.png`；既有详情、长选项和 form 截图也已查看。短题头桌面为上下文行加题名；390px 的上下文允许换行。极长题名正常增加高度，没有截断或限制输入。长说明末尾实际可见，弹层停留在视口内。

本轮未做独立打包验收或全仓库 lint；本任务未修改分发/运行时，使用完整构建、相关单测和真实 Chrome 的复制 skill 流程验证。临时 node_modules symlink 在提交前移除，不改依赖或 lock 文件。不 push、不合入主 checkout、不删除 worktree；下一步由主 agent 验收本轮提交。

## B63 parent acceptance

已验收 B63 精简题头及 B61 自由翻题依赖，合并仅取任务增量。主工作区真实 Chrome 完整 choose/form、说明键盘/触屏/焦点、桌面/390px/长文及最终独立 npm 安装包通过。为避免无截图模式误读动画起点，视觉断言改为始终等待弹层实际 opacity=1，不改变产品行为。

统一验收证据见 verification.md 的 B61–B65 主验收章节。
