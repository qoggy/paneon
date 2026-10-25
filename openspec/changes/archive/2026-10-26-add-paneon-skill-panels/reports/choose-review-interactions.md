# 选择页详情与汇总交互验收

2026-10-23。在独立 worktree `/Users/yuguo/.codex/worktrees/choose-review-interactions/paneon` 完成；基于 `5070397e42833843530eb5810cb7b2b7f612feec`。实施完成后由主 agent 在当前工作区独立验收并整合；未 push、未更新已安装 skill、未操作用户现有实例。

## 实现

- 同一详情按钮再次点击会关闭；点击另一选项切换详情。按钮的打开/关闭名称、`aria-expanded` 和 `aria-controls` 同步状态。保留宽屏侧栏、窄屏 Dialog、Escape 和关闭后的焦点返回。
- 问卷说明使用现有 Markdown 默认展示在紧凑标题/进度行下方，在题目和汇总均可阅读；没有 Popover、截断或行数限制。题目标题和题目专属说明保留。
- 用原 `answerSchema(question).safeParse(answer)` 派生每题完整性。汇总所有无效行同时显示图标、明确的「待完善」文字和主题错误色背景；已选选项及其说明仍显示。选中了空白 Other 也算无效。
- 无效提交只在汇总显示未完成数量，并把焦点移到该页的错误信息；不跳题、不产生事件。有效提交仍使用原 `completeAnswersSchema` 和共享 `useSubmission`，保留锁定、保存失败留稿与完整更正的 `replacesEventId`。
- 每一行都是原生按钮，鼠标、Enter 和 Space 可直达对应题目；进入汇总后题目操作区提供「返回汇总」。Previous/Next 继续自由导航；跳转、返回、详情开关均不改草稿或产生事件。
- 新交互文案新增中英文翻译；没有改 schema、SDK、公共 UI、runtime、依赖或批注术语。

## 验证

所有构建产物均在该 worktree 的 `dist/`，复用主仓库现有依赖的只读 symlink；浏览器 fixture 会复制本 worktree 的 skill 到独立临时目录并启动独立端口。没有注入业务 store，也没有添加失败重试或延长超时。

通过的命令：

```bash
npm run build
npm run typecheck
npm run lint
node_modules/.bin/prettier --check skills/paneon/assets/panels/choose/panel.tsx skills/paneon/assets/shared/locales/en.ts skills/paneon/assets/shared/locales/zh-CN.ts tests/browser/skill-pages.mjs tests/browser/choose-review-interactions.mjs
PANEON_TEST_ARTIFACTS=/private/tmp/choose-review-interactions-evidence/skill-pages node tests/browser/skill-pages.mjs
PANEON_TEST_ARTIFACTS=/private/tmp/choose-review-interactions-evidence/focused node tests/browser/choose-review-interactions.mjs
git diff --check
```

- build 包含 CLI/UI 构建、完整类型检查、Web 构建；最终小改动后另跑 typecheck 通过。
- lint 为 0 error、15 条已有的非空断言 warning，位于 compiler 和原有测试；本次文件没有 lint warning。
- 原 `skill-pages.mjs` 的旧 Popover 和无效提交跳题断言已替换为新行为断言，保留三题、独立选项说明、自填草稿、自由导航、长 Markdown、无说明、触控、宽/窄详情、提交锁定/事件、保存失败、更正、新一轮隔离及全部 form 覆盖。
- 新 `choose-review-interactions.mjs` 覆盖详情重复关闭/切换、显式关闭/Escape、移动 Dialog、详情不改答案、已答/未答/空白 Other 混合汇总、无效提交不离开汇总/不发事件、第一/中间/最后一行键盘跳题、直接返回、各题草稿和说明保留、四种主题语言组合各两个宽度无横向溢出、一次明确提交的完整 payload。
- 开发中精确文本断言暴露图标和状态文字共用节点的问题，现为独立文字节点；新增键盘焦点测试曾在产品预定的下一动画帧前断言，现同步下一帧验证，没有增加重试或任意等待。最终两套浏览器测试通过。

日志：`/private/tmp/choose-review-build.log`、`/private/tmp/choose-review-final-typecheck.log`、`/private/tmp/choose-review-lint.log`、`/private/tmp/choose-review-format.log`、`/private/tmp/choose-review-skill-pages.log`、`/private/tmp/choose-review-focused.log`。

## 截图证据

截图根目录：`/private/tmp/choose-review-interactions-evidence/`。

重点证据：

- `skill-pages/choose-desktop.png`：紧凑题头和首屏可见说明。
- `skill-pages/choose-details-desktop.png`、`skill-pages/choose-details-mobile.png`：宽屏侧栏和窄屏 Dialog。
- `skill-pages/choose-long-header-desktop.png`、`skill-pages/choose-long-header-mobile.png`、`skill-pages/choose-long-description-1280.png`、`skill-pages/choose-long-description-390.png`：长标题、长说明、题目专属说明和窄屏换行。
- `focused/return-to-summary-en-390.png`：从汇总进入题目后的直接返回入口与保留的草稿/说明。
- `focused/summary-{light,dark}-{en,zh-CN}-{1280,390}.png`：共 8 张实际截图；同一混合草稿在无效提交后保持汇总，全部未完成行有状态图标和文字，展示两种主题、两种语言、两种布局。
- `skill-pages/choose-review-desktop.png`、`skill-pages/choose-review-mobile.png`：完整答案汇总。

实施 agent 已实际打开查看英文亮色桌面问卷、英文亮色桌面无效汇总、中文暗色 390px 无效汇总和亮色移动详情截图；其余矩阵截图由通过的真实浏览器断言产生，等待主 agent 独立复核。

## 已知边界与交付

- 长说明完整展开会增加页面纵向长度，这是保留完整内容的结果；题头字号和间距仍保持紧凑，没有恢复冗余指引。
- 移动端详情沿用模态 Dialog，打开时底层选项按钮不可操作；可使用 Dialog 关闭按钮或 Escape。宽屏同项切换和跨项切换已覆盖。
- 本次未运行所有单元/集成测试；执行了完整构建、类型/lint/格式检查和与变更直接相关的两套真实浏览器回归。
- 主工作区仍有未提交的批注术语和 runtime 等变更，本 worktree 未复制或纳入这些改动；合并时仅应用本次增量，保留主工作区命名。
- 下一步由主 agent 独立验收后整合并处理 managed worktree；实施 agent 不合入、不 push、不归档。

改动文件：

- `skills/paneon/assets/panels/choose/panel.tsx`
- `skills/paneon/assets/shared/locales/en.ts`
- `skills/paneon/assets/shared/locales/zh-CN.ts`
- `tests/browser/skill-pages.mjs`
- `tests/browser/choose-review-interactions.mjs`
- `openspec/changes/add-paneon-skill-panels/reports/choose-review-interactions.md`

## 主 agent 独立验收

当前工作区已整合本次增量，并保留原有未提交的批注术语和 runtime 修改。主 agent 阅读了完整实现差异、测试变更和截图，未发现需要返工的问题。额外同步选择页使用指南和规范，移除说明 Popover 与最终校验自动跳题的旧描述。

独立执行通过：

- `npm run typecheck`：`/tmp/paneon-choose-review-root-typecheck.log`。
- 5 个变更源码/测试文件 ESLint：`/tmp/paneon-choose-review-root-lint.log`，无错误和警告。
- 变更文件 Prettier 检查、`git diff --check`。
- 新专项真实浏览器：`/tmp/paneon-choose-review-root-focused.log`，详情切换、汇总原地校验、全行键盘导航、草稿、返回汇总、主题/语言/宽窄矩阵与唯一完整提交均通过。
- 原完整选择/表单回归：`/tmp/paneon-choose-review-root-skill-pages-isolated.log`，草稿、原文、锁定、失败保留、完整更正及 CLI events/ack 均通过。

首次并行验收中的完整回归在 fixture 启动时触发 `Panel metadata evaluation timed out.`，未进入浏览器断言；日志为 `/tmp/paneon-choose-review-root-skill-pages.log`。确认是 compiler 的 15 秒 metadata 求值等待失败；未证实具体负载根因。其他验收结束后，单独执行同一未修改命令通过；未调整超时、增加测试重试或改动 compiler。此记录不将首次失败描述为通过，也不声称解决了 compiler 的偶发超时。

独立截图：`/private/tmp/paneon-choose-review-root/`。主 agent 实际查看了 `focused/summary-dark-zh-CN-390.png`、`focused/return-to-summary-en-390.png` 和 `skill-pages/choose-details-desktop.png`；未完成状态明显，移动布局无溢出，按钮和侧栏状态与设计一致。验收通过。

本任务已在当前分支本地提交，提交信息为 `fix(choose): keep review navigation and validation in context`，未 push。managed-worktree 归档工具返回 `queued`，尚未确认物理移除。除原先列出的 6 个实施文件，主 agent 还同步了以下文件：

- `openspec/changes/add-paneon-skill-panels/choose-review-interactions.md`
- `openspec/changes/add-paneon-skill-panels/design.md`
- `openspec/changes/add-paneon-skill-panels/specs/guided-choice-panel/spec.md`
- `skills/paneon/references/choose.md`

共 10 个任务文件；其他既有未提交修改未纳入提交。
