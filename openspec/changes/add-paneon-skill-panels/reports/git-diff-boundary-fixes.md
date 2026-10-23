# Git Diff 差异导航与批注边界修复验收

## 结果

已修复两处问题，并同步到用户指定的当前页面：

`http://127.0.0.1:60809/panels/instance-7af61ec5-c4e8-4dae-945b-4f6b40f63290`

来源为 `/Users/yuguo/IdeaProjects/x1/x1` 的 `eeff5b06fcc10b25284cf9b82dcc7c0d80aea0e9`，文件为 `lib/workflow/observability/prompts/analyze-session-worker.md`。本次没有修改来源仓库，没有提交 Git commit。

## 根因与修复

### 两处改动只计为一处

原始 Git 补丁只有一个包含上下文的 hunk，但内部有两段独立改动：新增 82 行，以及相隔四行未修改内容后的两行替换。文件内容没有丢失；工具栏错误地将合并后的上下文窗口数用作差异数，导航也依赖窗口位置。

现在以连续修改行为导航单位：相邻删除与新增构成一处替换，未修改行分隔不同改动。上下文窗口继续用于展示，计数和导航分别定位新增侧第 29 行、第 115 行。单双列切换与展开、收起上下文均保留当前差异。

### 批注编号跑出 Diff 区域

批注文字高亮原本裁剪到了滚动区域，但编号没有保留同一裁剪边界。编号向上偏移和碰撞避让只考虑整个窗口，可能越过滚动边界或吸顶标题。此外，通用 Button 的 transition-all 会让编号坐标在滚动后继续缓动，短时间留在旧位置。

现在保留来源对应的有效可视边界，扣除吸顶标题遮挡，完整编号只能放在该区域内。碰撞避让也遵守同一边界；空间无法容纳完整编号时不绘制该编号，批注仍保留在批注列表。编号和浮动操作按钮仅过渡颜色，不对位置应用动画。批注数据结构、正文和提交事件保持不变。

## 验证

- TypeScript 类型检查、定向 ESLint、Prettier 和 git diff --check 通过。
- diff-changes、git-review、feedback-state、feedback 单元测试共 21 项通过。
- 新增 diff-boundaries 浏览器回归通过：同一上下文 hunk 内两处改动、导航、单双列、上下文切换，以及一个批注对应多个目标时的滚动边界、吸顶标题、明暗主题和窄屏。
- 原有 feedback、diff-toolbar、diff-reading 浏览器测试通过，覆盖选择、编辑、撤销、提交失败、批注定位、分隔线、上下文和 Command+A。
- 修复前的几何诊断复现编号顶部 229.95 小于标题底部 239；修复后的边界断言全部通过。
- 当前实际页面已观察到并点击进入 `2 / 2 differences`。真实页面当前标签未重建旧批注草稿；批注几何由隔离浏览器回归验证，未在用户页面创建测试批注。

本地验证记录：

- `/tmp/paneon-diff-bugs-unit.log`
- `/tmp/paneon-diff-boundaries-fixed.log`
- `/tmp/paneon-diff-bugs-feedback.log`
- `/tmp/paneon-diff-bugs-toolbar.log`
- `/tmp/paneon-diff-bugs-reading.log`
- `/tmp/paneon-diff-boundaries-fixed/markers-light.png`
- `/tmp/paneon-diff-boundaries-fixed/markers-dark.png`
- `/tmp/paneon-diff-boundaries-fixed/markers-narrow.png`

## 应用与备份

当前 CLI 和运行进程来自本仓库，UI 已重新构建。安装的 skill 副本中两个文件与修复前基线一致，确认无独立改动后备份并同步。页面自动构建的 revision 从 `e57ce77f…` 更新为 `b9a264aa…`，状态 running。

同步前后读取的两条已保存事件完全一致；没有 ack 或提交事件。旧文件、面板元数据与已保存事件备份位于 `/tmp/paneon-diff-installed-backup/`。该目录是本机临时备份，不是持久归档，也不包含其他浏览器中的未提交草稿。

实际页面验收截图：`/tmp/paneon-diff-installed-backup/current-page-fixed.png`。

## 本次改动文件

下列文件包含本次修复；其中已有的其他任务改动保持原样：

- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/shared/diff-model.ts`
- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/assets/shared/diff.tsx`
- `/Users/yuguo/IdeaProjects/paneon/src/ui/feedback-geometry.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/ui/feedback-store.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/ui/feedback-surface.tsx`
- `/Users/yuguo/IdeaProjects/paneon/tests/diff-changes.test.ts`
- `/Users/yuguo/IdeaProjects/paneon/tests/browser/diff-boundaries-fixture.txt`
- `/Users/yuguo/IdeaProjects/paneon/tests/browser/diff-boundaries.mjs`
- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/references/git-review.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/specs/paneon-agent-skill/spec.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/reports/git-diff-boundary-fixes.md`

同步的安装副本文件：

- `/Users/yuguo/.agents/skills/paneon/assets/shared/diff-model.ts`
- `/Users/yuguo/.agents/skills/paneon/assets/shared/diff.tsx`

重新生成的构建产物位于 `/Users/yuguo/IdeaProjects/paneon/dist/ui/`，由 build:ui 管理，未纳入本次源码文件清单。
