# Skill installation preview

这是一次性 Paneon 安装流程演示，不是实际安装器或标准面板，不写入 agent 目录，不发送反馈事件。

## 确认状态

用户已体验并采纳当前交互（B40）。本文件记录定稿交互，CLI 安装器仍未实现，开发由任务 2.13 跟踪。

## 当前依据

用户要求“参考成熟项目的做法，文案也一样，先抄，不够再加”（B39）。因此以 [Vercel Skills add.ts](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/add.ts) 的固定版本为流程和英文文案依据，目录关系另核对同版本 [installer.ts](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/installer.ts)。原“默认用户级、直接复制、备份及冲突分类”的自定义建议已撤回。

1. Which agents do you want to install to?：按参考实现展示固定选中的 Universal 目标和可选其他 agent。
2. Installation scope：Project 为默认，Global 可选；两项说明沿用原文。
3. Installation method：不同目标目录时显示，推荐 Symlink，同时可选 Copy to all agents；所有目标共享目录则跳过，直接复制。
4. Installation Summary：显示中央目录和 universal / symlink / copy 关系；已有安装标记 overwrites。
5. Proceed with installation?：统一确认，Yes 覆盖所列已有安装，No 取消。没有额外备份、内容摘要冲突判断或自动合并流程。

Paneon 的必要差异：只有 CLI 包内的一份完整 skill，因此省去技能来源下载和技能挑选。中央目录使用项目或用户的 .agents/skills/paneon，不链接到 node_modules / npx 缓存。非交互参数沿用参考项目的 --agent、--global、--copy、--yes 等语义；演示命令尚未实现。

本页只展示 Codex、Cursor、Claude Code 作为固定参考注册表的子集。它不代表最终支持名单，也不模拟工具探测、搜索和上次选择恢复的全部实现。网页 Back/Next 只是体验终端提示的导航。正式实现仍须核对各工具路径与环境变量。CLI 安装器 2.13 尚未开工，update 不在本期范围。

英文提示取自 Vercel Skills（MIT），只替换产品名及必要内容；来源仓库许可见 [LICENSE](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/LICENSE)。

## 运行

在仓库根目录：

```sh
node dist/cli/index.js panel run openspec/changes/add-paneon-skill-panels/prototypes/skill-installation/panel.tsx --cwd "$PWD" --params '{}' --json
```

使用返回的 URL 打开。原实例开启 watch，源码保存后更新。

## 验证

专用 tsconfig、ESLint、格式校验；Chrome 核对 Project 默认、共享目录跳过方式选择、跨目录默认 Symlink、Global / Copy 切换、overwrites 汇总和 Yes / No，以及手机布局。页面不执行实际安装。
