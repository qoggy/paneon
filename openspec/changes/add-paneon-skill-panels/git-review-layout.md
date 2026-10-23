# Git review workbench layout — B45

用户提供当前 Git 页和 JetBrains Git Log 参考截图，要求直接改进布局/样式。此任务纳入正在进行的 comment-pages 工作单元，沿用其 Git panel/shared diff 文件独占权，避免另一个 agent 并发修改相同文件。B44 批注交互及“提交批注”按钮同时保留。

## Confirmed evidence

- panel.tsx 的历史行是 div 内一个默认 Button，后接普通 span。subject、author 和原始 ISO date 没有列定义；长标题挤出列界，作者时间按自然文本流换行。当前 max-h-64 只能约束整个列表高度，不能改善列布局。
- 页面将大间距的 Page、历史卡片和文件/diff 网格纵向堆叠；重要 diff 被挤到下方，文件标题和操作各占一层，信息密度低，当前选中的 commit 没有明确选中态。
- shared/diff.tsx 使用 table-fixed 的 old/new 半栏，代码内部 min-w-max 和 inline CodeBlock 允许长 pre 内容越过单元格；外层 overflow-x-auto 没有约束单元格的可见绘制范围，截图已出现 old/new 互相叠字。只裁掉长行会丢失查看能力，必须同时提供可用横向滚动。

## Layout

使用现有 shadcn 默认色彩/组件样式，在 Git TSX 内提供全宽、可收缩的工作区布局。紧凑工具栏保留仓库选择、未提交改动/提交记录/分支版本对比、刷新和“提交批注”，比较参数按需出现。状态说明精简，长 hash 使用短值和可查看完整值的入口（如 title），不得将显示短值写入查询或反馈引用。

桌面历史视图：上方为两栏（左侧主要空间是提交列表，右侧为当前提交改动文件/数量），下方为主要 diff 区。提交列表为紧凑对齐的行/列：短 hash、subject、author、date；subject 优先弹性占宽，长标题单行省略且可看完整内容，author/date 有稳定列宽且日期不可被断成散乱的两行。使用清楚的浅色选中态/hover/focus；操作目标仍是完整 commit oid，支持既有加载更多。文件列表、提交列表及 diff 各自可滚动，使多文件或更多提交不把主页面无限拉长。

未提交和 compare：文件列表在左，diff 在右，利用同一工作区空间；过滤、仓库/视图切换、加载状态、空状态及旧快照浏览不丢失。窄屏可将区域上下排列，必须保持可访问，不强行挤入桌面固定列。垂直滚动区域应有可用高度和 min-height: 0，横向 flex/grid 使用 min-width: 0，不能仅隐藏 body overflow 掩盖溢出。

Diff 文件路径、当前查看范围和视图切换等操作组织为紧凑栏；代码区与文件列表视觉分界清楚。左右模式每侧始终处于自己的可视区域，长行有可操作的横向滚动（两侧独立或经过验证的共同滚动），不能穿越中线或仅截断。左右行/改动背景保持对齐，统一视图、展开上下文、缺侧/新增/删除/无末尾换行等情况仍正确。

## Boundaries

只改页面局部布局及 shared/diff 的展示/滚动边界，不另建主题，不改全局 Page、CodeBlock 或 panel-host，不引入依赖；查询和模型维持现有只读 Git 行为。本次参考截图的信息密度、对齐、选中态和分区，不添加 Git 写操作或新的仓库管理功能。

源引用/行号/字符偏移始终使用原模型；不要通过随意换行/插入标记修改已登记代码文本，禁止以路径或短 hash 混并快照。左右语义、sourceId、原文 quote、旧快照定位及批注 marker 在区域滚动后仍正确。shared/diff 同时供 PR 示例使用，必须检查 PR 的变化。

## Verification

在现有 Git fixture 中加入或复用真实临时仓库：长 commit subject、不同长度作者、多个日期、长路径、很长代码行、多个文件和多批提交；不是截图造假数据。实际 Chrome 至少验证桌面和窄屏，保存与参考对应的历史区、选中提交、文件列表和 split diff 截图。检查标题/作者/日期的列边界、选中态、commit切换、文件筛选及滚动；长代码滚动后末尾可见，old/new不重叠，document 无意外横向溢出。不要只断言容器 overflow 属性，需验证实际渲染几何/内容可达。

完整保留 Git 未提交/history/compare、多仓库、原快照、各类对象/文本批注、跨视图草稿、保存/取消/删除、统一“提交批注”及更正历史验证；PR shared diff 同样验证。根因修复应包含实际长行回归，不能以 CSS 隐藏内容或删测试绕过。组合公共批注组件与页面代码后跑 build/typecheck、相关 lint/format、实际 Chrome 和独立包 Git 验证，更新 reports/annotation-pages.md。

## Delivery status

已实现并由主 agent 在最终独立安装包验收：55 commits/73 files、列对齐、分区滚动、两侧长行末尾、原文编号与跨视图更正、390px及共享PR diff均通过。截图和日志见verification.md。

## B51 — Stable commit navigation

用户截图指出切换提交时整个工作区闪烁。实际延迟 queryGit 请求复现：load 在请求前 save({ request })，清空 listing 和 selected，50 行提交立即变为 0，当前 DiffView 卸载。pending 条件插入新的文本行还会改变工作区布局高度。

修复只改 Git 标准页：同一仓库/视图已有 listing 时，等待期间保留上一份完整显示状态（提交选中态、描述、文件及 diff 保持一致），成功后一次替换；首次加载仍正常显示空初始区域。读取失败保留当前内容和选择，同时展示错误；不将失败请求标成已选中。固定高度的描述行承载加载状态，不临时插入占位行。既有请求序号校验保留，旧请求不能覆盖新的导航结果。没有定时延迟、动画遮盖、盲重试、Git 写操作或 SDK 变更。

回归通过拦截暂挂真实请求观察加载中间态：历史行数不清零，原 row/diff DOM 仍连接，文件差异区域位置/尺寸不变，选中态与仍显示的 diff 一致；另测试失败保留及正常恢复。继续验证多批历史、长行滚动、批注快照、跨视图与窄屏。

## B52 — Compact Git Log with graph and decorations

用户确认按 JetBrains Git Log 参考图改造提交列表：使用紧凑 28px 行，左侧节点与关系连线，中间提交说明及引用，右侧固定作者/时间；去掉独立 hash 列和表头，完整 hash/日期/长文本仍可悬停查看。合并提交的说明适度弱化，当前选中态沿用默认主题。今天/昨天显示时间，较早提交显示完整日期，原始 ISO 时间保留在 title。

图谱是 Git 标准页内的 SVG，不引入库或全局主题。graph.ts 根据真实 oid/parents 和现有 --date-order 顺序分配稳定 lane；每行上半承接前行、下半连接各父提交，根提交结束连线。内部空 lane 不强行压缩，合并/分叉不误连；从已累积的全部提交重建图，追加历史时前缀几何保持不变，未加载父提交的连线延伸至列表边界。保留固定 tip 和每批 50 条范围，不额外列出当前 tip 不可达分支。Git 对 date-order 保证父提交位于所有子提交之后，见 [git-log](https://git-scm.com/docs/git-log)。

后端为内部 GitCommit 增加 refs 展示数据，读取 HEAD、refs/heads、refs/remotes 和 refs/tags 与 oid 的映射。轻量/附注及嵌套附注标签解析到实际提交；指向 tree/blob 的标签不挂在提交上。refs 是读取时的装饰信息，不据此改写固定历史 tip，不增加 checkout 等写操作。解析依据见 [git-for-each-ref](https://git-scm.com/docs/git-for-each-ref)。引用仅作为行内标签；超长标签截断，悬停可读完整值。

小屏保留可横向滚动的历史表区域和足够说明宽度，不挤窄到只剩几个字，也不撑开整个文档。B51 保留内容与固定加载栏的修复维持不变。公共反馈 schema、行/文本坐标、Git diff、旧快照批注和提交更正都不改。

## B53 — Own single-branch history implementation

用户在调查 React Git Log、GitGraph.js、DoltHub 和 VS Code 实现后，明确选择自行实现。沿用页面内 React/SVG，不引入第三方 Git Log 组件或将 Git 业务提升到通用 SDK。

- 历史默认从当前 HEAD 开始，只读取该 tip 可达历史；分支下拉可浏览本地/远端分支，不执行 checkout。可选 initialView.branch 指定初始浏览分支，省略仍为 HEAD。切换分支清除旧 tip、offset、commit 和 file，成功后同时替换整份列表、详情、文件及 diff；失败保留原显示。
- 分支选择仅指定查询范围，parents 决定真实合并连线，不用单个 branch 字段给提交分配唯一归属。保留固定 tip 的每批 50 条分页，显式刷新才重新解析 tip。未加载祖先的连线延伸到已加载边界。
- 当前提交详情独立于列表页读取，使用 Git %B 获得完整说明；列表仍显示 %s。默认选中 tip 并读取其差异。右侧文件列表下方提供可独立滚动的纯文本提交说明，保留换行和段落，不渲染 Markdown/HTML，也不为每条历史复制完整正文。加载更多保留当前详情；选择已加载的后续提交保留已扩展历史。
- 提供 ArrowUp/Down、Home/End、PageUp/Down；导航在已加载历史内移动焦点并查询对应提交。超过 200 条已加载历史时，按 28px 固定行高和 8 行缓冲仅挂载可见区域，轨道布局仍基于全部已加载历史；离屏键盘导航必须滚动并恢复正确行焦点。较短列表保留原 DOM，避免普通切换卸载列表。
- 回归不仅比较图形快照：沿实际绘制的每条父边逐行追踪其终点，检查多父/交叉合并、多个根、分页截断与追加前缀；确定性生成图补充覆盖，一万条线性输入检查单轨结果。真实 Chrome 验证分支过滤、HEAD 不变、完整说明、键盘、250 条窗口渲染及原批注流程。

不新增 Git 写操作、自动刷新、持久化批注或库级 API。实现不等于达到 JetBrains 全功能或对所有任意 Git 图均给出证明，具体已验证范围记在 verification.md。

B53 已实现并通过上述源码/独立安装包 Chrome 验收，具体日志、覆盖边界及体验实例见 verification.md 的 B53。

## B54 — Draggable history / diff divider

用户在 Git 工作台截图标出上方提交历史/文件区与下方 Diff 之间的横向分界线，要求该分界线上下拖动；本次明确使用 distributed-development 派工。当前 panel.tsx 的历史容器使用固定的 `md:grid-rows-[minmax(10rem,0.8fr)_minmax(15rem,2fr)]`，没有可调整入口。

### Scope and behavior

- 仅桌面历史视图增加横向拖动分隔条，拖动时调整上方历史/文件/完整提交说明整区与下方 Diff 的高度；不是 old/new 代码栏之间的分隔线，也不调整未提交/比较视图的布局。
- 沿用当前初始比例，分隔条在原 gap 中提供可发现的 hover/拖动状态与 `row-resize` 光标，沿用主题颜色；两侧保留足够最小高度。
- 尺寸由实际容器高度计算，拖动只更新布局，不重新读取 Git、不清空历史、当前提交、diff、滚动/批注草稿；保留 B51/B53 的已实现行为。
- 使用 Pointer Events/pointer capture 处理拖出分隔条、松手与 pointercancel，结束后恢复光标和文字选择，不残留全局样式或监听器。
- 分隔条支持 role=separator、aria-orientation=horizontal、可聚焦和键盘上下调整，声明当前/最小/最大值。容器尺寸变化时重新约束范围，窄屏仍保持原上下堆叠，不强行开启桌面拖拽。
- 比例只保留在当前页面会话，视图切换返回可继续使用；不新增CLI入参、持久化设置、SDK组件或依赖。

### Implementation / acceptance

subagent 在独立 worktree 实现，主 agent 派工后立即交还用户。文件范围为 Git panel、必要的页面局部辅助模块及 Git layout browser 回归；共享反馈、Git查询、panel-host和选择页不在范围。真实 Chrome 需验证：实际拖动后上下区域几何变化且各自仍可滚动；极限/松手/取消/键盘/容器resize/390px；已有提交切换、完整消息、虚拟历史和批注草稿不受影响。保留源码/独立包验收，不以 CSS 属性断言替代真实拖动。主 agent 验收后只合入该任务相对移植基线的增量，遵循本次skill约定提交，再清理worktree。

## B55 — Compact changed-file directory tree

用户提供 JetBrains 改动文件树截图，要求目录形式展示、单子目录链合并为一行，以及删除弱化、修改蓝色、新增绿色。当前 fileList 在 [data-file-scroll] 内将每个 snapshot 展示为完整路径平铺按钮，长目录前缀重复、无法折叠。

### Scope / contract

- 将 Git 页所有视图共用的改动文件列表改成目录树；目录可展开/收起，默认展开，目录图标/缩进和文件名沿用当前主题。连续的只有一个子目录且没有直接文件的目录链合并为 `packages/web/src` 一行；遇到分叉或直接文件停止合并，不能把分叉后的兄弟错误压平。根文件不额外包一层目录。
- 文件叶子显示 basename，完整仓库相对路径保留在可访问名称和悬停中，点击仍调用现有snapshot选择函数。删除用灰色/弱化但不禁用，修改蓝色，新增/未跟踪绿色；仍提供状态字母或可访问状态说明，不能仅靠颜色区分。重命名显示在新路径，旧路径保留在悬停/可访问说明，身份继续使用sourceId而非文件名。
- working changes 同一路径的 staged/unstaged snapshot 不能合并：用已暂存/未暂存/未跟踪分组保持独立，组内再构建目录树；history/compare直接按目录组织。目录文件数量按真实叶子计数，不改变顶层总改动数。
- 现有搜索继续按完整old/new路径筛选，匹配项的祖先可见；过滤不清空原collapse草稿。清空搜索后恢复原展开状态；新选中文件在树中可达。不改变Git读取、diff来源或批注坐标。
- `ChangedFileTree` 页面局部组件建议props：snapshots、selectedId、filter、onSelect(snapshot)，可传scopeKey区分仓库/视图。只给目录层级建模型，不新增运行时/SDK通用组件或依赖。小屏长路径在本区域内处理，不撑开页面。

### Parallel ownership / acceptance

B54分隔条与B55目录树并行。B55独占 file-tree.tsx、必要纯model、独立test；panel.tsx只新增组件import并替换const fileList中[data-file-scroll]平铺map，不改外部历史grid/分隔条。B54保持fileList内部不变。B55不改已由B54修改的browser/git-review-layout.mjs；新增独立browser测试，并由主agent集成时核对原精确计数断言。必要既有按钮可访问名称保持不变以兼容真实用户操作和语义定位。

验证真实临时Git包含：多级共享前缀和分叉、根文件、新增/修改/删除/重命名、路径含空格/换行/Unicode、同名不同目录、staged/unstaged同路径；目录压缩/折叠、完整路径搜索、状态颜色及文字、删除仍可看diff、批注与文件切换、390px。目录模型单测+真实Chrome几何/可操作性；不以截图造假替代真实Git。主agent验收后集成任务增量并commit，再清理worktree。

## B54 / B55 — Integrated implementation

B54 使用页面局部 `history-split.ts` 管理会话比例、ResizeObserver 和 pointer capture；桌面最小工作区 28.5rem 保留上区 12.75rem、把手 0.75rem、Diff 15rem，短窗口通过页面滚动访问底部。手势结束、取消、失去 capture、离开历史、跨窄屏断点和卸载均清理临时光标/文字选择；键盘上下键按16px调整。宽度不足48rem不显示把手，保留堆叠。

B55 使用页面局部 `file-tree-model.ts` 和 `file-tree.tsx`，不引入 SDK tree API 或新依赖。目录仅在无直接文件且只有一个子目录时压缩；工作区各 area 独立建树，文件保留原 snapshot ID 和精确 old/new 路径。搜索临时展示命中路径，清空后恢复折叠；切换文件和批注定位展开祖先，普通折叠不抢滚动位置。重复定位同一条批注也重新展开其目录，当前列表内的批注定位清除阻挡搜索；不属于当前列表的旧快照仍通过原有保留快照 Diff 访问。删除弱化、修改/重命名蓝色、新增/未跟踪绿色，保留状态字母及完整路径提示。

## B56 — Left branch sidebar

用户要求按JetBrains截图把分支放到历史列表左边。历史上区采用三列：分支/标签、提交记录、文件树与完整提交说明；下方Diff和可拖动横向分隔条保持原逻辑。移除顶部历史分支下拉框。

页面局部branches.tsx展示HEAD、本地、远程和标签，按名称中的斜杠组织可折叠目录；搜索命中项时临时展开，清空恢复折叠。窄屏分支区与其他区域堆叠并限定可滚动高度。数据复用现有commitDecorations读取的完整引用，不新增Git查询；标签仅包括能解析到commit的标签。点击传递完整refs/heads、refs/remotes或refs/tags引用到现有history branch参数，重置旧tip/commit/分页，不执行checkout，不改变批注与快照协议。

## B57 — Adjustable history columns

用户截图要求分支栏/提交记录、提交记录/右侧文件区之间两条竖向分界线可左右拖动。采用页面局部history-columns.ts，以原上区两个0.75rem间隙作为把手；只调整上区三列宽度，下方Diff与原上下分隔条保持独立。分支最小9rem、提交记录16rem、文件区12rem；拖动一个边界时固定另一个侧栏，仅与中间历史区交换宽度。

Pointer capture覆盖移出把手的手势，松手/cancel/lostcapture、容器宽度变化、窄屏切换、离开历史/卸载均清理cursor/userSelect及capture。把手提供vertical separator语义和宽度范围，左右键按16px调整边界；右把手向左扩大文件区。比例在当前Review会话内保存，视图切换仍保留；窄屏保持堆叠并隐藏两个把手。变更不调用Git、不发送事件、不重建原浏览/批注子树。

## B58 — Git page performance review and Command+A crash

用户要求CR Git页面潜在卡顿，并报告在文件Diff里Command+A导致整个页面崩溃。该现象优先复现：记录文件规模、浏览/选择模式、实际键盘焦点、浏览器console/pageerror、主线程长任务及是否renderer退出，区分崩溃与长时间阻塞，不预先断言根因。

排查页面历史窗口渲染、目录/分支树、Diff行渲染、选择映射与反馈几何。当前feedback-provider从document mouseup/keyup收集选择，feedback-selection会遍历body文字并调用注册映射；Diff适配器也有自己的原文映射。重点核对全选时这些路径的复杂度与输入边界，并据实修复有证据的瓶颈。普通复制/全选不应隐式新增批注或提交；不能通过屏蔽Command+A、吞异常或任意截断选择来掩盖问题。

独立worktree后台实施，和B57列宽组并行。该组可修复共享feedback选择/几何与Diff、history/graph、目录/分支的性能问题；不得修改B57的history-columns/history-split/panel布局及其browser layout脚本。优先有实际证据的修正，允许其余CR零问题。输出复现条件、根因、修改前后证据、已验证边界；主agent完成后验收合入。

## B59 — Compact Git workbench and explicit file opening

用户提供六张截图，要求提高信息密度：分界视觉上收成一根细线（保留可拖动热区及键盘/ARIA）；收小文件区与提交说明之间的间隔，移除文件搜索和数量标题、移除可见“提交说明”开头，保留完整原文/作者/时间和可访问region名称。仅使用页面局部布局，不引入全局主题。

在历史视图切换分支或提交时，不默认选择第一个文件或展开下方Diff；先显示历史、文件树和提交说明，用户点文件后才展示Diff及上下分隔条。没有展开Diff时历史上区使用可用空间，避免保留大块空白。显式initialView.file仍打开指定文件；同一范围手动刷新可保留用户已选文件，切换提交/分支要清除旧文件选择。批注定位仍能展示其原快照，不丢草稿。其他视图原业务语义不扩大。

B57列宽组已经交付af632ff真实指针回归，主agent已把该任务增量集成到未提交主checkout；紧凑组在同worktree后续实施，负责panel.tsx、branches/history/file-tree局部密度、history-columns/history-split的必要handle尺寸、Gitlayout及file-tree UI回归。B58性能组独占共享反馈与Diff注册/映射性能，B60组负责共享Diff操作栏，合并时分别验证。

## B60 — Explicit Diff modes and difference navigation

参考用户截图，用两个明确的“左右对比”“单列对比”选项和当前选中态替代含义不清的“统一视图”切换按钮。工具栏增加“当前/总数 处差异”、上一个/下一个差异箭头icon；点击计数定位当前改动块。以已有model.hunks为导航单位，不引入Git写入、编辑文本或新的diff算法；无差异时禁用导航，首末边界明确禁用相应箭头。保持原上下文展开、旧/新侧原文和精确批注坐标。布局紧凑、键盘和可访问名称完整，窄屏不撑宽页面。

共享Diff组件也供PR页使用，需保留PR和Git回归。性能组同时修改Diff注册effect，B60仅修改UI/导航相关部分，不覆盖性能改动。最终交付任务增量，由主agent合并后统一验收。
