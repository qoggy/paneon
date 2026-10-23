# B44 / B45 页面交付

## 交付范围

独占 worktree：`/Users/yuguo/.codex/worktrees/comment-pages/paneon`。基线 `c10da98`；`2f05f1c` 是主树 `ee0e8f5` 的文档副本，主 agent 不需要重复合入。

本组实现提交：`613f153`、`6ee8af0`。公共组件未复制到本组提交；页面依赖 comment-core 的完整运行时代码链：`b33de55` → `6a3fd7c` → `70d1f7d` → `c03e007` → `5671d84` → `4dbc140`。公共组最后的 `bb3cb23` 是其测试、指南和报告，仍由主 agent 单独集成。

- Git、Markdown 审阅、表格、GitHub PR 和并发讲解都独立挂载一次 `FeedbackSurface`，将紧凑 `FeedbackToolbar` 放在页面上方操作位置。移除旧的独立“选择与批注”和“还有哪里需要解释”区块。
- 按公共组件提供正常文字划选的附近批注入口、临时输入、保存后编号、编号重新编辑、取消/保存/删除。页面统一“提交批注”；保存只更新页面草稿，提交才通过原事件交给当前 AI。
- 专用行/列/文档选择使用公开 `toggleTarget` 和 `selectionTargets`：先多选目标，再点工具栏批注输入；取消恢复选择状态，未保存选择不能被提交时静默忽略。TableRow/TableHead 通过 `FeedbackTarget asChild` 登记，保留合法 table DOM；整篇 Markdown 同样登记真实对象。
- 从原有 diff 定位算法提取 `diffTargetRanges`，Git/PR adapter 通过可选 `targetRanges` 供公共 Surface 使用。原文引用、sourceId、字符偏移和事件没有改变；显式行号/连续行引用与整侧文字登记不同，也能得到就地标记。未使用 quote 搜索、插入 marker 文本或重复文字注册。
- Git 工作台改为局部全宽紧凑布局：历史上方是对齐的短 hash / subject / author / date 与文件列表，下方为 diff；changes/compare 是文件列表与 diff 左右分区。各区独立滚动，选中 commit 明确；长标题/作者/路径省略但保留完整 title，时间缩短显示、保留原值。
- shared diff 的两侧拥有独立横向 viewport，长行可到达末尾、不覆盖另一侧；各行高度及无末尾换行提示对齐。定位长行批注会滚动到实际原文片段，而非只滚整行开头。PR 共用此渲染器。

未改变 Git/gh 查询、模型、schema、SDK/运行时事件、业务写接口、全局 Page/CodeBlock/host 或依赖。没有执行真实部署、GitHub 写操作、push 或发布。

## 验证环境和结果

所有组合验证在 `/private/tmp/paneon-comment-pages-combined`，组合本组源码和上列公共组件真实提交。该目录不是主树；没有假 stub。完整 npm 包通过 `npm pack`，在独立安装目录使用真实安装的 runtime、UI 和拷贝的 skill 源码进行 Chrome 验证。最终包 SHA-256：

`f96eb733ed25d0e6c53bfff3b87b9dda6024a1c4893a77916763f139cb845235`

| 检查                                                                                                                       | 结果                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`（包含完整 typecheck、CLI/UI/web）                                                                          | 通过，公共运行时代码截至 `4dbc140`                                                                                                                                                                                                                               |
| `node --test tests/{git-review,table-review,table-review-markdown,github-pr,explanations,feedback,feedback-state}.test.ts` | 33/33 通过                                                                                                                                                                                                                                                       |
| `npm run lint`                                                                                                             | 0 errors；15 条既有 non-null assertion warnings                                                                                                                                                                                                                  |
| `npm run format:check`                                                                                                     | 通过                                                                                                                                                                                                                                                             |
| `tests/browser/table-review.mjs`                                                                                           | 表格及 Markdown 全部通过；包括行列暂选勾选/取消、pending 提交门控、行列同编号两处标记重开、整篇编号重开、格式化原文坐标、失败冻结/保留、完整更正、CLI events/ack                                                                                                 |
| `tests/browser/git-review.mjs`                                                                                             | 全部通过；三视图、多仓库、暂存/未暂存、两侧/文本/行/块/文件批注、旧快照与更正历史、CLI events/ack                                                                                                                                                                |
| `tests/browser/git-review-layout.mjs`（Git 套件也调用）                                                                    | 真实 55 个 commits / 73 个改动文件；50→55 历史加载、长 subject/author/date/path；列几何不重叠；commit/file 独立滚动；切提交、过滤；old/new 长行末尾可达；两侧第 3 行及两侧连续行的就地编号/编号重开；长行 marker 随内层横滚隐藏/恢复；390px 无 document 横向溢出 |
| `tests/browser/github-pr.mjs`                                                                                              | 完整/独立/覆盖范围三场景 3/3；只读 gh fixture、跨 PR/旧 head/body/check 快照、意见和审阅请求分离、查询/提交失败、传输限制、事件更正及 CLI                                                                                                                        |
| `tests/browser/explanations.mjs`                                                                                           | 并发与 Sentinel 完整通过；并发情境快照、空批注、更改、CLI、Sentinel 原有交互和窄屏保留                                                                                                                                                                           |
| `tests/browser/git-review-pack.mjs`                                                                                        | 最终独立 npm 安装包完整 Git 和布局套件通过                                                                                                                                                                                                                       |
| `tests/browser/github-pr-pack.mjs`                                                                                         | 最终独立 npm 安装包 PR 3/3 通过                                                                                                                                                                                                                                  |

初轮组合发现并实际修复了：公开 toggleTarget 绕过临时编辑；表格行列与整篇缺少对象登记；区间 ref 缺少 marker 几何；长行定位只显示行头；对象立即展开编辑器会遮住相邻选择控件；测试把 Radix 关闭动画误当仍展开。公共问题由公共组修复，页面问题由本组修复。未用 force 点击或删断言。

最终包 PR 原生鼠标划词曾有一次空 selection；旧测试在切换 PR 状态后未等待列表查询结束。已补齐查询完成与两帧布局稳定前提，并保留失败时实际鼠标命中、矩形和截图诊断。最终独立包完整 3/3 通过；没有增加自动重试，也未据此断言所有浏览器状态都不会丢原生 selection。

## 截图和日志

最终独立包截图（主 agent 可直接打开检查）：

- `/private/tmp/paneon-comment-pages-final-evidence/git-history-desktop.png`
- `/private/tmp/paneon-comment-pages-final-evidence/git-history-mobile.png`
- `/private/tmp/paneon-comment-pages-final-evidence/git-review.png`
- `/private/tmp/paneon-comment-pages-final-evidence/github-pr.png`
- `/private/tmp/paneon-comment-pages-final-evidence/table-review-annotated.png`
- `/private/tmp/paneon-comment-pages-final-evidence/table-review.png`

并发与 Sentinel 截图：`/private/tmp/paneon-comment-pages-evidence/explanations-concurrency.png`、`explanations-sentinel.png`。完整编辑器各阶段的公共截图由 comment-core 报告提供。本组截图仍有基线 host 外壳，未越界修改它。

日志：`/private/tmp/paneon-combined-build-final.log`、`paneon-comment-pages-unit-final.log`、`paneon-comment-pages-lint-final.log`、`paneon-comment-pages-format-final.log`、`paneon-table-review-final.log`、`paneon-git-review-pack-final.log`、`paneon-github-pr-pack-final.log`；前述省略目录的文件都位于 `/private/tmp/`。

## 文件清单

- `skills/paneon/assets/panels/git-review/panel.tsx`
- `skills/paneon/assets/panels/review/panel.tsx`
- `skills/paneon/assets/panels/table/panel.tsx`
- `skills/paneon/assets/examples/github-pr/panel.tsx`
- `skills/paneon/assets/examples/concurrency/panel.tsx`
- `skills/paneon/assets/shared/diff.tsx`
- `skills/paneon/references/git-review.md`
- `skills/paneon/references/review.md`
- `skills/paneon/references/table.md`
- `skills/paneon/references/github-pr.md`
- `skills/paneon/references/examples.md`
- `tests/browser/annotation-tools.mjs`
- `tests/browser/git-review-fixture.mjs`
- `tests/browser/git-review-layout.mjs`
- `tests/browser/git-review.mjs`
- `tests/browser/table-review.mjs`
- `tests/browser/github-pr.mjs`
- `tests/browser/explanations.mjs`
- `openspec/changes/add-paneon-skill-panels/reports/annotation-pages.md`

下一步由主 agent 合入双方实现并检查最终组合（包含其已有 host 和其他工作），更新中央任务与验收记录。本组不自行合入、清理 managed worktree 或推送。
