# 页面与交互决策记录

本文件保留原 design.md 的 B1–B65 决策与分批收敛记录，作为当时的范围和决策依据。文中的“当前”“尚未实现”、旧 Feedback 名称及旧会话缓存描述均属于记录时点；现行 API 和后续覆盖关系见 [design.md](design.md)。不据这些历史措辞重开已完成的实现任务。B32 的一次性讲解定位保留，但旧 concurrency 的固定任务/并发数模型现已被 dining-philosophers 取代；当前无批注控件或事件。B19/B21 的默认对象选择入口随后已移除，ref 校验仍保留。

### 已确认结论

- **B1**：标准页面和示例均放入 Paneon skill，CLI 保持通用 TSX 运行入口。
- **B2**：首页不为标准页面做特殊处理；启动后的标准页面使用现有实例列表。
- **B3**：方案选择页保留原有方案字段，并支持只选选项、选项加补充说明、所有选项均不合适时自行填写答案，以及在同一页面依次回答多个选择问题。
- **B4**：本地 Git 变更审阅作为标准页面，并支持多 Git 仓库；不能仅依赖 --cwd 表达仓库范围。
- **B5**：多题问答最后统一提交全部答案；上一步/下一步只保留页面内草稿，不逐题发送答案事件。
- **B6**：新增通用 --params-file <path>，从 JSON 文件读取页面入参；保留 --params，两者二选一，标准页面和自定义 TSX 均可使用。
- **B7**：--params-file 在启动时读取 JSON 快照；修改原文件不自动改变当前实例的入参，不打断正在作答的页面。
- **B8**：交互式数据表作为 skill 中的标准页面，调用者传入数据即可使用，无需为该标准场景重写 TSX。
- **B9**：信息收集作为标准页面；GitHub PR 工作台作为场景示例；内容审阅和并发讲解可以试做验证，详细入参和交互仍需对焦。
- **B10**：skill 与 CLI 使用同一发布版本，随 CLI 包提供配套 skill 资源；skill 不独立发版；按新增 B37 通过统一安装入口完成配套安装，不要求用户自行分别安装两部分。
- **B11**：一轮问答对应一个实例；agent 发起新一轮选择题时创建新实例，使用新的链接与实例 ID 关联问题和答案。
- **B12**：信息收集页在同一页面展示全部字段，最后统一提交整份表单，不采用分步分组填写。
- **B13**：Git 审阅页同时支持当前工作区改动，以及分支/提交版本之间的比较。
- **B14**：Git 页面支持对改动和文本做精准批注，批注完成后可以修改以纠正输入，AI 能读取批注。
- **B15**：Git 批注明确提交后才交给 AI；提交前可以反复编辑，已提交内容修正后再次提交修正版，不在编辑过程中逐条发送草稿。
- **B16**：Git 页面能查看经过 Git 忽略规则处理的未提交改动文件、当前分支提交记录、变更文件 diff、每个提交的改动，以及当前分支与另一分支的文件对比；agent 唤起时指定仓库和初始展示界面。
- **B17**：initialView 采用 changes、history、compare 三类视图；history 可用 commit 定位单次提交，compare 使用 branch/commits 模式及 base/head，file 可定位文件；省略 initialView 时打开第一个仓库的未提交改动，用户之后可自由切换。
- **B18**：交互表格数据只读，支持浏览、选择和反馈，不提供单元格数据编辑。
- **B20**：表格选择对象包括行、列和单元格，不能仅用行选择表达所有场景。
- **B22**：表格页不提供预先选中能力；移除 initialSelection 入参，新实例打开时没有选中项，由 human 自行选择。
- **B23**：表格页移除 overflow、format 配置，沿用现有 shadcn Table 的默认展示；不恢复 detailsKey，也不增加自定义摘要、展开全文或单元格 Markdown 渲染。
- **B24**：选择与批注做成可选的公共 SDK/UI 能力，标准页、示例和自定义 TSX 按需接入；共享状态管理、正常/选择模式、对象与普通文本选择、批注编辑和明确提交，页面负责语义位置和内容版本，保留布局控制，复用现有事件机制。
- **B19**：表格直接复用 B24 的公共目标集合，同一份反馈允许混合行、列、单元格及格内文字目标，不人为增加同类限制；此为公共方案的自然落实，不单独请求用户拍板。
- **B21**：表格采用 B24 的公共选择与批注流程，支持多对象、格内文字、多条独立意见及纯选择；不再将已由公共方案覆盖的职责列为重复待定项。
- **B25**：表格移除 rowKey，不要求输入记录带 id；使用实例原始 rows 数组从 0 开始的下标作为稳定行定位，排序、筛选及分页只改变展示，不改变该定位。

- **B26**：信息收集页采用标准表单；支持文本、多行文本、数字、下拉/平铺单选、多选、勾选框和开关，提供说明、必填和默认值；所有字段同页填写、可反复修改，明确提交后统一校验并保存整份 values，失败保留填写内容，沿用 shadcn 默认样式。

- **B27**：Git 页面采用手动刷新改动；本地文件变化不自动替换正在阅读的 diff，human 点击页面内「刷新改动」才重新读取；保留批注草稿，旧批注继续指向原内容，不自动迁移到新版本的相同行号。

- **B28**：只选中不写批注等同于 comment 为空字符串；公共反馈只保留 annotations 一份条目列表，不再分别使用 selected 和 annotations 两种结果结构。

- **B29**：同一 Git 页面可跨未提交改动、提交历史和分支对比添加反馈；每条反馈的目标通过 sourceId 保留各自文件比较来源，同名文件在不同比较中不会混淆，切换视图不改变旧反馈含义，最后可一起提交。old/new 属于各个来源，不是页面全局的一对版本。

- **B30**：内容审阅页采用完整 Markdown 文档及精准圈选方案；输入 title 和 markdown，支持对整篇、正文段落及词句批注，复用统一 annotations 和明确提交；开发 Markdown 显示选区到原文位置的适配，不采用预先分块及只对整块批注的输入方式。

- **B31**：GitHub PR 示例中的意见只交给当前 AI；GitHub 内容只读，不提供批注发布、approve、合并或关闭 PR 等写操作。页面查询通过 serverAction 直接执行 gh，给 AI 的审阅请求及意见通过已有事件交付。

- **B32**：保留并发与排队作为一次性原理展示 example；主题、标题、任务数据和初始并发数直接写在 TSX 中，不设计专用业务入参或配置文件。agent 参考或修改源码编写自己的展示页；页面内仍可调整并发数、播放和暂停。

- **B33**：新增 Sentinel LeapArray 一次性原理展示 example，以 [alibaba/Sentinel](https://github.com/alibaba/Sentinel) 源码为准；主题、场景和数据写在代码内，开发时直接实现，不再逐项讨论；当前只记录需求，具体源码细节到编写该 panel 时再看，用户验收后遇到问题再修复。

- **B34**：Paneon 提供的标准页面统一支持在原页修改已提交的答案或反馈，并在用户再次明确提交时追加完整修正版、关联上一份结果、保留历史；新一轮问题仍用新实例。自定义页面作者在技术上可以自行实现其他提交后行为，不由 runtime 或公共组件强制此策略。
- **B35**：设计文档和 Sentinel example 页面使用公开仓库 [alibaba/Sentinel](https://github.com/alibaba/Sentinel) 作为来源，不出现开发者机器上的 Sentinel 路径。
- **B36**：面向使用 Paneon 的 agent 只提供 skill，不保留独立 agent 指南；现有有用内容迁入 skill references，删除 docs/agent-guide.md，并清理 README 引用与打包配置。
- **B37**：用户只需选一个安装入口：安装 skill 后由 skill 指导安装 CLI，或安装 CLI 后由 CLI 安装 skill；不能要求用户自行分别寻找和安装两部分。入口按 B38 采用 CLI。
- **B38**：采用 A，CLI 作为统一安装入口，由 CLI 安装包内配套 skill；CLI 与 skill 的配套维护由 CLI 承担。未来可增加 update 命令，本次不实现 update。
- **B39**：先沿用成熟项目的安装做法及文案，不足时再扩展；不预先加入自定义备份、冲突分类等流程。工程上以调研过的 Vercel Skills 固定实现作为参考。
- **B40**：用户体验后采纳当前安装交互：Universal 固定选中并共用一份目录；先选择 agent，再选择安装范围，默认 Project、可选 Global；所有目标共用目录时直接复制并跳过安装方式，多目录时默认推荐 Symlink、可选 Copy；展示安装汇总及覆盖目标后统一确认。沿用参考项目英文文案，不增加自定义备份或冲突分类。确认的是交互方案，CLI 安装器仍由 2.13 跟踪实施。

- **B41**：安装或更新需要保存元数据时，文件统一放固定的 ~/.paneon 内；项目目录不新增 .paneon/skill-install.json 等元数据文件。项目级 skill 资源仍安装到各 agent 的目录。更新命令方向后由 B42 确认，具体记录结构仍待实施收敛，不据此启动 update 开发。

- **B42**：采纳未来更新命令：paneon update 升级 CLI 并同步全部已登记的 Paneon skill；paneon update --project 升级 CLI、只同步 cwd 对应项目；paneon update --global 升级 CLI、只同步用户级。默认全部更新与 cwd 无关。沿用各安装方式，普通目录清理重建并覆盖用户修改，正确链接保留；项目目录已不存在则跳过并报告，不重建项目。此项仅确认并记录方案，update 仍不在本迭代实施范围。

### 方案选择页体验修正（B43 已实现）

用户截图反馈确认：收紧问答标题、说明、进度和题目间距；自填答案框始终可见，不先切换页面模式；单选和多选均为每个选项各有一条补充说明，输入框放在对应已选卡片内。新结果使用 selections 数组，已有选项项携带 kind: option、optionId 和字符串 comment，自填项携带 kind: custom 和 text；空 comment 表示没有说明，不再使用结果 selectedIds 加整题 comment。单选只选一项，多选允许同时选已有项和自填项。输入的初始 selectedIds 保留。具体交互、草稿和验收边界见 [choose-ux.md](choose-ux.md)。本修正已交付并通过主 agent 的源码与独立安装包 Chrome 验收。

## 第二批实现对齐

Markdown 原文适配复用公共 `Markdown`，通过可选 `components` 与 `rehypePlugins` 接入。组件合并默认 renderer 与覆盖项，保留 GFM、GitHub 样式和默认 Mermaid，不为 skill 复制一套渲染器，也不改变原始 HTML 默认禁用策略。正文显式注册的链接文字可参与连续源范围；普通点击仍使用链接自身行为，按钮/表单/反馈控件不参与文字选择。

表格、Markdown 与 Git 实现和验证见 verification.md。Git 的缓存原文只在当前页面会话可用，不承诺刷新浏览器或源码更新后恢复。Sentinel 使用固定公开 commit 的教学模型，未声称执行 Java 或验证并发竞争。PR 与 skill-only 指南已交付；CLI 安装器已实现并验收，用户 Sentinel 体验尚未完成，不把整个 change 标记为完成。

验收发现 action-transform 的选择性重导出会保留整条导出却裁掉其部分依赖。例如 `export {first,second} from './values'` 仅被导入 first 时，values 只剩 first 而 barrel 仍导出 second。已修复并验证按实际导出名称/别名裁剪，未以全量服务端依赖打包到浏览器绕过。已交付 skill 共享模块采用直接依赖，页面验收不受该缺陷影响。

## B36：唯一 agent 使用指导

skills/paneon/SKILL.md 是使用者 agent 的入口，CLI、SDK/API、自定义 TSX 和反馈接入说明按需放在同目录 references/。不在 docs/ 维护独立的 agent 使用手册，也不让 skill 反向依赖外部指南。README 只保留面向人的介绍与 skill 链接。现有 docs/agent-guide.md 完成内容迁移后删除；package.json 的 files 移除它，继续通过 skills/paneon/ 整体打包。开发验收记录仍属于工程文档，不作为另一份产品 agent 指导。

## 已开启任务收尾验收

编译器重导出、仅 skill 指南、GitHub PR 三个工作单元的交付与主验收记录见 verification.md。公共 Provider 对来自按钮、输入框和反馈控件的 mouseup/keyup 不再重新采集定位留下的 Selection，已用修复前失败、修复后通过的真实 Chrome 回归核对；显式注册的链接正文继续允许圈选。

npm run build 先生成 CLI 与 UI 公开声明，再执行完整 typecheck 和 Web 构建，解决测试/skill schema 从包自引用解析尚不存在 dist 的首次构建失败；没有降低类型检查或变更 SDK 解析规则。单独运行 typecheck 仍依赖包声明产物，标准 build 负责生成它们。

## Contextual annotation interaction — B44

用户进一步确认统一提交按钮文案为“提交批注”；提交的是当前面板的完整批注结果，编辑器“保存”仍只保存草稿。

按用户六张参考图，用户界面和说明统一使用“批注 / annotation”。替换旧独立控制区为划选气泡、就地输入、编号标记及保存/取消/删除，页面工具栏提交；完整权威交互及公共 API、两组文件边界和验收要求见 [annotation-interaction.md](annotation-interaction.md)。本节覆盖本文较早的集中式 FeedbackControls UI 草案及“先进入模式才能划选文字”的描述；语义目标、事件结构、原快照校验及页面更正策略保留。对象多选采用先累积目标、再点“批注”编辑，紧凑菜单可回到未挂载的目标；可选 adapter.targetRanges 只补 DOM 几何，不改原文坐标及事件。本修正已交付并通过最终独立包验收，见 verification.md。

## Git review layout — B45

用户提供 JetBrains Git Log 参考图后授权修正 Git 页布局，根因及定稿见 [git-review-layout.md](git-review-layout.md)。历史视图采用上方提交列表/文件区、下方 diff；其余视图文件区/diff 分栏。提交信息列对齐、明确选中态、紧凑工具栏和独立滚动，修复长代码跨 old/new 栏重叠。由 comment-pages 在原独占文件内一并实施，不新建相同文件并发工作单元，不改变查询/schema/批注协议。已交付并通过主 agent 的最终独立包 Git/PR 和窄屏验收，见 verification.md。

## Form layout correction — B46

用户截图指出表单清除按钮全宽及短选项纵向布局不佳。根因和实施范围见 [form-layout.md](form-layout.md)：仅修正 form 页对 Field/Stack 的组合，清除操作紧贴下拉框、短单选/多选横排换行、布尔控件与标签同排、提交按钮合理宽度。保留 shadcn 默认组件、字段 schema 和全部提交行为，独立 form-ux 组已交付，主 agent 的源码与独立安装包 Chrome 已验收；证据见 verification.md。

## Choice questionnaire layout — B47

用户要求参考 shadcn Questionnaire 截图，选择页改为居中窄列、紧凑选项行、清晰选中态、轻量自填输入及左右导航。B43 作答/schema/事件语义全部保留。主 agent 亲自实现，不派 subagent；具体边界与验收见 [choose-layout.md](choose-layout.md)。已实现并通过主 agent 源码及独立安装包 Chrome 验收，见 verification.md；本节覆盖 B43 中已交付但用户不满意的布局。

## Choice answer summary — B48

用户认可B47主体，要求局部优化最后一题的汇总；采用轻量分组、编号及题目/答案/说明层级，详见choose-layout.md的B48。主agent已亲自完成，构建、完整choose/form回归和实际桌面/窄屏检查通过，详见verification.md的B48。

## Option details — B49

用户确认采用 A，主 agent 亲自实现：选项详情改为独立查看入口，宽屏（1024px 起）右侧非模态并排，窄屏复用已有 Dialog 覆盖阅读。选项卡片不再内联展开 Markdown；正文标题层级局部约束，不改变全局 Markdown 或公共 UI 组件。查看、切换、关闭不修改答案及说明，不发事件；切题关闭旧详情。断点切换保持详情和作答，关闭恢复查看按钮焦点，长内容独立滚动。具体实现与验收见 choose-layout.md、verification.md。

## Independent review — B50

按用户确认，选择页在所有题目之后单独呈现 Review all answers。最后一题的 Next 直接进入汇总（B61 允许未答浏览，完整校验仅在最终提交）；答题阶段不显示汇总或提交按钮。汇总无选项或输入框，统一显示完整答案与提交操作，Previous 返回最后一题并保留草稿。更正仍需经过题目修改、回到汇总、明确提交；提交失败停留汇总并保留答案和原 receipt。进入汇总关闭详情并聚焦标题，不引入新 schema、事件或持久化状态。

## Git navigation stability — B51

切换提交时保留已加载的同仓库/视图内容，queryGit 成功后统一更新描述、提交选中态、文件和 diff，失败保留原状态并显示错误。首次加载行为不变。加载提示放在固定高度的范围描述行内，避免工作区重新排版。根因及回归见 git-review-layout.md 的 B51；不改 Git 查询、SDK 或批注数据协议。

## Compact Git Log — B52

按用户授权，将历史列表改为 JetBrains 参考图的紧凑 Git Log：SVG 关系图、说明与分支/标签、对齐的作者/日期，不单列 hash。新增 graph.ts 纯 lane 布局与 history.tsx 页面行组件，使用既有父提交关系，不引入依赖。内部 GitCommit 增加 refs；读取本地/远端分支、HEAD 及 peeled 标签。保持当前固定 tip 可达历史、50 条分页、只读行为与 B51 切换稳定性。具体边界和官方 Git 依据见 git-review-layout.md 的 B52。

## Own Git history — B53

用户明确选择自行实现 Git 图和提交列表。单分支浏览、完整提交说明、独立详情和键盘/可见行渲染按 [git-review-layout.md](git-review-layout.md) 的 B53 实施；继续复用当前 React/SVG 和只读 serverAction，不引入第三方 Git 图依赖。默认当前分支，浏览其他分支不 checkout；保留固定 tip、真实合并关系与现有批注快照。

## Adjustable history / diff split — B54

用户截图要求上下拖动历史区与Diff区之间的横向分界。桌面历史视图增加局部分隔条，默认比例延续现有值，保持上下最小可用高度、键盘操作和窄屏堆叠；只改变布局，不改变Git读取及批注语义。范围、Pointer Events收尾与真实拖动验收见 [git-review-layout.md](git-review-layout.md) 的B54。使用distributed-development，已集成并通过主agent源码与独立安装包验收，详见verification.md。

## Changed-file directory tree — B55

用户要求改动文件按目录树呈现，压缩单子目录链，删除灰色弱化、修改蓝色、新增绿色。使用页面局部组件替换共用fileList的平铺内容，保留snapshot身份、工作区分组、原old/new路径筛选与文件选择；与B54分隔条分工边界及验收见git-review-layout.md的B55。已集成并通过主agent源码与独立安装包验收，详见verification.md。

## Left branch sidebar — B56

按用户截图将历史分支选择移到提交列表左侧。本地/远程/标签按前缀分组，可折叠和搜索；桌面三列，窄屏堆叠。复用现有只读历史查询和引用信息，保留Diff分隔条及批注状态，详见git-review-layout.md的B56。

## Adjustable history columns — B57

按用户截图让左分支栏和右文件区的竖向分界线可左右拖动。页面局部hook维护宽度比例与约束，支持键盘、capture取消/清理、容器resize及窄屏堆叠；原上下分隔条与批注/查询语义保持不变，详见git-review-layout.md的B57。

## Git page performance and select-all stability — B58

用户要求检查Git页面潜在卡顿，并报告Diff内容中Command+A崩溃；独立组先复现、记录运行证据，再修复明确的选择/渲染瓶颈，不屏蔽原生全选。保留批注数据、复制、只读Git及原页面布局；范围见git-review-layout.md的B58。

## Compact Git review and Diff controls — B59 / B60

按用户截图压缩Git页的分隔线与区域间距，移除文件搜索/数量及可见说明标题，历史切换后由用户点文件才展开Diff。共享Diff提供明确左右/单列选择、差异计数和上下箭头导航，点击计数定位。保留拖动热区、完整消息、精确批注、只读和initialView.file；分工与边界见git-review-layout.md的B59/B60。

## B61–B65 — Navigation, empty input and compact panels

B61 允许未答题前后浏览并进入独立汇总，最终统一提交仍校验完整答案。B62 省略两种输入选项时默认 `{}`，显式 JSON/文件和原页面 schema 继续生效。

B63 选择页将问卷名、按需说明和进度合成紧凑上下文行，保留直接可见的题目说明。B64 采用居中单列，局部40rem上限、短数字/选择控件和自然换行。B65 表格采用紧凑标题操作区、搜索/筛选工具栏、按需条件和分页；公共批注控件仅做可组合拆分，旧 Toolbar 行为不变。具体设计及任务交付见 choose-layout.md、choose-navigation.md、optional-panel-params.md、form-layout.md 和 table-layout.md。

五个任务已由主 agent 独立检查并在最终主工作区及安装包验收；未开发主题/语言配置，也未新增业务校验或更改 schema。
