# Stateless Git review components

## 需要你处理的事项

### 需用户提供的信息

无。用户的组件职责和批注语义已明确。

### 需用户拍板的决策

目前无新增待定项。若实现必须改变默认交互、事件大小上限、授权路径、公开组件职责或扩大到 PR/运行时，执行者先报告明确选项与影响，由主 Agent 问用户，依赖部分暂停；禁止自行引入持久化/兼容/恢复机制。

### 需用户确认的风险

无新增待确认风险。仅在独立 worktree 开发，不操作用户当前实例或 runtime.sqlite；验收后由主 Agent 合入并本地 commit，不 push。

### 已确认结论

- **B1**：Diff 以 oldText/newText 为核心输入；分支、Commit 和改动文件组件以仓库路径、分支/固定 commit、选择回调等语义 props 为边界，可封装 serverAction 读取 Git。
- **B2**：批注绑定当时页面内的文件内容。工作区变化、切换分支/commit 或后端重建均不得用最新内容替换旧批注。
- **B3**：组件/页面拥有显示数据；后台不是批注原文的唯一来源。移除旧进程业务 Map 的功能依赖，不通过快照落盘或强制常驻解决。
- **B4**：产品首版未发布，不保留历史接口兼容层。中文批注、英文 annotation；正文 comment 字段和完整 replacesEventId 语义保留。
- **B5**：本任务只实施 Git 面板优化。panel 堆积、共享进程池和生命周期策略另行讨论。
- **B6**：主 Agent 严格验收；遇到无法从已确认要求中确定的产品/API 取舍，及时问用户，不用单元测试通过替代用户可见验收。
- **B7**：Git 面板现有交互、UI 和布局不改。内部组件抽取不得改变控件、文案、按钮位置、默认行为、点击/键盘操作、加载反馈、尺寸、间距、分栏、滚动和响应式布局；独立复用仅在测试/示例页验证。

## Context

仓库 `/Users/yuguo/IdeaProjects/paneon`，分支 `0.0.x`，实施基线 `a32404d8d97fef89fa0eb86f3e76bf1c00081aea`。`git.ts:275-303` 的 sessions 保存 snapshots/listings/histories；`readGitFile` 以 listingId/fileId 查 Map；`validateGitFeedback:756` 以 sourceId 查 Map。浏览器 `panel.tsx:131,275` 已存 GitSnapshot。`branches.tsx`、`history.tsx`、`file-tree.tsx` 主要是展示部件；`shared/diff.tsx:35` 已支持字符串但强依赖 sourceId/FeedbackProvider。编译器要求 serverAction 顶层命名导出，封装不能变成在 React render 闭包内动态创建 action。

页面持有所见原文、完整请求校验及后台可丢弃边界见本文件 Browser-owned annotation data 和 Implemented API and ownership；资源约束见 [资源生命周期设计](../add-panel-resource-lifecycle/design.md)。旧资源设计中的两个章节已被重整，不再引用不存在的章节；其 runtime 任务仍不属于本 change。

## Goals / Non-Goals

目标：Git 后端调用可在没有旧会话缓存的全新模块执行环境中正确工作；组件可用少量语义 props 独立组合；已有 UI/性能体验保持。非目标：不改 Runtime/进程模型，不做 PR 后端的对等重构，不发布整套新组件库，不为任意本地篡改添加防御，不加签名取证、持久化快照、自动重试或历史兼容。

## Component contracts

<!-- prettier-ignore -->
| 能力 | 作者需要提供 | 组件/配套读取层负责 |
| --- | --- | --- |
| Diff | 两个字符串；路径/版本/语义 ref 可选；反馈能力按需组合 | 展示、行/字坐标、导航和交互；两个字符串单独使用不必创建 Git session 或整页 Provider |
| Git 分支列表 | repositoryPath、selected、onSelect | 从显式仓库读取 refs，再复用现有 Branches 展示；无需调用方持有 GitSnapshot 或 session |
| Git Commit 图 | repositoryPath、branch 或明确 tip、selected、onSelect | 固定版本读取、分页和图布局；读命令收在组件模块/配套 hook，不要求外层整页协调内部缓存 |
| Git 改动文件 | repositoryPath、固定 commit/parent 或明确比较范围、onSelectFile | 文件树与状态颜色，按文件点击读取当次内容，回调含足够来源和文本用于 Diff/批注 |

建议在 Git 资源目录新增 `components.tsx` 导出三种读取型包装组件，必要时将命名 action 分离到 `actions.ts`；复用已有图和树展示，不重写绘制算法。props 的业务语义必须符合上表，内部名称可沿现有规范整理。通过一个最小自定义 TSX 例子证明组件能独立复用；不强制现在加入 `paneon/ui` 公共包导出。出现需要改变上述职责的取舍须先报告。

## Explicit read requests

用固定 OID/比较范围、路径与可序列化游标代替只在旧进程可解释的 ID。分支名首次读取解析 tip，后续同一分页使用固定 tip；commit 对比保持首父/明确 parent 和 merge-base 语义。工作区读取返回当次内容标识；后续重新读取是新版本。授权仓库、相对路径、Git 参数数组和既有符号链接/二进制/冲突文件边界继续沿用，不放宽访问。

下列 JSONC 是契约意图，不要求复刻字段命名：

```jsonc
{
  "repositoryPath": "/work/repo",
  "view": { "type": "history", "commit": "<full SHA>", "parent": "<full SHA or null>" },
  "path": "src/config.ts",
  "cursor": { "tip": "<fixed full SHA>", "offset": 100 }, // 仅分页时提供，不是服务端 Map key
}
```

移除 session 状态依赖后，优先不加新的后台缓存；若有已证实必要的加速缓存，miss 必须可重建且有明确边界。不得把 Map 换名、换进全局单例、SQLite、磁盘或浏览器 localStorage 就宣称完成无状态改造。

## Browser-owned annotation data

浏览器保存原文、来源、版本和模型；草稿引用的内容不能随视图更新被覆盖/淘汰。无引用结果可有界淘汰。显式提交构建去重 sources/evidence，后台仅依赖当前请求和固定配置做完整 Zod、来源、quote、行/字坐标内部一致性校验，不重新读最新文件解释旧批注。file 目标需来源/路径/类型/hash，不必附完整文件；lines/text 需对应行范围完整原文与 UTF-16 范围/quote；hunk 需当时 patch 和必要两侧原文片段。例子：

```jsonc
{
  "annotations": [
    {
      "id": "a1",
      "targets": [
        {
          "ref": {
            "kind": "lines",
            "sourceId": "display-1",
            "side": "new",
            "startLine": 1,
            "endLine": 1,
          },
          "text": { "start": 16, "end": 20, "quote": "3000" },
        },
      ],
      "comment": "为什么改成 3000？",
    },
  ],
  "sources": {
    "display-1": {
      "repositoryId": "repo-1",
      "view": { "type": "changes", "area": "unstaged" },
      "new": { "path": "config.ts", "type": "text", "contentHash": "<whole-content SHA-256>" },
      "evidence": [
        {
          "kind": "lines",
          "side": "new",
          "startLine": 1,
          "endLine": 1,
          "text": "const timeout = 3000;\n",
        },
      ],
    },
  },
  // 可附 replacesEventId；comment 只属于 annotations 条目，每次提交是完整结果。
}
```

原文片段不能证明完整文件哈希或 Git 来源真实性，不加入签名体系。继续使用 65536 UTF-16 字符事件上限和 262144 UTF-8 字节请求上限；必要证据完整但不发送无关整个 DiffModel。超限拒绝且保留草稿，不静默截断/分批/自动落盘。只有明确提交且有持久化回执才报告成功；刷新/关闭浏览器可以丢失未提交草稿。

## UI and regression boundaries

**禁止改动用户可见交互、UI 和布局。** 以当前基线截图、DOM/可访问性结构和真实操作为对照，内部封装不得带入新的外观或操作步骤。保留选中 commit 的即时反馈、异步竞态隔离、懒读取（没点文件不展示/读取 Diff）、完整 commit message、分支固定范围及拓扑、文件树目录折叠/合并和 M 蓝/A 绿/D 虚、分隔线拖动、Diff 收起/导航/双单列切换、Command+A 不崩溃、批注多目标/定位/更正。维持 light/dark、en/zh-CN 和窄屏；不借重构重新设计整体样式。

## Planned source and documentation paths

```text
skills/paneon/assets/panels/git-review/git.ts
skills/paneon/assets/panels/git-review/schema.ts
skills/paneon/assets/panels/git-review/panel.tsx
skills/paneon/assets/panels/git-review/components.tsx
skills/paneon/assets/panels/git-review/actions.ts
skills/paneon/assets/panels/git-review/branches.tsx
skills/paneon/assets/panels/git-review/history.tsx
skills/paneon/assets/panels/git-review/file-tree.tsx
skills/paneon/assets/shared/diff.tsx
skills/paneon/assets/shared/diff-schema.ts
skills/paneon/assets/shared/diff-model.ts
skills/paneon/references/git-review.md
skills/paneon/references/feedback.md
skills/paneon/references/authoring.md
openspec/changes/refactor-git-review-stateless/proposal.md
openspec/changes/refactor-git-review-stateless/design.md
openspec/changes/refactor-git-review-stateless/tasks.md
openspec/changes/refactor-git-review-stateless/specs/stateless-git-review/spec.md
openspec/changes/refactor-git-review-stateless/verification.md
```

实际路径若因合理抽取改变，维护完整清单。共享 Diff 被 PR 复用，必须验证 PR 回归；不得顺带改 PR 业务协议。纯组件解耦若必须改通用反馈公开 API，先报告具体必要性和备选，再由主 Agent 对焦。

## Acceptance and handoff

主 Agent 不以执行者自报通过为结论。验收必须独立审查 props/请求/事件 JSON、查找剩余后台状态依赖，并复跑关键用例与真实浏览器；复杂修复退回执行者。未解决取舍必须列明确问题，不默认放行。worktree 中交付一项聚焦本地 commit 或合理少量 commit、完整文件清单、命令/日志/截图/边界与未通过项；禁止 push 或合入主分支。

## Implemented API and ownership

The exported skill-resource wrappers are `GitBranches({repositoryPath,selected?,onSelect})`, `GitCommitGraph({repositoryPath,branch?,tip?,selected?,onSelect})` and `GitChangedFiles({repositoryPath,view,selected?,onSelectFile})`, with matching `useGitBranches`, `useGitHistory` and `useGitFiles` hooks. The built-in page keeps the existing Branches/HistoryRows/ChangedFileTree JSX and uses the shared `useGitReader(params)` boundary from the same module, preserving its layout/loading/race/selection orchestration. Named server actions are top-level exports in `actions.ts`.

The final function signatures are `readGit(params, request, signal?)`, `readGitFile(params, fileDescriptor, signal?)`, `buildGitFeedback(feedback, snapshots)` and `validateGitFeedback(params, completeEvent)`. `sessionId`, `historyId` and backend `listingId` inputs are removed. Returned `listingId` only scopes the browser's displayed file cache. A file descriptor has `source.repositoryId/view/old.path/new.path` and `read.entry` (modes, blob OIDs, paths and status) plus `read.working/conflict`; it is enough to read in a fresh module/process with current fixed configuration. Working files are captured at opening time.

History request `historyContext` contains only `{repositoryId,branch,tip?}` and an explicit `offset`/`pageOnly`. The first result includes `historyRefs/historyDecorations` retained in browser memory. The browser restores those frozen decorations on later pages and selection details; a large catalog is never resent in every read request. This preserves fixed-tip graph/decorations and existing request limits without a required server Map. Explicit refresh discards the context. An optional explicit history `parent` must be an actual parent (null only for a root); the built-in page still uses its first-parent default.

`DiffView` without `sourceId` renders a string/model comparison without calling `useAnnotations`. `sourceId` opts into `AnnotationRoot` integration, preserving PR callers and the public annotation API. `feedback.ts` builds normalized/de-duplicated sources/evidence in the browser. File-only sources have `evidence:[]`; line evidence stores exact selected complete lines; hunk evidence stores patch and composing old/new fragments. The pure validator checks configured repository association and internal consistency, not client/Git authenticity. Full `comment` and `replacesEventId` participate in the same 65536 UTF-16 event limit. Runtime transport remains 262144 UTF-8 bytes. No Runtime/PR business protocol, persistence or retry behavior is changed.

Exact examples are in `skills/paneon/references/git-review.md`, including component props, request/file descriptor, result and evidence formats. Verification and all actual changed files are recorded in this change's `verification.md`.
