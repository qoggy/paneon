## 范围与基线

- 仓库 paneon，分支 0.0.x，HEAD `f417c2f4af9d16a44ffa49aeea28003120425344`；验收以实施前实际工作区为准。
- 实施前其他任务已修改 Git checkout、批注、编译器及相关测试。其状态与文件哈希已记录在 `/private/tmp/paneon-neutral-tree-evidence/before-status.txt` 和 `before-hashes.json`，本次不覆盖这些改动。
- 改造前 `npm run build` 通过，现有 Git 文件树模型 7 项测试通过。
- 改造前真实 Chrome 文件树验收通过：changes/history/compare，目录压缩、状态、重命名、点击、批注保存和重复定位。
- 同一脚本记录 9 组截图与行级 DOM／几何数据：changes 平铺／目录、light/dark × en/zh-CN、1100px 桌面、history、compare。路径：`/private/tmp/paneon-neutral-tree-evidence/before/`。桌面视口为 1440×960 和 1100×900，不进行手机适配验收。

## 基线测试修正

初次基线在批注目录等待处超时。失败 DOM 显示目录已关闭、无弹层节点；目录新实现支持悬停打开及延迟关闭，原测试辅助函数会把短暂的 hover-open 当成稳定打开。Git 文件树验收改为先通过键盘显式固定目录，再调用已有辅助函数；同样流程在树接入前通过。没有修改批注产品代码或公共测试辅助函数。

## 实施结果

- 新增公开 `Tree<T>`、访问器模型、状态／定位类型和 `TreeRevealError`。核心不导入 Git 类型或访问文件系统。
- Git 保留分区容器、工具栏、排序／路径压缩、状态／提示和 scope 状态，通过每个分区中的 Tree 复用展示、交互和定位。
- 新增非 Git 路径示例，带中英文文案；原始／拟议文件路径由调用方提供，目录与内部身份由示例构建。按用户补充要求，示例页面现已接入文件读取和右侧 DiffView；读取仍属于页面，共享树保持中立。
- 受控定位等待父组件采纳展开并完成实际定位；取消、卸载、被新调用替代、过滤／删除目标等行为经浏览器验证。重复选择当前文件的回调保留，避免改变 Git 取消 pending 读取的行为。

## 最终检查

<!-- prettier-ignore -->
| 检查 | 结果 | 证据 |
| --- | --- | --- |
| npm run build | 通过，含 UI/CLI 构建、完整 typecheck 和 Web 构建 | `/private/tmp/paneon-neutral-tree-evidence/final-build.log` |
| npm run lint | 通过，0 error；47 条既有 non-null assertion 警告，本次新增树及示例文件无 lint 警告 | `final-lint.log` |
| tree、git-file-tree、git-review、ui-tree-shaking 针对性测试 | 28/28 通过 | `final-tests.log` |
| 共享树真实 Chrome 契约及非 Git 示例 | 通过 | `tree-browser.log` |
| Git 文件树 changes/history/compare 及重复批注定位 | 通过，含原生 Enter/Tab | `after-frozen-browser.log` |
| Git 工具栏／懒读取／树与平铺 | 通过 | `toolbar-browser.log` |
| 桌面分栏真实拖动、键盘调宽、边界、取消、草稿与 source 保留、视图宽度记忆 | 原树与新树均通过 | `before-split-browser.log`、`split-browser.log` |
| 受影响文件 Prettier 检查、git diff --check | 通过 | 最终检查命令输出 |

表内相对日志路径均在 `/private/tmp/paneon-neutral-tree-evidence/`。针对性测试命令为：

```sh
node --test tests/tree.test.ts tests/git-file-tree.test.ts tests/git-review.test.ts tests/ui-tree-shaking.test.ts
```

浏览器验收使用完整构建后的独立副本，通过已有 `PANEON_TEST_RUNTIME_ENTRY=file:///private/tmp/paneon-neutral-tree-evidence/package/dist/runtime/server.js` 选择该副本；Git 文件树与分栏运行还设置 `PANEON_TEST_DESKTOP_ONLY=1`。原树基线通过 `PANEON_TEST_SKILL_SOURCE` 使用保存的原组件。所有实例、仓库和浏览器均在隔离测试目录中创建并关闭。

## 前后对照

`before/` 与 `after-frozen/` 中以下 9 组 PNG 文件逐字节相同，行级数据 JSON 也完全相同：

- changes-flat、changes-tree。
- changes-light-en、changes-light-zh-CN、changes-dark-en、changes-dark-zh-CN。
- changes-desktop-1100、history、compare。

JSON 对照包含容器范围、滚动位置、每行文字、可访问名称、title、选择／展开状态、Git 状态码、行范围、颜色、缩进和 SVG 路径。结果汇总见 `/private/tmp/paneon-neutral-tree-evidence/comparison.json`，`allPassed=true`。本次没有声称整个 Git 面板的全部 DOM 字节相同；共享树增加了命名的 group 容器与内部行标记，原有行交互和视觉布局保持。

## 测试调整与边界

- 独立契约夹具的删除／过滤快捷键限定为树行，防止搜索框清空时的 Delete 事件误删测试数据。
- 既有分栏测试仍寻找已被其他批注改动移除的“取消”按钮，已改用当前支持的 Escape 操作；更新后的相同流程在原树和新树上均通过。手机检查保留在脚本中，本次通过桌面开关跳过。
- 一轮共享 dist 验收遇到 index.d.ts 短暂缺失的 BUILD_FAILED。完整重建后冻结构建副本，最终浏览器检查均在该副本上通过；没有为此修改编译器或添加重试逻辑。
- 没有运行全部 release/pack 测试，也没有声称覆盖 Git checkout、全部批注场景或手机适配；本次不修改这些产品协议。
- 开发期间其他任务继续更新 `branches.tsx` 和 `panel.tsx`；本次没有编辑或覆盖它们，也没有操作用户已有的 Paneon 面板或 Git 提交历史。

## 本轮文件清单

```text
src/ui/tree.tsx
src/ui/tree-model.ts
src/ui/index.ts
src/ui/README.md
skills/paneon/assets/panels/git-review/file-tree.tsx
skills/paneon/assets/examples/tree/model.ts
skills/paneon/assets/examples/tree/panel.tsx
skills/paneon/references/authoring.md
skills/paneon/references/git-review.md
tests/tree.test.ts
tests/fixtures/panels/tree-panel.tsx
tests/browser/tree.mjs
tests/browser/git-file-tree.mjs
tests/browser/git-file-split.mjs
tests/release-test.mjs
openspec/changes/extract-neutral-file-tree/design.md
openspec/changes/extract-neutral-file-tree/specs/generic-tree/spec.md
openspec/changes/extract-neutral-file-tree/tasks.md
openspec/changes/extract-neutral-file-tree/verification.md
```

proposal.md 和 .openspec.yaml 是提案阶段已创建的文件，本轮未改。没有提交、推送或自动归档。

## 右侧 DiffView 补充验收

用户明确要求将示例右侧改为 DiffView。页面现在默认打开首项，通过命名 query 并行读取两侧 UTF-8 文本；共享 Tree 不增加读取职责。相对路径按 --cwd 解析；只有 null 是空侧，真实读取错误可见。单击仍只选择，双击／Enter 切换比较。

- examples 类型检查及定向 ESLint 通过。
- 更新后的 tests/browser/tree.mjs 在真实 Chrome 中通过：真实修改、null 新增／删除、相对路径、读取失败、延迟响应不覆盖新条目，并保留全部共享树契约检查。日志：`/private/tmp/paneon-neutral-tree-evidence/tree-diff-browser.log`。
- 原实例 `instance-55e981fc-1c73-4cba-95a7-eaf61e4e204c` 已重载并验证，首项实际显示 19 处差异；截图：`/private/tmp/paneon-tree-demo-7s48c6u6/diffview.png`。
- 本轮修改：示例 panel.tsx／model.ts、tests/browser/tree.mjs、UI README、authoring 引用，以及本 change 的 proposal／design／spec／tasks／verification。未修改共享 Tree、DiffView 或 Git Review 产品代码。

用户补充要求 diff 默认展开全部上下文：示例传入 `defaultExpanded`，原页面已重载；实际浏览器确认 `aria-expanded=true`，两侧分别渲染 364／429 行，Prettier 和定向 ESLint 通过。

## 文件工具栏补充验收

按用户截图加入查看文件差异、按目录分组、全部展开、全部折叠四个图标操作。沿用 Git Review 的按钮尺寸／样式和左右布局，图标在示例内分发并附原许可证；不导入 Git 面板模块，也不新增依赖。直接导入图标库曾在示例复制到项目外时解析失败，已改为与现有供应页面一致的本地图标资产，复制后的完整浏览器检查通过。

- 4 项模型测试、examples 类型检查、定向 ESLint、Prettier 和 OpenSpec 严格校验通过。
- 真实 Chrome 验证四项操作、分组切换的选择／展开状态及已打开 diff 保留、平铺目录提示、搜索时折叠禁用，以及此前的文件读取／迟到响应检查。日志：`/private/tmp/paneon-neutral-tree-evidence/tree-toolbar-browser.log`。
- 原页面已检查四个按钮和分组切换；工具栏截图：`/private/tmp/paneon-tree-demo-7s48c6u6/file-toolbar.png`。
- 本轮修改示例 panel.tsx／model.ts，新增 icons.tsx／icons.LICENSE，并更新模型／浏览器测试、authoring 以及本 change 的 design／spec／tasks／verification。共享 Tree 和 Git Review 产品代码保持原样。

按用户要求移除示例中固定传入的 oldRevision／newRevision 标签。原页面已更新，浏览器确认标题只保留文件路径，无 Original／Proposed（或对应中文）标签；定向 ESLint 和格式检查通过。

## 文件状态展示补充验收

示例页面适配层新增状态推导及行展示，沿用 Git Review 的新增绿／修改蓝／删除弱化色和文件／目录图标，同时提供字母及中英文状态说明。两侧存在的文件读取前为省略号，读取后区分修改与无变化；失败为琥珀色感叹号。没有增加状态入参，也没有改动共享 Tree 或 Git Review 产品代码。

- examples 类型检查、定向 ESLint、Prettier 和 OpenSpec 严格校验通过。
- 完整 tests/browser/tree.mjs 在独立服务和真实 Chrome 通过，覆盖 A／M／D、读取前状态、读取后无变化、读取失败与此前的查询隔离、工具栏和树契约。日志：`/private/tmp/paneon-neutral-tree-evidence/tree-status-browser.log`。
- 原实例已重载，真实浏览器确认 1 个蓝色 M、3 个绿色 A，状态提示正确，分组切换保留状态。截图：`/private/tmp/paneon-tree-demo-7s48c6u6/status-colors.png`。
- 本次修改：示例 model.ts／panel.tsx／icons.tsx、tests/tree.test.ts、tests/browser/tree.mjs、authoring，以及本 change 的 design／spec／tasks／verification。未提交或推送。

## 正式内置 Diff Review 交付

此前交付停留在 tree 示例，未完成用户要求的内置面板。本轮修正交付范围，正式入口为 `skills/paneon/assets/panels/diff-review/panel.tsx`，definitionId 为 `diff-review`。移除本任务创建的 tree 示例目录，并修正 skill 入口表、authoring、UI README 和 OpenSpec 的范围描述。没有修改 Git Review 产品代码或公共 Tree 实现，也没有改动其他并行任务的源码。

路径入参保持原约定。面板补齐目录优先排序、单链目录压缩、搜索两侧及展示路径、可见文件计数和默认全部展开，并接入 DiffView 的文本批注、显式提交、更正和原始快照定位。内部生成的 fileIndex／snapshotId 仅用于回传引用，不要求 agent 提供身份字段。定位旧快照时同步恢复对应行状态，避免当前磁盘内容相同而旧快照仍有修改时出现状态不一致。

### 验收证据

- `npm run build` 通过，日志：`/private/tmp/paneon-neutral-tree-evidence/builtin-diff-review-build.log`。最后一处面板行状态同步调整后，examples 类型检查和定向 ESLint 再次通过；该资源不生成独立 dist 输出。
- 15 项模型／输入／引用范围与 Git 文件树测试通过：`node --test tests/diff-review.test.ts tests/tree.test.ts tests/git-file-tree.test.ts`。覆盖空文件新增／删除、压缩目录身份和计数、非法输入、错误引用、选文校验及组合字符边界。
- 完整 `tests/browser/tree.mjs` 在独立复制后的新内置入口上通过，保留查询隔离、错误、A/M/D/=/!、工具栏及共享树原有契约。日志：`/private/tmp/paneon-neutral-tree-evidence/builtin-diff-review-browser.log`。
- `tests/browser/diff-review.mjs` 在真实 Chrome 中通过目录排序／压缩、物理路径搜索及计数、跨文件批注、磁盘内容变化后的原快照定位、行状态恢复、显式事件和 replacesEventId 更正。事件来自实际 `runtime.events`。日志：`/private/tmp/paneon-neutral-tree-evidence/builtin-diff-review-annotations.log`；截图：`/private/tmp/paneon-neutral-tree-evidence/builtin-diff-review.png`。首次测试断言误用了事件 name 字段，按实际协议修正为 type 后通过，没有为此更改产品协议。
- `npm pack --ignore-scripts` 的资源清单确认新面板的五个源文件及独立契约文档均进入包，旧 tree 示例不再进入包。默认 npm cache 目录写入受限，因此检查使用 `/private/tmp/paneon-neutral-tree-evidence/npm-cache`；未修改用户全局缓存权限。
- 通过 CLI 正式启动 `instance-79630284-2423-4225-a907-ce0e4e9990a4`，`panel inspect` 确认 definitionId、entryPath、running 状态。真实浏览器复核 1 个 M、3 个 A、所有目录展开、批注入口存在及无 pageerror；截图：`/private/tmp/paneon-neutral-tree-evidence/builtin-diff-review-live.png`。
- 格式检查、git diff --check 和 OpenSpec 严格校验通过。未运行全套 release/pack 安装测试；不声称覆盖移动端。未提交、推送或归档。

### 本轮实际改动路径

```text
skills/paneon/assets/panels/diff-review/panel.tsx
skills/paneon/assets/panels/diff-review/model.ts
skills/paneon/assets/panels/diff-review/schema.ts
skills/paneon/assets/panels/diff-review/icons.tsx
skills/paneon/assets/panels/diff-review/icons.LICENSE
skills/paneon/SKILL.md
skills/paneon/references/diff-review.md
skills/paneon/references/authoring.md
src/ui/README.md
tests/diff-review.test.ts
tests/tree.test.ts
tests/browser/diff-review.mjs
tests/browser/tree.mjs
tests/release-test.mjs
openspec/changes/extract-neutral-file-tree/proposal.md
openspec/changes/extract-neutral-file-tree/design.md
openspec/changes/extract-neutral-file-tree/specs/generic-tree/spec.md
openspec/changes/extract-neutral-file-tree/specs/diff-review/spec.md
openspec/changes/extract-neutral-file-tree/tasks.md
openspec/changes/extract-neutral-file-tree/verification.md
```

迁移后删除本任务此前创建的以下示例文件：

```text
skills/paneon/assets/examples/tree/panel.tsx
skills/paneon/assets/examples/tree/model.ts
skills/paneon/assets/examples/tree/icons.tsx
skills/paneon/assets/examples/tree/icons.LICENSE
```

## shadcn Resizable 接入验收

用户明确授权引入 Resizable 并用于内置面板。本轮从官方 base-nova registry 取得源码，新增公开 ResizablePanelGroup／ResizablePanel／ResizableHandle 和 groupRef 句柄类型，固定 react-resizable-panels@4.15.0，并记录原始 registry JSON 的 URL／SHA-256。公共组件仅调整本地 utils 导入、格式和句柄类型导出，保留 shadcn 默认样式。

Git changes／compare 和 Diff Review 共同组合 `assets/shared/file-review-split.tsx`。库管理指针拖拽、布局约束及百分比 ARIA，组合层保留 1px 分隔线、12px 鼠标命中区、原键盘步长、Escape／pointercancel 回滚和宽度记忆。删除 Git 原 file-split.ts；history 原有三列及上下分栏不替换。Git JSX 将 history 和 diff 内容提为局部元素，避免复制两套差异展示。

### 实际检查与结果

- `npm run build`、examples 类型检查、定向 ESLint、Prettier、git diff --check、OpenSpec 严格校验通过。构建日志：`/private/tmp/paneon-resizable-evidence/build.log`。
- 模型、范围校验、Git 文件树及 UI tree-shaking 共 18 项测试通过：`node --test tests/tree.test.ts tests/diff-review.test.ts tests/git-file-tree.test.ts tests/ui-tree-shaking.test.ts`。日志：`/private/tmp/paneon-resizable-evidence/model-and-ui-tests.log`。
- 更新后的 `tests/browser/git-file-split.mjs` 在真实 Chrome 中通过 changes／compare 的拖拽、16px 键盘步长、边界、Escape／取消／blur、diff DOM 和编辑草稿保留、无额外查询／提交，以及收起恢复／视图切换后的宽度记忆。ARIA 沿用库的百分比单位；测试不再把 ARIA 数值当作像素。日志：`/private/tmp/paneon-resizable-evidence/git-file-split.log`。
- `tests/browser/diff-review.mjs` 通过真实拖拽与键盘调宽、1px 分隔线、保留 diff 和已保存批注、无额外读取／提交，以及原快照定位、显式提交和更正闭环。日志：`/private/tmp/paneon-resizable-evidence/diff-review.log`。
- 开始测试时发现 12px 命中区右半被后方 diff 内容覆盖，导致库虽然能按几何区域拖动，但分隔线自身的事件不能收到该位置的点击。用 elementFromPoint 确认实际目标为 diff 容器后，在面板组合层为 handle 添加 z-10；随后完整 Git 分栏测试通过。库在首次移动时捕获指针，测试已按真实生命周期检查，没有恢复自制指针拖拽。
- Git 接入前后 changes／compare 在 1440×1000 的几何对照中，所有区域 x/y/width/height 差异不超过 0.015625px，高度和 1px 分隔线一致。证据：`before-geometry.json`、`after-geometry.json` 和 `changes/compare-before/after.png`，均位于 `/private/tmp/paneon-resizable-evidence/`。
- 原版与接入后的 history 窗口、文件区和 diff 几何完全一致，三个历史分隔线均可键盘调整；证据：`history-geometry.json` 和 `history-before/after.png`。
- 完整 `git-review-layout.mjs` 未通过：历史列拖拽后旧测试期待未保存批注编辑器仍打开，但该编辑器已不存在，断言在第 179 行超时。相同脚本在接入前备份的 Git 面板上同点复现，日志分别为 `git-layout.log` 和 `git-layout-baseline.log`。本轮未修改无关批注产品逻辑或该历史测试，不能据此声称全套历史浏览器验收通过。
- npm pack 清单确认公开 resizable.js／d.ts、shared 分栏资源及新依赖进入交付，旧 file-split.ts 不再进入包。未运行全套独立安装测试或移动端验收。
- 原正式实例 `instance-79630284-2423-4225-a907-ce0e4e9990a4` 已更新；实际页面确认两栏间隔 1px、拖动后左侧增加 80px。截图：`/private/tmp/paneon-resizable-evidence/diff-review-live.png`。

### 本轮文件清单

```text
package.json
package-lock.json
src/ui/resizable.tsx
src/ui/index.ts
src/ui/upstream.json
src/ui/README.md
skills/paneon/assets/shared/file-review-split.tsx
skills/paneon/assets/panels/git-review/panel.tsx
skills/paneon/assets/panels/diff-review/panel.tsx
skills/paneon/references/authoring.md
skills/paneon/references/diff-review.md
tests/browser/git-file-split.mjs
tests/browser/diff-review.mjs
openspec/changes/extract-neutral-file-tree/proposal.md
openspec/changes/extract-neutral-file-tree/design.md
openspec/changes/extract-neutral-file-tree/specs/diff-review/spec.md
openspec/changes/extract-neutral-file-tree/tasks.md
openspec/changes/extract-neutral-file-tree/verification.md
```

删除：`skills/paneon/assets/panels/git-review/file-split.ts`。package.json 既有的测试并发改动及其他并行任务改动均保留。本轮没有提交、推送或归档。

## DiffView 内部统一 Resizable

按用户“统一”的要求，DiffView 的原／拟议两列也改用同一组 Resizable 原语，删除 `src/ui/diff-split.ts`。新增私有 `diff-columns.tsx`，由一个列宽轨道统一驱动路径标题和所有差异块的 CSS 列宽；现有行表格、每块的横向滚动与批注 DOM 保留。库负责指针尺寸更新及百分比 ARIA，适配层通过库 API 保留 16／48px 键盘步长、Home／End、Escape／原生取消和比例记忆。未改变 DiffView 的公开入参或任何批注事件。

### 结果与证据

- 最终 `npm run build`、定向 ESLint 和格式检查通过，日志：`/private/tmp/paneon-diff-resizable-evidence/build.log`。18 项既有模型／UI tree-shaking 测试及 1 项 public UI 导出检查通过；私有检查已跟随新组件名称更新，不把 DiffColumns 加入公共 barrel。
- `tests/browser/diff-reading.mjs` 在最终实现上通过完整桌面阅读验收：默认展开和首次定位、粘性标题、真实指针／键盘与取消、容器 resize、统一列宽、单列／左右切换后的比例、独立横向滚动、拖动时语法节点不变、批注精确范围、收起恢复、整份新增／删除／空白／空文本边界及 light/dark × en/zh-CN 截图。日志：`diff-reading.log`，位于本节证据目录。
- `tests/browser/diff-annotations.mjs` 验证多个 DiffView 的独立 Panel 身份、原始引用、上下文定位、单列模式 offset、提交和失效来源拒绝。内部 Panel 身份使用每份 DiffView 的唯一前缀，不依赖 agent 提供身份字段。
- `tests/browser/git-file-split.mjs` 在内外分栏嵌套后通过，保留外层拖拽、取消、草稿／源码 DOM、无额外查询／事件及宽度记忆。`tests/browser/diff-review.mjs` 的实际保存／定位／提交／更正闭环也通过。日志分别为 `git-file-split.log` 和 `diff-review.log`。
- 首次挂载回归发现子组件的布局 effect 读取父级 source ref 时，父级 ref 尚未赋值，导致初始约束未测量。最终改为测量组件自己持有的轨道 ref，安装约束后再恢复保存布局；不在 render 中读取或改写外部 ref。完整阅读测试随后通过。
- 旧阅读脚本中的“取消”按钮已不存在，改用当前支持的编辑器 Escape；目录通过键盘固定后再编辑，避免悬停自动打开和 click 切换相互影响。只修改测试操作，没有修改批注产品行为。
- 在 1280×780、相同文本和默认模式下，root、两份路径标题和两侧代码区的 x/y/width/height 与基线完全一致。证据：`before-geometry.json`、`after-geometry.json`、`before.png`、`after.png`。
- 原实例 `instance-79630284-2423-4225-a907-ce0e4e9990a4` 已更新。真实页面确认有两组 Resizable，内层拖动约 80px；继续调整外层后，标题和代码列仍对齐且文字 DOM 保留，无 pageerror。截图：`live.png`。
- npm pack 清单确认 `dist/ui/diff-columns.js` 进入包，旧 `diff-split.js`／`.d.ts` 均已移除。未运行全套独立安装或移动端验收。本轮没有重复运行此前已确认存在旧批注断言失败的完整历史布局脚本，不能声称该脚本已修复。

以上日志和截图均位于 `/private/tmp/paneon-diff-resizable-evidence/`。

### 本轮实际文件

```text
src/ui/diff-columns.tsx
src/ui/diff.tsx
src/ui/README.md
tests/browser/diff-reading.mjs
tests/browser/diff-annotations.mjs
tests/promoted-ui.test.ts
openspec/changes/extract-neutral-file-tree/proposal.md
openspec/changes/extract-neutral-file-tree/design.md
openspec/changes/extract-neutral-file-tree/specs/diff-review/spec.md
openspec/changes/extract-neutral-file-tree/tasks.md
openspec/changes/extract-neutral-file-tree/verification.md
```

删除：`src/ui/diff-split.ts`。未提交、推送或归档。

## Git 历史分栏统一 Resizable

按用户确认的范围，将历史视图的分支／提交／文件三列以及历史／diff 上下区域改用嵌套 Resizable。新增私有 `history-workspace.tsx`，移除 `history-columns.ts` 和 `history-split.ts`；不增加面板入参。原语负责实际指针拖拽，适配层通过 Panel.disabled 在拖动期间固定相反外侧列，并通过 Group API 保留 16px 键盘步长、最小值和会话尺寸。

### 已验证结果

证据目录：`/private/tmp/paneon-history-resizable-evidence/`。

- `npm run build` 通过（`build.log`）；定向示例类型检查、ESLint、Prettier 和 `git diff --check` 通过。
- `node --test tests/git-file-tree.test.ts tests/git-review.test.ts tests/diff-review.test.ts`：24／24 通过（`unit-tests.log`）。
- 新增 `tests/browser/git-history-resizable.mjs` 通过，并加入 release-test 列表。覆盖两条列分隔线和上下分隔线的真实鼠标／键盘、最小值、单边约束、取消／失去捕获、容器尺寸变化、收起／返回后的比例恢复、滚动、源码及历史行 DOM、键盘调整时的草稿，以及保存批注后的拖拽／定位／显式提交。实际收到一条正确的 git-review-submitted 事件，没有 pageerror（`history-browser.log`）。
- `tests/browser/git-file-split.mjs` 通过：changes／compare 的分栏、草稿和源码保留、无额外查询／事件及会话恢复仍然正常（`git-file-split.log`）。本轮浏览器使用 `PANEON_TEST_DESKTOP_ONLY=1`，未声明移动端验收。
- 1440×1000、1100×1000、1440×700 三组桌面尺寸的默认几何与旧实现对照。最大差异为 0.015625px，默认上下高度与位置一致；证据为 before/after-geometry.json 及对应截图。
- 指针取消测试发现库在实际移动后才请求捕获。仅一次 move 后立即 releasePointerCapture 会取消尚未建立的捕获，此时浏览器不会发出 lostpointercapture；两个实际 move 建立捕获后释放，尺寸立即停止变化。测试按真实生命周期操作，没有增加产品重试或绕行。
- 旧布局测试已移除不存在的“取消”按钮操作，改用编辑器 Escape；批注目录通过键盘固定后操作，验证实际反馈事件，不以悬停弹层隐藏作为提交成功依据。这些调整不修改批注产品逻辑。
- 浏览器使用上一轮冻结的完整 runtime/UI 包（`/private/tmp/paneon-diff-resizable-evidence/package/dist/runtime/server.js`）编译本轮最新 skill 源码，避免并行构建 dist 造成测试竞争。本轮未改变 UI 公共原语；当前工作区的完整构建另行通过。
- 完整 `tests/browser/git-review-layout.mjs` 最终通过：独立滚动、长行两端、批注取消／保存／提交及快照回看、提交图、分支范围、键盘导航和 250 条历史窗口渲染（`full-layout.log`）。早期两次运行在分页按钮点击未送达处失败，未发出查询，另一次和最终两次均通过分页；已增加实际指针事件和请求失败诊断，尚未确认该间歇性输入现象的根因，不声称它已被产品修改修复。其他超时均定位于旧批注目录 click 与悬停切换的测试操作，最终使用键盘固定目录后通过。
- npm pack 确认新 history-workspace.tsx 已进入交付，两个旧 hook 已移除（`pack.json`）；未执行全套独立安装验收。
- 正式 Git Review 历史实例 `instance-ddc41c3a-28ad-4cb4-a6a5-915deea740ea` 读取本仓库 HEAD，文件 CHANGELOG.md。真实页面确认列宽增加 40px 时另一外侧列固定，上下高度调整 20px 后源码节点保留，无 pageerror（`live.png`）。这份页面用于检查历史布局，不代表未提交工作区的修改预览。

### 本轮实际文件

```text
skills/paneon/assets/panels/git-review/history-workspace.tsx
skills/paneon/assets/panels/git-review/panel.tsx
skills/paneon/references/git-review.md
src/ui/README.md
tests/browser/git-history-resizable.mjs
tests/browser/git-review-layout.mjs
tests/release-test.mjs
openspec/changes/extract-neutral-file-tree/proposal.md
openspec/changes/extract-neutral-file-tree/design.md
openspec/changes/extract-neutral-file-tree/specs/stateless-git-review/spec.md
openspec/changes/extract-neutral-file-tree/tasks.md
openspec/changes/extract-neutral-file-tree/verification.md
```

删除：`skills/paneon/assets/panels/git-review/history-columns.ts`、`skills/paneon/assets/panels/git-review/history-split.ts`。保留其他并行改动；未提交、推送或归档。
