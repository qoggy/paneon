## 需要你处理的事项

无。用户已授权实施；实际改动和验收证据记录于 [verification.md](verification.md)。

### 已确认结论

- **B5**：采用业务无关的 `Tree<T>` 访问器接口，路径及 Git 业务由适配层负责。
- **B6**：补齐受控命令、搜索和交互契约；不照单采纳其他评审中的返回值设计、搜索时折叠策略和完整方向键导航。

- **B7**：文件树示例右侧显示 DiffView，由页面读取原／拟议文件路径对应的文本。
- **B8**：右侧 DiffView 默认展开全部上下文。
- **B9**：示例文件列表加入与 Git Review 一致的四个图标操作：查看文件差异、按目录分组、全部展开、全部折叠。
- **B10**：DiffView 标题只展示文件路径，不填入固定的 Original／Proposed 版本标签。
- **B11**：示例沿用 Git Review 的文件／目录图标、状态颜色、字母标记和悬停说明，状态由页面推导，不增加 agent 入参或共享树业务字段。

- **B12**：正式交付 `assets/panels/diff-review/panel.tsx`，id 为 `diff-review`，取代临时 tree 示例；补齐 skill 入口、契约文档及批注提交，修正此前遗漏的内置化交付。
- **B13**：引入 shadcn Resizable，由 Git Review 和 Diff Review 共用文件树／diff 的窄分隔线及拖拽分栏；不继续维护手写文件分栏拖拽核心。
- **B14**：DiffView 内部也统一到 Resizable，以一个列宽轨道驱动路径标题与所有差异块，保留行结构、横向滚动、批注定位及比例记忆，移除旧 diff-split.ts。

- **B15**：Git 历史三列和历史／diff 上下分栏也使用嵌套 Resizable，保留默认尺寸、单边拖动时的另一侧锁定、比例与批注状态，删除 history-columns.ts／history-split.ts。

## Context

仓库：`paneon`，路径 `/Users/yuguo/IdeaProjects/paneon`，分支 `0.0.x`，HEAD 基线 `f417c2f4af9d16a44ffa49aeea28003120425344`。工作区另有未提交的 Git checkout、批注等改动；上述 HEAD 不能代表全部在用行为。实施前记录当时文件树及三个视图的真实浏览器基线，保留其他任务的工作区改动。

当前 `ChangedFileTree` 直接接收 `GitFile[]`。模型中的 `TreeSnapshot` 仍要求 Git `status`、`source.view.area` 和 `source.old/new.path`，因此仅给组件增加泛型不能实现中立复用。当前实现还包含这些必须保留的行为：

- changes 按 staged、unstaged、untracked 分区，同一路径的两份改动保留不同身份；history、compare 没有这三种分区。
- 路径建树、单子目录链压缩、目录优先排序、树／平铺切换、状态颜色及旧新路径提示。
- 搜索匹配文件的旧／新路径，保留祖先；搜索期间强制显示祖先，不把搜索展开写进原来的折叠状态；搜索时“全部折叠”禁用。
- 文件单击选择、双击打开、Enter 选择并打开；目录整行点击切换展开。当前使用原生按钮的焦点和 Tab 操作，没有完整 APG 方向键导航。
- 按 `scopeKey` 保存视图状态；选择变化及批注定位可以重新展开祖先，重复定位同一文件也有效。
- `pending` 不会自动删除已有列表；无数据且不在加载时显示各视图自己的空态。

既有 `stateless-git-review` 规范要求保持用户可见的交互、UI 和布局。本设计继续遵守该约束，路径式 diff-review 面板负责证明非 Git 复用。

## Goals / Non-Goals

**Goals:**

- 使用访问器读取任意同步、完整的树数据，回调保留原业务对象。
- 明确状态归属、搜索覆盖层、定位完成／取消及原生按钮交互。
- Git Review 使用共享树，并保持现有分区、操作、几何布局、滚动和批注定位。
- 提供能直接理解的接口注释、Git 和非 Git 示例。

**Non-Goals:**

- 不改 Git 后端、DiffView 公开入参或共享批注协议；文件读取与批注提交由 diff-review 面板适配。
- 不要求 agent 提供方案 ID、版本号、节点 ID 或手写目录 children。
- 不实现节点懒加载、虚拟化、多选、拖放、编辑或完整 APG treeview 导航；不声明当前交互已满足该复合控件规范。
- 不新增跨刷新持久化、状态缓存服务、定时重试或依赖包。

## Decisions

### 共享核心与适配层

`src/ui/tree.tsx` 负责递归展示、原生按钮交互、选择／展开状态、过滤显示及定位。`tree-model.ts` 只处理访问器索引、祖先和过滤计算，不导入 skill 资源或 Git 类型。

Git 适配层保留分区标题及其 Collapsible 容器，每个分区内组合一个 `Tree`；没有分区的视图组合一个 `Tree`。这样分区的文案、计数、工具栏和容器不用进入通用节点模型。适配层协调分区展开及目录树定位，不让公共 `Tree` 认识 staged 等枚举。

现有 Button、Collapsible 已覆盖当前操作和渲染需求。MUI 的访问器和受控展开接口、react-arborist 的数据访问器与激活回调是接口参考，不能证明直接替换组件后仍兼容。整套库替换会引入焦点模型和样式适配，本次不采用。参考：[MUI API](https://mui.com/x/api/tree-view/rich-tree-view/)、[MUI 受控展开](https://mui.com/x/react-tree-view/rich-tree-view/expansion/)、[react-arborist API](https://github.com/jameskerr/react-arborist#tree-component-props)。

### 公共接口

```tsx
type TreeItemState = {
  selected: boolean;
  expanded: boolean; // 搜索临时展开后的实际显示状态
  isBranch: boolean; // [] 也是容器，不能用 expanded 判断
  level: number; // 根节点为 1
};

// 仅放行实际需要的展示属性，不允许替换事件、ref、角色或展开状态。
type TreeItemPresentation = {
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  'aria-description'?: string;
} & { [name: `data-${string}`]: string | number | boolean | undefined };

type TreeProps<T> = {
  items: readonly T[]; // 根节点，按传入顺序展示
  getItemId: (item: T) => string; // 本 Tree 实例内唯一，数据更新后保持稳定
  getItemLabel: (item: T) => string; // 可访问名称和默认匹配的纯文本
  getItemChildren: (item: T) => readonly T[] | undefined;
  // undefined 是叶节点；[] 是已完整加载的空容器，不表示待加载。

  renderItemContent?: (item: T, state: TreeItemState) => React.ReactNode;
  // 只展示文字、图标、状态等，不放按钮、链接或输入框。
  // 行按钮、展开图标和事件仍由 Tree 管理。
  getItemPresentation?: (item: T, state: TreeItemState) => TreeItemPresentation;
  // Git 行颜色、title 和 data-* 需要落在行上，单独渲染文字不足以保持现状。
  isItemSelectable?: (item: T) => boolean; // 默认仅叶节点可选

  selectedId?: string | null; // undefined 为非受控，null 为受控的无选中
  defaultSelectedId?: string | null; // 仅初始化读取，默认 null
  onSelectionChange?: (id: string | null) => void;
  expandedIds?: readonly string[]; // undefined 为非受控，[] 为受控的全折叠
  defaultExpandedIds?: readonly string[]; // 仅初始化读取，默认 []
  onExpandedChange?: (ids: readonly string[]) => void;

  onAction?: (item: T) => void; // 叶节点 Enter／双击，传回原对象
  searchTerm?: string; // 默认空串
  isItemMatchingSearch?: (item: T, term: string) => boolean;
  loading?: boolean; // 整体读取状态，不触发节点加载或复制旧 items
  emptyState?: React.ReactNode; // 无数据或过滤结果为空时的内容
  className?: string; // 根容器布局；不创建业务工具栏或额外滚动区
  'aria-label': string;
  ref?: React.Ref<TreeHandle>; // React 19 的 ref prop
};

type TreeHandle = {
  revealItem(id: string, options: { signal: AbortSignal }): Promise<void>;
  expandAll(): void;
  collapseAll(): void;
};

// 拒绝定位时可按稳定 code 分类，不匹配 message 文本。
declare class TreeRevealError extends Error {
  code: 'TREE_ITEM_NOT_FOUND' | 'TREE_ITEM_FILTERED';
}
```

`TreeItemState`、`TreeItemPresentation`、`TreeProps`、`TreeHandle` 和 `TreeRevealError` 与 `Tree` 一起从 `@qoggy/paneon/ui` 导出。数据必须是有限、无环、身份不重复的树；访问器保持纯函数。组件不排序、不拆分路径、不访问文件系统。

展示接口只增加一个有现有用途的 `getItemPresentation`：Git 文件的颜色、精确路径提示及 `data-file-id/status` 不能仅靠 `renderItemContent` 设置。它不允许调用方覆盖 onClick、onKeyDown、tabIndex 或 aria-expanded，从而避免把行为管理重新交给每个面板。

### 状态和命令

选择和展开分别判断是否受控；每次挂载期间不切换对应模式。受控模式只通过回调请求变更，不能先私自修改内部值；非受控模式更新内部值并通知回调。展开回调只包含真实的基础展开状态，不包含搜索的临时展开；基础展开无变化不发通知。选择回调表达用户明确的选择意图，重复选择当前 ID 仍通知，不自动激活。实施核对发现 Git 的 selectFile 会据此取消正在进行的读取、结束 pending 并切换旧快照选中状态，因此不能把重复点击当成可丢弃事件；不为此新增另一个点击 prop。

`expandAll()` 请求展开当前完整数据中的所有容器。`collapseAll()` 在没有搜索时请求清空基础展开；非空搜索期间无操作，也不发回调，避免界面仍展开却暗中改掉基础布局。Git 工具栏继续禁用搜索期间的全部折叠按钮。

定位保持 `Promise<void>`，不增加成功结果联合类型。契约如下：

<!-- prettier-ignore -->
| 条件 | 处理 |
| --- | --- |
| ID 不在当前完整数据中 | 拒绝，code 为 TREE_ITEM_NOT_FOUND |
| 目标不在过滤结果中 | 拒绝，code 为 TREE_ITEM_FILTERED；不清空搜索 |
| 祖先尚未展开 | 非受控模式更新展开；受控模式通过 onExpandedChange 请求展开 |
| 父组件延迟回传 | 等待，不能因一次未更新就判断拒绝，也不内置任意超时 |
| 目标和祖先已显示 | 等目标行提交到 DOM，执行非平滑的 nearest 滚动，并在该次布局处理后 resolve |
| signal 取消、组件卸载或新 revealItem 替代旧调用 | 旧调用以原生 AbortError 拒绝，移除对应监听／待办 |
| 等待中目标被删除或搜索排除 | 按上面的稳定 code 拒绝 |
| 等待中用户发起折叠或全局展开／折叠命令 | 取消旧定位，避免旧请求稍后夺回显示位置 |

调用方必须提供 `AbortSignal`，负责视图切换、业务取消及自身超时策略；父组件从不采纳请求时，调用保持等待直到取消，不伪装成功或推断拒绝。取消不回滚父组件已经接受的展开。`revealItem` 不改变选择、焦点或打开 diff；连续定位同一 ID 也会重新展开、滚动。

```tsx
// 调用方持有取消源；更换视图或退出页面时也调用 abort()。
const controller = new AbortController();
try {
  await treeRef.current!.revealItem(fileId, { signal: controller.signal });
  // 这里只表示目录内的目标行已展开并完成定位。
} catch (error) {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  throw error; // 业务层展示／记录真实错误，不把失败当定位成功
}
```

### 搜索规则

非空 `searchTerm` 启用过滤；默认按 `getItemLabel` 做不区分大小写的子串匹配，不额外 trim 或改写用户内容。自定义匹配器收到原始 term。

- 匹配节点及其祖先保留；祖先匹配不代表全部后代匹配。空容器自身匹配时可以保留。
- 匹配结果的祖先临时展开；基础 `expandedIds` 不变，搜索本身不触发展开回调。
- 搜索本身不改基础状态；用户在搜索期间显式点击单个容器时，仍按现有按钮行为请求折叠基础状态，但搜索覆盖层保持该路径可见。清空搜索后反映这次主动折叠。此行为与被禁用的“全部折叠”分开约定。
- 清空搜索，恢复基础展开布局。搜索期间显式执行 `expandAll()` 或成功定位所请求的基础展开仍保留，因为它们是独立操作。
- Git 自定义匹配器只匹配文件的 old/new 原始路径，目录本身返回 false；目录展示标签及压缩方式不会因过滤重建。搜索后的可见文件计数由适配层按相同匹配规则计算。
- 搜索不自动改变选中项；目标被搜索隐藏仍可保持选中 ID，但不会显示选中行。定位是否清空搜索由面板决定。

### 交互表

本次沿用原生按钮组成的层级列表。根容器使用可命名的 `role=group` 和 `aria-label`，通过 `tabIndex=-1` 支持无行时的程序化焦点，不增加一个 Tab 停靠点；容器按钮保留 `aria-expanded`，可选择行保留 `aria-pressed` 和清晰焦点样式。不增加 `role=tree/treeitem` 冒充完整复合控件。焦点和选择的区别参考 [WAI-ARIA Tree View Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)，它不要求本次顺带改变现有键盘流程。

<!-- prettier-ignore -->
| 操作 | 叶节点 | 容器节点 |
| --- | --- | --- |
| 单击行 | 可选时请求选择；不激活 | 切换展开；显式允许选择时同时请求选择 |
| 单击展开图标 | 无图标 | 与行点击同一操作，只切换一次 |
| 双击 | onAction 一次；前置 click 仍按单击规则处理 | 按两个原生 click 处理，不发 onAction |
| Enter | 可选时先请求选择，再 onAction 一次，阻止重复合成点击 | 与原生按钮激活一致，切换一次；不发 onAction |
| Space | 原生按钮 click，仅按单击规则处理 | 原生按钮 click，仅按单击规则处理 |
| Tab / Shift+Tab | 按现有文档顺序移动焦点，不跟随选择 | 同左 |
| 方向键 / Home / End | 不增加自定义焦点或选择逻辑 | 同左 |
| isItemSelectable=false | 不选择；仍可聚焦和激活 | 不选择；仍可聚焦和展开 |

`renderItemContent` 只能返回展示内容。已有图标、计数、颜色可组合；行内按钮和输入框不属于本次契约，不为尚不存在的操作增加事件绕行。

### 加载和数据变化

`loading=true` 设置忙状态；初始 `items=[]` 时不显示 emptyState。有现存 items 时照常显示传入数据，组件不私存一份旧数据。非加载且可见结果为空时渲染调用方的 emptyState；Git 可按当前行为对“无改动”和“搜索无结果”分别提供内容。

受控的无效 selectedId／expandedIds 不导致树擅自通知父组件或改写 props；渲染忽略不存在的身份。非受控选中项被真实删除或变得不可选时清空并通知一次；非受控展开状态移除真实删除的身份并按变化通知。过滤只影响可见性，不视作删除。

当前焦点行被过滤、删除或因折叠隐藏时，若焦点原本在树内，先移到最近仍可见的祖先，再选原可见顺序中的邻近行；无可见行时留给根容器的程序化焦点。焦点已在其他面板时不夺回。新数据的身份保持稳定时不重新初始化默认状态。

### Git 适配示例

现有 `groupFileTrees`、`snapshotTitle`、`statusClass` 等保留在 Git 资源目录。将原 `TreeNode<GitFile>` 用访问器交给 Tree，而非让 Tree 继承 TreeSnapshot：

```tsx
// 以下在每个既有分区的 CollapsibleContent 内组合，分区标题不交给 Tree。
<Tree
  ref={treeRef}
  items={nodes}
  getItemId={(node) => (node.kind === 'file' ? node.snapshot.id : `directory:${area}:${node.path}`)}
  getItemLabel={(node) =>
    node.kind === 'file'
      ? snapshotName(node.snapshot, message)
      : t('Directory {path}', { path: node.path })
  }
  getItemChildren={(node) => (node.kind === 'directory' ? node.children : undefined)}
  isItemSelectable={(node) => node.kind === 'file'}
  selectedId={selectedId ?? null}
  expandedIds={expandedDirectoryIds}
  onExpandedChange={updateDirectoriesInCurrentScope}
  onSelectionChange={(id) => {
    const node = id === null ? undefined : nodesById.get(id);
    if (node?.kind === 'file') onSelect(node.snapshot); // 完整 GitFile 原对象
  }}
  onAction={(node) => {
    if (node.kind === 'file') onOpen(node.snapshot);
  }}
  searchTerm={filter}
  isItemMatchingSearch={(node, term) => node.kind === 'file' && matchesPath(node.snapshot, term)}
  renderItemContent={renderExistingGitContent}
  getItemPresentation={existingGitRowPresentation}
  aria-label={fileListLabel}
/>
```

`renderExistingGitContent` 保留文件图标、文件名、平铺父目录、状态码和目录计数；共享树提供原来位置及尺寸的展开图标。`existingGitRowPresentation` 保留现有行 class、缩进、title、aria-description 和 data 属性，按有无分区补齐原来的缩进层级，不在核心判断 Git 状态。包装层保留 `ChangedFileTree` 的外部 props，`scopeKey/revealKey` 不进入公共 Tree。

Git 包装层仍按 scope 保存 `{ groupByDirectory, collapsedIds }`。例如当前浏览器内可以表示为：

```jsonc
{
  "repo:changes": {
    "groupByDirectory": true,
    "collapsedIds": ["group:staged", "directory:unstaged:src"],
  },
}
```

目录的基础 expandedIds 由完整目录集合减去 collapsedIds 得到，因此新出现的目录维持原来的默认展开。工具栏由适配层统一更新完整分区／目录集合，不能只操作当前已挂载的 Tree，否则折叠分区里的目录会漏掉。定位先显示所属分区，等待对应树挂载，再用同一个取消信号调用 revealItem；选择变化和旧 revealKey 驱动现有自动定位，避免改变外部协议。包装层持有整次定位的 AbortController，在切换 scope、工具栏展开操作或用户折叠分区时取消，防止树外操作遗漏取消。搜索排除目标时保留页面既有的显式搜索处理，不由通用树修改 term。

### 非 Git 调用及 JSONC

内置 diff-review 面板组合目录导航、共享 DiffView 和文本批注。页面通过命名 query action 并行读取两侧 UTF-8 文件；相对路径按实例 --cwd 解析，null 返回空字符串，缺失或不可读的文件按错误展示。共享树仍不读取磁盘。默认展开并打开第一份比较；其他条目仍以单击选择、双击／Enter 打开。每个激活条目挂载独立的查询／比较视图，旧响应不覆盖新文件。示例适配器接收已有的扁平文件描述，以 displayPath 建树并生成浏览器内部身份，叶节点保留 comparison 引用。agent 不需要提供节点 ID 或嵌套 children。

```jsonc
{
  "title": "审阅提示词改动", // 可选的面板标题
  "files": [
    {
      "displayPath": "prompts/analyze-session-worker.md", // 可选，只决定显示层级
      "oldPath": "lib/workflow/observability/prompts/analyze-session-worker.md",
      "newPath": "/tmp/proposal/analyze-session-worker.md",
    },
    {
      "displayPath": "prompts/new-guide.md",
      "oldPath": null, // 明确表示新增；两侧不能同时为 null
      "newPath": "/tmp/proposal/new-guide.md",
    },
  ],
}
```

displayPath 省略时使用 oldPath、否则 newPath 的文件名。展示路径不用于磁盘遍历；不同物理路径也不自动意味着重命名。本面板实现文本读取、差异展示和显式批注提交，不改变既有 Git Review 协议。

```tsx
type ReviewNode = {
  key: string;
  name: string;
  nodes?: readonly ReviewNode[];
  comparison?: { oldPath: string | null; newPath: string | null };
};

<Tree
  items={reviewRoots} // 由示例适配器把 flat files 转成目录；不是 agent 输入
  getItemId={(node) => node.key}
  getItemLabel={(node) => node.name}
  getItemChildren={(node) => node.nodes}
  isItemSelectable={(node) => node.comparison !== undefined}
  onAction={(node) => {
    if (node.comparison) openComparison(node.comparison);
  }}
  aria-label="拟议修改的文件"
/>;
```

示例的 files 输入在实例生命周期内固定：叶节点身份使用原始条目序号，目录身份使用独立命名空间下的展示路径；过滤不重新编号。comparison 保留原始条目的对象引用。同名文件位于不同目录时独立展示；重复展示路径的比较项也不能覆盖数据。示例回调必须得到正确的原始比较项，而不是通过 Git 字段反查。

工具栏留在示例页面组合，沿用 Git Review 的 ghost／secondary 图标按钮、悬停提示与左右布局，不把操作放进共享 Tree。目录／平铺切换保留叶节点身份、当前选择、目录展开状态及已打开的 DiffView；平铺时附上父目录。查看差异打开选中的比较项；无可折叠目录时禁用展开／折叠，搜索期间禁用全部折叠。

示例行借鉴 Git Review 的图标和配色：新增 A 为绿色、修改 M 为蓝色、删除 D 为弱化色，附状态字母及可访问的悬停说明。oldPath 为 null 表示新增，newPath 为 null 表示删除；两侧均存在时，打开读取前显示中性的省略号，成功读取后按全文比较显示 M 或无变化 =。读取失败显示琥珀色 !，不当成删除。状态留在页面适配层，切换目录／平铺不丢失；不把临时目录的物理路径差异推断为重命名，也不引入 staged／unstaged／冲突等 Git 状态。

### 内置 Diff Review 的交付边界

正式入口为 `skills/paneon/assets/panels/diff-review/panel.tsx`，`definePanel.id` 为 `diff-review`。内置页通过 skill 表格和 `references/diff-review.md` 发现，不需要额外 CLI 注册表。原 tree 示例移除，防止继续分叉维护。

入参保持 title 可选、files 中 displayPath 可选、oldPath/newPath 可空且至少一侧存在。目录由展示路径构建，目录优先和名称排序、单链目录压缩、可见文件计数、完整展示／两侧路径搜索由面板适配层实现，目录与 diff 默认全部展开。共享 Tree 继续只处理访问器数据，不引入 Git 字段。现有 Git Review 不改动。

通过 `usePageAnnotations` 注册 DiffView 两侧文本。首次成功读取时在浏览器内保存内容快照，内部生成哈希及清单序号作为引用；它们不进入 agent 入参。批注定位使用原快照，磁盘内容后续变化不改写旧批注。`diff-review-submitted` 只在显式提交时产生，包含完整批注列表和所引用的文件描述／快照身份，选中文字由批注 text 保存；不传整份文件。服务端对保留快照哈希、两侧存在性、原始 UTF-16 范围及引用关系做校验。更正沿用 replacesEventId，失败保留草稿；页面刷新后的草稿持久化不在本次范围。

## Risks / Trade-offs

### Resizable 接入

`src/ui/resizable.tsx` 沿用官方 base-nova 组件，固定 `react-resizable-panels@4.15.0`，上游 URL／哈希记入 upstream.json，公开导出三项组件及 groupRef 的句柄类型。面板共用 `assets/shared/file-review-split.tsx`：1px 分隔线、12px 鼠标命中区、左侧至少 9rem／右侧至少 20rem、初始左侧 max(13rem,20%)。底层库管理指针、约束和 ARIA；组合层通过库 API 保留旧键盘步长、Escape／pointercancel 回滚及收起、视图切换后的宽度记忆。ARIA 数值沿用库的百分比单位。

DiffView 的内部列宽同样由 ResizablePanelGroup 管理。由于多个 hunk 各自拥有横向滚动表格，内部使用一套覆盖代码区的列宽轨道，Panel 分配宽度后通过 onLayoutChange 写入共同 CSS 列宽；标题和各表格继续使用同一边界，拖动不重新渲染源码文字。轨道上的 handle 使用库的原生指针和 ARIA，适配层仅保留既有键盘步长与取消。每份 DiffView 使用独立的 Panel 身份，切换单列／左右模式时保存比例。

Git Review 的 changes／compare 接入该组合，删除原 file-split.ts；history 的三列与上下分栏由 history-workspace.tsx 中的横向／纵向 Group 组合，删除原 history-columns.ts／history-split.ts。Diff Review 接入相同组合，去掉固定 18rem 和 16px 间隔。拖拽过程只由库更新布局，不替换 diff DOM、不重新查询、不提交事件。以接入前实际 Git 窗口尺寸为几何基线，并验证批注及原快照定位。

- [抽取影响行高、缩进、图标位置或滚动] → 保留现有分区和工具栏，接入前后用同一数据、桌面视口及实际侧栏宽度对照截图、DOM 和几何数据；失败先定位原因。
- [受控父组件不采纳定位请求] → 明确等待而非猜测拒绝；要求调用方提供取消信号，视图切换时取消并释放监听。
- [通用键盘模型改变 Git 操作] → 本次保留原生按钮模型，不添加完整 treeview 角色及方向键导航。
- [共享搜索与 Git 计数出现分歧] → 使用相同匹配器并验证旧／新路径、压缩目录和可见文件计数；不根据过滤后的节点重新压缩路径。
- [其他任务同时修改 Git Review] → 实施时核对最新工作区和变更归属；只修改文件树接入所需内容，不覆盖 checkout 或批注改动。

### 历史分栏的约束迁移

HistoryWorkspace 只接收分支、提交列表、文件区和 diff 的 React 内容槽，以及显示状态和父级持有的会话内布局 ref；不改变 Git 输入、读取、checkout 或批注协议。横向三列通过库的 Panel.disabled 在手势期间固定另一侧外栏，防止中栏触及最小值后挤动另一侧。布局默认值由已有断点公式计算；未调整时保持自适应默认值，用户调整后保存 requestedLayout。纵向 Group 保留 0.8:2 比例与 12.75rem／15rem 最小高度，收起时将 diff 约束为零并保留内容，再展开恢复布局。拖拽尺寸更新由库完成，不按每个像素 setState；组件只在手势开始／结束更新锁定状态。

## Migration Plan

先记录现状验收数据，再实现共享组件及独立示例，最后接入 Git 包装层并比较三个视图。没有持久化迁移或历史协议兼容层。接入不满足现状约束时，修复共享组件／适配层的具体原因；确需改变可见行为时单独对焦，不能用验收通过推定授权。

## Planned source and documentation paths

以下为计划受影响的产品和文档路径，实施时按实际变更维护；不涉及其他仓库。

```text
src/ui/tree.tsx
src/ui/tree-model.ts
src/ui/index.ts
src/ui/README.md
skills/paneon/assets/panels/git-review/file-tree.tsx
skills/paneon/assets/panels/diff-review/panel.tsx
skills/paneon/assets/panels/diff-review/model.ts
skills/paneon/assets/panels/diff-review/icons.tsx
skills/paneon/assets/panels/diff-review/icons.LICENSE
skills/paneon/assets/panels/diff-review/schema.ts
skills/paneon/references/diff-review.md
skills/paneon/references/git-review.md
skills/paneon/references/authoring.md
openspec/changes/extract-neutral-file-tree/.openspec.yaml
openspec/changes/extract-neutral-file-tree/proposal.md
openspec/changes/extract-neutral-file-tree/design.md
openspec/changes/extract-neutral-file-tree/specs/generic-tree/spec.md
openspec/changes/extract-neutral-file-tree/tasks.md
openspec/changes/extract-neutral-file-tree/verification.md
```

实际验收命令、结果、文件清单和临时截图路径记录于 `verification.md`；不以接口设计或类型检查替代浏览器兼容性证据。

## Open Questions

无未决接口项。实施结果和验证边界以 `verification.md` 为准。
