# Skill update scope and installation records

一次性 Paneon 交互说明稿；回应“是否保存 agent / 方式 / 位置，以及本地更新是否只处理 cwd”。未来命令及范围已由 B42 确认，具体 JSON 仍待收敛；用户已明确要求元数据只放 ~/.paneon，不在项目内加文件（B41）。不实现 update，不改动真实安装。

## 最新确认（B42）

| 命令                    | 行为                                  |
| ----------------------- | ------------------------------------- |
| paneon update           | 升级 CLI，同步全部已登记 skill        |
| paneon update --project | 升级 CLI，只同步 cwd 对应项目的 skill |
| paneon update --global  | 升级 CLI，只同步用户级 skill          |

默认全部更新，不按 cwd 筛选；显式 --project 才匹配 cwd。普通目录清理重建并覆盖用户修改，正确链接保留；项目目录不存在时跳过并报告，不重建项目。即使 CLI 已是最新仍同步 skill。未来 update 不在本迭代实施范围。

当前可运行页面仍保留此前默认按 cwd 的原型，用于解释集中记录、目录清理和链接；尚未同步 B42 的默认全部更新，不可将原型旧默认当作最终契约。本次只按用户要求记录决定。

## 原型所示规则（历史，默认已由 B42 覆盖）

保存安装记录与按 cwd 限定范围同时采用：记录决定“原来怎么装”，cwd / --global 决定“本次管哪里”。

- 元数据统一存放 ~/.paneon/skill-installations.json（文件名示意），集中保存 project/global 安装条目。项目级用规范化的 cwd 绝对路径精确匹配 projectPath；不扫描其他项目、不向上查找父目录，也不自动转成用户级。子目录无匹配时提示回安装目录；新目录需要安装时走 init。
- --global 从同一集中文件中匹配 scope=global，与 cwd 无关；不顺便同步项目资源。
- 集中文件记录 schemaVersion，各安装条目保存 scope、项目级 projectPath、成功安装时的 paneonVersion、agents、method、实际 targets。项目级目标相对 projectPath；全局目标相对用户主目录。链接 target 也以该根为基准，不是最终传给 symlink 的原始相对字符串。
- 沿用记录的 agent 和安装方式，不重新检测并给其他 agent 增添安装。链接模式同步中央副本并维持链接；复制模式同步各目录。只有成功后才更新版本记录。
- 未来统一 update 可先检查/升级 CLI，再同步本次范围；CLI 已最新也继续检查 skill。没有当前范围记录时只报告未同步，不猜测目录归属。当前示意中程序可完成升级而 skill 未同步，页面明确区分两步结果。
- 按 B41 撤回此前“记录放项目内、不保留项目清单”的建议。集中记录现在保存各项目安装路径；项目搬家后需要在新目录 init 重新登记，不做自动扫描或路径追踪。记录位置已明确，文件名/结构和更新规则仍待对焦；不变更 B40 的交互或本期不实现 update 的范围。

Vercel 固定版本的项目锁文件包含来源与内容摘要；普通 agent 没有逐 skill 完整保存安装列表/方式，更新调用 add -y。Global 的 lastSelectedAgents 是上一次选择，不是每份 skill 的目标清单。因此本页“保留安装配置后复用”是 Paneon 建议，不宣称原样复制参考实现。来源：[local-lock.ts](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/local-lock.ts)、[skill-lock.ts](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/skill-lock.ts)、[update.ts](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/update.ts)。

## 清理与复制

参考固定版本 [installer.ts](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/installer.ts) 的 cleanAndCreateDirectory 和 createSymlink：

- 普通安装目录：清理并重建该 paneon 目录，然后复制全部新版内容，避免残留上版已删除的文件。
- Symlink 模式：更新中央目录 .agents/skills/paneon；.claude/skills/paneon 已正确指向它则保留链接，缺失或指向改变时才修复。
- Copy 模式：分别清理、复制各安装目录，相同实际路径去重。
- 清理只限目标 paneon 目录；不清理整个 skills 父目录或其他 skill，也不将正确链接按普通目录重复清理。只有同步成功后才更新记录；不将清理复制描述成原子替换。

## 历史原型体验

默认模拟版本为 1.0.0，可用版本 1.1.0，仅用于说明：

1. 在项目 A 执行，A 的 skill 和 CLI 改为 1.1.0，B 与用户级仍为 1.0.0。
2. 切到项目 B 执行，即使 CLI 已是最新，B 的 Copy 副本仍继续同步。
3. 选择 Global，只同步用户级。
4. 选择 A/src 或新目录，展示无记录及具体提示，不写入其他范围。

运行：

```sh
node dist/cli/index.js panel run openspec/changes/add-paneon-skill-panels/prototypes/skill-update/panel.tsx --cwd "$PWD" --params '{}' --json
```

已通过专用类型检查、ESLint、格式及真实 Chrome 验证：项目/用户级范围隔离、CLI 已最新仍同步旧项目、子目录及新目录无记录不转移范围、390px 布局和无页面错误。主 agent 查看了渲染截图。没有执行真实包升级、skill 安装或记录写入。
