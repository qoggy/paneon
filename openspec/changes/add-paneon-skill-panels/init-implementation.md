# paneon init implementation contract

用户已授权实现 init，采用 distributed-development；本次只做任务 2.13，不实现 B42 的 update 命令，不自动升级 npm 程序。B40/B41 已确认的交互与元数据规则是依据。主 agent 验收后本地集成、提交及清理 worktree，不推送或发布。

## Command and behavior

```sh
paneon init
paneon init --agent codex claude-code --project --yes --json
paneon init --agent codex claude-code --global --copy --yes --json
```

- --agent <agents...> 使用参考项目 ID，显式列表不自动加上其他非指定 agent；交互中 Universal 组固定选中。--project 与 --global 互斥，默认当前 cwd 项目级；不增加用户可改 PANEON_HOME 的选项。
- --copy 指定完整复制；默认多目标目录推荐 symlink，共享同一目录时直接 copy。--yes 跳过询问，使用已明确参数及默认 Project / 推荐方式；未指定 agent 时只选择 Universal 加检测到的 agent，不凭 --yes 写遍所有非通用工具。
- --json 按现有 {ok,data}/{ok:false,error} 输出，stdout 不混交互提示；--debug 只写 stderr。JSON 模式或无 TTY 时不进入交互，没有 --yes 时返回 NON_INTERACTIVE_INPUT_REQUIRED，提示显式参数与 --yes。未知 agent / 冲突参数在写入前失败。TTY 正常流程依次选择 agents、scope、必要的 method、summary 和 confirm。取消退出成功、不写文件。
- 提示使用已核对的 Vercel Skills 原文：Which agents do you want to install to? / Installation scope / Project / Global / Installation method / Symlink (Recommended) / Copy to all agents / Installation Summary / overwrites: / Proceed with installation?。使用 @clack/prompts 1.8.1，不自建 TUI。固定 Universal 组可用 note 加其余目标 multiselect 表达，不强求复制通用市场的全部选择器实现。
- 只安装当前包的 skills/paneon 完整目录。单一技能不问技能来源和技能列表，不下载技能，不启动运行服务、不初始化 npm 项目。

## Target registry

首批支持实际常见工具：codex、cursor、claude-code、opencode、gemini-cli、github-copilot、cline、windsurf、qwen-code、kiro-cli、roo。注册表可扩展；不得将原型的三个目标当作完整名单。

路径/探测依据固定官方源码 a80e4c9d12d607631249d4d7d059f835d4b2f13a 的 src/agents.ts 与 src/installer.ts，保留适用许可证/来源记录。Universal 按 skillsDir=.agents/skills 判定，这些工具在两种 scope 下使用中央 .agents/skills；其他目标按官方目录与环境变量解析（如 CLAUDE_CONFIG_DIR、XDG_CONFIG_HOME）。检测只辅助预选，不证明 agent 安装或加载成功，不执行各工具二进制。

与先前原型一致：显式选中的非通用工具，即使项目配置根原先不存在，也安装到已选择的目标目录；不静默跳过用户明确选的 agent。交互中共享目录只写一次。

## Installation and records

- Symlink 模式：完整复制到 <project-or-user-home>/.agents/skills/paneon，再为非通用目标建立链接；目标指向稳定中央副本，不能链接 node_modules / npx 缓存。Copy 模式完整复制到每个实际不同的目标。
- 先根据实际路径去重，包含父目录本身为链接的情况。只清理 paneon 目标目录，不能删父 skills 目录或其他技能。已有内容在 summary 标记覆盖，由确认或 --yes 授权；普通目录清理重建，覆盖本地修改、清除旧文件；相同目标的正确链接保留。不增加自定义备份/合并/冲突判断流程。
- 路径从可信注册表与选择计算，校验目标和包内来源不重叠（包括父路径别名），防止清理来源。源目录缺失、非法记录、路径验证失败应在破坏性写入前报告；不得静默把未知数据覆盖成空记录。计划必须先完成，执行不使用 shell 拼接。
- 元数据只能放固定 ~/.paneon/skill-installations.json，不向项目写 .paneon 元数据。文件为 {schemaVersion:1, installations:[...]}。条目保存 scope、projectPath（仅项目级、规范化绝对路径）、paneonVersion、agents、method、targets；targets 保存 path/kind/可选 target，相对项目根或用户主目录。物理路径解析用于安装及去重，注册记录保留稳定身份。
- 同一 scope/projectPath 重装更新该条目，其他条目保留；记录实际安装方式/实际目标，不能在链接失败时伪报链接成功。使用临时文件+rename 写元数据，防止截断；并发写入需保护 read-modify-write，不得丢失另一个项目记录。只在该次同步成功后更新成功版本，失败提供真实结果，不宣称自动回滚。
- 不改变正在运行的 Paneon runtime.json / SQLite，不把安装当成 runtime task。

## Shared internal API (owned by installer agent)

文件 src/cli/skill-install/index.ts。CLI 组依此实现，类型可在该目录分文件但统一从 index 导出；不要新增假实现到另一组目录。

```ts
type InstallScope = 'project' | 'global';
type InstallMethod = 'symlink' | 'copy';
type InstallEnvironment = {
  cwd: string;
  homeDir: string;
  paneonHome: string;
  packageRoot: string;
  packageVersion: string;
  env: Record<string, string | undefined>;
};
type SkillAgent = {
  id: string;
  displayName: string;
  universal: boolean;
  detected: boolean;
};
type InstallRequest = { agents: string[]; scope: InstallScope; method?: InstallMethod };
type InstallTarget = {
  path: string; // actual absolute path, used for summary and execution
  kind: 'directory' | 'symlink';
  target?: string; // absolute central path for link
  agents: string[];
  exists: boolean; // includes broken links
};
type InstallPlan = {
  scope: InstallScope;
  projectPath?: string;
  method: InstallMethod; // effective method after shared-dir normalization
  agents: string[];
  paneonVersion: string;
  sourcePath: string;
  recordPath: string;
  targets: InstallTarget[];
};
type InstallResult = {
  scope: InstallScope;
  projectPath?: string;
  method: InstallMethod;
  paneonVersion: string;
  recordPath: string;
  targets: {
    path: string;
    kind: 'directory' | 'symlink';
    target?: string;
    status: 'installed' | 'linked';
  }[];
};
function createInstallEnvironment(): InstallEnvironment;
function listSkillAgents(environment: InstallEnvironment): Promise<SkillAgent[]>;
function createInstallPlan(
  request: InstallRequest,
  environment: InstallEnvironment,
): Promise<InstallPlan>;
function executeInstallPlan(
  plan: InstallPlan,
  environment: InstallEnvironment,
): Promise<InstallResult>;
```

createInstallEnvironment 默认使用 process.cwd / os.homedir 与 shared/paths 的包根、版本和固定 PANEON_HOME；测试可显式传环境对象，生产不暴露 home 覆盖开关。createInstallPlan 只读并归一化目录/路径/方式；不写目录。execute 需防止把来自外部或过期的 plan 直接当可信任删除指令，执行前核对路径/来源；错误用现有 PaneonError 或 code/message/details 兼容结构。

CLI init.ts 导出 runInit(options)，返回 InstallResult 或 {cancelled:true}；index.ts 沿用 execute 输出封装。考虑 source CLI 直接 node src/cli/index.ts 的现有支持，采用与 client() 相同的动态 dist 模块选择，不能顶层 import 新的仅 .js 文件导致 source --help 失败。

## Ownership and acceptance

| Unit           | Exclusive files                                                                                                                                                                                                | Delivery                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| init-installer | src/cli/skill-install/**, tests/skill-install.test.ts, reports/init-installer.md                                                                                                                               | registry, plan/execute, complete copying/linking/central metadata and regression tests   |
| init-cli       | src/cli/index.ts, src/cli/init.ts, package.json/package-lock.json, README.md, skills/paneon/SKILL.md, skills/paneon/references/cli.md, tests/init-cli.test.ts, tests/init-interactive.mjs, reports/init-cli.md | real terminal flow, flags, JSON/debug/cancel, help, docs, independent package/PTY checks |

两组从同一文档基线启动，互不改文件；不得并发修改中央 design/tasks/development 或项目 memory。接口冲突直接通知主 agent/对方；可以从对方 worktree 只读查看进度，但不改它或把其提交混入自己的交付。接口依赖尚未在本 worktree 落地时报告验证限制，不用 stub 伪造验收。需要组合验证可在独立临时目录按双方交付组合；不在主分支合入。

验收包括：临时项目与临时 home 下的 Project/Global、共享路径、链接/复制、正确链接保留、内容覆盖与旧 references 删除、路径别名/来源重叠/其他技能保留、失败不伪报成功/不截断记录、记录多项目合并及并发；source/built CLI help、非交互参数/JSON/error、真实 PTY 选择/确认/取消；真实 npm pack 后独立安装，完整 skill 可运行，无需手工搬资源。所有安装验证只用临时路径/内部注入上下文，不写实际个人 agent 目录，不执行全局 npm 安装。主 agent 做最终组合验收后勾任务并集成；未授权不推送。

## Implementation status

已交付并通过主 agent 的源码测试和最终独立 npm 安装包验收，包含5个真实PTY场景。安装只在测试临时home/project执行，没有改用户现有agent目录。最终命令/返回值见CLI帮助及唯一产品skill的references/cli.md；完整记录见verification.md。update仍不在本次实现范围。
