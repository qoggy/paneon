# CLI skill installation research

调研日期：2026-10-21。归属 change：add-paneon-skill-panels。本文是工程调研，不是另一份面向使用者 agent 的指南。

## 当前采用方向（B39）

用户在体验后明确要求先沿用成熟项目做法和文案，不足再增加。当前流程演示已对齐 Vercel Skills 固定实现：默认 Project，多目录推荐 Symlink，已有安装在汇总中提示覆盖并统一确认。此前“默认用户级、直接复制、冲突备份”仅是初步建议，已撤回；下文调研事实保持不变，“给 Paneon 的建议”保留为当时建议，不作为当前实施契约。最新方向见 design.md 和 [演示说明](../prototypes/skill-installation/README.md)。安装器尚未实现。

## 结论

用户确认的 B37/B38 有充分的现有实践可借鉴：产品 CLI 可以作为唯一入口，初始化时引导选择 agent 并安装使用技能。最贴近 Paneon 的组合是 **OpenSpec 的工具选择交互 + Firecrawl 的统一初始化入口 + Playwright 的包内配套技能安装**。Vercel Skills 适合借鉴多目标路径、统一内容与链接、非交互参数和安装记录；没有必要让 Paneon 变成通用技能市场。

“skill 难更新”主要是手工复制流程缺少管理，不是 skill 文件本身不能更新。已经有来源记录后重新获取、刷新 CLI 自带内容、中央副本加链接、薄入口运行时读取等不同方案。应当分别设计“升级 CLI 程序”和“同步安装好的 skill”；其他工具叫 update，不代表它升级了 CLI 程序。

下文推荐均为调研建议。B38 已确认 CLI 入口；具体命令、安装范围、复制/链接、覆盖规则尚未定稿，本次未实现安装器或 update。

## 证据范围

- 读取官方 GitHub 仓库的实际实现，固定 commit；下表的版本是对应源码 package.json 的值，不把 main 的版本当作 npm 最新发布版本。
- 实际运行本机 OpenSpec 的终端选择器、临时项目安装和强制刷新；本机安装包自报 1.5.0，与官方 main 快照不同，分别记录。
- 实际调用本机 playwright-core 1.64.1 的 CLI 客户端入口，在临时项目安装、重复安装，核对全部安装文件。没有安装浏览器或打开业务页面。
- Vercel Skills、Firecrawl、OpenSkills、agent-browser 的行为来自官方代码阅读；没有在真实 agent 用户目录执行这些安装器。项目目录探测也不等于验证目标 agent 实际加载了 skill。

## 项目快照

| 项目            | 源码版本 | 固定 commit                              | 验证方式                                |
| --------------- | -------- | ---------------------------------------- | --------------------------------------- |
| OpenSpec        | 1.14.3   | c04f30e57817422c1a107ea00a682c1d29a423ca | 官方源码；另实测本机自报 1.5.0 的安装包 |
| Vercel Skills   | 1.7.4    | a80e4c9d12d607631249d4d7d059f835d4b2f13a | 官方源码                                |
| Firecrawl CLI   | 1.26.18  | 2de80d5c7a89cabfbf6aa4d068418eb569fbc273 | 官方源码                                |
| Playwright CLI  | 0.1.22   | b1a5903c5b633b8c9f843ad7b629c2a78437040c | 官方入口与指南源码                      |
| playwright-core | 1.64.1   | cfe490d941f992655948eee8fd4fd94e1c4234bf | 安装实现源码；本机同版本实测            |
| OpenSkills      | 1.5.0    | 57d933a4f0d5c8659bd8b285f50fb9554360f0b3 | 官方源码                                |
| agent-browser   | 0.39.1   | fd93075e55a21a47fcb36d7433361daa867a0580 | 官方源码，作为另一种分发模式对照        |

## 安装体验对比

| 项目           | 入口与终端交互                                                                         | 安装范围与内容                                                                                | 重装/更新的实际含义                                                                  |
| -------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| OpenSpec       | init 中可搜索多选工具，已配置/检测到的工具影响排序与预选；--tools 可绕过交互           | 以项目初始化为主，按工具注册表生成技能与该工具支持的命令；部分目标有全局路径                  | update 使用当前 CLI 模板刷新已配置工具的生成文件，不是升级 npm 包                    |
| Vercel Skills  | add：选技能、选 agents、选项目/用户范围；按目标情况提供 symlink/copy 选择与写入摘要    | 通用来源安装器；中央 .agents/skills 与各 agent 路径；通用目标在当前选择器中可能作为固定选中项 | 记录来源/ref/skill 路径/目录 hash，check/update 重新比较并获取技能内容               |
| Firecrawl CLI  | init 串起安装 CLI、安装技能及认证；交互时可多选检测到的 agents，提供 --agent/-y 等参数 | 用户级为主；源码优先原生检测和中央副本加链接，也保留外部 skills 安装分支                      | setup 可重新安装技能；原生安装会替换中央技能目录并更新来源记录，不是对用户修改作合并 |
| Playwright CLI | install 的 --skills 选择安装；claude/agents 两种目标，无多 agent 选择器                | 从已安装程序的包内资源复制；默认项目目录，--global 切用户目录                                 | 重复安装复制覆盖；包装 CLI 另有技能内容不匹配提示，提示重跑安装，不自动替用户更新    |
| OpenSkills     | install 中多选的是仓库里的技能，不是 agent 产品列表                                    | 默认项目 .claude/skills，--global 改用户目录；--universal 使用 .agent/skills                  | 安装记录来源；update 重新获取技能；已有目录交互确认默认不覆盖，--yes 会同意覆盖      |

来源：[OpenSpec init](https://github.com/Fission-AI/OpenSpec/blob/c04f30e57817422c1a107ea00a682c1d29a423ca/src/core/init.ts)、[update](https://github.com/Fission-AI/OpenSpec/blob/c04f30e57817422c1a107ea00a682c1d29a423ca/src/core/update.ts)，[Skills add](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/add.ts)、[installer](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/installer.ts)，[Firecrawl init](https://github.com/firecrawl/cli/blob/2de80d5c7a89cabfbf6aa4d068418eb569fbc273/src/commands/init.ts)、[native installer](https://github.com/firecrawl/cli/blob/2de80d5c7a89cabfbf6aa4d068418eb569fbc273/src/commands/skills-native.ts)，[Playwright installSkills](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright-core/src/tools/utils/installSkills.ts)、[CLI wrapper](https://github.com/microsoft/playwright-cli/blob/b1a5903c5b633b8c9f843ad7b629c2a78437040c/playwright-cli.js)，[OpenSkills install](https://github.com/numman-ali/openskills/blob/57d933a4f0d5c8659bd8b285f50fb9554360f0b3/src/commands/install.ts)、[update](https://github.com/numman-ali/openskills/blob/57d933a4f0d5c8659bd8b285f50fb9554360f0b3/src/commands/update.ts)。

## OpenSpec：值得借鉴的是工具选择与内容生成职责

### 交互与非交互

init 使用工具注册表，终端中可输入搜索、方向键移动、空格切换多个工具、回车确认。检测依据主要是配置目录/文件与已有生成物，不是逐个运行 agent 二进制。检测结果可以辅助预选，但不能据此承诺 agent 已安装或已成功加载。

本机 1.5.0 实测显示 30 个工具可选；输入 codex 后列表缩小到 Codex，空格选中再确认。这验证了用户所说的终端交互，不是浏览器页面或图形桌面程序。

无交互调用可以显式指定工具，例如：

```sh
openspec init ./project --tools claude,codex
openspec update ./project --force
```

当前官方源码和本机旧版本的工具清单、Codex 路径、工作流数量不同，不能把本机菜单数量当成当前官方支持数量。[可搜索选择器](https://github.com/Fission-AI/OpenSpec/blob/c04f30e57817422c1a107ea00a682c1d29a423ca/src/prompts/searchable-multi-select.ts)、[工具探测](https://github.com/Fission-AI/OpenSpec/blob/c04f30e57817422c1a107ea00a682c1d29a423ca/src/core/available-tools.ts)、[路径与能力注册表](https://github.com/Fission-AI/OpenSpec/blob/c04f30e57817422c1a107ea00a682c1d29a423ca/src/core/config.ts)。

### 文件和更新

官方 init/update 从当前 CLI 模板生成 SKILL.md，包含生成版本信息；按工具能力决定是否生成额外命令。update 对配置过的工具做同步，并非运行 npm 安装新版 CLI。官方实现还比较规范化后的生成内容，不能简单概括为“只看版本号”。

对普通受管理的技能文件，生成/刷新会重写它；某些旧目录迁移、其他生成物的自定义保护，不能泛化为“所有用户修改都保留”。本机强制刷新实测也确认了这点。

Paneon 已确认所有使用指导只在 skill 内，不应照搬 OpenSpec 的多工作流、命令模板和规划目录等完整产品架构。

## Vercel Skills：多 agent 分发与更新记录

典型入口如下；参数拼写来自官方实现与 CLI 文档：

```sh
npx skills add ./bundled-skills --agent claude-code --global --yes
```

这是支持本地目录的通用安装器，不要求来源一定是远程仓库。交互会根据目标情况决定是否需要展示安装方法；不是每次必问所有问题。

当前源码的重要细节：

- 项目范围与用户范围明确区分。目标路径和检测规则集中在 agent 注册表中；同一物理目录可服务多个工具，不能重复安装同一目录。
- 普通 symlink 模式先复制到中央目录，再让各工具路径链接到中央副本。源码另有直接 link 模式，不能把两者混称为“永远链接到 node_modules”。copy 模式直接维护独立副本。
- 安装前汇总目标与将被覆盖的技能，再确认。安装实现会清理目标目录并复制完整内容；有源/目标重叠保护。
- 非 TTY 若仍需要交互会报错，而不是一直等待输入；--agent 和 --yes 支持自动化。
- 用户级 .skill-lock.json 记录 source/sourceUrl/ref/skillPath/skillFolderHash、安装/更新时间及上次选择的 agents；项目恢复/同步另有项目锁文件。目录 hash 不仅覆盖 SKILL.md。
- 选择器的 Universal 目标有固定选中行为，不能把 --yes 理解为“只选用户明确点过的一个工具”。

源码：[agents](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/agents.ts)、[add](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/add.ts)、[installer](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/installer.ts)、[skill-lock](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/skill-lock.ts)、[update](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/update.ts)。

Paneon 可以借鉴职责划分，但本次快照 package.json 主要提供 CLI bin，没有声明可直接复用的稳定安装器库 API。把它当外部 CLI 调用是可行路线，不能因此宣称可以稳定 import 一个公开 installer SDK。[package.json](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/package.json)。

## Firecrawl：与 Paneon 更接近的一体化初始化

Firecrawl 提供一个 init 流程，将 CLI 安装、技能安装、认证串起来；非交互模式逐步执行，交互模式允许选择已检测到的 agent 子集。用户不需要先去另一处找技能资源。[init](https://github.com/firecrawl/cli/blob/2de80d5c7a89cabfbf6aa4d068418eb569fbc273/src/commands/init.ts)。

实际技能安装并非只有一个实现：优先使用原生安装器，将下载的技能放到中央目录后给目标 agent 建链接；也有调用固定版本 skills CLI 的分支。检测不到工具、显式 all、显式 agent 等情况的路径不同。因此不能只看 README 的“detected”就承诺所有分支只写已检测工具。空选/全选折算语义、外部安装器的 --all 含义，都要从实现核对。

原生安装会先移除对应中央目录，再复制新内容；链接目标已有目录时也存在替换逻辑。这解决同步，却不代表保留用户修改。它还维护技能目录 hash 和来源记录。[skills-native](https://github.com/firecrawl/cli/blob/2de80d5c7a89cabfbf6aa4d068418eb569fbc273/src/commands/skills-native.ts)、[外部安装参数](https://github.com/firecrawl/cli/blob/2de80d5c7a89cabfbf6aa4d068418eb569fbc273/src/commands/skills-install.ts)、[agent 探测](https://github.com/firecrawl/cli/blob/2de80d5c7a89cabfbf6aa4d068418eb569fbc273/src/utils/skill-install-agents.ts)。

Paneon 应借鉴一体化入口，但本项目已确认技能随 CLI 同版本提供。无需照搬 Firecrawl 的远程技能目录、认证、技能族选择和多个安装后端。

## Playwright：最小的包内 skill 安装

该项目的公开安装命令：

```sh
playwright-cli install --skills
playwright-cli install --skills=agents
```

安装器根据 claude/agents 目标，把已安装包里的完整技能复制到项目或用户目录，包含 references，不另外拉取技能仓库。本机同版本实测：11 个文件均与包内内容一致，没有符号链接。[安装实现](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright-core/src/tools/utils/installSkills.ts)。

重复安装使用递归 cp：已有文件被覆盖，目标里不再属于新版的旧文件仍可能保留。包装 CLI 的 skillCheck 会比较项目目录下已安装的 SKILL.md 与包内版本，发现不一致时提示重跑安装；这项检查只覆盖所列项目目标和主文件，不能扩写为“所有全局目录和全部 references 自动同步”。[skillCheck](https://github.com/microsoft/playwright-cli/blob/b1a5903c5b633b8c9f843ad7b629c2a78437040c/skillCheck.js)。

优点是实现简单且来源与工具配套；局限是选择 agent、处理多目标、用户修改和过期文件管理都很轻。这是 Paneon 可借鉴的资源来源方式，不足以单独解决全部安装体验。

## 两个补充对照

### OpenSkills

它证明“复制安装也能更新”：安装时保存来源元数据，update 据此重新获取，缺失来源信息就跳过并提示重新安装。更新使用先删目标再复制；不会自动把用户修改合并回来。其交互主要面向技能选择，不能误称为 OpenSpec 那样的 agent 选择器。[install](https://github.com/numman-ali/openskills/blob/57d933a4f0d5c8659bd8b285f50fb9554360f0b3/src/commands/install.ts)、[update](https://github.com/numman-ali/openskills/blob/57d933a4f0d5c8659bd8b285f50fb9554360f0b3/src/commands/update.ts)。

它还提供 sync 到 AGENTS.md 的使用模式，Paneon 已按 B36 选择只维护 skill，不应照搬额外 agent 指导文件。

### agent-browser

该快照的内置 skills 子命令是 list/get/path，**没有 install 子命令**。README 仍使用外部 Skills CLI 安装薄入口，再通过运行中的 agent-browser 读取真正的详细指令和 references，使详细指令跟已安装 CLI 配套。[skills.rs](https://github.com/vercel-labs/agent-browser/blob/fd93075e55a21a47fcb36d7433361daa867a0580/cli/src/skills.rs)、[README](https://github.com/vercel-labs/agent-browser/blob/fd93075e55a21a47fcb36d7433361daa867a0580/README.md)。

这是有价值的更新思路，但不能把“内置 skills 命令”误记成“内置 skill 安装器”。Paneon 的 skill 同时含可直接运行的 TSX、shared 模块与 examples，单纯让 agent 运行命令读取一段说明并不能代替这些资源的部署。本次无需新增动态指导协议。

## 临时目录实测记录

### OpenSpec

1. 本机命令自报 1.5.0；运行 init 的终端选择器，搜索/选中 Codex 的交互可用。
2. 这个本机版本的 Codex 命令适配器还尝试写用户级 prompts，受到沙箱 EPERM 拒绝；未开放权限去修改真实用户目录，不把该次结果记为完整安装成功。当前官方 main 的 Codex 目标已改为共享 .agents skill 且不生成这种 prompt，版本需分开看。
3. 换用临时 Claude 项目及 --tools claude --profile core，安装成功：项目内 5 个 skill 和 5 个 command。
4. 给临时 openspec-explore/SKILL.md 增加测试标记，再执行 update --force。第一次遇到旧全局配置迁移写入被拒绝；将该工具支持的 XDG_CONFIG_HOME 指向临时目录后重做，更新成功：测试标记被覆盖，额外 extra-user-file.txt 仍保留。
5. 这只验证本机安装包，不宣称完整执行了官方 main 的全部迁移分支或所有 agent。

### Playwright

调用已有 playwright-core 1.64.1 的实际 CLI 客户端入口，以临时目录为 cwd 执行 install --skills=agents：

```text
Skill installed to .agents/skills/playwright-cli
11 files match the bundled skill; destination is not a symlink.
```

随后修改临时目标的 SKILL.md，并增加 obsolete.tmp，重跑安装。SKILL.md 恢复为包内内容，obsolete.tmp 仍存在，证实是覆盖复制而非完整目录替换。

没有执行全局技能安装、没有写入实际 agent 用户目录；没有把“文件安装成功”当成 agent 已发现/使用技能的证明。

## 给 Paneon 的建议

### 建议交互

提供一个终端初始化入口，例如 paneon init。用户选择使用范围、可多选 agent，然后查看实际写入路径和覆盖摘要再确认。检测结果用于标注/预选，所有支持目标仍可手动选择；不要默认写遍全部已知工具。

Paneon 只有一份产品 skill，第一版无需问“安装哪些技能”。也无需让普通用户先理解符号链接、复制或技能来源仓库。

应同时提供等价非交互参数，让 agent/脚本明确指定目标、范围和 JSON 输出；无 TTY 而参数不完整时给出明确错误。候选示意如下，尚未实现或定稿：

```sh
paneon init
paneon init --tools codex,claude --global --json
```

### 建议工程结构

| 模块             | 责任                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| agent 目标注册表 | ID、显示名、项目/用户路径、检测提示、共享目录去重                    |
| 安装计划         | 从所选范围和目标算出写入内容；交互预览与非交互执行共用               |
| 资源来源         | 始终使用当前 Paneon 包中的完整 skills/paneon，不额外下载另一版 skill |
| 安装执行         | 完整 references/assets、已有文件处理、失败结果及幂等重跑             |
| 安装记录         | 识别 Paneon 管理的内容与修改，给未来同步/更新提供依据                |

复制与中央副本加链接都成立。Paneon 的 TSX 和相对依赖要求完整目录，且用户可改源码；直接链接到可能被清理的 npx 缓存不合适。若采用中央副本加链接，应有稳定安装位置；若采用复制，应明确如何更新每份副本。不要仅因为别人推荐 symlink 就把它当成唯一正确方案。

已有目标若属于其他来源或有用户修改，应明确报告冲突；仅依靠 --yes 表示“允许覆盖所有修改”不是必须照搬的设计。更新还需要处理新版删除的旧文件，不能只保证新文件复制过去。

### 可以直接复用的社区交互库

| 项目                   | 当前代码使用                                               |
| ---------------------- | ---------------------------------------------------------- |
| OpenSpec               | @inquirer/core + @inquirer/prompts；搜索多选另有自定义实现 |
| Vercel Skills          | @clack/prompts；另有自定义搜索多选/通用目标分组            |
| Firecrawl / OpenSkills | @inquirer/prompts 的 checkbox 等控件                       |
| Playwright 安装        | 当前是参数驱动的复制，没有同类选择器                       |

Paneon 可以复用成熟的终端选择组件。第一版常规多选用库自带能力即可；不用为了接近 OpenSpec 自己实现完整 TUI 框架。

### 仍需收敛但本次不要求用户逐项拍板

命令名称、项目/用户范围的默认值、完整目标表、已有副本策略和安装记录的最小结构，应在安装器技术设计中一次收敛。本文没有把上述建议写成用户已确认的结论，也没有把未来 update 提前纳入本次实现。

## 本轮改动文件

- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/research/skill-installation.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/design.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/development.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/tasks.md

## 更新范围与安装记录：后续讨论稿

用户继续询问是否需要保留 agent/安装方式/目标位置，以及更新是否应限定当前 cwd。已检查固定版本的 local-lock.ts、skill-lock.ts、update.ts 与 cli.ts：项目级通过 cwd 的 skills-lock.json 读取来源和内容摘要；普通 agent 没有逐 skill 完整记录原目标列表和方式，更新重新调用 add -y。用户级 lastSelectedAgents 仅是上次交互选择。该版本 check/update/upgrade 进入同一个 runUpdate，不能把 check 描述为纯只读检查。

按用户后续 B41 修正，Paneon 安装/更新元数据统一存放 ~/.paneon。当前讨论稿采用集中保存各范围的安装配置，项目级按 cwd 与已登记的绝对路径精确匹配；撤回记录放项目内的建议。无匹配不自动查父级或切用户级，项目搬家后重新登记。未来 update 的 CLI 升级和该范围 skill 同步分开报告，即使程序已经最新也继续同步该范围。JSON 字段、文件位置和交互演示见 [更新演示说明](../prototypes/skill-update/README.md)。这不是 B40 已确认内容，不视为 update 已获开发授权，也不改变本期范围。

更新的目录动作另核对固定版 installer.ts：普通目录经 cleanAndCreateDirectory 清理重建后复制；createSymlink 对目标正确的现有链接直接返回成功。演示据此区分中央副本更新与保留链接，Copy 模式分别刷新目录；没有执行任何实际清理。

## B42：用户已确认未来更新命令

- paneon update：CLI 升级一次后，同步全部已登记的项目级及用户级 Paneon skill，不依赖 cwd。
- paneon update --project：升级 CLI，只同步 cwd 对应项目。
- paneon update --global：升级 CLI，只同步用户级。

集中记录从 ~/.paneon 读取，沿用每项安装方式；普通目录清理重建、覆盖用户修改并清除历史残留，正确链接保留。已不存在的项目跳过并报告，不重建项目。CLI 已最新仍继续同步 skill。该决定替代先前默认只按 cwd 的建议；历史原型尚未调整默认值。用户本次仅要求记录，不启动 update 实施，也不改变本迭代范围。
