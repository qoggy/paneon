# GitHub PR 只读工作台交付

## 状态

基于 `19b9486`，在 `/Users/yuguo/.codex/worktrees/skill-github-pr/paneon` 完成剩余 GitHub PR 场景示例。仅修改分配的示例、指南、专属测试和本报告；没有修改中央设计/任务、SKILL.md、package/tsconfig、SDK/UI/runtime 或已有 shared 模块。本报告随本地交付提交保存，提交哈希由交付消息提供。未推送、合入、发布或清理 worktree。

实现与静态检查已完成；完整交互验收尚未通过。源码和独立 npm 安装的 Chrome 均为 **2 项通过、1 项失败**，失败是已有公共反馈事件处理对程序定位 Selection 的误收集，下面保留精确复现和断言。主 agent 已收到复现，将在核心修复集成后重新验收；本组没有越界修改公共模块，也没有清除定位选区或删除断言掩盖问题。

## 实现

- `repository` 必填且限定 `owner/repo`；`initialPullRequest` 是可选正整数，不推断当前分支或 PR。省略初始编号时显示列表并等待选择；显式详情失败会显示错误。
- 列表通过真实 `gh pr list --repo` 查询，显式字段、状态和搜索；初始最大 30，加载更多增加 30 并重新查询、按编号去重。页面显示已加载数量，不把它称为 cursor 或完整仓库快照。
- 详情通过明确 PR 编号读取元信息、原始 Markdown、完整 base/head OID、review/merge 状态。检查按固定 head 查询 `statusCheckRollup`、遍历 contexts 分页，使用 GraphQL node ID 区分同名检查，并保存所见状态与观察时间。CI FAILURE 与查询失败分别呈现。
- 页面自有 serverAction 直接执行 `gh`，使用 execFile 参数数组、ctx.signal、30 秒超时及 32 MiB 单命令 JSON 输出限制。REST 仅 GET；GraphQL 仅固定只读 query。没有评论、review 发布、approve、merge、close、push 或运行 CI 的 GitHub 写操作。
- 比较先用固定 base/head 的 compare API 取得 merge base 和文件清单，再读取完整 commit/tree/blob 对象。按路径逐层读取非递归 tree，检查 tree 截断和 OID，blob 校验实际字节数与 Git SHA-1；SHA-256、diff、行号及引用均来自同一份固定字节。没有把可变 `gh pr diff` 套在另一次查询的版本上。
- 始终显示 compare 的最多 300 文件限制、本次返回数、详情报告数和 GitHub 原始链接。达到 300 或数量不符即明确显示不完整/无法证明完整；缺 patch 明确说明并由实际原文生成差异。对象截断、缺失、损坏或输出超限明确失败，不截成伪完整结果。
- 重命名保留双侧路径，新增/删除允许一侧缺失；CRLF、BOM 和无末尾换行保持原文。二进制、无效 UTF-8、符号链接及 gitlink 仅文件级反馈，不跟随链接或递归子模块。
- 直接复用现有 DiffView、MarkdownFeedback、公共 Provider/Controls/Target；左右/统一视图、上下文、文件/hunk/同侧行/词句、多目标、多意见和空说明共用同一公共反馈状态。整侧原文范围提交前规范到实际行范围，并调整 UTF-16 偏移；Markdown 选择跨强调/链接/实体时引用真实原始 Markdown。
- 跨 PR、跨内容种类保留原始来源；同 head 的 description/check 变化也产生不同来源。刷新不会改挂已有反馈。客户端及查询模块当前会话缓存保存旧原文，服务端校验使用旧缓存，不临时读取最新内容代替旧快照；没有新增 runtime 表或持久业务快照。
- `review-requested` 只包含所看 PR 的 repository/number/baseCommit/headCommit，与草稿分开。`pr-feedback-submitted` 是完整 Feedback 加 repository 和实际引用的 sources，不包含整份说明/源文件/diff，只保留所选 quote/hunk。失败保留草稿，超限不拆事件；显式重提完整结果保持批注 ID 和历史。本示例按设计的 PRFeedbackSubmitted 契约不强加标准页 replacesEventId 策略。

## 验证：静态检查与确定性 fixture

以下命令均在本 worktree 执行，未并发运行全项目测试套件。

- `npm run build` 通过：完整类型检查、CLI、SDK/UI 声明与 bundle、web 构建。
- `npm run typecheck` 再次通过。分配源码与专属 tests 的定向 ESLint 无错误/警告；Prettier 检查通过。
- `node --test --test-concurrency=1 tests/github-pr.test.ts`：**6/6 通过**。覆盖明确输入和注入拒绝；30/60 最大数量、搜索/状态；同 head 的 body/check 变化及稳定检查 ID；跨 PR、旧来源、非法 quote/kind、缺快照；head 移动后仍按旧 merge-base/head 读取；CRLF/无末尾换行、重命名与含换行路径、binary/非法 UTF-8/链接/gitlink/增删；300/301 覆盖、截断 tree、损坏 blob、超限、abort、检查分页和查询失败。
- `node tests/browser/github-pr.mjs`：宿主真实 Chrome，先把完整 skill 复制到仓库外临时目录。fixture 通过 PATH 中明确的只读 gh 替身提供确定数据，产品真实 serverAction/worker/SDK/UI/事件服务不替换。**2 通过、1 失败，退出码 1**。
- 已通过的独立提交用例验证：跨 PR 的原说明与旧 head diff 行/hunk、刷新后不改来源；review-requested 不携带草稿；65536 字符及 262144 字节超限保留三条草稿且不额外发事件；event POST 503 后保留草稿；成功后明确重提完整结果、稳定批注 ID、历史保留；真实 CLI `events/ack`。另一个独立用例验证 compare 返回 300/详情 301 的明确覆盖说明及无 initialPullRequest 的导航。
- 完整交互用例在失败前验证列表 30→60、搜索/状态重置、首次空提交拒绝、真实鼠标圈选/普通复制、重复中文词精确偏移、跨强调/链接/实体的 Markdown 原文、CI FAILURE/查询失败区分、blob 失败、行/hunk 与布局切换。定位导航断言失败后的代码没有执行，不将后续未执行部分算作通过。
- `PANEON_PR_TEST_LIVE=1 node tests/browser/github-pr-pack.mjs`：真实 npm pack、安装到临时独立 prefix，确认 package 不是符号链接；检查配套资源，使用安装包 runtime/CLI 和从该安装包复制到仓库外的完整 skill。fixture 同样 **2 通过、1 保留失败**，整体退出码 1；随后真实公开 gh Chrome 单独通过。验收包 SHA-256 为 `7ce53da651830a3989d6981e78b5de7031f6d05153bb15220bd5cfb0ab88ebe7`，该哈希代表上述部分通过/保留失败的包，不是完整验收通过标记。

fixture 证明可重复的版本变化、特殊文件、覆盖上限、失败、精准坐标和交付行为；它不证明 GitHub 网络/权限/API 兼容。后者由下面独立真实查询证明。

## 验证：真实公开 gh 与 Chrome

本机 gh 2.88.1，执行只读查询，没有输出凭据。`node tests/github-pr-live.mjs` 对 [cli/cli #14768](https://github.com/cli/cli/pull/14768) 成功读取列表、详情、固定 compare、commit/tree/blob 和 11 条稳定 ID 检查。最终记录：

- base/merge base：`342313940fd365569716754cd166c2870c5b66c9`
- head：`2a595926763ebc515baf433f0beaebf4bc90b4ab`
- 文件清单返回/详情报告：6/6，完整标记 true。
- 首文件 go.mod 原文 8783→8753 UTF-16 字符，1 个 hunk；旧 SHA-256 `2375df7ae80ae2a142990122b0861c7b33f3ab83157d58a2cf8f5f925c92bb5b`，新 SHA-256 `5445d61d1235bdd6d767d23e8c55ba189d1bfb9dc9480baf41886123504a3ecd`。
- 首检查 key `CR_kwDODKw3uc8AAAAbwMjnVw`；查询时同时存在 COMPLETED/SUCCESS 与 IN_PROGRESS/null，页面按观察结果呈现。验收期间该公开 PR 的 base/head 曾更新；每次读取独立固定所见 OID，没有混用前后版本。

`PANEON_LIVE_PR=14727 node tests/github-pr-live.mjs` 对 [fork PR #14727](https://github.com/cli/cli/pull/14727) 也通过：head owner 为 umairnaeem0309，base/merge base `fa92838bef95fe4a29c1587693885d5e9bdb6cf1`，head `1156f977ff6d12d592bc152987b9d9b378f6718d`；2/2 文件、14 条检查，同名检查有不同 node ID。首文件 pkg/cmd/issue/create/create.go 原文 17809→18360 字符，1 个 hunk；两侧 SHA-256 分别为 `aeb951405e9d7fae96d4ac12d409a726eb470b7d670ee75a34da942c98f2dedf` 和 `d30fc5704def361c74fb5d1ce44268da46b3e4c1d4a604c964e8da3b12e12908`。这验证了实际 fork 对象在目标仓库固定对象 API 中可读，没有用猜测降级代替。

`node tests/browser/github-pr-live.mjs` 及独立包中的同一测试均通过真实 Chrome：仓库外完整 skill、真实 PR 详情、固定对象 diff、11 条检查，浏览事件数 0，pageerror 空。已实际查看 `/private/tmp/paneon-pr-live-evidence/github-pr-live.png`，元信息、列表、固定版本与检查展示正确。真实网络验收没有向 GitHub 发写操作，也没有将测试意见发给外部账号。

覆盖依据为官方 [compare API](https://docs.github.com/en/rest/commits/commits#compare-two-commits)、[tree API](https://docs.github.com/en/rest/git/trees#get-a-tree)、[blob API](https://docs.github.com/en/rest/git/blobs#get-a-blob)。compare 的首分页最多 300 文件与单提交接口的分页行为不能混为一谈。

## 保留失败：定位选区被普通按钮重新收集

最小触发路径：

1. 开启选择模式，圈选 Markdown 词句，完成当前条目。
2. 点击该条目的「定位」，共享 Markdown 定位器在已保存原文上建立浏览器 Selection。
3. 不产生新圈选，真实点击普通按钮「返回当前 PR」。
4. 公共 Provider 的 document mouseup 回调再次把已有 Selection 交给 `store.selectText`，生成新的草稿条目。

本例真实数据：点击前 `{"annotations":4,"events":0}`；点击后 `{"annotations":5,"events":0}`；新增末条显示「5. 仅选择 · 1 个位置 … 定位 5.1「缓存」」。原位置属于 PR101 旧 description。事件仍为 0，错误发生在草稿状态；若继续跨 PR 选择，旧词句可能与新目标进入同一条意见。

`tests/browser/github-pr.mjs:169` 保留断言 `Locating a phrase then clicking navigation must not create another annotation.`，期望 4、实际 5。源代码中最小路径是只读核对到的 `src/ui/feedback-provider.tsx:18` document mouseup/keyup 无事件目标过滤，及 `src/ui/feedback-store.ts:195` 对现存选区的再次接收。不是 PR 查询、快照或 OID 变化引起。主 agent 正在公共反馈回归中处理真实按钮/输入事件过滤；修复后应在最终集成版本重新运行完整 PR Chrome 与 npm pack 验收，不仅重跑静态检查。

本组保留失败退出码；没有修改公共文件、清除程序定位 Selection、跳过失败断言或把独立成功用例冒充完整交互通过。

## 边界

- 当前会话缓存不承诺浏览器重载、服务重启或普通 Vite/React 更新后的未提交草稿/旧 worker 恢复。
- compare 最多 300 文件，达到上限不证明完整。单命令输出 32 MiB/30 秒；超限明确失败并保留已有草稿。特殊文件仅文件级反馈。大文本复用已有共享 diff 的有界计算策略，不截断原文。
- 验证 Chrome，未验收 Firefox/Safari；未重跑已验收的无关全项目套件。真实公开 PR 的检查和元数据持续变化，上述结果是对应查询时的观察。
- 中央 tasks/verification、核心反馈修复与最终集成验收由主 agent 完成。本组工作在本地提交交付后到此为止。

## 文件清单

- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/skills/paneon/assets/examples/github-pr/panel.tsx
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/skills/paneon/assets/examples/github-pr/schema.ts
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/skills/paneon/assets/examples/github-pr/github.ts
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/skills/paneon/assets/examples/github-pr/model.ts
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/skills/paneon/references/github-pr.md
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/tests/github-pr-fixture.ts
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/tests/github-pr.test.ts
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/tests/github-pr-live.mjs
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/tests/browser/github-pr-fixture.mjs
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/tests/browser/github-pr.mjs
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/tests/browser/github-pr-live.mjs
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/tests/browser/github-pr-pack.mjs
- /Users/yuguo/.codex/worktrees/skill-github-pr/paneon/openspec/changes/add-paneon-skill-panels/reports/github-pr.md
