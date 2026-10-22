## 当前状态

状态：页面范围、输入、交互和反馈契约已完成对焦与工程核对，首批公共反馈、文件入参及选择/表单已集成；第二批表格、Markdown、Git 和两个讲解页已通过主 agent 工程验收，证据见 verification.md。已开启的 PR、编译器和 skill 指南任务均已通过主 agent 验收并本地集成，证据见 verification.md。init 安装器已按 init-implementation.md 分工实现，并通过主 agent 的单测、真实 PTY 和临时安装验收。B38 已确认采用 CLI 统一安装入口，B40 已采纳安装交互；原页面实施已获用户授权在 Mermaid 验收通过后开工，该条件已满足，按 development.md 分工实施。Sentinel 已在实施时核对固定公开版本源码；用户亲自体验仍待完成。

### 需用户提供的信息

无。

### 需用户拍板的决策

无。

原页面及安装入口方向已确认；不把普通工程细节重新变成审批问题。用户已明确授权，Mermaid 前置验收已通过。

### 需用户确认的风险

无。当前进行实现与本地验收，不执行发布、Git 页面中的业务写操作或历史改写。

### 已确认结论

- **B1**：标准页面和示例均放入 Paneon skill，CLI 保持通用 TSX 运行入口。
- **B2**：首页不为标准页面做特殊处理；启动后的标准页面使用现有实例列表。
- **B3**：方案选择页保留原有方案字段，并支持只选选项、选项加补充说明、所有选项均不合适时自行填写答案，以及在同一页面依次回答多个选择问题。
- **B4**：本地 Git 变更审阅作为标准页面，并支持多 Git 仓库；不能仅依赖 --cwd 表达仓库范围。
- **B5**：多题问答最后统一提交全部答案；上一步/下一步只保留页面内草稿，不逐题发送答案事件。
- **B6**：新增通用 --params-file <path>，从 JSON 文件读取页面入参；保留 --params，两者二选一，标准页面和自定义 TSX 均可使用。
- **B7**：--params-file 在启动时读取 JSON 快照；修改原文件不自动改变当前实例的入参，不打断正在作答的页面。
- **B8**：交互式数据表作为 skill 中的标准页面，调用者传入数据即可使用，无需为该标准场景重写 TSX。
- **B9**：信息收集作为标准页面；GitHub PR 工作台作为场景示例；内容审阅和并发讲解可以试做验证，详细入参和交互仍需对焦。
- **B10**：skill 与 CLI 使用同一发布版本，随 CLI 包提供配套 skill 资源；skill 不独立发版；按新增 B37 通过统一安装入口完成配套安装，不要求用户自行分别安装两部分。
- **B11**：一轮问答对应一个实例；agent 发起新一轮选择题时创建新实例，使用新的链接与实例 ID 关联问题和答案。
- **B12**：信息收集页在同一页面展示全部字段，最后统一提交整份表单，不采用分步分组填写。
- **B13**：Git 审阅页同时支持当前工作区改动，以及分支/提交版本之间的比较。
- **B14**：Git 页面支持对改动和文本做精准评论，评论完成后可以修改以纠正输入，AI 能读取评论。
- **B15**：Git 评论明确提交后才交给 AI；提交前可以反复编辑，已提交内容修正后再次提交修正版，不在编辑过程中逐条发送草稿。
- **B16**：Git 页面能查看经过 Git 忽略规则处理的未提交改动文件、当前分支提交记录、变更文件 diff、每个提交的改动，以及当前分支与另一分支的文件对比；agent 唤起时指定仓库和初始展示界面。
- **B17**：initialView 采用 changes、history、compare 三类视图；history 可用 commit 定位单次提交，compare 使用 branch/commits 模式及 base/head，file 可定位文件；省略 initialView 时打开第一个仓库的未提交改动，用户之后可自由切换。
- **B18**：交互表格数据只读，支持浏览、选择和反馈，不提供单元格数据编辑。
- **B20**：表格选择对象包括行、列和单元格，不能仅用行选择表达所有场景。
- **B22**：表格页不提供预先选中能力；移除 initialSelection 入参，新实例打开时没有选中项，由 human 自行选择。
- **B23**：表格页移除 overflow、format 配置，沿用现有 shadcn Table 的默认展示；不恢复 detailsKey，也不增加自定义摘要、展开全文或单元格 Markdown 渲染。
- **B24**：选择与评论做成可选的公共 SDK/UI 能力，标准页、示例和自定义 TSX 按需接入；共享状态管理、正常/选择模式、对象与普通文本选择、评论编辑和明确提交，页面负责语义位置和内容版本，保留布局控制，复用现有事件机制。
- **B19**：表格直接复用 B24 的公共目标集合，同一份反馈允许混合行、列、单元格及格内文字目标，不人为增加同类限制；此为公共方案的自然落实，不单独请求用户拍板。
- **B21**：表格采用 B24 的公共选择与评论流程，支持多对象、格内文字、多条独立意见、纯选择及整体反馈；不再将已由公共方案覆盖的职责列为重复待定项。
- **B25**：表格移除 rowKey，不要求输入记录带 id；使用实例原始 rows 数组从 0 开始的下标作为稳定行定位，排序、筛选及分页只改变展示，不改变该定位。

- **B26**：信息收集页采用标准表单；支持文本、多行文本、数字、下拉/平铺单选、多选、勾选框和开关，提供说明、必填和默认值；所有字段同页填写、可反复修改，明确提交后统一校验并保存整份 values，失败保留填写内容，沿用 shadcn 默认样式。

- **B27**：Git 页面采用手动刷新改动；本地文件变化不自动替换正在阅读的 diff，human 点击页面内「刷新改动」才重新读取；保留评论草稿，旧评论继续指向原内容，不自动迁移到新版本的相同行号。

- **B28**：只选中不写评论等同于 comment 为空字符串；公共反馈只保留 annotations 一份条目列表，不再分别使用 selected 和 annotations 两种结果结构。

- **B29**：同一 Git 页面可跨未提交改动、提交历史和分支对比添加反馈；每条反馈的目标通过 sourceId 保留各自文件比较来源，同名文件在不同比较中不会混淆，切换视图不改变旧反馈含义，最后可一起提交。old/new 属于各个来源，不是页面全局的一对版本。

- **B30**：内容审阅页采用完整 Markdown 文档及精准圈选方案；输入 title 和 markdown，支持对整篇、正文段落及词句评论，复用统一 annotations 和明确提交；开发 Markdown 显示选区到原文位置的适配，不采用预先分块及只对整块评论的输入方式。

- **B31**：GitHub PR 示例中的意见只交给当前 AI；GitHub 内容只读，不提供评论发布、approve、合并或关闭 PR 等写操作。页面查询通过 serverAction 直接执行 gh，给 AI 的审阅请求及意见通过已有事件交付。

- **B32**：保留并发与排队作为一次性原理展示 example；主题、标题、任务数据和初始并发数直接写在 TSX 中，不设计专用业务入参或配置文件。agent 参考或修改源码编写自己的展示页；页面内仍可调整并发数、播放和暂停。

- **B33**：新增 Sentinel LeapArray 一次性原理展示 example，以 [alibaba/Sentinel](https://github.com/alibaba/Sentinel) 源码为准；主题、场景和数据写在代码内，开发时直接实现，不再逐项讨论；当前只记录需求，具体源码细节到编写该 panel 时再看，用户验收后遇到问题再修复。

- **B34**：Paneon 提供的标准页面统一支持在原页修改已提交的答案或反馈，并在用户再次明确提交时追加完整修正版、关联上一份结果、保留历史；新一轮问题仍用新实例。自定义页面作者在技术上可以自行实现其他提交后行为，不由 runtime 或公共组件强制此策略。
- **B35**：设计文档和 Sentinel example 页面使用公开仓库 [alibaba/Sentinel](https://github.com/alibaba/Sentinel) 作为来源，不出现开发者机器上的 Sentinel 路径。
- **B36**：面向使用 Paneon 的 agent 只提供 skill，不保留独立 agent 指南；现有有用内容迁入 skill references，删除 docs/agent-guide.md，并清理 README 引用与打包配置。
- **B37**：用户只需选一个安装入口：安装 skill 后由 skill 指导安装 CLI，或安装 CLI 后由 CLI 安装 skill；不能要求用户自行分别寻找和安装两部分。入口按 B38 采用 CLI。
- **B38**：采用 A，CLI 作为统一安装入口，由 CLI 安装包内配套 skill；CLI 与 skill 的配套维护由 CLI 承担。未来可增加 update 命令，本次不实现 update。
- **B39**：先沿用成熟项目的安装做法及文案，不足时再扩展；不预先加入自定义备份、冲突分类等流程。工程上以调研过的 Vercel Skills 固定实现作为参考。
- **B40**：用户体验后采纳当前安装交互：Universal 固定选中并共用一份目录；先选择 agent，再选择安装范围，默认 Project、可选 Global；所有目标共用目录时直接复制并跳过安装方式，多目录时默认推荐 Symlink、可选 Copy；展示安装汇总及覆盖目标后统一确认。沿用参考项目英文文案，不增加自定义备份或冲突分类。确认的是交互方案，CLI 安装器仍由 2.13 跟踪实施。

- **B41**：安装或更新需要保存元数据时，文件统一放固定的 ~/.paneon 内；项目目录不新增 .paneon/skill-install.json 等元数据文件。项目级 skill 资源仍安装到各 agent 的目录。更新命令方向后由 B42 确认，具体记录结构仍待实施收敛，不据此启动 update 开发。

- **B42**：采纳未来更新命令：paneon update 升级 CLI 并同步全部已登记的 Paneon skill；paneon update --project 升级 CLI、只同步 cwd 对应项目；paneon update --global 升级 CLI、只同步用户级。默认全部更新与 cwd 无关。沿用各安装方式，普通目录清理重建并覆盖用户修改，正确链接保留；项目目录已不存在则跳过并报告，不重建项目。此项仅确认并记录方案，update 仍不在本迭代实施范围。

## Context

仓库：paneon（/Users/yuguo/IdeaProjects/paneon）。分支：0.0.x。设计基线：ba6e731a78700ecfdc5dfbb58f20483ba6927c7f。

变更前的基线产品有 CLI、SDK、UI 和独立 agent 指南；当前已提供 Paneon skill，并按 B36 将全部 agent 使用指导收拢到 skill，删除独立指南。现有 .agents/skills/ 是开发工具，不作为产品 skill 的资源目录。当前 examples 主要证明组件或调用能力；用户要求围绕实际任务重整。此 change 与 add-mermaid-rendering 分开；使用 Markdown Mermaid 能力时依赖其完成集成和验收，不在此处声称已交付。

已有运行基础：panel run 从 entryPath、cwd、params 创建实例；definePanel.input 校验 JSON；agent.emit 保存显式用户事件；events/ack 允许原会话恢复后读取结果。CLI 当前只支持 --params，不支持 --params-file。无需为标准页面创建新的 HTTP 端点或数据库模型。

## Goals / Non-Goals

**Goals:**

- 通过一个产品 skill 分发现成标准 TSX、可复用场景示例和按需加载的调用说明。
- 标准选择页覆盖 B3 的四种交互；保留稳定的问题/选项标识，供 agent 理解回答。
- 多仓库 Git 页面在输入和反馈中区分仓库，避免同名文件混淆。
- 提供可由标准页、示例与自定义 TSX 接入的公共选择/评论 SDK/UI，skill 提供使用说明，页面保留语义和布局控制。
- 在对应页面实现前完成其契约核对，由 agent 收敛工程细节。

**Non-Goals:**

- 不增加 builtin: 名称解析、内置页面注册表或首页专用目录。
- 不设计通用 JSON 页面搭建语言；JSON 仅描述每个标准页面自己的输入。
- 不自动唤醒已结束的 agent；不将阅读下一题等浏览行为自动当作已提交答案。
- 不把 Git/gh 概念加入通用 runtime，也不把计数器或模拟发布测试当成主要产品示例。

## Decisions

### 资源归属与运行方式

产品 skill 的仓库位置建议为 skills/paneon/：SKILL.md 只介绍场景选择、运行和读取结果；references 按具体页面拆分参数/事件契约；assets/panels 放直接运行的 TSX；assets/examples 放可复制修改的完整业务场景。路径布局是建议实施结构，用户已确认的是 skill 资源归属。

通用调用仍是 `paneon panel run <skill-directory>/assets/panels/choose/panel.tsx --cwd <directory> --params '<json>'`。每次 run 仍创建普通实例，沿用 inspect/reload/close/events/ack。无需先复制标准页面源码；需要修改实现时再复制相关目录。

按 B10，仓库只维护一份产品 skill 源码，随 CLI 的 npm 包携带配套资源，与 CLI 使用同一发布版本，不维护独立的 skill 发布序列。package.json 的 files 清单需要包含产品 skill 目录；独立安装产物验收应确认 SKILL.md、references 和 assets 均完整可用。

按 B37，安装体验只提供一个入口，由该入口指导或完成另一部分的安装；不把独立寻找 CLI 与 skill 两份资源作为用户流程。当前代码仅提供包内 skill 和手动目录复制，尚无安装命令，不能把目标体验写成已实现。B38 已选定 CLI 入口，由 CLI 安装其包内同版本完整 skill，不以用户手动查找包目录和复制作为产品安装流程。资源引用仍相对 SKILL.md，保持完整可移植；requires.paneon 继续作兼容校验。安装命令的目录选择与已有副本处理规则由安装能力的技术契约落实；未执行安装命令时不写入个人目录。用户提出未来通过 update 改善更新体验，该命令不纳入本次实现，也不提前承诺旧 skill 副本已能自动更新。

### CLI skill 安装链路调研

已完成 OpenSpec、Vercel Skills、Firecrawl CLI、Playwright CLI、OpenSkills 的实现对比，并以 agent-browser 的薄入口模式作对照。固定源码版本、实际终端选择与临时项目安装/重装证据见 [调研文档](research/skill-installation.md)。

B40 已确认当前演示交互。按 B39，流程和英文文案先沿用 Vercel Skills 固定源码 a80e4c9 的 add.ts / installer.ts：先选 agent，默认 Project、可选 Global；多个不同目录时显示 Installation method，推荐 Symlink，也支持 Copy to all agents；同目录跳过方式选择并直接复制。链接模式把完整资源复制到稳定的 .agents/skills/paneon 中央副本，各非通用目标链接到它，不链接 npm/npx 缓存。已有安装在 Installation Summary 标记 overwrites，再通过 Proceed with installation? 统一确认覆盖或取消，不新增备份、自动合并或内容冲突分类。等价非交互参数沿用 --agent / --global / --copy / --yes 的语义。

Paneon 保留已确认的唯一来源：当前 CLI 包内完整 skill，不另下载技能仓库，也不显示多技能挑选。一次性体验页见 prototypes/skill-installation/panel.tsx，说明见同目录 README.md；网页导航仅用于展示终端流程，不增加浏览器安装器依赖。演示只列三个 agent 子集，不代表正式注册表已完成。CLI 安装器已实现并通过主 agent 验收，最终注册表及命令以 init-implementation.md 和 skill/CLI 帮助为准；未来 update 仍不在本次范围。

### init 实施契约

用户已明确要求实现 paneon init 并使用 distributed-development。命令、首批 11 个 agent、终端原文、目录/覆盖及集中记录、两组内部 API 和验收边界见 [init-implementation.md](init-implementation.md)。只做 2.13，B42 update 仍为未来方案。

### 后续 update 已确认行为（B42，本迭代不实现）

| 命令                    | 行为                                                          |
| ----------------------- | ------------------------------------------------------------- |
| paneon update           | 升级 CLI，并更新全部已登记的 Paneon skill，包含项目级和用户级 |
| paneon update --project | 升级 CLI，只同步当前 cwd 对应项目的 skill                     |
| paneon update --global  | 升级 CLI，只同步用户级 skill                                  |

CLI 检查/升级一次后，从 ~/.paneon 的集中安装记录取得所选条目；默认命令不以 cwd 筛选，也不扫描磁盘找项目。显式 --project 才用 cwd 匹配安装记录。即使 CLI 已是最新，也继续同步所选 skill。沿用每项原来的 agent、目标及 Copy/Symlink 方式，普通安装目录清理重建后复制包内新版，覆盖用户修改并清除过时文件；正确指向中央副本的链接保留。项目目录已不存在时跳过并报告，不根据旧记录重建项目。

prototypes/skill-update 的可运行页面仍是之前默认按 cwd 的演示，保留作记录结构和目录/链接动作说明；不能把该原型的旧默认值当作 B42 已确认行为。具体 JSON 文件名/结构仍由实施收敛。本次仅记录 future update 方案，不新增 update 实施任务，也不扩大 2.13 安装器范围。

### 后续实施依赖与页面契约概览

页面对焦和整体方案核对已完成，用户明确开工后，实施依赖顺序为：公共类型/schema 与 UI 状态、通用文件入参 → 公共对象/文本选择及自定义页面接入验证 → 标准选择/表单/表格 → Git 原文定位和评论适配 → 内容审阅试做、GitHub PR 与并发讲解示例 → 打包/skill 安装说明及整体验收。工程契约见下方定稿章节；当前按独立 worktree 分工开工，不将文档核对视为实现或验收完成。

现有示例迁移以场景为目标：decision-panel 的布局经验用于 choose；form/table 转为标准 skill 页；gh-panel/github 模块整理为真实 PR 场景；components-panel、计数器及模拟发布相关资源只作为开发检查/测试素材，不再作为主要用户体验入口。先迁移引用和必要验证，再整理旧文件，不直接删除仍被测试依赖的资源。

内容审阅已按 B30 确认完整文档阅读及精准圈选方案，详见下方专节。GitHub PR 已按 B31 确认 GitHub 只读及意见交给当前 AI 的边界，详细位置反馈契约见工程定稿章节；并发讲解按 B32 采用数据写在 TSX 内的一次性展示 example。工程契约、实现和运行验收见 verification.md；以下为已确认的场景职责：

| 页面        | 入参样例                                                   | 页面职责和结果                                                                                                                                                                                                                                                                             |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| review      | `{ "title": "方案审阅", "markdown": "采用……" }`            | B30 已确认完整 Markdown 阅读及整篇/正文段落/词句精准评论，复用 annotations 和 review-submitted；不要求调用者切段或提供段落 ID，详见下方专节。                                                                                                                                              |
| github-pr   | `{ "repository": "cli/cli", "initialPullRequest": 14768 }` | repository 必须显式给出；initialPullRequest 可省略，省略时先展示 open PR 列表。真实 gh 查询列表、详情、状态与 diff；浏览请求由 serverAction 执行，请 AI 分析及反馈通过事件提交；按已确认 B31，意见仅交给当前 AI，不提供 GitHub 写操作。ref 含 repository、PR number、head OID 及被选内容。 |
| concurrency | 无专用业务入参；标题、固定任务和初始并发数直接写在 TSX 中  | B32 已确认一次性原理展示示例，页面内可调整并发、播放和暂停；agent 参考或改源码写自己的讲解页，不为此维护任务 JSON 输入协议。                                                                                                                                                               |

标准选择与表单的输入/结果沿用下文已列结构：创建时校验 schema 和声明的初始值，显式提交时校验完整结果；普通字段编辑不发送事件。推荐项不自动选中。文本不擅自改写，空白判定用于校验，不把原文静默清洗成另一份值。技术默认值和错误状态按统一组件组合实现。

### 文件变更、问题修订与新一轮问答

用户指出两个需同时评估的体验问题：参数文件突然变化可能打断 human；agent 发起新的选择题时，新实例和更新原实例哪个更合适。B7 已确认启动时读取参数快照，B11 已确认新一轮创建新实例；本 change 不增加覆盖现有实例 params 的入口。

代码事实：runtime.run 每次生成新 instanceId 并保存传入 params；reload 读取已保存的实例和 params，再重建源码，并不会重新读取原命令的 JSON 文件。现有 CLI/HTTP 没有更新实例 params 的入口。revision 是源码/依赖/包版本摘要，不是问题内容或问答轮次版本。现有事件按 instanceId 归属，因此新实例已能区分不同轮次结果；直接重用实例并修改 params 不能仅靠现有 revision 区分用户回答的题目版本。

三个动作按已确认 B7/B11 分别处理：

| 动作                                         | 行为与确认状态                                                                         | 原因                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 保存或整理输入文件                           | 按 B7 保持当前实例原有 JSON 快照，不监测参数文件变化                                   | 文件保存可能只是 agent 的中间编辑，不应突然替换 human 正在读的题目         |
| 修正输入文件中的错字、补全方案说明           | 已打开实例保持原快照；如需向 human 展示修改后的题目，重新 run 创建实例并明确交付新链接 | 避免失去阅读位置或误将旧选择用于新含义；不增加同实例参数更新或更新确认机制 |
| 收到上一轮答案后，提出新一轮问题或另一个决策 | 按已确认 B11 创建新实例，保留上一轮的问题与答案归属，通过聊天交付新链接                | AI 可通过实例 ID 关联结果，旧页面不会突然变成另一轮问答                    |

新一轮使用新实例，复用当前运行/事件模型，问题和答案通过 instanceId 对应；代价是多轮会产生多个链接和实例。既有实例列表、分页和显式 close 可以管理它们，但自动关闭或偷偷替换旧页尚未获确认。标准选择页不采用同实例切换问答轮次的流程，不为此增加轮次切换机制，也不因参数文件保存而修改已有实例。

例如 human 正在第 2/3 题填写补充说明时，agent 保存修改了第 1 题的 options，页面直接重载会改变已回答题目的含义或清空草稿。即使按 questionId/optionId 保留值，也不能证明对应文字仍是 human 当时认可的内容。因此先保护当前问答的稳定性，再设计明确的更新/交接动作；不把 TSX 开发热更新直接等同于提问内容的更新策略。

参数文件更新也不等同于业务数据显示更新。Git/PR 工作台在同一实例内重新查询最新数据，可以继续由页面自己的查询和刷新逻辑负责；不需要通过覆盖 params 实现。按 B7 固定实例的 JSON 配置/问答输入，不要求所有页面的业务数据保持静止。JSON 字段中的业务文件路径不会被通用 CLI 自动加载、冻结或监测，其内容读取方式由对应页面契约明确。

### 页面清单与对焦状态

| 资源                | 角色               | 已对焦的内容                                                                       | 工程状态                                                    |
| ------------------- | ------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| choose              | 标准页面           | 选项/补充说明/自填、多题依次回答、最后统一提交、每轮新实例                         | 首批已实现并集成；验收状态见 verification.md                |
| form                | 标准表单页         | 字段类型、说明/必填/默认值、同页填写、校验、统一提交和 values 结果已确认           | 首批已实现并集成，支持 B34 更正；验收状态见 verification.md |
| table               | 标准页面           | 数据只读，公共混选/文字评论、多条意见，沿用 Table 默认展示，移除预选及特殊长文配置 | 第二批已实现，主验收见 verification.md                      |
| git-review          | 标准页面           | 多仓库、工作区/提交历史/分支比较、initialView、精准可编辑评论及明确提交            | 第二批已实现，主验收见 verification.md                      |
| review              | 试做的标准页面     | B30 已确认完整 Markdown 输入、整篇/段落/词句评论和统一提交                         | 第二批已实现，主验收见 verification.md                      |
| github-pr           | 场景示例           | 同意提供真实 gh CLI 场景                                                           | 已实现真实只读 gh 与精准反馈；主验收见 verification.md      |
| sentinel-leap-array | 一次性展示 example | B33/B35 已确认公开源码、固定主题和数据                                             | 第二批已实现并核对公开源码；用户体验待完成                  |
| concurrency         | 一次性展示 example | B32 已确认数据写在 TSX 中，无专用业务入参，示范交互原理讲解                        | 第二批已实现，主验收见 verification.md                      |

公共选择与评论是跨页能力；各页范围及工程契约已分别核对。表格按 B25 不要求 rowKey，表单按 B26，标准页更正按 B34。不要求用户重新确认混选、普通校验或 API 字段名。

### 选择与评论的通用复用方案（B24 已确认）

现有 src/sdk/client.ts 已提供 agent.emit，src/sdk/server.ts 的 definePanel.events 声明事件 schema；事件校验与持久保存、CLI events/ack 已有实现。首批已在 src/sdk/index.ts、client.ts、server.ts 和 src/ui/index.ts 导出公共选择/评论能力。建议复用现有传输和存储，将新增工作集中在公共交互能力；不另造通信协议、评论数据库或自动唤醒机制。B24 已确认采用公共 SDK/UI 的方向与下述交互设计；组件、hook、schema helper 的精确签名见工程定稿章节；首批实现已验收集成，业务页面适配仍分别跟踪。

#### human 如何操作

1. 默认是正常浏览。已确认 B22 的表格新实例没有预选项；点击链接、按钮和输入表单保持现有含义。
2. human 点击页面作者放置的「选择与评论」入口，进入选择模式。只对作者已标记的内容选择；点击可选对象增选/取消，多个对象可不相邻。普通文本还可以划选其中一个词或连续片段；保留复制入口，划选不自动提交。
3. 选择对象后形成一条 annotations 草稿，comment 初始为空字符串；可继续给这条草稿添加目标，或直接填写说明。只选不写与写了说明使用同一条目，补充或清空说明不迁移结构，也不改变条目 ID。完成当前条目后可新建另一条；已有条目保留，同一对象可以被不同条目引用。取消当前草稿仅撤销本次未确认的编辑，不删除其他已有条目。
4. 可以退出选择模式继续操作页面、回看/定位已有评论、编辑或删除草稿。切换模式不清空草稿，也不发事件。不可见对象提示其状态，由页面适配器定位，不因翻页或过滤擅自删除。
5. human 明确提交后，页面通过已声明 schema 的事件把统一条目列表及整体意见发送给 AI；等待 agent.emit 完成持久保存再显示成功。失败保留草稿，提交中禁用重复点击。按 B34，随 skill 提供的标准页允许修改并明确重提修正版；自定义页面的 onSubmit 和页面状态仍由作者决定，公共组件不强制锁定或修订策略。

模式入口、评论编辑器和列表由作者放在页面合适位置，默认没有固定页头、浮动工具条或强制侧栏。表单/选择题本来的答案和操作不作为反馈目标选择；选择模式只处理显式注册的非表单内容，不能自动调用任何业务动作。嵌套目标优先处理最内层对象，文字划选不同时触发整块点选；按钮/链接/输入框不被外层对象的选择处理抢占。

#### AI 编写自定义页面时如何接入

按 B24 提供以下公共构件，随 Paneon CLI 包的 SDK/UI 一起发布；skill 提供接入说明和实例，精确签名见工程定稿章节：

| 构件（拟定名称） | 做什么                                                      | 页面作者提供什么                                                     |
| ---------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| FeedbackProvider | 管理模式、选择、评论草稿、提交状态；不生成可见容器          | onSubmit 回调；动态数据按需提供目标校验和定位回调                    |
| FeedbackTarget   | 注册一块可整块选择的内容并处理选择/高亮                     | 可 JSON 序列化的稳定对象标识；asChild 复用原元素，不额外包裹表格标签 |
| FeedbackText     | 注册普通原文，计算文字划选范围和 quote                      | 对象标识和原始字符串；不从任意渲染 DOM 猜测原文                      |
| FeedbackControls | 入口、当前选择、添加/编辑评论、评论列表和明确提交的默认组合 | 在页面中放置的位置；采用已有 shadcn 组件样式                         |
| useFeedback      | 允许页面用自己的按钮或布局接入同一份状态                    | 按需调用切换模式、选择目标、新建/修改/删除评论、定位和提交操作       |

最小自定义卡片例子（计划 API，省略页面本身的输入与 definePanel 声明）：

```tsx
import { agent } from 'paneon/sdk';
import { Card, FeedbackProvider, FeedbackTarget, FeedbackControls } from 'paneon/ui';

function PlanReview() {
  return (
    <FeedbackProvider onSubmit={(feedback) => agent.emit('feedback-submitted', feedback)}>
      <FeedbackTarget target={{ kind: 'plan', planId: 'redis' }} asChild>
        <Card>使用 Redis 保存缓存</Card>
      </FeedbackTarget>
      <FeedbackControls />
    </FeedbackProvider>
  );
}
```

普通文字精确划选使用显式原文入口，而非对整个任意 Card 自动推断：

```tsx
<FeedbackText
  target={{ kind: 'plan-description', planId: 'redis' }}
  text="使用 Redis 保存缓存，缓存失效后回源查询。"
/>
```

FeedbackControls 可以放在页尾、页面自己的侧栏或其他合适位置；更复杂的布局通过 useFeedback 组合现有 Button、Dialog、列表等。公共层维护同一份状态，不要求作者重写新增/编辑/删除的逻辑，也不接管作者的整体页面布局。

#### 统一数据结构：业务对象与文字范围分开

为使 FeedbackText 能自行生成文字范围，建议在上一轮 Feedback<TTarget> 草案上补一个统一的目标外层；业务对象放在 ref，文字范围放在 text。页面不必为每种文字划选重写生成目标的逻辑。该公共目标结构纳入 B24 方案；详细校验与 API 签名见工程定稿章节。

```ts
type FeedbackTextRange = {
  start: number; // 原始字符串 UTF-16 下标，包含
  end: number; // 不包含
  quote: string; // 必须等于原文 slice(start, end)
};

type FeedbackTarget<TRef> = {
  ref: TRef; // 页面定义的对象：单元格、方案、代码内容等
  text?: FeedbackTextRange; // 没有 text 表示整个对象
};

type FeedbackAnnotation<TRef> = {
  id: string;
  targets: FeedbackTarget<TRef>[]; // 非空，一条意见可以关联多个位置
  comment: string; // 空字符串表示只选中，非空表示补充了意见
};

type Feedback<TRef> = {
  annotations: FeedbackAnnotation<TRef>[]; // 统一表达全部已选对象及其可选说明
  comment?: string; // 对本次内容的整体意见
};
```

TRef 必须可 JSON 序列化，页面提供相应 schema；建议 SDK 提供 feedbackSchema(refSchema)，组合公共结构与业务位置校验，供 definePanel.events 声明。例如 `events: { 'feedback-submitted': feedbackSchema(planRefSchema) }`。辅助函数需同时遵循 paneon/sdk 的 browser/default 导出入口，不出现 Node 端有而浏览器端缺失的公共导出。type FeedbackTarget 在 SDK 中表示数据类型，UI 中同名 FeedbackTarget 是组件，示例中从 paneon/ui 导入的是后者。

表格可以复用下文的 TableRef；GitRef 则需包含仓库、文件、所见版本/比较范围、diff 侧和被登记的代码区域。纯选择和评论都使用稳定的对象标识，排序、翻页或 React 重建元素不改变身份。DOM 元素、函数、CSS 选择器和点击坐标不进入提交结果。对边框、空白或任意画布坐标的自由评论不因通用化自动成为需求。

普通文本的范围针对登记的原始字符串，不自动适配 Markdown DOM、代码 diff、虚拟列表等复杂内容。表格适配器负责行/列/格的选择入口和跨页定位；Git 适配器负责原文、侧、行号及内容版本的映射；自定义页至少标记其可选内容及语义标识。动态页面必须保留 human 所见内容与版本，内容变化时将原目标标为过期并保留草稿，不能静默把文字偏移套到新内容上。源码 revision 不是业务数据版本。表格输入已有实例快照归属，无需额外添加重复数据版本号。

#### 事件校验与内容校验的实际边界

已核对 src/runtime/worker.ts 的 validate-event 与 src/runtime/lifecycle.ts 的 append：当前运行时只调用 definePanel.events 对 payload 做 schema.safeParse，再持久化；不会自动用实例 params 或外部文件/接口内容核对业务位置。feedbackSchema(refSchema) 负责公共结构、JSON 可序列化、非空目标集合、ID 唯一性和范围的结构约束；comment 必须是字符串，允许为空，不能要求非空评论，不假装知道每个 ref 对应的原文。

页面适配器负责语义校验：纯静态内容用实例输入快照及已注册原文核对目标；Git 等动态内容在读取时形成所见快照，提交前通过页面自己的 serverAction 校验相同快照，不能重新读取最新文件来替换旧内容。校验通过后将有版本和 quote 的目标交给已有 agent.emit；这不是语义校验与入库合成的数据库事务，不宣称排除了期间发生外部数据变化，但结果始终明确指向原快照。外部数据的最新状态和业务动作仍由页面代码负责。

公共 Provider 的实现应统一冻结提交快照，校验期间限制重复提交，成功前不清草稿；onSubmit 负责页面语义校验及最终发事件。原文或版本不匹配时保留草稿并指出过期目标，不自动重定位成新内容。无需为这条校验链新增 runtime 专属 Git/表格规则或通用业务执行器。

现有事件限制为 type 最长 128 字符、payload 按当前 JSON 序列化长度上限 65536；反馈不重复传整份输入或完整 diff。schema 与页面提交界面应在超限时给出明确校验结果，不能静默截断评论或 quote；验收覆盖该限制。事件语义上限不变，HTTP 字节上限需按下方工程核对修正，不新增用户配置选项。

#### 提交与存储

公共组件只输出 Feedback<TRef> 并调用页面的 onSubmit。页面在 definePanel.events 声明 schema，再用 agent.emit 发送；可以直接用作 table-submitted 的 payload，或者随选择题答案等页面结果组合提交，不强制新增唯一事件名，不产生双份提交。

评论草稿保存在当前页面的 React 状态中，不承诺刷新、reload 或浏览器关闭后恢复，也不增加磁盘草稿。最终事件仍使用现有 runtime.sqlite 事件存储及 CLI events/ack；已有外层 instanceId、事件 ID、时间和源码 revision 不在反馈 payload 重复。AI 停止时不会被页面点击唤醒，手动恢复后仍可读取已持久保存的结果。

按已确认 B24，需要开发并验证状态管理、选择/文本定位、默认编辑界面和接入 API；公共逻辑和样式只维护一份，页面负责语义和特殊内容适配。skill 提供使用说明和接入示例，不把复制一份评论实现作为自定义页的标准接入方式。

B24 的公共能力和各页的接入范围已经明确，公共 API 与页面适配契约见工程定稿章节。实施范围除标准页适配、skill 指南外，涉及 src/sdk/feedback.ts（公共类型/schema）、src/sdk/index.ts、src/sdk/client.ts、src/sdk/server.ts、src/ui/feedback.tsx（状态及组件）、src/ui/index.ts 和 skill references；公共模块已由首批实现并验收；按 B36 仅在 skill 内维护使用指导。公共 API 验收应覆盖真正的自定义 TSX 接入、原有按钮/表单可用、文字复制、多目标与多条评论、内容变化定位、发送失败保留草稿及 events 读取结果。

### 方案选择页体验修正（B43 已实现）

用户截图反馈确认：收紧问答标题、说明、进度和题目间距；自填答案框始终可见，不先切换页面模式；单选和多选均为每个选项各有一条补充说明，输入框放在对应已选卡片内。新结果使用 selections 数组，已有选项项携带 kind: option、optionId 和字符串 comment，自填项携带 kind: custom 和 text；空 comment 表示没有说明，不再使用结果 selectedIds 加整题 comment。单选只选一项，多选允许同时选已有项和自填项。输入的初始 selectedIds 保留。具体交互、草稿和验收边界见 [choose-ux.md](choose-ux.md)。本修正已交付并通过主 agent 的源码与独立安装包 Chrome 验收。

### 方案选择页输入

把原来的 mode/options/selectedIds 下移到 questions 中。title/description 负责整份问答；每题有自己的 id、title、背景与选项。即使只有一题也使用 questions 数组，避免维护两套输入格式。

```ts
type ChooseParams = {
  title: string;
  description?: string; // Markdown
  questions: ChooseQuestion[];
};

type ChooseQuestion = {
  id: string;
  title: string;
  description?: string; // Markdown
  mode?: 'single' | 'multiple'; // 默认 single
  options: {
    id: string;
    label: string;
    description?: string;
    details?: string; // Markdown，含代码、表格、Mermaid
    recommended?: boolean; // 推荐标记不自动选中
  }[];
  selectedIds?: string[]; // 默认 []
};
```

所有题目固定提供选项选择、可选补充说明和「自行填写答案」，不增加调用者通常无需决策的开关。自填答案是独立的选中项类型，不伪造一个与用户选项 ID 可能冲突的 other 选项。

问题 id 在同一问答内唯一；选项 id 在所属问题内唯一。问题和选项数组不能为空；初始选择不得重复或指向不存在的选项；single 最多一个初始选项。selections 至少一项，single 总共恰好一项；选中的 custom 文本去除首尾空白后不能为空。无补充说明的选择同样是合法答案。自填不要求选中任何已有项；single 中与已有项互斥，multiple 中允许同时选择已有项和自填，至多一个 custom。取消或切换保留未提交草稿，避免输入丢失。

输入文件示例为 /work/project/choices.json，按已确认 B6 将由 --params-file 读取；现有 --params 也可传相同 JSON。文件入参现已实现并集成：

```json
{
  "title": "确认实现方案",
  "questions": [
    {
      "id": "storage",
      "title": "数据存储采用什么方案？",
      "options": [
        { "id": "sqlite", "label": "SQLite", "description": "单机部署简单", "recommended": true },
        { "id": "postgres", "label": "PostgreSQL", "description": "多实例共享数据" }
      ]
    },
    {
      "id": "delivery",
      "title": "以什么方式分发？",
      "options": [
        { "id": "npm", "label": "npm" },
        { "id": "binary", "label": "独立程序" }
      ]
    }
  ]
}
```

### 选择页分镜与提交边界

按已确认 B5：显示整份问答标题和进度「1 / 2」；每次展示一题的背景和方案。方案显示名称、摘要与推荐标记，详情按需展开。各已选卡片内提供属于该选项的可选补充说明；选项列表下始终展示自行填写答案框，无需先切换。单选中已有选项与自填答案互斥，多选中两者可以同时选中，当前生效项须清晰可见；详见 B43。上一步/下一步仅保存当前页面内草稿，返回后可修改；末尾确认整组答案并提交。最终提交前不发送 answers-submitted 事件，也不将切题当作完成问答。一次成功的最终提交产生一个包含全部问题答案的事件。

只选、选项加说明、自填分别使用以下回答结构。最后统一提交已经确认；具体字段及完整校验见工程定稿章节。统一提交的数据包含全部问题的最终答案，通过 questionId 关联；不发送每题的草稿修改历史。

```ts
type ChoiceSelection =
  | { kind: 'option'; optionId: string; comment: string } // 未写说明用空字符串
  | { kind: 'custom'; text: string };
type ChoiceAnswer = {
  questionId: string;
  selections: ChoiceSelection[]; // 单选恰好一项；多选可同时选已有项和自填
};

type AnswersSubmitted = {
  answers: ChoiceAnswer[];
  replacesEventId?: number; // 更正时引用本页面上一份成功提交，首次不传
};
```

事件示例：type 为 answers-submitted，payload 如下；所有问题均以稳定 questionId 关联，输出不重复完整选项详情。

```json
{
  "answers": [
    {
      "questionId": "storage",
      "selections": [{ "kind": "option", "optionId": "sqlite", "comment": "请补充备份方案" }]
    },
    {
      "questionId": "delivery",
      "selections": [{ "kind": "custom", "text": "通过公司内部软件中心分发" }]
    }
  ]
}
```

### 标准页面提交后的更正（B34 已确认）

本节适用于随 skill 提供的 choose、form、table、git-review、review 标准页。这里的标准页即用户所说的 builtin 页面，不增加 builtin 名称解析或特殊 CLI 命令。

首次提交成功后保留已提交内容和回执，允许 user 在原页修改自己的答案/反馈；只有再次点击明确提交，才校验整份新结果并追加事件。更正不修改原始题目、表格数据或被审阅文档；新一轮问题依旧按 B11 创建新实例。所有 required、选项、位置和内容版本校验对更正同样生效，失败保留编辑内容，保存成功前不更新成功回执。

各页结果增加可选 replacesEventId。首次不传，更正时引用当前页面上一份已成功保存的同类型结果事件 ID；提交内容是当前完整结果，不是增量补丁。评论条目未修改或仅更正说明时保留其 ID，新增条目有新 ID，删除条目不再出现在修正版。AI 从原事件和新修订关系理解更正，历史不被覆盖；已经执行的动作不会因此自动撤销。runtime 继续保存普通事件，不自动替所有面板强制解释修订关系。

例如表单原结果为事件 123，user 把实例数量从 2 改成 3 后明确重提：

```jsonc
{
  "values": {
    // 仍然提交整份当前表单，不只发送 replicas 的变化
    "projectName": "my-project",
    "environment": "local",
    "replicas": 3,
    "notes": "需要支持离线运行",
  },
  "replacesEventId": 123, // 这是对上一份结果的更正，旧事件仍保留
}
```

公共 Feedback 类型仍只描述 annotations 和可选整体 comment，不强制把修订字段加入每个自定义页面。标准页在自己的结果 schema、onSubmit 和状态中采用上述更正行为；公共 API 保留作者提供回调、组合/替换控件和自行管理提交状态的能力。作者可以实现一次提交后只读、自己的修订方式或其他流程，runtime、公共组件和 skill 指南不把标准页策略变成自定义页的硬性要求。

### 标准表单页输入和结果（B12/B26 已确认）

此页就是标准表单，供 agent 收集具体任务的参数，不需要为每份表单编写 TSX。B12/B26 已确认以下字段类型、填写流程和统一提交方式；首批已实现并集成，主验收见 verification.md。

#### 页面职责与填写流程

职责：AI 已经知道需要向 human 收集哪些信息，但缺少实际取值。例如确认项目名称、运行环境、实例数量和补充要求。AI 提供字段描述和可选默认值，human 填写后统一交回；标准页本身不创建项目或调用业务接口。与 choose 的区别是以填写参数为主，而不是围绕多个方案作比较。

提供以下字段；这是 Paneon 标准表单的输入契约，不是 shadcn Form 自带的 JSON 配置，也不是公共 runtime 的页面描述语言。实现使用现有 Field、Input、Textarea、Select、RadioGroup、Checkbox 和 Switch，沿用默认样式。

| type        | human 看到的控件 | 返回值   |
| ----------- | ---------------- | -------- |
| text        | 单行文本框       | string   |
| textarea    | 多行文本框       | string   |
| number      | 数字输入框       | number   |
| select      | 下拉单选         | string   |
| radio       | 平铺单选         | string   |
| multiselect | 一组复选项       | string[] |
| checkbox    | 一个勾选框       | boolean  |
| switch      | 一个开关         | boolean  |

页面流程：按 fields 顺序在一页展示全部字段，显示字段名称、可选说明、必填标记和默认值。用户可以直接填写、反复修改；底部只有一个整份表单提交入口。点击提交时检查必填和类型/范围，错误显示在字段附近并定位第一个错误，不清空其他字段。只有校验通过且事件保存成功才显示已提交；保存失败保留当前填写内容，允许用户再次明确提交。填写、切换控件和校验失败都不发送答案事件。

结果只返回字段 name 对应的值，不重复标题、字段定义或选项列表。输入表单的正常填写与公共选择/评论分别处理；不把一次输入框点击或修改自动解释成评论。B26 已确认该页采用上述标准表单方案，页面需求对焦完成；不再重复请求用户批准字段名和普通校验实现。

```ts
type FormParams = {
  title: string;
  description?: string; // Markdown
  fields: FormField[];
};

type FieldBase = {
  name: string; // 提交结果的键，同一表单内唯一
  label: string;
  description?: string;
  required?: boolean; // 默认 false
};

type FieldOption = { value: string; label: string };

type FormField = FieldBase &
  (
    | { type: 'text' | 'textarea'; defaultValue?: string; minLength?: number; maxLength?: number }
    | { type: 'number'; defaultValue?: number; min?: number; max?: number }
    | { type: 'select' | 'radio'; options: FieldOption[]; defaultValue?: string }
    | { type: 'multiselect'; options: FieldOption[]; defaultValue?: string[] }
    | { type: 'checkbox' | 'switch'; defaultValue?: boolean }
  );
```

字段类型：文本、多行文本、数字、下拉单选、平铺单选、多选、勾选和开关。checkbox/switch 都提交布尔值，仅呈现不同；multiselect 复用 Checkbox 组合。默认值类型必须匹配字段，选项 value 必须在所属字段内唯一；选项字段默认值必须属于 options。fields 不能为空，name 不能重复。

校验规则：required 文本不能全为空白；必填选择须有值，多选至少一个；数字按 min/max 校验，0 是有效值；布尔 false 是有效值，不把 required 解释成必须勾选。未填写的可选字段不出现在结果中；布尔字段默认 false 并返回该值。无效默认值和相互冲突的上下限在创建时拒绝，用户填写错误在对应字段显示；提交时一次校验全部字段。字段编辑不发送事件；显式提交成功保存一个整份 values 事件，不执行用户业务功能。

输入文件示例 /work/project/form.json：

```json
{
  "title": "确认项目配置",
  "fields": [
    { "name": "projectName", "label": "项目名称", "type": "text", "required": true },
    {
      "name": "environment",
      "label": "运行环境",
      "type": "select",
      "options": [
        { "value": "local", "label": "本地" },
        { "value": "cloud", "label": "云端" }
      ],
      "defaultValue": "local"
    },
    { "name": "replicas", "label": "实例数量", "type": "number", "min": 1, "defaultValue": 1 },
    { "name": "notes", "label": "补充要求", "type": "textarea" }
  ]
}
```

事件名 form-submitted，payload 结构如下（与其他页面一样复用现有事件存储和 events/ack）：

```ts
type FormSubmitted = {
  values: Record<string, string | number | boolean | string[]>;
  replacesEventId?: number; // 更正时引用本页面上一份成功提交，首次不传
};
```

```json
{
  "values": {
    "projectName": "my-project",
    "environment": "local",
    "replicas": 2,
    "notes": "需要支持离线运行"
  }
}
```

按已确认 B12 的分镜：标题和说明、依序展示全部字段及就近校验提示、底部一个提交按钮与提交状态。没有逐字段的下一题动作或分步组织；字段编辑期间不提交，最后明确提交整份表单。

### 交互表格页职责、入参与结果

表格作为只读标准页，直接复用 B24 的公共选择与评论。B19/B21 是该公共方案在表格中的自然落实：支持不同目标混选、多单元格、格内文字及多条独立意见，无需再为这些能力单独请求用户选择。详细校验和定位规则由实现设计收敛。短小静态表格仍可直接用 Markdown；此页价值在于浏览数据并准确向 AI 表达关注点，不承担执行数据修改。

#### 表格页完整流程（按已确认行为做工程核对）

本节将已确认行为整理为完整流程，agent 核对其不遗漏需求、不引入额外能力；组件名、普通校验和默认布局不再作为用户批准门槛。提交后更正按已确认 B34 统一实施，具体字段和适配在实现前收敛；工程未完成不等于还需逐页重复请求产品批准。

页面定位：AI 已有一份结构化数据，希望 human 在浏览和比较后准确指出关注对象、疑问或意见。AI 先取得数据，再通过普通 panel run 加 params/params-file 交给标准表格页；标准页不接管数据源，不在表格入参中引入 CLI/OpenAPI 调用定义。短小静态展示仍可直接使用 Markdown 表格。

默认页面由简短标题/说明、搜索与列筛选、数据表、分页及可组合反馈控件组成，没有额外 Paneon 固定页头。使用现有 shadcn Table 默认样式和宽表横向滚动；数据只读。初始是正常浏览模式，第一页、每页 20 条且没有选中项。搜索、筛选、排序和分页只改变所见数据的排列与范围，不产生 agent 事件，也不改变原始输入或已有目标身份。空数据与无匹配结果分别说明，不伪造记录。

进入「选择与评论」模式后：行选择使用明确的行勾选入口；列选择使用独立于排序的入口；点击单元格增选/取消，允许不相邻多选；在字符串单元格内划选一个词或连续片段时生成文字目标，不同时选整格。列目标表示输入快照的整列，界面明确范围，不因当前分页/筛选悄悄改变列含义。表头行勾选作用于当前页；跨页选择保留并显示数量，可以从评论/选择列表定位对象。普通模式仍可正常复制文字，按钮和表单不被外层目标接管。

操作示例：选两个耗时值，写一条「为什么差这么多」；再圈出描述里的一个词，写另一条解释请求；还可选一整行而不写评论，或只给整体意见。评论各自保留位置，能回看、编辑和删除。新增一条评论不会覆盖已有评论；行、列、格和文字目标可以在同一份结果中共存。

提交使用公共 Feedback 的 annotations、comment，只在 human 明确点击「提交评论」时发送 table-submitted。保存成功前不显示已交付，失败保留草稿。结果不重复整份 rows/columns；目标对应该实例保存的输入快照。退出选择模式不清空草稿、不发送事件；刷新或源码 reload 不承诺恢复未提交草稿，沿用已确认的页面状态边界。

提交后修正（B34 已确认）：保留刚提交的选择/评论供回看，human 可点击「修改反馈」后编辑，再明确提交修正版；通过追加事件表达，不修改旧事件或撤回 AI 已执行的动作。当前页面保留上一条成功回执 id，修正版使用 replacesEventId 指明替代本次页面内的上一份成功结果；评论 ID 保持不变。首次提交没有该字段，失败不更新回执。此流程是所提供标准页的统一行为，不作为强制覆盖自定义页面的协议。

最终入参沿用下文 TableParams：必填 title、columns、rows，可选 description、pageSize（默认 20）；columns 只有 key、label、type。没有初始选择、长字段特殊配置、业务调用配置或默认执行动作。结果沿用公共目标的 ref/text 结构，整页使用流程、这份入参和结果一同接受 review。

#### 先对焦用户需要完成的任务

| 用户任务               | 具体例子                                           | 建议支持的表达                                              |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| 只选择，不解释         | 选几项候选服务，请 AI 按选中的对象继续             | 多选行、列或单元格，无需强制填写评论                        |
| 对多处内容表达一个意见 | 选中两个服务的耗时单元格，问「为什么差这么多？」   | 一条评论关联多个单元格，允许不相邻                          |
| 精确指明格内内容       | 在描述里选中「最终一致性」，问「这里具体指什么？」 | 选中一个词或连续文本片段，评论指向原文具体位置              |
| 对不同位置提出不同意见 | 一个数值有疑问，另一个描述需改写                   | 分别建立多条评论，每条有自己的对象和意见，不挤进一条总意见  |
| 讨论整个字段或记录     | 选「错误率」列要求解释计算方式，或选某服务整行分析 | 行、列保留独立含义，界面明确作用范围                        |
| 整体反馈与修正         | 给全表意见，或修改/撤销刚写错的评论                | 不选对象也可写整体意见；草稿可编辑、删除，明确提交后交给 AI |

建议交互流程：先浏览和定位数据；需要选择时添加关注对象，需要意见时为当前一个或多个对象添加评论；已添加评论在列表中回看、定位、修改或删除；最后查看待提交内容并明确提交。多条评论各自保留指向，不因选择下一个对象而被替换。用户可只选择数据，也可同时提供评论与整体说明。

正常复制文本不能被单元格选择手势抢占。格内划选后提供「添加评论」入口，而不是划选即提交或立即通知 AI；点选整对象、原生划选文本后显式添加为默认入口，不依赖专用快捷键。排序、筛选和翻页后，已选对象与评论不能指向别处；需能回看暂时不可见的对象。列范围、筛选结果范围和跨页选择需明确显示。

范围限定为数据的行、列、单元格、单元格内连续文本，以及整表反馈；不提供对行间横线、边框、空白或任意页面坐标的评论。数据仍只读，评论内容可编辑。单条评论可指向多个完整单元格；不要求跨多个单元格进行连续文字划选、画任意区域或提供电子表格编辑能力。

#### 数据结构

本结构按 B19/B21/B24 的公共反馈方案展开，具体类型签名和校验见工程定稿。以 TableTarget 统一表达指向的数据位置，以 TableAnnotation 表达一条独立意见；输入和结果分开。按 B28，用统一 annotations 条目表示选中对象及可选意见，不再单列 selected。标准页默认提供搜索、排序、筛选、分页、多对象选择和评论，不要求 agent 逐项开启；本推荐结构不再保留之前未定稿的 selection.targets/mode 开关。

```ts
type CellValue = string | number | boolean | null;

// agent 创建面板时传入，保存为该实例的数据快照。
type TableParams = {
  title: string;
  description?: string; // Markdown
  columns: {
    key: string;
    label: string;
    type?: 'text' | 'number' | 'boolean'; // 默认 text
  }[];
  rows: Record<string, CellValue>[];
  pageSize?: number; // 默认 20
};

// 表格提供业务位置；按已确认 B24，公共层另加可选的 text 范围。
type TableRef =
  | { kind: 'row'; rowIndex: number }
  | { kind: 'column'; columnKey: string }
  | { kind: 'cell'; rowIndex: number; columnKey: string };

type TableTarget = FeedbackTarget<TableRef>;
type TableAnnotation = FeedbackAnnotation<TableRef>;

// 明确提交时作为 table-submitted 的 payload 交给 AI。
type TableSubmitted = Feedback<TableRef> & {
  replacesEventId?: number; // B34：修正版引用本页面上一条成功回执
};
```

按已确认 B22，表格页不提供预先选中入参；新实例打开时没有选中项。

按已确认 B25，不提供 rowKey，也不要求 rows 内包含业务 id。面板创建时以原始数组位置作为行定位，反馈使用 rowIndex（从 0 开始）：第一条记录为 0，第二条为 1。排序、筛选和分页只生成展示视图，不能重排实例原始输入或按可见位置重新编号。底层表格库需要字符串行 ID 时可由该下标生成内部 ID，输出仍使用原始 rowIndex；不把内部编号写回调用者的行对象。

两个内容完全相同的记录也按原始下标区分。调用者本身带 id 字段时将其作为普通数据，不自动用作身份或要求唯一。定位只适用于该实例保存的输入快照，新的实例通过 instanceId 区分；不把这种索引策略推广为所有动态自定义页面的身份方案。

按已确认 B23，列配置只保留 key、label、type；去掉 overflow、format，不恢复顶层 detailsKey。单元格直接展示数据，不增加自动摘要、展开全文或 Markdown 渲染。当前 src/ui/table.tsx 的 TableCell 默认包含 whitespace-nowrap，Table 外层提供 overflow-x-auto，沿用其不自动换行、过宽时横向滚动的行为。此前的长字段对话预览用于辅助讨论，其自定义折叠交互不作为实施方案。

基础库能力：shadcn [Table](https://ui.shadcn.com/docs/components/table) 提供原生 table/th/td 的样式组件；[Data Table](https://ui.shadcn.com/docs/components/data-table) 是用 Table 和 TanStack Table 组合排序、筛选、分页、行选择等能力的指南。标准页的行/列/单元格及文本评论复用 B24 的公共模块，不把这些交互误认为 shadcn 默认能力。这里不改变 Paneon 已有 Markdown 组件或其他页面的 Markdown 内容支持。

候选输入文件 /work/project/services.json：

```json
{
  "title": "审阅服务指标",
  "columns": [
    { "key": "name", "label": "服务" },
    { "key": "latency", "label": "耗时（ms）", "type": "number" },
    { "key": "description", "label": "说明" }
  ],
  "rows": [
    { "name": "接口服务", "latency": 120, "description": "同步处理请求" },
    {
      "name": "后台服务",
      "latency": 900,
      "description": "采用最终一致性保证吞吐量"
    }
  ]
}
```

候选事件 payload（按 B24 的 ref/text 公共结构更新）：只选接口服务这一行，同时对两个耗时值添加同一条比较意见，并对后台服务描述中的词添加另一条意见。

```json
{
  "annotations": [
    {
      "id": "selection-1",
      "targets": [
        {
          "ref": {
            "kind": "row",
            "rowIndex": 0
          }
        }
      ],
      "comment": ""
    },
    {
      "id": "note-1",
      "targets": [
        {
          "ref": {
            "kind": "cell",
            "rowIndex": 0,
            "columnKey": "latency"
          }
        },
        {
          "ref": {
            "kind": "cell",
            "rowIndex": 1,
            "columnKey": "latency"
          }
        }
      ],
      "comment": "为什么这两项耗时差这么多？"
    },
    {
      "id": "note-2",
      "targets": [
        {
          "ref": {
            "kind": "cell",
            "rowIndex": 1,
            "columnKey": "description"
          },
          "text": {
            "start": 2,
            "end": 7,
            "quote": "最终一致性"
          }
        }
      ],
      "comment": "这里具体指什么？"
    }
  ],
  "comment": "请结合这些疑问解释整体方案。"
}
```

#### 定位、校验与提交规则

- columns.key 非空且唯一，每个声明字段在每行必须存在，缺值用 null；行不要求 id 字段，也不要求内容唯一。rows 可为空。pageSize 建议为 1–1000 的整数；这些校验均在创建时完成。反馈中的 rowIndex 必须是整数，满足 0 <= rowIndex < 原始 rows.length。
- 行用原始 rowIndex，列用 columnKey，单元格用二者共同定位。列目标指输入快照中的整列，与当前筛选/页码无关；只涉及部分行时选对应单元格或行，不隐式把整列解释成当前页。行列目标不自动展开成大批单元格。
- 目标的 text 仅用于 ref 指向原始值为字符串的单元格；text.start/text.end 是原始字符串的 UTF-16 下标，与 JavaScript slice 一致，满足 0 <= start < end <= value.length 且 value.slice(start, end) === quote。起止不能截断一个可见字符。相同词重复出现也用范围区分。偏移针对单元格原始字符串，不针对页面坐标、HTML 或格式化后的数值。按 B23，表格单元格不引入 Markdown 渲染或摘要/全文两套展示。
- 所有 annotations[].targets 均校验目标确实存在；每条 targets 非空，且条目内不重复同一目标。允许同一位置被不同条目引用，分别表达独立意见。条目 ID 在一份提交内唯一；comment 必须为字符串，允许为空字符串，只有空白时按空说明处理。空说明条目仍是有效选择，不过滤或转移到另一份列表。
- 排序、筛选、分页不改变位置身份；跨页保留选择和评论，并能回看被筛选隐藏的对象。列选择入口与排序入口分开，表头行勾选表示当前页，全筛选结果需单独明确操作。字符串单元格可划选原文，正常文字复制不被选择操作抢占；不增加自定义全文展开入口。
- 浏览、选择及草稿编辑不产生事件；建议点击「提交评论」时统一提交上述 payload。annotations 为空且整表 comment 也为空时，不提交空反馈。只选不写使用 comment 为空的条目；有说明时填写同一条目的 comment，不要求再复制一份选择。提交前可反复修改或删除草稿；提交后的修正按上方整页 review 稿建议：保留评论 ID，通过追加结果及 replacesEventId 指明本页面的上一份成功结果；提交后更正按已确认 B34 实施；其余契约由 agent 核对，不拆出基础能力审批问题。
- 事件沿用 Paneon 的 instanceId、事件 ID、createdAt 和源码 revision 外层信息，不在 payload 重复。此处不新增数据版本号：对象和文字偏移针对该实例保存的 params 快照，源码 revision 不能当作输入数据版本。表格适配器按实例输入快照校验目标；通用事件入口只做声明的 schema 校验，不能把它描述成自动执行全部表格语义校验。

建议分镜：标题和背景、搜索/列筛选、数据表、选择及就地添加评论入口、分页和选择范围提示、可回看编辑的评论列表、整体意见与明确提交。具体布局和控件组合由页面实现设计确定，不能把评论列表做成强占空间的固定页头。

### 内容审阅页（B30 已确认）

此页面向技术方案、需求说明、调研结论等长内容的阅读与反馈。human 在阅读内容时圈出有疑问或希望调整的位置，填写意见，最后把整份反馈交给 AI。保留原文作为审阅对象，页面本身不直接改写原文；AI 根据明确提交的意见决定后续修改。B30 已确认该页职责、完整文档输入及精准圈选方向；原文映射已实现，复杂格式选区验收见 verification.md。

按已确认 B30：AI 只提供标题和一篇完整 Markdown，不需要先给每段分配 id 或切成 sections。标准页呈现正文，长文可由标题生成阅读导航；布局以阅读为主，没有 Paneon 固定页头或把每个段落强制放入 Card。渲染沿用现有 Markdown 与 GitHub 样式。当前 src/ui/markdown.tsx 只有 ReactMarkdown + remarkGfm 渲染，没有评论映射能力；这份设计不是在声称现有组件已经能精确评论文档。

```ts
type ReviewParams = {
  title: string;
  markdown: string; // 整篇 Markdown，实例创建时固定
};

type ReviewRef = { kind: 'document' };
type ReviewSubmitted = Feedback<ReviewRef> & {
  replacesEventId?: number; // 更正时引用本页面上一份成功提交，首次不传
};
```

输入示例 /work/project/review.json（以下为加注释展示的 JSONC，真正文件仍使用 JSON）：

```jsonc
{
  "title": "审阅缓存方案", // 页面标题
  "markdown": "# 缓存策略\n\n缓存保留 24 小时。\n\n# 失败处理\n\n读取失败后直接访问数据库。", // 一篇文档；AI 不需要切段或提供段落 id
}
```

操作流程：打开后直接阅读；进入公共选择模式，可选择整篇、正文段落或其中的词句。选中后形成统一 annotations 条目，comment 可为空，也可补充意见；可以编辑、删除和继续添加其他位置的意见，最后明确点击「提交评论」。也可以不选位置，只填写整体 comment。普通阅读与复制仍可使用，编辑评论不发事件。保留失败草稿，保存事件成功后才显示提交完成。新内容通过新实例提供，不在 human 阅读时覆盖当前文档内容。

定位规则：整篇目标使用 document ref 且不带 text；段落或词句使用同一个 document ref 加公共 text，偏移对应固定 markdown 原文，quote 必须等于 markdown.slice(start, end)。Markdown 专用适配器负责渲染选区与源文位置映射；不能把 DOM 显示字符下标当作原始 Markdown 下标。跨格式标记的选区映射到包含标记的原文范围，无法表示为一个连续范围时用同一条目的多个 targets 表达，显示高亮须回到原选区；不猜测或静默丢失所选内容。正文词句精确评论是本方案需要开发的能力；复杂非正文内容如渲染后图形内部位置不因此自动纳入，具体适配细节由 agent 核对。整段目标亦可引用该段的原始 Markdown 范围，不要求调用者维护段落 ID。

上例「24 小时」的原文范围为 [13, 18)，review-submitted 结果如下：

```jsonc
{
  "annotations": [
    {
      "id": "note-1", // 反馈 id；修改意见时保持不变
      "targets": [
        {
          "ref": { "kind": "document" }, // 当前实例保存的这篇文档
          "text": {
            "start": 13, // Markdown 原文的 UTF-16 下标，从 0 开始
            "end": 18, // 不包含
            "quote": "24 小时", // 必须与原文 slice 完全一致
          },
        },
      ],
      "comment": "这个时间太长，改成 1 小时。", // 为空字符串时就是只圈选，不写意见
    },
  ],
}
```

存储和事件：ReviewParams 继续保存在实例 params_json，ReviewSubmitted 作为 review-submitted 的 payload_json，使用已有 events/ack。原文在当前实例输入中已有一份，结果不重复整篇 Markdown，也不新增 sources、数据库表或文档业务存储。内容审阅采用这一份完整文档契约，不再保留 sections/sectionId 的分块输入；本轮仅同步设计和规范，不启动公共基础或页面实现。

### Git 页职责：浏览工作区、历史与分支对比，并对所见内容评论

按用户补充的 B14/B16，页面承担本地 Git 浏览和人机评论入口，而不仅是选择文件请求分析。以下区分已明确的能力与尚需定稿的交互。

| 界面          | 已明确职责                                                            |
| ------------- | --------------------------------------------------------------------- |
| 未提交改动    | 查看已暂存、未暂存和未跟踪改动文件，读取每个变更文件的 diff           |
| 提交记录      | 浏览当前分支的 commit 列表，打开某个 commit 的文件清单和逐文件 diff   |
| 分支/版本对比 | 查看当前分支与另一分支的文件差异；保留 B13 已确认的提交版本比较能力   |
| 文本与评论    | 在 diff 或文本上精确选择位置/范围添加评论，允许修改评论，并让 AI 读取 |

Git 忽略规则按 Git 的通常语义应用：未跟踪文件通过 --exclude-standard 等入口排除忽略项；已经被 Git 跟踪的文件，即使后来匹配 .gitignore，改动仍应显示。已用隔离临时仓库核对：ignored.log 被排除，而已跟踪的 tracked.log 在添加 *.log 忽略规则后仍在 status 中显示。不能简单把所有匹配 .gitignore 的已跟踪文件也隐藏。

按已确认 B24，Git 复用公共评论管理与编辑组件，Git 自己负责位置适配。评论精度不只依赖行号。锚点需区分仓库、文件、正在看的视图/提交或比较范围、diff 旧侧/新侧，以及所选文本和内容版本；精确文本选择还需表达行内范围。提交原始选中文本有助于 agent 理解指向的内容。具体字段和存储/结果结构见下方「Git 评论定位和提交契约」，不把行号直接套到后来变化的代码上。

按已确认 B15，human 可以在页面反复添加、编辑和改正评论；只有明确点击「提交评论」后，整份评论才作为事件供 AI 读取。输入、保存草稿、切换文件或浏览位置不逐条发送草稿。如果已提交评论再次修改，应再次明确提交新的结果修订，复用评论稳定 ID，使 AI 能识别更新。修正采用追加事件表达，不改写或撤回已经被消费的历史事件，也不暗示撤销 AI 已经完成的动作。具体事件字段见下方 GitReviewSubmitted，使用完整反馈加 replacesEventId 表达修订。

按已确认 B27，工作区变化不自动替换 human 正在阅读和评论的内容；点击页面内「刷新改动」才重新读取，保留草稿及旧评论对应原内容的定位。二进制等不能逐行呈现的内容需显示其类型，不伪造文本 diff。提交记录默认展示从当前分支可达的历史是技术建议，不把「当前分支历史」自动等同于「相对某基线新增的 commits」；历史分页和 merge commit diff 按工程定稿实施。

agent 唤起页面时，仓库列表与初始视图是主要入口。初始定位不锁死用户导航，用户随后可切换仓库、改动、提交历史和比较范围。建议布局包含仓库导航、工作区/历史/对比入口、文件清单、diff/文本区及评论列表；初始参数只决定第一次打开的位置。

建议的职责边界仍是浏览与评论，不默认增加暂存、撤销、commit、merge、push 或自动修复操作；这不是用户已确认的完整操作清单，后续职责对焦如改变范围应同步修正规范。

#### Git 工作台操作流程

本节描述已确认的浏览、精准评论和明确提交职责；B27 的手动刷新及 B29 的跨视图反馈保持不变。具体布局是实施方案，工程约束见定稿章节。

布局建议：顶部只放仓库切换和「未提交改动 / 提交记录 / 分支对比」入口；左侧是当前范围的文件清单，右侧是所选文件的 diff。评论列表按需打开，不常驻占用第三栏；提交入口同时显示当前整份反馈的评论数量。没有额外 Paneon 固定页头。切换仓库和视图保留各自浏览位置，未提交评论不因切换而清空。

| 操作           | 页面呈现和交互建议                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 浏览未提交改动 | 文件按已暂存、未暂存、未跟踪分组，支持文件路径搜索；同一文件同时有已暂存和未暂存改动时分别展示，不合成一个含糊的 diff。点击文件在右侧读取对应差异。                                        |
| 浏览提交记录   | 展示当前分支可达的提交，包含简短提交号、说明、作者和时间，逐批加载；点开提交后展示其文件清单，再点文件查看该次提交的 diff。                                                                |
| 比较分支或版本 | 显示当前 base/head 及比较方式，允许更换；随后仍使用同一套文件清单与 diff 区。具体比较语义沿用 B17。                                                                                        |
| 阅读 diff      | 默认左右对照旧内容和新内容，可切换统一 diff；保留行号、新增/删除标记和代码高亮，可展开相邻上下文。新增文件旧侧为空，删除文件新侧为空；二进制显示类型与变更状态，不伪造文本差异。           |
| 选择与评论     | 进入公共选择模式后，可选整文件、一段改动、同侧行范围或行内文字；多个位置可以共用一条评论，也可以分别添加多条。评论就近编辑，列表可回到原位置并修改或删除。选择模式之外仍能正常复制和浏览。 |
| 提交评论       | 浏览、选择、编辑草稿均不发事件。明确提交当前整份反馈时，包含跨文件/仓库的已选对象、评论和可选整体意见。提交后改正评论仍需再次明确提交，按 B15 追加修订，不改历史。                         |

例如：human 在前端仓库的未提交改动中打开 src/auth.ts，选中新侧一段条件表达式并写「这里是否漏了未登录状态？」；随后打开服务端仓库的一次提交，另加一条评论。评论列表保留两处原始位置，最后一次「提交评论」交付整份意见。切换文件不会把第一条评论变成对第二个文件的意见。精确引用继续由页面适配公共反馈，GitRef 及事件内容见下方契约；其与整页交互的一致性已在工程定稿中核对。

按已确认 B27：打开的工作区内容保持稳定；点击页面内「刷新改动」才读取最新状态。它不是重载整个浏览器页面，保留评论草稿；旧评论仍关联所读内容，不能自动挪到新版本同一行。旧内容可从评论回看，最新内容用于继续浏览和添加新评论，列表明确标记旧内容来源。为满足该行为，需要保留本次浏览中评论引用的原始片段及版本信息，不承诺刷新浏览器或服务重启后恢复未提交草稿，也不引入框架业务存储。

#### Git 评论定位和提交契约（工程收敛，不新增产品决策）

以下将 B14/B15/B24/B27 落到类型和事件，不要求用户逐个批准字段名称；对应实现已在第二批交付并验收。源代码 revision 仍表示面板源码版本，与下面正在审阅的 Git 内容版本分开。

按已确认 B29，先在未提交改动中添加一条意见，再切到和主干的比较中添加另一条意见，两者在 annotations 中并存：前者引用 s1，后者引用 s2，各自保留当时的比较范围与内容；即使都是同一仓库的同一路径，也不能仅按文件路径合并成一个来源。切换视图只改变当前浏览位置，不修改已有条目的 sourceId；最后一次明确提交同时携带两份来源和两条意见。

同一份结果用 sources 保存实际被引用的文件内容来源；多个目标用 sourceId 引用，避免在每条意见中重复仓库、比较范围及内容摘要。sourceId 是页面为一次文件比较快照分配的标识，只在本实例内有意义，不是 Git commit。每个事件包含其使用的全部来源，AI 不需要依赖运行中的页面查询 sourceId；repositoryId 对应实例已保存的 repositories，路径不重复输出绝对仓库目录。

```ts
type GitSourceView =
  | { type: 'changes'; area: 'staged' | 'unstaged' | 'untracked'; headCommit?: string }
  | { type: 'history'; commit: string; parent: string | null }
  | {
      type: 'compare';
      mode: 'branch' | 'commits';
      baseCommit: string;
      headCommit: string;
      mergeBaseCommit?: string;
    };

type GitContentSide = {
  path: string; // 仓库相对路径；重命名时旧侧/新侧可以不同
  contentHash: string; // 对实际读取原始字节计算 SHA-256，不假装成 commit ID
  type: 'text' | 'binary'; // 仅可可靠映射原文的内容按 text 处理
};

type GitReviewSource = {
  repositoryId: string;
  view: GitSourceView;
  old?: GitContentSide; // 新增文件可以没有旧侧
  new?: GitContentSide; // 删除文件可以没有新侧；至少有一侧
};

type GitRef = { sourceId: string } & (
  | { kind: 'file' }
  | {
      kind: 'hunk';
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      patch: string; // 所选改动块的原始 unified patch，含上下文，不是完整文件 diff
    }
  | { kind: 'lines'; side: 'old' | 'new'; startLine: number; endLine: number }
);

type GitReviewSubmitted = Feedback<GitRef> & {
  sources: Record<string, GitReviewSource>;
  replacesEventId?: number; // 当前页面上一份成功提交的 git-review-submitted 事件 ID
};
```

定位规则：

- file 选整个变更文件；hunk 选整段改动，保存两侧范围和所选 patch；lines 对某一侧的行或行内文字评论。二进制及不能可靠映射原文的内容只提供文件级目标，不伪造行或文字范围。
- 行号从 1 开始，两端包含在内，针对该 source 的 old/new 原文，不是页面显示行号、另一侧行号或后来磁盘文件的行号。对多行保留原始换行，不对 CRLF、空白或缩进做隐式标准化。
- lines 目标必须携带公共 text。先取 startLine..endLine 所覆盖的原始行字符串作为注册原文；text.start/end 是这段原文内的 UTF-16 下标，quote 必须与 slice 完全一致。选整行时覆盖整段注册原文；选某个词时仅覆盖词，不能截断可见字符。故它既能表示完整行范围，也能表示同一行中两次出现的相同词。
- file/hunk 目标不带 text；hunk 的 patch 提供被选改动的实际内容，精确选某侧文字则使用 lines。hunk 的起点和数量须与来源中的真实块相符，不能由浏览器随意拼一段与所读 diff 无关的 patch。
- 提交的 sources 仅包含 annotations[].targets 实际引用的来源。repositoryId、sourceId、侧、路径、行范围及原文均由页面适配器按保留快照校验；通用事件入口仍只执行声明 schema 校验，不承担 Git 语义校验。只有整体意见时 sources 可以为空。

版本规则：staged、unstaged、untracked 分别指已暂存、未暂存和未跟踪文件，不能只写含糊的 working-tree。已有 HEAD 时记录 headCommit，尚无 HEAD 时可省略；历史与比较中的版本引用解析成完整 commit ID，避免之后分支指针移动改变反馈含义。history.parent 记录实际比较的父提交，根提交为 null；merge commit 默认对第一父提交比较，页面显示该比较对象，不冒充对所有父提交的综合 diff。branch 模式记录解析后的 base/head 及实际使用的 mergeBaseCommit；commits 模式只比较两个端点。

原始 old/new 字节和 diff 在页面所用的 Git 查询模块中一起形成快照，目标和呈现必须使用同一份读取结果。按 B27，页面内刷新读取新快照，旧评论引用的快照在当前会话继续保留；提交前校验旧快照，不因为当前文件已变化就把有效的旧内容评论判成无效或改指新内容。若保留快照已丢失或 quote 与对应快照不符，拒绝该次提交并保留草稿，不能使用当前文件推测补齐。

old/new 是本次 diff 的比较两侧，不是「刷新前」和「刷新后」，也不是两条评论。对应关系如下：

| 当前查看内容 | old（左侧）                         | new（右侧）  |
| ------------ | ----------------------------------- | ------------ |
| 未暂存改动   | 暂存区内容                          | 工作目录内容 |
| 已暂存改动   | HEAD 内容（无 HEAD 时为空）         | 暂存区内容   |
| 单次提交     | 该提交的比较父版本（根提交时为空）  | 该提交内容   |
| 版本对比     | 所选比较起点；branch 模式用共同祖先 | 所选比较终点 |

新增文件可没有 old，删除文件可没有 new。以下 JSONC 中的 // 注释只用于阅读说明；实际事件仍是无注释 JSON，未修改 CLI 文件输入格式。

事件名为 git-review-submitted。以下是对新侧第一行中的 user.isAdmin 评论的完整 payload 示例；commit ID 为示意值，两个 SHA-256 分别来自本例旧文件 `if (user) {\n  return allow();\n}\n` 与新文件 `if (user.isAdmin) {\n  return allow();\n}\n`：

```jsonc
{
  // 被审阅的文件及版本信息；多条意见可以共同引用 s1
  "sources": {
    "s1": {
      "repositoryId": "web", // 启动入参 repositories 中的仓库 id
      "view": {
        "type": "changes", // 正在看未提交改动
        "area": "unstaged", // 其中的未暂存改动
        "headCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", // 当时 HEAD，示意值；不代表 old 侧等于 HEAD
      },
      // old = 本次 diff 左侧；未暂存改动的左侧是暂存区内容
      "old": {
        "path": "src/auth.ts", // 左侧文件的仓库相对路径
        "contentHash": "sha256:93698334049c34387179d53a10066d38a9af3a71d840e24d9862cc11f3d83c48", // 左侧文件原始内容的摘要，用于识别版本，不是文件内容
        "type": "text", // 文本文件
      },
      // new = 本次 diff 右侧；未暂存改动的右侧是当前工作目录内容
      "new": {
        "path": "src/auth.ts", // 右侧路径；文件重命名时可与 old.path 不同
        "contentHash": "sha256:4243bc06bd08fa08de9a35a819d404310686fe901d7bda4a20e98c05e03969e4", // 右侧文件内容的摘要；与面板源码 revision 无关
        "type": "text",
      },
    },
  },
  // 一份列表表示全部选择，comment 允许为空；没有单独的 selected 数组
  "annotations": [
    {
      "id": "note-1", // 这条反馈的稳定 id，改正文字时保持不变
      "targets": [
        // 同一条意见可以指向多个位置；本例只有一个
        {
          "ref": {
            "sourceId": "s1", // 引用上面的文件比较版本
            "kind": "lines", // 选择代码行或行内文字
            "side": "new", // 右侧代码；选左侧代码就填 old
            "startLine": 1, // 右侧原文件第 1 行，从 1 开始
            "endLine": 1, // 同样是第 1 行，范围两端都包含
          },
          "text": {
            "start": 4, // 上述行原文内从 0 开始的位置，包含
            "end": 16, // 不包含；即原文 slice(4, 16)
            "quote": "user.isAdmin", // 用户真正选中的原文
          },
        },
      ],
      "comment": "这里是否漏了未登录状态？", // 改成空字符串就是只选中，没有写评论
    },
  ],
}
```

修订规则：首次明确提交不带 replacesEventId；页面保存 agent.emit 返回的事件 ID，之后 human 修改并再次明确提交时携带该 ID。每次都是当前整份反馈，不是增量补丁；未改评论保留 ID，修正保留原 ID，新增评论用新 ID，删除的评论不再出现。AI 通过引用关系区分修正与新增意见，旧事件仍保留。删除全部反馈后可明确提交空的修订结果表示清空，但初次不提交空反馈。修订只指向本实例已有的同类型事件，不将其解释成撤销 AI 已完成的动作；不同浏览器页面的修订分支不自动互相覆盖。

体积和存储：结果不重复输入的仓库列表，不发送完整 diff 或完整源文件；只持久保存使用到的来源、选中的原文/改动块和意见，复用现有 payload_json。内容摘要只能识别版本，不能还原已经消失的旧工作区文件；事件能保留选中文本和评论，但不承诺恢复整份历史工作区。首次及修订结果均遵守当前 JSON 序列化长度 65536 上限；超限时明确说明、保留草稿，不静默裁剪或自动拆成多次提交。

这份契约及工程定稿补齐精准定位、修订、历史分页和 diff 读取规则；任务 1.15 的文档核对已完成，Git 页面实现和验收仍未开始。

### 多仓库 Git 输入

B4/B13/B16 已确认多仓库、工作区/历史/版本浏览，以及指定初始界面。将此前仅有 repositories[].comparison 的候选输入调整为仓库列表加 initialView，避免比较参数无法表达「直接打开提交历史/某个 commit」的问题。B17 已确认 initialView 的结构及下列填写方式；仓库路径细节继续按下述规则收敛，评论结果见 GitReviewSubmitted。

```ts
type GitReviewParams = {
  title?: string;
  repositories: {
    id: string;
    path: string;
    label?: string;
  }[];
  initialView?:
    | { repositoryId: string; type: 'changes'; file?: string }
    | { repositoryId: string; type: 'history'; commit?: string; file?: string }
    | {
        repositoryId: string;
        type: 'compare';
        base: string;
        head?: string;
        mode?: 'branch' | 'commits';
        file?: string;
      };
};
```

建议规则：repositories 必填且非空，id 唯一；path 可以是绝对路径，或相对于 --cwd 的路径，必须能定位本地 Git 仓库，不隐式递归发现其他仓库。label 省略时显示仓库目录名。initialView 省略时显示第一个仓库的未提交改动；repositoryId 必须引用列表中的仓库。history 可定位到具体 commit，file 可定位仓库内文件；compare 的 base 必填，head 默认 HEAD，mode 默认 branch。不猜测基线分支名。页面内导航和比较切换保留各仓库各自的状态，不通过覆盖启动 params 实现。

已确认的 initialView 填写示例：三个主界面为 changes、history、compare；单次提交详情是 history 中定位到一个 commit，不增加第四种 type。以下 JSON 对象均为 initialView 的值，web 必须是 repositories 中已有的 id；示例提交号需替换为实际存在的版本。

未提交改动：

```json
{ "repositoryId": "web", "type": "changes" }
```

当前分支提交列表：

```json
{ "repositoryId": "web", "type": "history" }
```

直接打开单次提交的改动：

```json
{ "repositoryId": "web", "type": "history", "commit": "a1b2c3d" }
```

查看当前分支相对 main 引入的改动：

```json
{ "repositoryId": "web", "type": "compare", "mode": "branch", "base": "main", "head": "HEAD" }
```

直接比较两个版本的内容：

```json
{
  "repositoryId": "web",
  "type": "compare",
  "mode": "commits",
  "base": "a1b2c3d",
  "head": "d4e5f6a"
}
```

需要初始打开某个文件时，为 changes、带 commit 的 history 或 compare 对象添加 file，例如 `"file": "src/auth.ts"`，路径相对于对应仓库根目录。history 中的 file 必须与 commit 一起提供，避免把提交列表定位含糊解释为某个文件的 diff；不带 commit 的 history 只定位提交列表。

已确认视图与比较模式的语义：

| mode         | 展示内容                                 | Git 语义依据                                                        |
| ------------ | ---------------------------------------- | ------------------------------------------------------------------- |
| changes 视图 | 当前已暂存、未暂存和未跟踪文件，分区展示 | staged 与 unstaged 分开读取；未跟踪文件按 Git 忽略规则过滤          |
| branch       | 目标分支从与基线的共同祖先开始引入的改动 | 相当于 git diff base...head，不把基线分支独有的推进算成目标分支改动 |
| commits      | 两个指定版本之间的内容差异               | 相当于 git diff base head，直接比较两个端点                         |

使用本机 git diff -h 核对了两端比较和三点比较入口。branch 表达分支引入的改动，commits 表达两个版本端点的完整差异。版本比较不混入未提交文件；初始范围来自保存的 JSON，Git 业务数据刷新由页面自己的查询逻辑负责，不涉及覆盖 params。未明确展示的默认值和错误处理细节在技术契约定稿时核对，不因示例确认而宣称全部实现细节已确认。

建议输入文件 /work/project/git-review.json：

```json
{
  "title": "审阅本次改动",
  "repositories": [
    { "id": "web", "path": "/work/product/web", "label": "前端" },
    { "id": "api", "path": "/work/product/api", "label": "服务端" }
  ],
  "initialView": { "repositoryId": "api", "type": "history" }
}
```

此示例直接打开服务端仓库的当前分支提交记录；human 可以继续切到前端工作区，或服务端分支比较。精准评论、可修改、明确提交后 AI 可读的能力已经确认；刷新按 B27，锚点和反馈字段见 GitReviewSubmitted。反馈必须对应 human 实际看到的内容版本，不能提交时才抓一份最新 diff。

### GitHub PR 审阅示例（B31 只读与反馈边界已确认）

此示例仍放在 skill 的 assets/examples/github-pr，是可运行、可复制修改的真实 gh 集成。建议用途是：human 找到要关注的 PR，读说明、代码改动和 CI 检查状态，圈出问题，再让 AI 针对所见版本分析。页面加载和刷新通过 serverAction 直接查询 gh，选择与意见通过已有事件交给 AI；两条路径在一个实际任务中并存，不把 CLI 执行、监控或业务日志加入框架。

已核对代码事实：examples/gh-panel.tsx 当前提供列表、描述对话框和 review-requested；examples/github.ts 使用 gh pr list --limit 30 和 gh pr view，只读取基础字段，没有读取代码 diff 或 CI 详情。完整工作台已实现于 skill 的 assets/examples/github-pr，并通过主 agent 的真实 gh 查询与 Chrome 验证；原开发样例继续作为较小能力示例，不能代表完整工作台。

建议页面：左侧 PR 列表，右侧所选 PR 的「概览 / 文件改动 / 检查」区域。列表显示编号、标题、作者、分支、草稿状态和更新时间，可搜索并切换 open/closed/merged 范围。概览展示 Markdown 描述、来源/目标分支和 review/合并状态；文件改动提供文件清单和 diff，复用 Git 审阅的代码呈现与评论适配；检查展示检查名称、成功/失败/进行中状态和原始详情链接。没有新 Paneon 固定页头，不把长篇代码放在仅展示描述的 Dialog 中。

```ts
type GitHubPRParams = {
  repository: string; // owner/repo，显式给出
  initialPullRequest?: number; // 正整数；省略时展示 open PR 列表
};

type PRReviewRequested = {
  repository: string;
  number: number;
  baseCommit: string; // 本次实际看到的 PR base 完整 OID
  headCommit: string; // 本次实际看到的 PR head 完整 OID
};
```

候选输入 /work/project/github-pr.json（加注释展示，真正文件仍为 JSON）：

```jsonc
{
  "repository": "cli/cli", // 查询哪个 GitHub 仓库，不依赖当前目录猜测
  "initialPullRequest": 123, // 示例编号，实际替换为目标仓库存在的 PR；省略则先看列表
}
```

建议操作和两种调用方式：

| 操作               | 页面行为                                                                                               | 是否等待 AI                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 打开 PR、切换详情  | serverAction 调用 gh 读取说明、文件和检查状态，直接展示结果                                            | 否                                           |
| 刷新               | 重新查询所选范围，保留已有意见的原始内容/版本关联，不偷偷改挂到新 head                                 | 否                                           |
| 在 GitHub 打开     | 使用所选 PR 或检查的真实链接打开原页面                                                                 | 否                                           |
| 请 AI 审阅此 PR    | 明确保存 review-requested，包含仓库、PR 编号和所看 base/head                                           | 需要 AI 正在等待，或用户之后手动恢复会话读取 |
| 圈选并提交具体问题 | 复用公共 annotations；可指向 PR、说明正文、检查项、文件或代码片段，comment 允许为空，明确提交后交给 AI | 同上                                         |

候选 review-requested payload：

```jsonc
{
  "repository": "cli/cli", // 当前查看的仓库
  "number": 123, // 当前查看的 PR
  "baseCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", // 示例完整 OID；实际取所看版本
  "headCommit": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", // 防止 AI 把请求误认为针对后来更新的代码
}
```

这是直接请求整份 PR review 的简洁结果；针对具体位置的意见使用统一 annotations 结构，动态来源须带 PR 编号、base/head 及相关原文或 diff 范围，可跨 PR 保留后一起明确提交。来源去重、旧内容回看和精确目标映射由示例适配，复用公共/已有 Git 与 Markdown 能力，不把 GitHub 特有来源字段加入通用 runtime。B31 已确认只读与 AI 反馈边界；具体 GitHub 来源与反馈结果类型见工程定稿中的 PRSource/PRRef/PRFeedbackSubmitted。

真实命令与实现核对：

- 列表使用 gh pr list --repo，并用明确的 --json 字段；列表搜索/状态需作用于对应查询范围。gh pr list 的 --limit 是最大获取量，不是游标分页，不能把取回 30 条写成完整仓库或真正服务端分页；加载更多与覆盖范围按工程定稿实施。
- 详情使用 gh pr view <number> --repo，读取 title、body、author、baseRefName/baseRefOid、headRefName/headRefOid、files、statusCheckRollup 等实际需要的 JSON 字段。未传 PR 编号时不隐式使用当前 Git 分支。
- gh pr diff 查询当前 PR 状态，不能因另一个查询取得 OID 就把其输出视为固定版本。最终 diff 使用工程定稿中的 gh api 固定 OID 原文方案。
- 检查可使用 statusCheckRollup 或 gh pr checks --json；如采用后者，应识别其非全绿/进行中状态与命令调用故障的区别，不能把正常显示失败的检查当作整个页面读取失败。本机帮助声明了 pending 的额外退出码 8，具体返回路径在实现时验证。
- 本地 gh 已安装、已登录且可访问目标仓库是场景前提。示例适配模块用参数数组调用 gh，并在页面自己的加载/错误状态中展示查询结果；不增加核心 CLI 调度器，不执行合并、关闭、approve 或触发 CI 等本稿未提出的操作。

按已确认 B31，反馈只进入 Paneon 事件供当前 AI 使用，不在 GitHub 发评论。示例不提供发布普通评论或行内 review 的按钮；查询和原始链接用于阅读，提交给 AI 的事件用于讨论与分析。不承诺自动唤醒已停止的会话，也不把点击浏览页面当成给 AI 的请求。

本稿不改变 core 存储。GitHubPRParams 存入实例 params_json；PRReviewRequested 通过已有 review-requested 的 payload_json 保存；PRFeedbackSubmitted 同样使用现有事件存储。B31 边界和具体反馈契约已完成核对；仍不开始代码实现或外部写入。

### 并发与排队一次性展示 example（B32 已确认）

按已确认 B32，保留一个一次性原理展示 example，覆盖用户最初提出的「AI 用友好界面帮助理解某个事物的运作原理」。主题、文字、固定任务和初始并发数直接写在页面 TSX 中；agent 可以运行它体验，也可以复制并修改源码，为当前对话编写新的讲解。通常这类页面只服务当次解释，不要求先抽象一套可复用任务入参。资源仍放在 skill 的 assets/examples/concurrency，不注册成接收任务 JSON 的标准页面；第二批已实现并验收。

具体问题：4 个任务分别需要 4、2、3、1 秒，在给定并发上限下，何时开始、等待多久、何时全部完成？任务按输入顺序在虚拟时间 0 同时进入队列，空闲槽位按先到先服务顺序领取任务，开始后不抢占。多个任务同时完成时先统一释放槽位，再按输入顺序启动后续任务。计算规则是示例中的普通 TypeScript 模型代码，没有真实任务执行，也不需要 CLI、HTTP 或 agent 工作流配合。

页面建议：上方是简短问题说明和并发数输入框（使用 Input，不引入 Slider）；主体同时显示串行基准和所选并发数的任务时间线。配套展示等待中、执行中和已完成状态、每个任务的开始/结束/等待时间，以及整批完成时间。提供播放、暂停、重播，帮助 user 看清同一时刻谁在执行、谁在排队。播放只推进虚拟时钟，不等待真实业务任务；更改并发数重新计算并从时间 0 重播，不能在半次模拟中静默改变调度规则。视图以标准组件和少量页面自有时间条组成，不因此向公共 UI 库新增通用流程编排或甘特图框架。

按上述 4 个时长和输入顺序，确定性排程为：

| 并发数 | A      | B      | C      | D       | 整批完成 |
| ------ | ------ | ------ | ------ | ------- | -------- |
| 1      | 0–4 秒 | 4–6 秒 | 6–9 秒 | 9–10 秒 | 10 秒    |
| 2      | 0–4 秒 | 0–2 秒 | 2–5 秒 | 4–5 秒  | 5 秒     |
| 3      | 0–4 秒 | 0–2 秒 | 0–3 秒 | 2–3 秒  | 4 秒     |
| 4      | 0–4 秒 | 0–2 秒 | 0–3 秒 | 0–1 秒  | 4 秒     |

这个例子帮助解释：为何会等待、并发上限怎样改变排程，以及存在长任务时继续增加并发不一定继续缩短整批时间。前提是固定任务时长、没有共享资源争用等外部影响；页面必须标明这些条件，不把模拟结果当成真实系统提速估计，也不在本例引入未经对焦的请求到达率、限流、失败重试或资源竞争模型。

固定数据直接作为示例源码中的普通常量，不存在 ConcurrencyParams 或外部任务配置文件：

```tsx
const TITLE = '同时跑几个任务，会怎样影响完成时间？';
const INITIAL_CONCURRENCY = 2;
const TASKS = [
  { id: 'a', label: '任务 A', durationMs: 4000 },
  { id: 'b', label: '任务 B', durationMs: 2000 },
  { id: 'c', label: '任务 C', durationMs: 3000 },
  { id: 'd', label: '任务 D', durationMs: 1000 },
];
// 页面用 useState(INITIAL_CONCURRENCY) 管理用户交互，模型直接读取 TASKS。
```

没有专用的外部业务入参。definePanel.input 使用空对象 schema；通用 panel run 既有协议需要传空对象时仍按现有方式传入 '{}'，不借此改变所有面板的 CLI 参数规则。空对象不承载标题、任务、时长或并发设置，也不提供 concurrency.json / --params-file 业务配置样例。

示例若演示公共评论接入，其反馈位置仍可使用普通的页面自定义类型，不将它提升为新的标准页输入协议：

```ts
type SimulationRef =
  | { kind: 'task'; taskId: string; concurrency: number; atMs: number }
  | { kind: 'summary'; concurrency: number };

type SimulationFeedback = Feedback<SimulationRef>;
```

所有播放、暂停、重播和并发数调整只改变页面内的探索状态，不向 AI 逐步发事件。需要进一步解释时，human 可以暂停，选择一个任务或某个并发数的汇总结果，使用公共 annotations 追加疑问，再明确提交；也可以只写整体意见。目标保存被选时的并发数，任务状态还保存当时虚拟时间 atMs，使 AI 不会把对并发 2 的问题当成对后来切换到并发 4 的问题。taskId 对应该示例源码中的固定 TASKS，代码中的模型与反馈情境足以重新计算排程，不增加动画状态业务存储或额外任务日志。

例如虚拟时间 1 秒、并发上限 2 时，任务 C 仍在排队；human 可选它并问为什么。候选事件 explanation-feedback 的 payload：

```jsonc
{
  "annotations": [
    {
      "id": "note-1",
      "targets": [
        {
          "ref": {
            "kind": "task", // 选中任务 C 当时的状态
            "taskId": "c",
            "concurrency": 2, // 当时设置的并发上限
            "atMs": 1000, // 当时播放到虚拟时间 1 秒
          },
        },
      ],
      "comment": "为什么 C 现在还没开始？", // 空字符串同样表示只选中
    },
  ],
}
```

数据与存储：标题、固定任务、模拟时长与初始并发值随示例源码保存，不写入专用 JSON 配置或业务存储。实例 params_json 仅为通用协议的空对象，不保存一份重复任务数据；最后明确提交的 SimulationFeedback 仍用已有事件 payload_json。并发数、虚拟时钟和播放状态留在页面内，反馈中的 concurrency/atMs 保留实际提问情境，不把计算表或动画 tick 发给 AI。事件已有源码 revision，用于关联当时页面代码；不新增专用模型版本体系。agent 要换主题或固定任务时直接修改或复制 TSX，沿用已有源码运行及更新方式，不增加输入文件监测、覆盖 params 或自定义更新协议。

示例交付重点是让 agent 看懂如何用现有组件和 React 状态写出「用户调整页面控件 → 图形/数值随之变化 → 理解原理 → 按需反馈」的完整一次性展示页。无需为固定内容再开发业务参数 schema、通用调度服务或外部数据接入。此结论只适用于该原理展示 example，不移除 GitHub PR 示例已确认的 repository 等必要输入。

### Sentinel LeapArray 一次性原理展示（B33 已确认）

新增第二个一次性原理展示 example，讲解公开仓库 [alibaba/Sentinel](https://github.com/alibaba/Sentinel) 中 com.alibaba.csp.sentinel.slots.statistic.base.LeapArray 的核心工作原理。主题、场景和数据固定在示例源码，不提供专用业务入参，资源放入 skill 的 examples 中。

已按用户要求到实际实施时阅读公开源码并完成 panel/model、交互与测试，不新增产品决策。第二批主 agent 验证见 verification.md；用户亲自体验尚待完成，体验后发现问题再修正。

### 工程契约定稿

本节完成任务 1.4、1.7、1.15、1.19、1.25 的工程核对；前文的类型及本节的约束共同构成实施契约。这里不新增产品决策，也不表示代码或浏览器验收已经完成。

#### 公共反馈 API

公共 JSON 类型和 feedbackSchema 从 paneon/sdk 的 Node/browser 入口同时导出；编译器将服务端 paneon/sdk 重定向 dist/sdk/server.js，因此该实际入口也同步导出；React 组件和 hook 从 paneon/ui 导出。以下是需要实现的公开签名，React/Zod 类型以项目现有依赖为准：

```ts
type TargetResolution =
  { status: 'ready'; text?: string } | { status: 'missing' | 'stale'; message: string };

type FeedbackAdapter<TRef> = {
  resolve(target: FeedbackTarget<TRef>): TargetResolution | Promise<TargetResolution>;
  locate(target: FeedbackTarget<TRef>): void | Promise<void>;
};

type FeedbackProviderProps<TRef> = {
  children: React.ReactNode;
  onSubmit(value: Feedback<TRef>): Promise<unknown>;
  adapter?: FeedbackAdapter<TRef>;
  disabled?: boolean;
};

type FeedbackTargetProps<TRef> = {
  target: TRef;
  asChild?: boolean;
  children: React.ReactNode;
};

type FeedbackTextProps<TRef> = {
  target: TRef;
  text: string;
  className?: string;
};

type TextRegistration<TRef> = {
  ref: TRef;
  source: string;
  segments: {
    node: Text;
    sourceOffsets: (number | null)[];
  }[];
};

type FeedbackController<TRef> = {
  mode: 'browse' | 'select';
  value: Feedback<TRef>;
  activeAnnotationId: string | null;
  submitting: boolean;
  error: string | null;
  setMode(mode: 'browse' | 'select'): void;
  createAnnotation(targets: FeedbackTarget<TRef>[], comment?: string): string;
  editAnnotation(id: string | null): void; // null 结束编辑，保留条目，下一次选择新建条目
  updateAnnotation(id: string, value: Omit<FeedbackAnnotation<TRef>, 'id'>): void;
  removeAnnotation(id: string): void;
  toggleTarget(target: FeedbackTarget<TRef>): void;
  setComment(comment: string): void;
  locate(target: FeedbackTarget<TRef>): Promise<void>;
  registerText(registration: TextRegistration<TRef>): () => void;
  submit(): Promise<void>;
};

declare function useFeedback<TRef>(): FeedbackController<TRef>;
```

FeedbackControls 无必填 props，组合当前 Provider 的控制器与现有 shadcn 组件。Provider 默认泛型为 JsonValue；作者为复杂页面显式指定 TRef，并在同一 Provider 下使用相同的 hook 类型。组件的 target 是业务 ref，提交时才生成 `{ref,text?}`；避免要求调用者为整块选择写空 text。ref 按 JSON 对象键排序后比较，数组顺序保留，不能因对象键顺序不同重复登记。feedbackSchema(refSchema) 接受一个 Zod ref schema，返回 Feedback<TRef> 的 schema；不含 replacesEventId 或页面特有 sources，页面自行组合这些字段。

toggleTarget 操作当前条目；没有当前条目时生成随机稳定 id 和空 comment。取消最后一个目标后删除该空目标条目，不能留下不合法的 targets=[]。createAnnotation 返回新 id 并激活，editAnnotation 切换编辑对象，传 null 则结束当前编辑且不删除条目；updateAnnotation 原地保留 id。更正/锁定/重提按钮由标准页面组合实现；Provider 不生成 replacesEventId，也不默认在成功后清空或锁定，disabled 由作者控制。提交期间暂时禁止草稿编辑和重复提交，冻结一份值，先完成结构及目标校验，再调用 onSubmit；失败恢复编辑，保留原草稿。回执与成功提示由页面持有，custom onSubmit 不必返回 Paneon 事件 id。

静态对象由已登记内容校验；未挂载对象需要 adapter 才能校验和定位。表格翻页不是目标失效，adapter 根据完整输入定位、必要时清除过滤并切页；Git/PR 根据缓存的原始快照定位，即使已有新版本也仍可提交有效旧快照。只有无法取得匹配原文时才返回 stale/missing 并阻止该次提交，不能删除草稿或改挂新内容。移除 DOM 注册只解除监听，不移除已保存条目。多次异步查询返回时按当前请求标识接收结果，过时响应不得覆盖当前视图。

registerText 供 Markdown/diff 适配器使用，返回注销函数。每段 sourceOffsets 长度必须为 node.data.length + 1，记录 DOM UTF-16 边界对应的 source 下标；无法映射的边界用 null，不能通过搜索相同词猜位置。普通 FeedbackText 生成直映射。Markdown 在现有 remark/React 渲染链中保留源位置，并针对转义、实体、代码及格式标记生成映射；多个 DOM 节点共用一份原文坐标。连续选择跨格式时覆盖中间的 Markdown 标记，quote 等于实际 source.slice；源中不连续的内容拆为同一条目的多个目标。浏览器起止位置归一到完整字素，表格和 diff 不混淆两侧/单元格坐标。非正文控件、图形内部及不可映射节点不能伪造文字目标；应保留普通复制及已注册的整体选择。

语义校验在页面自己的 serverAction 再做一次：固定输入校验 ref 和范围，动态查询校验原始快照及摘要。公共结构 schema 校验唯一 id、非空 targets、合法 JSON、整数范围和字符串 comment，不承担查 Git/接口内容的职责。复杂适配器必须通过真实浏览器对重复词、中文/emoji、转义/实体、跨强调和链接文本、代码片段、翻页及旧快照的定位验收；仅按原文找到首个同名词不算实现完成。

#### 标准选择与表格校验

choose 创建时校验已有约束及非空标题/标识；提交结果必须恰好覆盖输入 questions，每题一次，不允许未知 questionId 或重复项，输出顺序跟随输入问题顺序。每题 selections 校验单/多选总数量：single 恰好一项，multiple 至少一项且允许已有项和自填混合；至多一个 custom。kind 为 option 的项含 optionId 与 comment，选项 ID 不得重复或跨题；kind 为 custom 的项含非空白 text。已有项按输入选项顺序输出，custom 放末尾，避免点击次序造成无意义差异。未填写的补充说明使用空字符串，所有说明保持原文，不裁剪空格。返回上一题不校验或发送最终事件；进入下一题和最终提交时展示对应题目的错误并定位，最终提交再次校验全部答案。推荐标记不生成默认答案。

table 的 columns 至少一列，key 唯一且非空；rows 允许空，所有声明列都必须是行自己的字段，不能读取原型链。允许未声明的额外数据字段但不自动显示或选为列。type 是排序/筛选提示：number 列仅接受有限数或 null，boolean 列仅接受布尔值或 null，默认 text 列允许 CellValue，按 String(value) 展示，null 为空；可精确选词的仍仅限原始字符串。pageSize 为 1–1000 整数，默认 20。类型/范围/原文校验在创建或提交阶段报清楚字段位置，不静默转换输入。

全表搜索对声明列的可见文本作不区分大小写的子串匹配；每列提供同样的文本包含筛选，number/boolean 列按原生值排序，text 按文本排序，null 始终排末尾，等值按原始 rowIndex 稳定排列。排序、筛选后回第一页，但保留评论；分页作用于筛选后的行。定位隐藏行时明确恢复其可见范围、跳到对应页并高亮，不更改原始 rowIndex。列评论覆盖原始整列，表头勾选只操作当前页；不额外提供含糊的隐式全表选择。无匹配结果提供清除过滤入口。

首次空反馈不发事件；标准页更正后允许明确提交空 annotations 表示删除原有意见。修正版仍校验所有保留目标，只携带本次引用的 sources；B34 的完整替代和历史保留适用于所有标准页，而不只是 Git。

#### Git 历史、快照与 diff

历史每次读取 50 条并多取一条判断是否还有内容，按同一完整 tip OID 与相同排序遍历、使用已加载数量作为后续偏移；历史刷新才解析新 tip 并重置列表，旧评论保留原来源。空仓库能浏览未跟踪文件，历史为空，不伪造 HEAD；无法解析的指定 commit/base/head 明确报错。history 点开 merge commit 默认相对第一父提交，界面说明；根提交相对空树。branch 模式遇到没有共同祖先时报告比较失败，不改成另一种比较；多个共同祖先不擅自选择，要求在页面指定端点比较。

统一参数数组调用 Git，仓库路径使用 -C；版本先解析为提交 OID，文件路径通过 -- 分隔。文件清单按 Git 的 NUL 分隔格式解析，支持空格、换行和重命名；--no-ext-diff/--no-textconv 避免本机显示插件改变原文。未跟踪清单按 Git 忽略规则获取；不递归到子模块或跟随符号链接读取仓库外文本，gitlink/链接作为对应对象变更展示，不能伪装成普通文件行。

每次查询先读取比较两侧实际内容，再由这两份不可变内容生成 diff；显示、高亮、行号、摘要和 quote 共用该快照。工作区不能原子锁定为某个时刻，读取期间变化也不以最新文件重算已有目标。冲突文件展示未合并状态及可读取的工作区原文，不把不同 index stage 合成一个虚假的已暂存结果。二进制或无法可靠解码的内容仅提供文件级评论。CRLF 保留为原文，行分隔映射和无末尾换行标记均需验证。

默认左右视图与统一视图使用相同的 sourceId 和原文坐标；展开上下文只改变可见范围。同一行范围必须位于同一侧且连续；跨两侧或不连续的范围用同条目多个目标。行 target 的 text 范围针对所选行的原文拼接，包括原始行分隔，文件/hunk 目标不带 text。sources 只包含实际引用的快照，至少有一侧；hunk 的 patch、行区间必须与来源原文匹配。旧快照缓存在当前查询运行环境，源码热更新遵循现有 Vite/React 机制，不增加旧 worker 保活保证。

#### GitHub PR 精准反馈契约

PR 详情/描述可变，base/head 不能单独充当它们的版本号。来源按 PR、内容种类和实际快照去重；同一条意见可跨 PR、描述和代码，仍只用一份 annotations。

```ts
type PRSource = {
  number: number;
  baseCommit: string;
  headCommit: string;
} & (
  | { kind: 'pull-request'; title: string; updatedAt: string }
  | { kind: 'description'; contentHash: string }
  | {
      kind: 'check';
      key: string;
      name: string;
      status: string;
      conclusion: string | null;
      detailsUrl?: string;
      observedAt: string;
    }
  | {
      kind: 'diff';
      mergeBaseCommit: string;
      old?: GitContentSide;
      new?: GitContentSide;
    }
);

type PRRef = { sourceId: string; kind: 'pull-request' | 'description' | 'check' } | GitRef; // file/hunk/lines 的坐标结构复用，sourceId 指向 PRSource 的 diff

type PRFeedbackSubmitted = Feedback<PRRef> & {
  repository: string;
  sources: Record<string, PRSource>;
};
```

事件名 pr-feedback-submitted。来源的 kind 与引用种类必须匹配：description 可整段或带 Markdown 原文 text，check/整份 PR 只整对象，diff 的 file/hunk/lines 按 Git 规则。description 摘要覆盖完整原始 body，diff 摘要覆盖实际两侧原文；检查 key 使用接口稳定标识并保留所见状态，不只按名称合并。只有实际引用的来源入事件。刷新或切换 PR 不改旧反馈来源；过期快照仍可在当前页回看。整份 review-requested 继续用前文的简洁类型；点击它不会自动发送草稿。PR 是可改造示例，公开反馈能力不强制它使用标准页 replacesEventId 策略。

例如 body 为「请检查缓存。」时，选中「缓存」的结果如下；本例摘要是示意值，实际代码计算原文 SHA-256：

```jsonc
{
  "repository": "cli/cli",
  "sources": {
    "pr-body-1": {
      "number": 123,
      "baseCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "headCommit": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "kind": "description",
      "contentHash": "sha256:example",
    },
  },
  "annotations": [
    {
      "id": "note-1",
      "targets": [
        {
          "ref": { "sourceId": "pr-body-1", "kind": "description" },
          "text": { "start": 3, "end": 5, "quote": "缓存" },
        },
      ],
      "comment": "请说明失效策略。",
    },
  ],
}
```

PR 列表首次取 30 条，加载更多将 gh pr list --limit 增加 30 后重新查询，按 PR number 去重；切换搜索/状态重置。显示当前已加载条数，不把 --limit 当游标或固定仓库快照。详情使用明确 PR 编号，检查使用 statusCheckRollup；检查失败是业务状态，查询失败是独立错误。

代码阅读使用 gh api 的固定 OID 比较：先取得 base/head，再查询 compare 得到 merge_base_commit，以完整 merge-base/head 固定获取两侧文件并生成 diff。不能把 gh pr diff 的实时输出直接贴上另一次查询的 OID。GitHub compare 接口的文件清单最多 300 个、部分二进制或超大文件没有 patch，必须说明覆盖范围，提供原始链接；缺失 patch 时可从固定版本原文生成，不能把省略当成无改动。超过接口文件清单上限时明确标记不完整，不声称已审阅全部文件。接口行为以 [GitHub 官方 Compare two commits 文档](https://docs.github.com/en/rest/commits/commits?apiversion=2022-11-28#compare-two-commits) 为准，实施时以真实查询验收。

#### 传输体积限制核对

实施前基线事实（现已由首批修复，见 verification.md）：src/runtime/lifecycle.ts 限制 JSON.stringify(payload).length <= 65536（UTF-16 长度），src/runtime/server.ts 却将整个 HTTP body 限制为 131072 字节。65536 个 JSON 字符可能接近 196608 个 UTF-8 字节，另有 type/revision 外层，因此中文长反馈存在提前被拒绝的路径；现有错误处理还会将 Fastify 的体积错误按普通异常返回 500。

本 change 实施时将 HTTP body 固定上限调整为 262144 字节，并把体积错误映射为 HTTP 413、英文 BODY_TOO_LARGE 结构化诊断；事件的 65536 字符上限仍独立保留。CLI 文件入参和浏览器事件在发送前计算完整请求体 UTF-8 字节数，提前报告同样限制；服务端仍作权威限制。--params-file 不代表无限数据量，不拆分事件、不截断文本、不新增体积配置。页面语义校验若经 serverAction 发送同份反馈，也使用这个 HTTP 限制。验收覆盖中文 payload 在语义上限内可提交、超过语义上限和超过请求字节上限分别被准确拒绝，失败保留草稿。

### 整体方案核对：agent 自行完成的工程工作

整体核对用于保证已经确定的产品行为能正确落地，不是再逐项要求用户审批组件命名、文件名、内部算法或默认样式。需要核对：

1. 标准页、真实 gh 示例及两个一次性讲解 example 是否各自按已确认的资源/输入边界设计，清除过时的草案参数和重复待确认项。
2. 公共 annotations/schema、页面输入和事件类型是否一致；Git/PR 的版本关联及 Markdown 显示选区到原文的映射是否闭合；SDK browser/default 导出是否一致。这些由 agent 完成，不把技术字段重新作为产品问题。
3. skill 随包携带的资源、复制安装后的相对路径、类型检查和示例运行方式是否完整；按 B38 由 CLI 提供配套 skill 安装入口，不扩展为通用 skill 管理器或运行时业务能力。
4. 验收是否覆盖选择/评论、错误和提交状态、CLI 读取事件，以及真实页面操作；文档校验通过不等于功能已实现或浏览器已验收。

B34 已确认标准页统一更正，B35 已确认 Sentinel 使用公开仓库来源，当前没有新增产品决策。各页具体类型、API/内容定位适配契约、打包和验收范围已完成工程核对，结果见 review.md；已交付部分与剩余任务以 tasks.md/verification.md 为准，按独立 worktree 继续同一 change。

## Storage and Interfaces

复用 ~/.paneon/runtime.sqlite 的 panels.params_json 保存面板输入，以及现有事件存储的 type/payload_json 保存提交数据；不新增表。上述 ChooseParams 和 AnswersSubmitted 给出了需要持久化的 JSON 结构。浏览器未提交的多题草稿建议保存在页面 React 状态中，不增加磁盘草稿。按 B5，只在最终提交时保存整组答案事件，不保存逐题答案事件。

标准表单页按已确认 B26 复用同一存储位置，FormParams 对应 params_json，FormSubmitted 对应事件 payload_json。上节给出了结构及内容样例；未提交字段在页面内保存，不新增表或独立文件存储。

表格页输入对应 params_json，table-submitted 的反馈结构对应事件 payload_json。上节提供了 TableParams、TableRef、TableTarget、TableAnnotation、TableSubmitted 定义，以及候选输入文件和含多单元格/文本评论的结果样例；B24 已确认公共模块归属与通用结构；B19/B21 已落实表格复用公共混选/评论，详细校验及修订事件规则见工程定稿；B23 已确认简化列展示配置。不新增表格业务存储，建议浏览状态、未提交选择和评论草稿保留在页面内。

GitReviewParams 保存在 panels.params_json，上节提供了类型和输入文件样例；不为标准 Git 页面单独增加框架数据库表。GitReviewSubmitted 给出了 git-review-submitted 的 payload_json 类型和完整示例，首次和修订均追加到现有事件存储；当前会话的原始文件快照和未提交评论只保留在页面所用查询模块及 React 状态中，不承诺重启或整页刷新后恢复。

按已确认 B6，panel run 将新增 --params-file <path>，与 --params <json> 恰好提供其中一个。文件路径相对于调用 CLI 的当前目录解析，--cwd 保持代码执行工作目录的既有含义；CLI 读取 UTF-8 JSON，将解析值交给与 --params 相同的 definePanel.input 校验。文件不存在、读取失败、JSON 无效、两个参数同时提供或均未提供时，启动失败并返回清晰诊断，不创建面板实例。此能力适用于标准页面和自定义 TSX。按 B7，只在创建实例时读取该文件，不监测后续修改；--watch/--no-watch 仍只控制已有源码更新行为，不扩展为参数文件监测。

建议调用：`paneon panel run <skill-directory>/assets/panels/choose/panel.tsx --cwd /work/project --params-file /work/project/choices.json`。解析后的 JSON 继续保存到 panels.params_json；不另存一套相同内容、不保存运行所需的参数文件监测依赖。浏览器刷新、panel reload 及服务重启继续使用已保存的 params，不重新读取原参数文件；源文件修改或删除不改变已有实例输入。修改数据后再次 run 创建的实例读取新快照。

标准页面通过现有 POST /api/panels 创建，通过 POST /api/panels/:instanceId/events 提交反馈；读取/确认使用现有 GET /api/panels/:instanceId/events 和 POST /api/panels/:instanceId/acks。B6 不新增 HTTP 端点或改变事件读/ack 语义。

## Risks / Trade-offs

- 未完成问答与最终答复混淆 → 按 B5 仅在最后明确提交时发送整组答案；上下题不产生答案事件或隐式触发业务动作。
- 多题 ID 或多仓库文件名混淆 → 校验问题/选项唯一性，Git 反馈使用仓库 id 和相对文件路径。
- 文件入参与源码更新混淆 → B6/B7 已确认创建时读取 JSON 快照；--watch 保持源码监测语义，reload 不重新读取原参数文件。
- skill 与 CLI 版本不匹配 → 按 B10 同版本提供资源，仍用 requires.paneon 校验范围；安装到 agent 目录的资源不承诺自动同步更新。

## Affected Files

本 change 的文档改动路径：

- openspec/changes/add-paneon-skill-panels/.openspec.yaml
- openspec/changes/add-paneon-skill-panels/proposal.md
- openspec/changes/add-paneon-skill-panels/design.md
- openspec/changes/add-paneon-skill-panels/specs/paneon-agent-skill/spec.md
- openspec/changes/add-paneon-skill-panels/specs/guided-choice-panel/spec.md
- openspec/changes/add-paneon-skill-panels/specs/panel-file-input/spec.md
- openspec/changes/add-paneon-skill-panels/specs/panel-feedback/spec.md
- openspec/changes/add-paneon-skill-panels/tasks.md
- openspec/changes/add-paneon-skill-panels/review.md
- openspec/changes/add-paneon-skill-panels/development.md
- openspec/changes/add-paneon-skill-panels/verification.md
- docs/memory/MEMORY.md
- docs/memory/agent-skill-assets.md
- docs/memory/ui-selection-feedback.md
- docs/memory/ui-reusable-examples.md

实施路径如下；均为仓库相对路径。原页面资源与 skill 指南已交付；CLI 安装器按独立任务跟踪：

- skills/paneon/SKILL.md
- skills/paneon/references/choose.md
- skills/paneon/references/authoring.md
- skills/paneon/assets/panels/choose/panel.tsx
- skills/paneon/assets/panels/choose/schema.ts
- skills/paneon/references/form.md
- skills/paneon/assets/panels/form/panel.tsx
- skills/paneon/assets/panels/form/schema.ts
- skills/paneon/references/table.md
- skills/paneon/assets/panels/table/panel.tsx
- skills/paneon/assets/panels/table/schema.ts
- skills/paneon/references/git-review.md
- skills/paneon/assets/panels/git-review/panel.tsx
- skills/paneon/assets/panels/git-review/schema.ts
- skills/paneon/assets/panels/git-review/git.ts
- skills/paneon/references/review.md
- skills/paneon/assets/panels/review/panel.tsx
- skills/paneon/assets/panels/review/schema.ts
- skills/paneon/assets/shared/diff.tsx
- skills/paneon/assets/shared/markdown-feedback.tsx
- skills/paneon/references/examples.md
- skills/paneon/assets/examples/github-pr/panel.tsx
- skills/paneon/assets/examples/github-pr/github.ts
- skills/paneon/assets/examples/concurrency/panel.tsx
- skills/paneon/assets/examples/concurrency/model.ts
- skills/paneon/assets/examples/sentinel-leap-array/panel.tsx
- package.json
- tsconfig.examples.json
- tsconfig.ui.json
- tsconfig.app.json
- README.md
- docs/agent-guide.md（删除，有用内容迁入 skills/paneon/references）
- src/cli/index.ts
- src/cli/client.ts
- src/runtime/lifecycle.ts
- src/runtime/server.ts
- src/shared/limits.ts
- src/shared/types.ts
- src/web/api.ts
- src/sdk/feedback.ts
- src/sdk/index.ts
- src/sdk/server.ts
- src/sdk/client.ts
- src/ui/feedback.tsx
- src/ui/feedback-types.ts
- src/ui/feedback-context.ts
- src/ui/feedback-store.ts
- src/ui/feedback-selection.ts
- src/ui/feedback-provider.tsx
- src/ui/index.ts

各页面需求及相关实施文件已完成文档核对；用户开工条件已满足，按 development.md 开始写运行代码。现有未提交的页头修改、Mermaid 验证记录和其他 change 不属于本轮修改范围。

## 第二批实现对齐

Markdown 原文适配复用公共 `Markdown`，通过可选 `components` 与 `rehypePlugins` 接入。组件合并默认 renderer 与覆盖项，保留 GFM、GitHub 样式和默认 Mermaid，不为 skill 复制一套渲染器，也不改变原始 HTML 默认禁用策略。正文显式注册的链接文字可参与连续源范围；普通点击仍使用链接自身行为，按钮/表单/反馈控件不参与文字选择。

表格、Markdown 与 Git 实现和验证见 verification.md。Git 的缓存原文只在当前页面会话可用，不承诺刷新浏览器或源码更新后恢复。Sentinel 使用固定公开 commit 的教学模型，未声称执行 Java 或验证并发竞争。PR 与 skill-only 指南已交付；CLI 安装器已实现并验收，用户 Sentinel 体验尚未完成，不把整个 change 标记为完成。

验收发现 action-transform 的选择性重导出会保留整条导出却裁掉其部分依赖。例如 `export {first,second} from './values'` 仅被导入 first 时，values 只剩 first 而 barrel 仍导出 second。已修复并验证按实际导出名称/别名裁剪，未以全量服务端依赖打包到浏览器绕过。已交付 skill 共享模块采用直接依赖，页面验收不受该缺陷影响。

## B36：唯一 agent 使用指导

skills/paneon/SKILL.md 是使用者 agent 的入口，CLI、SDK/API、自定义 TSX 和反馈接入说明按需放在同目录 references/。不在 docs/ 维护独立的 agent 使用手册，也不让 skill 反向依赖外部指南。README 只保留面向人的介绍与 skill 链接。现有 docs/agent-guide.md 完成内容迁移后删除；package.json 的 files 移除它，继续通过 skills/paneon/ 整体打包。开发验收记录仍属于工程文档，不作为另一份产品 agent 指导。

## 已开启任务收尾验收

编译器重导出、仅 skill 指南、GitHub PR 三个工作单元的交付与主验收记录见 verification.md。公共 Provider 对来自按钮、输入框和反馈控件的 mouseup/keyup 不再重新采集定位留下的 Selection，已用修复前失败、修复后通过的真实 Chrome 回归核对；显式注册的链接正文继续允许圈选。

npm run build 先生成 CLI 与 UI 公开声明，再执行完整 typecheck 和 Web 构建，解决测试/skill schema 从包自引用解析尚不存在 dist 的首次构建失败；没有降低类型检查或变更 SDK 解析规则。单独运行 typecheck 仍依赖包声明产物，标准 build 负责生成它们。

## Contextual comment interaction — B44

用户进一步确认统一提交按钮文案为“提交评论”；提交的是当前面板的完整评论结果，编辑器“保存”仍只保存草稿。

按用户六张参考图，将用户界面和说明中的“批注”统一称“评论”。替换旧独立控制区为划选气泡、就地输入、编号标记及保存/取消/删除，页面工具栏提交；完整权威交互及公共 API、两组文件边界和验收要求见 [comment-interaction.md](comment-interaction.md)。本节覆盖本文较早的集中式 FeedbackControls UI 草案及“先进入模式才能划选文字”的描述；语义目标、事件结构、原快照校验及页面更正策略保留。对象多选采用先累积目标、再点“评论”编辑，紧凑菜单可回到未挂载的目标；可选 adapter.targetRanges 只补 DOM 几何，不改原文坐标及事件。本修正已交付并通过最终独立包验收，见 verification.md。

## Git review layout — B45

用户提供 JetBrains Git Log 参考图后授权修正 Git 页布局，根因及定稿见 [git-review-layout.md](git-review-layout.md)。历史视图采用上方提交列表/文件区、下方 diff；其余视图文件区/diff 分栏。提交信息列对齐、明确选中态、紧凑工具栏和独立滚动，修复长代码跨 old/new 栏重叠。由 comment-pages 在原独占文件内一并实施，不新建相同文件并发工作单元，不改变查询/schema/评论协议。已交付并通过主 agent 的最终独立包 Git/PR 和窄屏验收，见 verification.md。

## Form layout correction — B46

用户截图指出表单清除按钮全宽及短选项纵向布局不佳。根因和实施范围见 [form-layout.md](form-layout.md)：仅修正 form 页对 Field/Stack 的组合，清除操作紧贴下拉框、短单选/多选横排换行、布尔控件与标签同排、提交按钮合理宽度。保留 shadcn 默认组件、字段 schema 和全部提交行为，独立 form-ux 组已交付，主 agent 的源码与独立安装包 Chrome 已验收；证据见 verification.md。

## Git navigation stability — B51

切换提交时保留已加载的同仓库/视图内容，queryGit 成功后统一更新描述、提交选中态、文件和 diff，失败保留原状态并显示错误。首次加载行为不变。加载提示放在固定高度的范围描述行内，避免工作区重新排版。根因及回归见 git-review-layout.md 的 B51；不改 Git 查询、SDK 或评论数据协议。

## Compact Git Log — B52

按用户授权，将历史列表改为 JetBrains 参考图的紧凑 Git Log：SVG 关系图、说明与分支/标签、对齐的作者/日期，不单列 hash。新增 graph.ts 纯 lane 布局与 history.tsx 页面行组件，使用既有父提交关系，不引入依赖。内部 GitCommit 增加 refs；读取本地/远端分支、HEAD 及 peeled 标签。保持当前固定 tip 可达历史、50 条分页、只读行为与 B51 切换稳定性。具体边界和官方 Git 依据见 git-review-layout.md 的 B52。

## Own Git history — B53

用户明确选择自行实现 Git 图和提交列表。单分支浏览、完整提交说明、独立详情和键盘/可见行渲染按 [git-review-layout.md](git-review-layout.md) 的 B53 实施；继续复用当前 React/SVG 和只读 serverAction，不引入第三方 Git 图依赖。默认当前分支，浏览其他分支不 checkout；保留固定 tip、真实合并关系与现有评论快照。

## Adjustable history / diff split — B54

用户截图要求上下拖动历史区与Diff区之间的横向分界。桌面历史视图增加局部分隔条，默认比例延续现有值，保持上下最小可用高度、键盘操作和窄屏堆叠；只改变布局，不改变Git读取及评论语义。范围、Pointer Events收尾与真实拖动验收见 [git-review-layout.md](git-review-layout.md) 的B54。使用distributed-development，已集成并通过主agent源码与独立安装包验收，详见verification.md。

## Changed-file directory tree — B55

用户要求改动文件按目录树呈现，压缩单子目录链，删除灰色弱化、修改蓝色、新增绿色。使用页面局部组件替换共用fileList的平铺内容，保留snapshot身份、工作区分组、原old/new路径筛选与文件选择；与B54分隔条分工边界及验收见git-review-layout.md的B55。已集成并通过主agent源码与独立安装包验收，详见verification.md。

## Left branch sidebar — B56

按用户截图将历史分支选择移到提交列表左侧。本地/远程/标签按前缀分组，可折叠和搜索；桌面三列，窄屏堆叠。复用现有只读历史查询和引用信息，保留Diff分隔条及评论状态，详见git-review-layout.md的B56。

## Adjustable history columns — B57

按用户截图让左分支栏和右文件区的竖向分界线可左右拖动。页面局部hook维护宽度比例与约束，支持键盘、capture取消/清理、容器resize及窄屏堆叠；原上下分隔条与评论/查询语义保持不变，详见git-review-layout.md的B57。

## Git page performance and select-all stability — B58

用户要求检查Git页面潜在卡顿，并报告Diff内容中Command+A崩溃；独立组先复现、记录运行证据，再修复明确的选择/渲染瓶颈，不屏蔽原生全选。保留评论数据、复制、只读Git及原页面布局；范围见git-review-layout.md的B58。

## Compact Git review and Diff controls — B59 / B60

按用户截图压缩Git页的分隔线与区域间距，移除文件搜索/数量及可见说明标题，历史切换后由用户点文件才展开Diff。共享Diff提供明确左右/单列选择、差异计数和上下箭头导航，点击计数定位。保留拖动热区、完整消息、精确评论、只读和initialView.file；分工与边界见git-review-layout.md的B59/B60。
