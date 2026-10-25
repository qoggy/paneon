# Distributed development

## Start condition

用户已明确授权：Mermaid 未验收则先验收，验收完成即开始本 change。Mermaid 源码及独立安装包验收已通过，记录见 ../add-mermaid-rendering/verification.md。

仓库 paneon，分支 0.0.x；代码基线 7cd105d（含 Mermaid MIME 修复），各实现 worktree 从派工前最新文档提交创建。主工作区已有的页头及其测试修改不复制、不覆盖、不顺带提交。

## First batch

| 工作单元       | OpenSpec 任务                    | 独占实现范围                                                                                                                                               | 交付及边界                                                                                             |
| -------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| feedback       | 2.6、2.7、2.8                    | src/sdk/feedback.ts、SDK 导出、src/ui/feedback.tsx、UI 导出、必要的 tsconfig.ui.json 和专用验证                                                            | 公共类型/schema、Provider/hook、对象/原文选择、可组合控件与自定义 TSX fixture；不写各标准页业务适配    |
| input          | 2.4、2.11                        | src/cli/index.ts、src/cli/client.ts、src/shared/limits.ts、src/shared/types.ts、src/runtime/server.ts、必要的 lifecycle 限制引用、src/web/api.ts、专用验证 | 文件 JSON 入参及创建快照、完整 HTTP 体积预检与 413 诊断；不写公共批注和页面，不修改既有 panel-host.tsx |
| standard-pages | 2.1 的资源骨架、2.2、2.3 中 form | skills/paneon/SKILL.md、choose/form 源码与说明、页面级完整提交 helper、package.json 的 files、tsconfig.examples.json、专用验证                             | 选择与表单使用普通答案流程，无需等待反馈 Provider；不建立其余页面假实现、不声称全产品资源已完成        |

三组文件边界互不重叠。SDK/UI 新增的反馈类型需单一来源，避免循环依赖和 browser/Node 导出不一致。当前 tsconfig.ui.json 的 rootDir=src/ui；如 UI 引用 SDK 类型，可调整为 rootDir=src、outDir=dist，保持 UI 声明仍落在 dist/ui，不能靠旧 dist 启动构建或复制两份公共类型。

HTTP 的浏览器完整请求体预检统一放 src/web/api.ts，避免把基础传输职责散落到各页面；沿用现有安全检查，不放宽 CSP 或暴露服务。CLI/HTTP 输出英文，不记录业务输入内容。

choose/form 按 B34 支持同页更正并明确追加完整结果，成功回执用于 replacesEventId；失败保留草稿。表单、选择题自身的作答不是选择与批注目标。所有组均不得增加 runtime 业务任务、CLI 执行日志或自动唤醒 agent 的机制。

## Integration and acceptance

主 agent 在派工后立即结束当前回复，不等待或轮询子 agent。子 agent 在独立 worktree 提交实现，汇报 commit、变更文件、验证及已知限制，不推送、不自行合入、不再派生子 agent。

本文件记录分工，不表示这些代码已完成。实现任务在主 agent 核对并验收后才勾选；各组可提交独立的 reports/<unit>.md，不并发改写中央 tasks.md 或 design.md。需要调整契约时向主 agent 说明具体冲突与建议。

公共能力验收后再派发依赖它的 table、git-review、review、GitHub PR 与一次性讲解资源。Sentinel 仍到实施该页时才阅读公开源码；设计和示例不含开发者机器路径。这是同一 change 的依赖顺序，不减少已确认交付范围。

最终由主 agent 验收、合入 0.0.x、本地 commit 并清理对应 worktree；不推送或发布。

## First-batch integration

首批全部通过主 agent 验收；完整 65/65 自动回归、源码及独立安装包 Chrome 均通过，证据与完整文件清单见 verification.md。集成提交分别为 276a66a、70911fe、41bf0a8。已同步 editAnnotation(null)、SDK server 入口和文件入参指南。首批 worktree 清理后不再用于实施。

## Second batch

以下是同一 change 的独立实现工作单元，从本轮验收文档提交创建 worktree；派发后仍立即交还控制权。

| 工作单元     | 独占资源范围                                                                                                                          | 交付                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| table-review | assets/panels/table、assets/panels/review、assets/shared/markdown-feedback.tsx 及其独有 mapper/schema，references/table.md、review.md | 只读交互表格及完整 Markdown 精准圈选；复用公共反馈与页面级完整修订 helper                                |
| git-review   | assets/panels/git-review、assets/shared/diff.tsx 和相关 diff model、references/git-review.md                                          | 多仓库工作区/历史/比较、版本化原文及 diff、跨视图精准反馈；共享 diff 不依赖本地 Git 查询，供 PR 后续复用 |
| explanations | assets/examples/concurrency、assets/examples/sentinel-leap-array、references/examples.md                                              | 两个固定主题/数据的一次性交互讲解；Sentinel 此时阅读公开源码，不输出开发机路径                           |

上述路径都位于 skills/paneon。每组可增独占 tests 与 reports/<unit>.md；不得互改共享模块。SKILL.md 总入口、package/tsconfig、中央 design/tasks 由主 agent 集成时更新，避免三组冲突。需要改核心 SDK/UI 时先说明已复现的问题和最小改动，不在页面中复制公共批注状态管理。

表格/内容审阅和 Git 标准页均采用 B34 完整更正，首次空反馈不提交，更正允许明确清空并保留旧事件；动态快照定位不悄悄改挂最新内容。讲解页不是参数化标准页，不把任务数据改成外部 JSON 协议。

PR 场景依赖本批共享 Markdown/diff，待这些模块验收后单独接入；未减少已确认交付范围。所有组完成本地 commit 后由主 agent 验收、合入、清理，不推送。

## Second-batch integration

第二批三个工作单元均完成并通过主 agent 验收，集成为 ca3e191、245ae0e、7452770。主 agent 以 72afdd7 修复 Markdown 公开扩展点和注册链接文字圈选两个实际阻塞；完整 85/85 回归、源码 Chrome、独立安装包六套 Chrome 均通过，详见 verification.md。三个第二批 worktree 已从 git worktree list 核实移除；没有推送。

## Third-batch implementation units

以下仍属于同一 change；从本次主验收文档提交创建独立 worktree。先写清派工边界，再派发，派工后立即结束回复。

| 工作单元         | 独占资源                                                                                                                              | 交付                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| github-pr        | skills/paneon/assets/examples/github-pr、references/github-pr.md，专属 tests 与 reports/github-pr.md                                  | 真实只读 gh 查询，复用已验收 MarkdownFeedback/DiffView，固定版本来源、跨 PR 意见和 review-requested；不发布意见到 GitHub |
| compiler-exports | src/compiler/action-transform.ts、tests/compiler-exports.test.ts、reports/compiler-exports.md                                         | 修复已复现的选择性重导出缺陷，覆盖别名/类型/依赖隔离；不以全量打包服务端代码绕过                                         |
| guides           | skills/paneon/SKILL.md、references/{cli,authoring,feedback}.md、examples/README.md、reports/guides.md；迁移后删除 docs/agent-guide.md | 按 B36 仅 skill 维护全部 agent 使用指导；examples README 只作目录说明；不提前声明 PR 已验收                              |

本批不改 SDK/核心反馈/业务页面/中央 design/tasks，除 compiler-exports 独占 compiler 文件。任何共享能力冲突先反馈主 agent；各组不得自行合入或推送。SKILL.md 总入口已由主 agent 更新为真实现有资源，PR 入口待其验收再加入。最终整体验收和用户 Sentinel 体验未完成，不归档 change。

## Files maintained before dispatch

- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/.openspec.yaml
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/proposal.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/design.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/review.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/development.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/tasks.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/specs/paneon-agent-skill/spec.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/specs/guided-choice-panel/spec.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/specs/panel-file-input/spec.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/specs/panel-feedback/spec.md
- /Users/yuguo/IdeaProjects/paneon/docs/memory/MEMORY.md
- /Users/yuguo/IdeaProjects/paneon/docs/memory/agent-skill-assets.md
- /Users/yuguo/IdeaProjects/paneon/docs/memory/ui-selection-feedback.md
- /Users/yuguo/IdeaProjects/paneon/docs/memory/ui-reusable-examples.md

## B36 guidance consolidation

用户明确只保留 skill 作为 agent 使用指导。guides 组已收到变更：迁移有用内容到 skill references、删除 docs/agent-guide.md、让 SKILL.md 按需引用；examples/README.md 只说明示例目录。主 agent 同步 README、package.json、项目记忆与中央设计/任务，避免并发修改。待 guides 交付后验证旧文件已删除、skill 内部链接及复制后的资源独立性，不将迁移中的状态表述为删除已完成。

本轮主 agent 改动文件：

- /Users/yuguo/IdeaProjects/paneon/README.md
- /Users/yuguo/IdeaProjects/paneon/package.json
- /Users/yuguo/IdeaProjects/paneon/docs/memory/MEMORY.md
- /Users/yuguo/IdeaProjects/paneon/docs/memory/agent-skill-assets.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/design.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/tasks.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/development.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/specs/paneon-agent-skill/spec.md

## Installation entry discussion

B37 已确认安装体验只有一个入口，不让用户自行分别寻找/安装 CLI 与 skill；B38 已确认 A：CLI 是统一安装入口，负责安装包内配套 skill。当前尚无安装命令，目录/已有副本规则与实现仍须落实，不将目标写成已完成。guides 组同步安装方向与现状，保持原文件边界，不自行添加安装器；主 agent 在 tasks.md 单独跟踪安装能力。用户提及的 update 仅为未来方向，本次不实现。

本轮对焦修改文件：

- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/design.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/development.md
- /Users/yuguo/IdeaProjects/paneon/docs/memory/agent-skill-assets.md

## Skill installation research

用户要求调研不局限于 OpenSpec，且文档保存在本 change。结果见 [research/skill-installation.md](research/skill-installation.md)：覆盖五个实际安装链路及 agent-browser 对照，固定官方源码 commit，记录本机 OpenSpec 终端选择/临时安装/更新和 Playwright 临时安装/重复覆盖的实际结果。代码阅读、运行结果与 Paneon 建议分开陈述。

本轮只新增调研与同步设计/任务，没有实现 CLI 安装命令，没有安装技能到实际个人目录。2.13 继续待完成，update 不提前实施。已有已交付子 agent 的工程验收与此调研分开，不能把本次调研当成其验收通过。

## Third-batch integration and acceptance

已开启的 github-pr、compiler-exports、guides 三组均完成验收并本地集成，分别为 e69e0ea、3bef324、bb41066。主 agent 用 5d07177 修复定位后普通控件事件误采集文字范围，用 3e2e615 修复无 dist 时构建顺序。PR 完整 Chrome 流程由保留失败转为 3/3 通过，没有删减原断言。

98 项现有回归与另跑的 6 项 PR 专项全部通过；六组指南代码在源码及独立安装包实际编译。独立 npm 包八套 Chrome（PR、真实 gh、反馈、表格/Markdown、Git、讲解、Mermaid、选择/表单）全部通过，详情、包摘要和文件清单见 verification.md。仅 skill 指导已完成，docs/agent-guide.md 已删除。

已请求归档三个 worktree，工具返回 queued；复查 git worktree list 仍列出它们，清理尚未确认完成。主工作区原有五个页头相关文件保留，未纳入本批提交。未推送或发布。当前没有仍在开发的已开启子任务；安装器 2.13 尚未派工，用户 Sentinel 体验待进行，不归档整个 change。

## Init implementation dispatch

用户已明确授权把 init 实现掉并调用 distributed-development。当前选中 add-paneon-skill-panels（spec-driven，派工前 70/74 完成）。2.13 细分两组，接口及边界见 [init-implementation.md](init-implementation.md)；两组从本轮文档提交创建独立 worktree。安装器组负责 src/cli/skill-install 和文件/记录回归，CLI 组负责命令/终端、依赖、使用说明和 CLI 验证。主 agent 后续验收合入、提交、清理；派工后立即交还控制权，不等实现完成。

仅 init 已授权开工。B42 的 update 不实施，不自动升级 CLI，不安装到真实个人 agent 目录。主工作区原有五个页头相关文件继续保留，不纳入本轮基线提交。前批 archive queued 仍不当作已清理，本次建立新的命名 worktree，不混用已交付旧任务目录。

### 本轮准备及此前已确认方案的文件清单

- /Users/yuguo/IdeaProjects/paneon/docs/memory/agent-skill-assets.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/design.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/tasks.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/development.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/proposal.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/init-implementation.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/research/skill-installation.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/specs/paneon-agent-skill/spec.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/prototypes/skill-installation/README.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/prototypes/skill-installation/panel.tsx
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/prototypes/skill-installation/tsconfig.json
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/prototypes/skill-update/README.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/prototypes/skill-update/panel.tsx
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/prototypes/skill-update/tsconfig.json

## Choice UX correction dispatch

用户截图及补充回答确认 B43。实施契约见 [choose-ux.md](choose-ux.md)，新工作单元仅负责选择页、schema、独立说明及相关测试，避免 init_cli 的技能入口/CLI 指南/依赖范围。基于当前分支最新文档提交建立独立 worktree；主 agent 后续验收，派工后立即交还控制权。原有五个页头文件不变。安装器后端已有子 agent 交付，init CLI 收尾与本任务独立，不把子 agent 报告当成主 agent 验收。

本轮文档改动文件：

- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/design.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/tasks.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/development.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/choose-ux.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/specs/guided-choice-panel/spec.md

B43 补充纠正：多选支持已有选项与自填同时选中，自填是同级答案，不是整题补充。选择结果统一 selections 项级 kind，取消整题 options/custom 判别；单选仍总共恰好一项。主 agent 已同步进行中的 choose-ux 组，此修正不改变其文件边界。

## Contextual annotations dispatch

B44 根据六张用户截图明确；公共交互与各页接入分两组，以 [annotation-interaction.md](annotation-interaction.md) 为共同契约。两组新建隔离 worktree，基于本轮最新文档提交；core 独占公共 UI 和 feedback.md，pages 独占页面/适配器接入、其余指南及页面 browser 回归。不要修改事件 schema 或运行时业务协议。主工作区原有五个页头文件保留。

此前 choose-ux、init 两组已提交供验收。本轮主 agent 已读 choose 报告/截图并复验 schema 6/6；首次执行因交付树无 node_modules 无法解析 zod，链接现有依赖后通过，未改产品代码。choose 的浏览器/独立包仍需主 agent 核对，init 曾有一次子进程超时需组合复验；未将它们标记已全部验收或本 change 完成。

本轮修改文件：

- /Users/yuguo/IdeaProjects/paneon/docs/memory/MEMORY.md
- /Users/yuguo/IdeaProjects/paneon/docs/memory/ui-selection-feedback.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/annotation-interaction.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/design.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/proposal.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/tasks.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/development.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/specs/panel-feedback/spec.md

## Git layout follow-up — B45

用户直接要求参考 JetBrains Git Log 改进 Git 页面。主 agent 已核对历史行自然文本流、层层 Page 间距和 split diff min-w-max 溢出，与截图对应；方案见 [git-review-layout.md](git-review-layout.md)。此新增任务交给原 comment-pages 组，在 /Users/yuguo/.codex/worktrees/comment-pages/paneon 一并实现并验证，不新派另组修改相同文件。公共组的布局锚点/滚动更新契约继续适用。仅记录并派工，尚未完成验收。

本次新增/修改：

- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/git-review-layout.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/design.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/tasks.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/development.md

## Form layout dispatch — B46

用户继续体验并提供表单布局截图。该问题与批注无关，新建 form-ux 工作树独占 form/panel.tsx、form.md 和 skill-pages browser 回归中的表单部分；首先叠加 choose 已交付提交 32bc21d，避免在旧共用测试文件上重复修改，交付只包含新 form 实现。原 choose 主 agent 全套验收仍单独跟踪，不因准备依赖而勾选。comment-core/pages 文件边界不变。

本轮文档文件：

- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/form-layout.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/design.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/tasks.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/development.md

## Main acceptance progress

init和choose已完成源码审阅并本地集成，43/43组合回归、5个真实PTY和选择/原表单Chrome通过，见verification.md。2.13及2.14实现勾选，最终独立包/组合验收继续跟踪。批注、Git布局及表单组仍在开发，按用户要求本轮等待交付后验收；不根据其未完成代码提前勾选。

## Final integration — 2026-10-22

init两组、choose-ux、form-ux、comment-core和comment-pages均已交付并在0.0.x本地集成，主agent逐项验收，具体提交/日志/截图和全部文件见verification.md。本轮按用户明确“等待subagent完成任务，再验收”执行等待；该指令覆盖最初派工即交还的默认安排。无push或发布；此前五个页头相关脏文件不纳入提交。最终独立安装包的init及所有标准页/场景套件已通过；公共批注最后的点击/截图前提已定位并修正，最终安装包含截图完整流程通过，功能与首帧锚定断言均保留。已提交完成单元的managed worktree归档请求，工具仅返回queued，尚未确认物理移除。用户亲自体验Sentinel保留为未完成项，不归档整个change。
