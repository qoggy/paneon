# File Review 实施与验收

## 交付范围

- 新入口 `skills/paneon/assets/panels/file-review/panel.tsx`，输入为 `{ title?, files: string[] }`。
- 采用与 Diff Review 相同的 Tree、文件图标、按钮、主题和 FileReviewSplit；单文件直接阅读。
- Markdown 保留现有渲染与链接预览；代码使用公开 CodeBlock，隐藏内部标题栏，显示行号，初始不换行。
- 页面会话持续挂载，文件按需读取并保留原始快照，支持跨文件批注、定位、完整修正和撤回。
- `file-review-submitted` 只输出 `files[].{path,snapshotId,annotations}` 与可选 `replacesEventId`。链接文件反馈归入自己的来源，内部引用不进入事件。
- 旧 review 入口与 reference 已移除，历史事件和已有实例没有迁移。CodeBlock/Markdown 公开 props 没有变化。

## 校验与行为决策审查

下表来自实际改动及接入的现有逻辑。没有新增超出本 change 已确认范围的文件数量、扩展名白名单、路径目录限制、评论必填、自动重试或自动提交策略。

| 决策与依据         | 触发条件和处理                                                                                                                                                           | 代码位置                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 已确认的输入契约   | 可选 title 提供时不能全空白；files 非空，每项必须为非空白字符串；拒绝对象和额外顶层字段。合法路径保留原字符。                                                            | `skills/paneon/assets/panels/file-review/schema.ts`                                                                |
| 固定清单身份       | 内部索引必须为非负整数并存在于清单；快照身份采用 sha256 格式。重复路径不去重，各自保留 fileIndex。                                                                       | `schema.ts`、`actions.ts`、`model.ts`                                                                              |
| 沿用既有读取边界   | 只读普通文件、有效 UTF-8、无 NUL、最大 1 MiB；检查 stat 后仍最多读上限加一字节，拒绝超限而非截断。空文件有效。不存在、不可读与非文本错误按文件呈现。                     | `src/runtime/read-text-file.ts`、`src/runtime/file-preview.ts`、`actions.ts`                                       |
| 路径与原文快照     | 按 cwd 解析字面路径，不按 URL 处理；主文件保留 BOM、CRLF/CR 和 UTF-16 原文。Markdown 链接读取保留原先的 BOM 解码行为。摘要由实际绝对路径和原文生成。                     | `actions.ts`、`src/runtime/read-text-file.ts`                                                                      |
| 原始证据验证       | 提交检查证据来源重复、索引/路径/摘要一致及精确原文范围；缺失或不一致时报错。只验证请求中保留的证据，不重读磁盘、不要求前次 worker 状态。                                 | `actions.ts`、`schema.ts`                                                                                          |
| 沿用范围规则       | 共享 SDK 检查 JSON、批注身份、重复 target 与 UTF-16 范围结构；既有源文校验要求 quote 对应原文且边界不切开 grapheme。没有新增第二套坐标映射。                             | `src/sdk/annotation.ts`、`src/ui/annotation-store.ts`、`skills/paneon/assets/shared/markdown-annotation-schema.ts` |
| 链接文件验证与归组 | 共享页面会话验证和重开链接快照；不把链接范围按入口 Markdown 校验。公开反馈按链接 path/snapshotId 合并，并省略无批注的入口文件。                                          | `schema.ts`、`feedback.ts`、现有 AnnotationStore                                                                   |
| 按需读取与响应归属 | 每项首次打开时读取；loading、成功快照和文件级错误按索引保存，晚到响应只更新自己的项；切回成功项不读磁盘。没有刷新、监听或自动重试。                                      | `panel.tsx`                                                                                                        |
| 导航和定位         | 初始打开第一项；搜索匹配原始与解析后的绝对路径，清空恢复基础展开。定位清除搜索、展开祖先并等待目标预览的 layout 注册；当前目标已挂载时直接使用注册。仅挂载当前完整预览。 | `panel.tsx`、`model.ts`、既有 Tree/FileReviewSplit                                                                 |
| 渲染默认值         | 实际扩展名 `.md`/`.markdown` 忽略大小写；其他文本走 CodeBlock，未知语法沿用纯文本。代码 header=false、行号=true、defaultWrap=false，复用组件内置复制和换行。             | `panel.tsx`、`model.ts`                                                                                            |
| 编辑保护           | 既有 modal 编辑器要求显式保存或取消，阻止编辑期间切换来源或定位另一条意见，不隐式保存。                                                                                  | 既有 AnnotationSurface、AnnotationStore                                                                            |
| 显式提交与修正     | 首次至少一条批注，comment 可为空；成功后锁定并允许修改反馈。修正提交完整结果并引用前次成功事件，空 files 撤回。共享 submission 的 busy 状态避免重复提交。                | `schema.ts`、`panel.tsx`、既有 `submission.ts`                                                                     |
| 失败与既有传输边界 | 查询错误可观察并呈现；提交校验、框架限额或保存失败保留草稿与前次成功回执，不截断、分批或宣称成功。                                                                       | `panel.tsx`、既有 AnnotationStore/submission/transport                                                             |

读取实现的唯一维护源为 `src/runtime/read-text-file.ts`。`build:cli` 生成 Skill 的 `.js`/`.d.ts` 副本，保证复制完整 Skill 后可独立运行，同时公开 UI 不依赖 Skill 文件。

## 实施中修复的两个根因

1. JavaScript action 依赖解析：提取器为 `.js` 辅助模块创建 TypeScript program 时未开启 allowJs，符号未绑定，导致构建崩溃。补齐解析选项并加入实际对象简写依赖回归。
2. 文本节点共享边界：定位选择了上一行末尾节点，浏览器选区因此多带一个显示换行。改为起点选择包含后续字符的节点、终点选择包含前置字符的节点；覆盖跨文件重挂载、孤立 CR、CRLF、重复文本及异步高亮。

## 验证记录

桌面验收页：<http://127.0.0.1:49321/panels/55>。补充深层 Java 文件的验收页：<http://127.0.0.1:49321/panels/56>。

| 检查                                                                                          | 结果                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`（CLI、生成的 Skill 读取模块、公共 UI、四组 TypeScript 工程、Web）             | 通过                                                                                                                                  |
| `node --test --test-concurrency=6 tests/*.test.ts`（最终稳定构建）                            | 400 项通过、0 失败，约 249 秒                                                                                                         |
| 文件清单/字面路径/空文件/不可读文件/UTF-8/NUL/1 MiB/BOM/范围/显式证据测试                     | 12 项通过                                                                                                                             |
| 公共 UI 无 Skill 依赖、面板删除和删除期间重载                                                 | 5 项通过                                                                                                                              |
| `node tests/browser/file-review.mjs`                                                          | 通过：多/单文件、搜索、鼠标/键盘、分栏、主/链接快照、卸载重挂载、CRLF/CR/Unicode/重复文本、晚到响应、失败/修正/撤回、中英文与深浅主题 |
| `node tests/browser/file-review-pack.mjs`（最终 npm 包、独立安装、仓库外 cwd）                | 通过：完整 File Review 与 Markdown 流程                                                                                               |
| `node tests/browser/code-block.mjs`                                                           | 通过：头部/悬浮操作、复制/换行、源文范围、异步高亮、定位与提交修正                                                                    |
| `node tests/browser/markdown-review.mjs`                                                      | 通过：正文、frontmatter、代码、表格、列表、引用、链接文件来源与完整修正                                                               |
| `node tests/browser/diff-review.mjs`、`node tests/browser/git-review.mjs`                     | 均通过                                                                                                                                |
| `node tests/browser/table-review.mjs`、`node tests/browser/annotation-submission-toast.mjs`   | 均通过：更新后的内置入口及保存失败、回执、修正、撤回                                                                                  |
| 改动文件 Prettier、`git diff --check`、产品 Skill 格式与 reference 链接、OpenSpec strict 校验 | 均通过                                                                                                                                |
| 改动的 4 个核心 TS 源文件 ESLint                                                              | 0 error；6 条既有 non-null assertion warning                                                                                          |

最终独立安装场景中，1,024,000 字节、2,000 行的纯文本预览约 168 ms 就绪。这是单个桌面样本记录，不表示所有语法或 Markdown 文件均有相同耗时。

首轮全量回归捕获了公开 UI 反向依赖 Skill 的问题，已按前述依赖方向修复。一项删除重载测试曾超时；另一次复测与重建产物并行，明确出现模块缺失。构建结束后相关 5 项用例全部通过，最终使用稳定产物执行全量回归，不与重建并行，400 项全部通过。

## 文件导航补齐的增量验证

- 补齐目录/平铺切换、随搜索更新的目录计数、平铺父路径提示，以及与 Diff Review 风格一致的分组、展开和折叠三个工具栏按钮。按用户最终选择保留单击打开，删除独立查看按钮。
- 目录模式默认开启；切换视图保留选中项、目录展开、搜索、预览 DOM 和批注。平铺无目录时禁用展开/折叠，搜索期间禁用折叠，沿用 Diff Review 的交互规则。同步删除该按钮专用的 ref、tabIndex、预览焦点样式和中英文文案；没有新增业务校验或输入限制。
- `node --test tests/file-review.test.ts`：6 项通过，包含深层目录压缩；`npx tsc -p tsconfig.examples.json --noEmit`、Prettier、diff check 和 OpenSpec strict 校验通过。
- 扩充后的 `node tests/browser/file-review.mjs` 通过：目录计数 2→1→2、视图切换与展开恢复、父路径显示、重复条目身份、单击打开与三项工具栏、不重读、草稿保留、平铺中的跨文件批注定位，以及原有完整提交流程。本次只涉及面板导航，未重复执行此前的全量 400 项测试和 npm 安装验收。
- panel 56 在默认桌面分栏下实际显示单行 `src/io/github/qoggy/myproject`，其下为 `App.java`，已打开 Java 预览。样本：`/tmp/paneon-file-review-plan-20261031/samples/src/io/github/qoggy/myproject/App.java`。
- 删除独立查看按钮后，`node tests/browser/file-review.mjs`、`npx tsc -p tsconfig.examples.json --noEmit`、改动文件 Prettier、diff check 和 OpenSpec strict 校验再次通过；没有重复执行此前的全量 400 项测试。
- panel 55、56 均已自动更新到 `sha256:891f7272cf1c642e32f59698a0640c3194d0606460845d5aa6a170e3509bb13c`；实际工具栏只有分组、展开、折叠，App.java 仍能单击打开，深层目录保持一行。最终截图：`/tmp/paneon-file-review-acceptance/file-review-single-click-final.jpg`。

本次增量修改了下面清单中的 file-review model/panel、两个 file-review 测试，以及 proposal、design、file-review spec、tasks 和本验收记录；另新增上述临时 Java 样本。其余为前次实现保留的工作区改动。

最后一次按选项 2 删除按钮的改动文件为：

- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/file-review/panel.tsx`
- `/Users/yuguo/IdeaProjects/paneon/tests/browser/file-review.mjs`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/proposal.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/design.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/specs/file-review/spec.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/tasks.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/verification.md`

## 改动文件清单

### 路径文字批注增量（2026-10-31）

- 路径栏复用公共 AnnotationText，内部以 `part: "path"` 区分正文来源并保留原始 UTF-16 选区；切换、定位、编辑、提交和修正沿用现有会话。对外仅新增 `{path: {quote}}` target；没有 pathText、displayPath、路径坐标或其他新增元数据。正文、链接来源、文件归组和修正格式不变。
- `node --test tests/file-review.test.ts`：7 项通过，覆盖相对路径、中文/emoji、重复路径片段的精确坐标、路径与正文归组、只输出 quote，以及按路径原文校验。
- `node tests/browser/file-review.mjs`：通过，新增路径批注、跨文件与搜索后的精确定位、不重读、与正文/链接文件混合提交、失败保留、路径和正文的完整修正及全部撤回；保留原有浏览器场景。日志：`/tmp/paneon-file-review-path-browser.log`。本次没有修改公共 UI/SDK，未重复执行此前全量测试或 npm 打包验收。
- `npx tsc -p tsconfig.examples.json --noEmit`、OpenSpec strict 校验通过；相关文件 ESLint 为 0 error、5 条 non-null assertion warning。
- 现有 panel 55 已自动更新至 `sha256:998d4a808bcf7b3e92bb7ea54f6a545e1a21f0d56f45811a86dc859c40511c26`，实际选中路径文字可打开批注输入框；检查后取消输入，没有在验收页保存或提交测试批注。截图：`/tmp/paneon-file-review-acceptance/file-review-path-live.png`。

本次涉及的条件与校验：

| 决策               | 目的、触发与影响                                                                                                                                                  | 代码位置                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 路径来源标记       | 内部 ref 的可选 part 只接受 path；正文 ref 保持原状，避免同一 ref 对应两份不同原文。此标记不公开。                                                                | `schema.ts`、`panel.tsx`                                  |
| 选区来源校验       | 路径 target 按输入清单原始字符串、正文按保留正文校验，均复用原有 UTF-16/grapheme/quote 规则；不匹配时沿用提交失败并保留草稿。未新增路径格式、评论或操作次数限制。 | `schema.ts:validateRanges`、`actions.ts:validateFeedback` |
| 快照注册时机       | 成功读到当前文件快照后注册路径文字，使路径与正文归入同一既有快照；加载或读取失败时仍显示路径和原有状态，没有增加另一套无快照提交模型。                            | `panel.tsx` 路径栏                                        |
| 来源解析与输出分支 | adapter 根据 part 解析路径或正文；提交映射只将路径的 quote 输出为 path target。定位、缓存与更正没有新增回退、重试或近似匹配。                                     | `panel.tsx` adapter、`feedback.ts`                        |

本次增量改动文件：

- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/file-review/panel.tsx`
- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/file-review/schema.ts`
- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/file-review/actions.ts`
- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/file-review/feedback.ts`
- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/references/file-review.md`
- `/Users/yuguo/IdeaProjects/paneon/tests/file-review.test.ts`
- `/Users/yuguo/IdeaProjects/paneon/tests/browser/file-review.mjs`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/proposal.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/design.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/tasks.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/specs/file-review/spec.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/specs/paneon-agent-skill/spec.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/verification.md`

### 原有完整交付

- 修改：`/Users/yuguo/IdeaProjects/paneon/CHANGELOG.md`
- 修改：`/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/design.md`
- 修改：`/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/proposal.md`
- 修改：`/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/specs/file-review/spec.md`
- 修改：`/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/specs/paneon-agent-skill/spec.md`
- 修改：`/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/tasks.md`
- 修改：`/Users/yuguo/IdeaProjects/paneon/package.json`
- 修改：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/SKILL.md`
- 移除：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/review/feedback.ts`
- 移除：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/review/panel.tsx`
- 移除：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/review/schema.ts`
- 移除：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/references/review.md`
- 修改：`/Users/yuguo/IdeaProjects/paneon/src/compiler/action-transform.ts`
- 修改：`/Users/yuguo/IdeaProjects/paneon/src/runtime/file-preview.ts`
- 修改：`/Users/yuguo/IdeaProjects/paneon/src/ui/annotation-store.ts`
- 修改：`/Users/yuguo/IdeaProjects/paneon/tests/browser/annotation-submission-toast.mjs`
- 修改：`/Users/yuguo/IdeaProjects/paneon/tests/browser/markdown-review.mjs`
- 修改：`/Users/yuguo/IdeaProjects/paneon/tests/browser/table-review-fixture.mjs`
- 修改：`/Users/yuguo/IdeaProjects/paneon/tests/browser/table-review-pack.mjs`
- 修改：`/Users/yuguo/IdeaProjects/paneon/tests/browser/table-review.mjs`
- 修改：`/Users/yuguo/IdeaProjects/paneon/tests/compiler-exports.test.ts`
- 修改：`/Users/yuguo/IdeaProjects/paneon/tests/file-references.test.ts`
- 修改：`/Users/yuguo/IdeaProjects/paneon/tests/release-test.mjs`
- 移除：`/Users/yuguo/IdeaProjects/paneon/tests/review-feedback.test.ts`
- 修改：`/Users/yuguo/IdeaProjects/paneon/tests/table-review.test.ts`
- 新增：`/Users/yuguo/IdeaProjects/paneon/openspec/changes/upgrade-review-to-file-review/verification.md`
- 新增：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/file-review/actions.ts`
- 新增：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/file-review/feedback.ts`
- 新增：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/file-review/model.ts`
- 新增：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/file-review/panel.tsx`
- 新增：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/panels/file-review/schema.ts`
- 新增：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/shared/read-text-file.d.ts`
- 新增：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/shared/read-text-file.js`
- 新增：`/Users/yuguo/IdeaProjects/paneon/skills/paneon/references/file-review.md`
- 新增：`/Users/yuguo/IdeaProjects/paneon/src/runtime/read-text-file.ts`
- 新增：`/Users/yuguo/IdeaProjects/paneon/tests/browser/file-review-pack.mjs`
- 新增：`/Users/yuguo/IdeaProjects/paneon/tests/browser/file-review.mjs`
- 新增：`/Users/yuguo/IdeaProjects/paneon/tests/file-review.test.ts`
