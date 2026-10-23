# Compact table review workspace — B65

## 需要你处理的事项

无。用户已确认本重做设计，授权派 subagent 实现；范围为表格布局及摆放批注控件所需的最小公共拆分。

### 已确认结论

- 用户认为服务数据评审表格页整体难看，要求重做。
- 保留既有表格/批注功能，不恢复此前去掉的rowKey、format、overflow配置。

## Evidence and scope

仓库paneon，分支0.0.x，基线cb51f8a02f080feb70dfe3f4d08469af23dc0351。当前table/panel.tsx组合了Page默认space-y-8、独立description、独立FeedbackToolbar、全宽搜索label/Input、长统计说明、表头每列常驻Input和独立分页Button组。结果数据表上方连续数层留白和控件，信息被操作说明压下去。公共Table已有紧凑默认样式，问题主要在页面组合。

本次重排table页，不修改公共Page/Table/Input默认样式或其他panel，不改变输入schema、排序/筛选语义、分页、rowIndex身份、批注提交协议或原文映射。

## Proposed composition

```text
服务数据评审   说明                         整体批注  [提交批注]

[搜索表格…          ] [筛选]                [选择对象]

┌────┬─────────┬────────┬───────┬────────────────────┐
│    │ 服务 ↕  │ 耗时ms↕│ 健康 ↕│ 说明 ↕             │
├────┼─────────┼────────┼───────┼────────────────────┤
│ 1  │ API     │    120 │ true  │ 同步接口…          │
│ 2  │ Worker  │    900 │ true  │ 后台批处理任务     │
│ 3  │ Search  │    240 │ false │ 索引更新延迟…      │
└────┴─────────┴────────┴───────┴────────────────────┘

1–3 / 5 行                                  ‹ 1 / 2 ›
```

标题与批注操作同一横排，标题使用普通页面标题层级，取消截图中大标题下的大段空隙。params.description保持原文，通过标题旁说明入口查看完整Markdown；有说明才展示入口，支持键盘和触屏，不用仅hover的tooltip容纳正文。

表格工具栏左侧是适中宽度的搜索（约16–20rem、窄屏可缩短）和筛选入口，右侧是选择对象操作。选择模式、待批注目标和已有批注目录沿用公共能力；不能漏掉FeedbackToolbar在有目标/已存批注时提供的批注/目录入口。长工具栏可换行，保持数据区靠近工具栏。

## Search, filters and sorting

- 移除每列常驻的大输入框。点击筛选打开Popover，按已有columns逐项提供列名和文本筛选输入，不新增操作符/条件类型。输入立即沿用原case-insensitive contains逻辑，回第一页并保留批注草稿。
- 有效筛选以可移除条件显示在工具栏下方；没有条件则不占行。搜索框保留自身清除入口；只在搜索、筛选或排序有效时出现「重置视图」。整体重置沿用现有initialView语义，清除搜索/筛选/排序；单个筛选条件的移除仅影响该条件。
- 表头保留字段名称和小排序指示，不给每个标题额外加显眼按钮边框。排序仍按声明type和现有规则计算，不按业务标签猜测类型。
- 筛选Popover在窄屏贴合可用区域、字段多时区域内滚动，不撑大页面。说明和筛选入口均需清楚可访问名称。

## Table and density

数据区使用一层轻边框/圆角和细行分隔；默认表头约36–40px、数据行约40px，沿用shadcn主题。没有大外卡片或装饰色块。

列采用内容驱动宽度。序号/复选框列窄，声明为number的列右对齐，boolean列紧凑，text列使用剩余空间；不把所有列分成等宽输入区。不把true/false改成健康徽章，不把数字补单位或字符串化业务状态。所有原始值继续按现有cellText/FeedbackText呈现。

长字符串允许CSS自然换行且不截断源文本；多列导致最小可读宽度不足时，沿用表格区域的横向滚动，不让整个页面溢出，不增加overflow参数、隐藏列或新增详情机制。文本的实际DOM源映射、复制和UTF-16坐标不变。

底部左侧只保留紧凑行统计，右侧为上一页/页数/下一页。搜索后同时表达匹配数与原始总数，不能让用户误以为数据被删除；无数据和无匹配使用现有语义。清除条件不作为固定大按钮挤在分页旁。

## Selection and annotations

浏览态显示原始行序号；进入选择对象模式后显示行复选框、表头当前页复选框及列选择控件。普通文字圈选继续直接出现批注气泡，不要求先开选择模式。

“列选择覆盖输入整列；表头行勾选只作用当前页”的长说明，改到选择模式下的帮助入口，并给各控件保留明确可访问名称；默认浏览不常驻一整行教学文字。已选数量仅在有待选目标或已保存批注时出现，不固定展示“已选0个位置”。

整体批注和提交批注在标题操作区，选择模式/待选批注/批注目录可按语义摆放在工具栏右侧。现有 FeedbackToolbar 将选择对象、整体批注、待批注目标、批注目录和提交绑在一处，不能直接分区摆放。因此将已有逻辑提取为可组合的 FeedbackSelectionControls（选择/待批注/目录）和 FeedbackOverallAnnotationButton，继续复用 FeedbackSubmitButton；原 FeedbackToolbar 以相同顺序组合这些控件，保留其他页面的默认外观和行为。mountToolbar 仍只由选择控件注册一次，不重复注册，不新增一套批注状态或 placement 协议。已有保存/取消/删除、失败保留、更正、定位隐藏目标等语义保持不变。

## Responsive layout

桌面页面宽度上限建议约72rem，合适边距；表格与数据量相符，不套用问卷/表单的36rem窄列。标题/操作、工具栏、表格和底部使用统一左右边界。

窄容器时标题与批注操作分行，搜索与筛选仍靠近，其他控制按空间换行；表格必要时区域内横向滚动，分页和操作始终可达。布局依据实际panel容器宽度，不新增agent需要填写的布局属性。

## Files and acceptance

拟实施文件：

- skills/paneon/assets/panels/table/panel.tsx
- skills/paneon/references/table.md
- openspec/changes/add-paneon-skill-panels/table-layout.md

允许上述最小公共拆分及对应导出（src/ui/feedback-surface.tsx、src/ui/feedback.tsx、src/ui/index.ts；以实际导出链为准），不改全局样式、状态机或其他页面源码。

验收桌面/390px、长列名/长文本/多列/无数据/筛选无结果；排序、搜索、列筛选、移除/清空条件和分页；行/整列/单元格/词语批注、选择模式帮助、跨页定位和完整更正；所有操作保留原始rowIndex及原文，布局变更不新增业务校验或事件。预览是设计稿，不是已修改产品的截图。

## B65 implementation ownership

独立 table-compact-layout worktree，独占 table/panel.tsx、references/table.md、本文、table-review 浏览器流程及新增表格布局专用 fixture/脚本，以及上述最小公共批注控件拆分。不要编辑 choose/form、共用 skill-pages 文件、中央 design/tasks/verification、schema 或主题语言配置。验证真实 Chrome 桌面与窄屏；额外运行公共批注和 Git/PR 相关回归，确认原 FeedbackToolbar 的顺序、注册和提交/定位行为保持一致。只交付隔离基线后的任务增量和实际证据，主 agent 负责最终验收合入，不 push。

## B65 implementation and evidence

状态：实现和本任务验收完成，等待主 agent 验收；未合入主 checkout、未 push。交付只包含隔离基线 `6ce2ddc6d09da3564e0d3f9668fab9f68694fccb` 之后的表格增量，该基线包含其他任务的已有草稿和 B61 依赖，不作为本次任务改动交付。

已实现标题/说明与整体批注/提交批注同排、适中宽度搜索与筛选 Popover、逐个可移除有效条件、条件生效才出现的重置视图、表格内横滚和紧凑统计分页。声明为 number 的列右对齐，boolean 保留原始 true/false，原文只通过 CSS 换行。选择帮助按需打开，普通词语批注无需选择模式。未修改 schema、contains/sort 算法、原始 rowIndex、源文本注册或提交/更正协议。

公共提取仅涉及 `FeedbackSelectionControls`、`FeedbackOverallAnnotationButton` 和导出链。`FeedbackSelectionControls` 负责唯一一次 `mountToolbar`；其普通 children 组合让原 `FeedbackToolbar` 保持选择对象 → 整体批注 → 待评批注 → 批注目录 → 提交批注顺序。表格把整体批注与提交按钮放在标题区。其他页面源码未改，未引入 placement 属性或新的反馈状态。

验证命令与实际结果：

- `npm run build` 通过，包含 CLI/UI 构建、四个 TypeScript 配置和 web 构建；日志 `/private/tmp/paneon-table-b65/build.log`。只有已有 npm email 配置警告。
- 对本次 TSX、公共导出和表格浏览器文件运行限定范围 ESLint 与 Prettier，通过；日志同目录的 `lint.log`、`format.log`。
- `node --test tests/table-review.test.ts tests/feedback-state.test.ts tests/feedback-selection.test.ts tests/feedback.test.ts`：17/17 通过，日志 `unit.log`。
- 原 `tests/browser/table-review.mjs` 增加筛选/移除/重置、排序重置、普通浏览态 Unicode 圈选、整体意见及空更正检查；真实 Chrome 全流程通过（含 Markdown 批注、失败保留、并发提交冻结、完整更正、CLI events/ack），日志 `table-review.log`。
- 新 `tests/browser/table-layout.mjs` 使用独立表格专用 fixture，在真实 Chrome 的 1440px/390px 下验证键盘与触屏 Popover、布局、长列名/长文本、多列、空数据/无匹配、条件移除/清空、排序分页、当前页行批注、跨页定位、更正、原文 UTF-16 坐标，全部通过。日志 `table-layout.log`、量测 `table-layout-metrics.json`。桌面默认表头 40.5px、普通数据行 40px；390px 数据行随原文自然换行为 57px。长列名/长原文不设固定高度。所有场景的 iframe document.scrollWidth 等于 clientWidth（1086/356px），多列表格在 1020/322px 区域内部横滚。
- 原 `tests/browser/feedback.mjs` 通过，涵盖原生/键盘圈选、保存/取消/删除、对象组、目录/定位、窄屏、失败保留、CLI events/ack；日志 `feedback-browser.log`。
- 原 `tests/browser/github-pr.mjs`：3/3 通过，涵盖跨 PR 批注、源快照、查询/事件失败、更正、300 文件覆盖和 CLI events/ack；日志 `pr-browser.log`。

截图已由实现 agent 读取像素检查，位于 `/private/tmp/paneon-table-b65/`：`table-1440-normal.png`、`table-390-normal.png`、`table-390-description.png`、`table-390-filter-popover.png`、`table-1440-long-content.png`、`table-390-long-content-scrolled.png`、`table-390-many-columns-scrolled.png`、`table-390-empty.png`、`table-390-no-match.png`、`table-review-annotated.png`。布局专项截图关闭过渡动画后采集，设计 HTML 不作为产品验收截图。

### Existing Git drag failure

原 `tests/browser/git-review.mjs` 已运行；批注、失败保留、完整更正/清空、初始视图和 CLI 部分完成后，在 `tests/browser/git-review-layout.mjs:128` 的列拖拽极限测试失败。当前产物重跑与 `git archive 6ce2ddc` 的独立完整构建基线都在同一点失败，日志分别为 `git-browser-rerun.log`、`baseline-git-browser.log`；不能将整条 Git 回归报告为通过。

最小复现是历史页拖分支栏到主页面 x=1（iframe 之外）后松开。基线事件诊断中 iframe 位于 x=176、宽 1088；host 收到 pointerup，但 iframe 未收到 pointerup/lostpointercapture，仍保留 capture 和 data-dragging，cursor=col-resize/userSelect=none。等待 200ms 仍不恢复，鼠标重新进入 iframe 后发生 lostpointercapture 并恢复。证据 `baseline-columns-diagnostic.log` 的 IMMEDIATE/AFTER_200MS/REENTER JSON；诊断只写临时基线副本，没有修改本任务或 Git 页面源码。现有 `history-columns.ts:107–141` 仅处理当前 iframe 的 pointer/blur，buttons=0 的移动能恢复但需回到 iframe。该现象在隔离基线已存在，已交主 agent 独立判断处理，本任务不扩大到 Git 拖拽修复。

## B65 parent acceptance

主 agent 已检查页面组合及公共控件最小拆分：旧 Toolbar 操作顺序、一次注册与原状态机保留。最终工作区 table-layout、完整 table/review、公共 feedback、Git、PR Chrome 全通过，独立 npm 安装包 table/review 通过。子任务旧宿主基线 iframe 外释放拖拽问题已记录；主工作区现有全屏宿主下，真实双边界拖拽/极限/取消及 Git 全流程通过，本轮未改 Git 源码。

统一验收证据见 verification.md 的 B61–B65 主验收章节。
