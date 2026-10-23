# Git 审阅标准页交付

## 状态

基于 `c7d667e`，在 `/Users/yuguo/.codex/worktrees/skill-git-review/paneon` 实现 2.3/2.9 中的 Git 页与 PR 后续可复用的 diff 适配。仅修改分配资源与专属测试/报告，没有修改 SDK/UI/runtime、总入口、package/tsconfig 或中央 design/tasks。等待主 agent 验收；未合入、推送、发布或清理 worktree。

## 实现

- 显式多仓库输入，仓库 ID 唯一；相对路径按 worker 的 `process.cwd()`（`--cwd`）解析。默认首仓库改动，支持 changes/history/compare 与 commit/file 初始定位，非法初始位置明确报错。仓库与视图导航保留各自浏览状态。
- 查询通过页面 serverAction 执行 Git；参数显式传入 action input，不假设 ctx 有 cwd/params。execFile 使用参数数组、明确 `-C`、signal，版本先通过 `--end-of-options` 固定为完整提交 OID，文件参数使用 `--`，禁止 ext-diff/textconv。
- 未提交改动分别读取 staged/unstaged/untracked，同路径分开展示。Git NUL 清单支持空格、换行和重命名；忽略规则只排除未跟踪忽略项，已跟踪改动保留。无 Git 业务写操作按钮。
- 历史固定完整 tip，date-order、每批 50、多取一条判断分页；加载后续页不会跟随新 HEAD。单提交按第一父比较并说明，root 使用空树；branch 模式使用唯一共同祖先，没有或多个共同祖先明确失败，不改变语义；commits 模式直接比较端点。
- 对实际读取字节计算 SHA-256；index/固定版本按已取得 blob OID 读取，工作区内容读后固定。从同一份原文生成差异、行号、patch 和 quote，不使用另一次实时 Git diff 套当前文件。保留 CRLF、BOM 解码原文与无末尾换行标记。二进制、无效 UTF-8、符号链接和 gitlink 不伪装普通文本；符号链接不跟随目标、子模块不递归。冲突明确标记未合并，展示可读取的工作区内容，不合成已暂存结果。
- 共享 DiffView 接收 sourceId 和原文/模型，完全独立于本地 Git 与仓库列表；默认左右，可切统一、展开上下文。高亮复用公共 CodeBlock。显式 DOM Text 到原文 UTF-16 映射注册，纯模型与校验工具分别位于 diff-model.ts、diff-schema.ts，供 PR 直接复用。
- 复用公共 Provider、控件和交互状态。文件/hunk/同侧连续行/词句均支持，多位置、多意见、空 annotation、整体意见共用 annotations。整侧文字注册提交前规范为实际选中行，偏移改为该行原文拼接内坐标；不同手势规范为完全相同目标时去重。
- 定位旧批注可回看原始来源，整行按钮与整侧文字注册不同 ref 时也按真实 DOM 原文范围定位。高亮用分开的 Range，避免左右列之间串选另一侧文字；系统默认选区颜色，不自建交互状态。
- 刷新只由人明确触发，不自动替换所读内容。旧批注及来源保存在页面自有查询模块的当前会话缓存；刷新后不改挂新版本。提交服务端校验缓存旧快照，sources 只含实际引用来源，按仓库/视图/两侧内容去重。
- 复用页面 submission helper：首次空反馈拒绝，后续完整更正关联上次成功 event ID，保留稳定批注 ID、历史和失败草稿，允许明确提交空更正清空。结果仅包含选中 quote/hunk，不附整份源文件/diff。65536 字符与 262144 字节限制保持原有语义，超限保留草稿。
- 普通 action 异常会被 runtime 包装为通用 ACTION_FAILED；页面把预期 Git 查询/快照校验错误作为结构化业务结果返回，以保留明确错误，不修改核心异常安全策略。

## 真实验证

- `npm run build` 通过，含完整 typecheck、CLI、UI 声明/bundle、web。最后的 diff 定位适配另通过 `npm run typecheck`，并由独立包实际编译运行验证。
- `node --test --test-concurrency=1 tests/git-review.test.ts`：7/7 通过。覆盖随机文本双侧重建、中文/emoji、CRLF/无末尾换行、重复词偏移与非法字素；输入范围；真实多仓库、相对路径与含空格/末尾换行的仓库路径；staged+unstaged、忽略/未跟踪、NUL 重命名、binary/无效 UTF-8/链接/gitlink/冲突；根提交、merge 第一父、分支和端点比较、无/多共同祖先；固定 tip 分页、非法版本、abort、旧快照/缺失快照、来源去重、相同目标规范化去重与超限。
- 专属 TypeScript 定向 ESLint：0 errors、0 warnings。源码、专属测试和指南的 Prettier 检查通过；Git diff whitespace 检查通过。
- `node tests/browser/git-review.mjs`：宿主真实 Chrome，通过仓库外完整 skill 复制运行。覆盖物理鼠标拖选与普通复制、重复中文词精确偏移、文件/hunk/连续行/词句目标，左右/统一/上下文，同路径 staged+unstaged，手动刷新且旧批注回看，跨仓库/跨视图的 4 个来源，明确提交、更正、失败保留、明确清空，以及真实 CLI events/ack；history/root/compare 初始定位和缺失文件错误。
- `node tests/browser/git-review-pack.mjs`：真实 npm pack 并安装到临时独立目录；验证完整配套资源，运行安装包的 runtime/CLI 和复制后的 skill，不依赖源码符号链接。复用同一 Chrome 场景，额外验证旧整行目标实际精确高亮、65536 字符与 262144 字节超限均保留四条草稿且不发事件。最终独立验收包 SHA-256：`79edff7c354f4fcd057730d8365d60a499e206d3ecd26119aa2bca8c948f275d`。
- 已实际查看源码 Chrome 截图 `/private/tmp/paneon-git-evidence/git-review.png`，左右代码、行号、增删色、路径和默认组件显示正确。该临时证据未加入产品资源。

## 边界

- 工作目录无法原子锁定，快照只保证使用已经读取的固定字节；不承诺浏览器刷新、服务重启或普通 Vite/React 源码更新后恢复草稿/旧 worker。
- 单次 Git 命令输出上限 32 MiB，超限明确失败；高度不同的大文本用有界 Myers trace，必要时生成较粗但两侧内容精确完整的替换差异，不截断原文。
- 已验证 Chrome，未验证 Firefox/Safari。代码语法高亮复用逐行公共 CodeBlock；不声称跨行语法上下文达到 IDE 水平。
- 本组未实现 PR 查询/Markdown 适配，未重跑主 agent 已验收的全项目 65 项回归。中央任务由主 agent 验收后更新。

## 文件清单

- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/skills/paneon/assets/panels/git-review/panel.tsx
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/skills/paneon/assets/panels/git-review/schema.ts
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/skills/paneon/assets/panels/git-review/git.ts
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/skills/paneon/assets/shared/diff.tsx
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/skills/paneon/assets/shared/diff-model.ts
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/skills/paneon/assets/shared/diff-schema.ts
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/skills/paneon/references/git-review.md
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/tests/git-review-fixture.ts
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/tests/git-review.test.ts
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/tests/browser/git-review-fixture.mjs
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/tests/browser/git-review.mjs
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/tests/browser/git-review-pack.mjs
- /Users/yuguo/.codex/worktrees/skill-git-review/paneon/openspec/changes/add-paneon-skill-panels/reports/git-review.md
