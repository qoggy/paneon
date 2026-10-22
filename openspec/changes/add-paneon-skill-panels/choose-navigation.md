# B61 — Browse questions without mandatory answers

## Problem and accepted behavior

用户反馈：当前 Next 在 `ChoosePanel.next()` 中调用 `validate(index)`，未作答便显示错误并阻止查看下一题。用户明确要求放松这一限制并派一个 subagent 处理。

前后翻题只做浏览，不要求先作答。所有问题的 Next 均不校验；最后一题也允许 Next 进入独立 Review all answers，汇总如实显示未作答。最终 Submit all answers 仍校验完整结果；发现缺失或无效答案时回到第一道问题、显示清晰错误并聚焦题目，不发送事件、不丢任何草稿。离开错误题目浏览时清除旧错误，不能把上一题错误带到下一题。

本节覆盖 B50 的“进入汇总前校验最后一题”以及旧指导中的“Next validates”。不改输入/答案 schema、必填语义、事件或提交限制，不新增跳题菜单或页面重设计。保留自填、多选及每选项说明、详情关闭/焦点、独立汇总、失败保留和更正重提。

## Ownership and baseline

一个独立 worktree/subagent。主 checkout 的选择页 B47–B50 布局及回归尚未提交，因此 worktree 从最新 HEAD 创建后，先移植当前选择页 panel、choose reference、skill-pages browser fixture、choose-layout.md 及本文为隔离基线。记录该基线 SHA，交付仅包含其后的 B61 增量；不得整合基线或触碰 host、CLI、Git 页面及其他未提交文件。

## Tasks and acceptance

- [x] 移除 Next 作答校验，清理翻题后的过期错误，保留最终提交完整校验。
- [x] 同步 choose 指导和现有浏览器断言，覆盖未填首题到下一题、未填末题到汇总、自由往返草稿保留、未完成汇总点击提交回到正确题目且零事件。
- [x] 验证空自填/无效答案浏览不阻塞但提交仍拒绝，补全后正常提交，更正/失败草稿及全部既有 form 回归保留。
- [x] build/typecheck、相关单测/lint/format、真实 Chrome choose/form；截图桌面/390px，交付纯任务 SHA、基线和日志，主 agent 后续验收集成。

## Subagent delivery evidence (2026-10-22)

- Isolation baseline: `354f65d5b760ede570ad238eb5dc71145a14810c`. Only the subsequent B61 delta is intended for integration.
- `next()` no longer calls answer validation; changing questions clears old validation errors. Final initial/corrected submission still validates the complete set and locates/focuses the first invalid question without emitting an event.
- Full build (including typecheck): `/tmp/paneon-b61-build.log`.
- Choice/form schema tests: 6/6, `/tmp/paneon-b61-unit.log`.
- Scoped ESLint and Prettier: `/tmp/paneon-b61-lint.log`, `/tmp/paneon-b61-format.log`.
- Real Chrome complete choice/form browser suite: `/tmp/paneon-b61-browser.log`. Includes unanswered first/last question browsing, 0/3 summary, invalid custom answer browsing with accurate answered count, final validation focus and zero events, repeated navigation with fixed/custom/per-option drafts, invalid correction after a saved receipt, pending/failed saves, normal corrected events, and all existing form assertions.
- Desktop/390px screenshots visually inspected: `/tmp/paneon-b61-artifacts/choose-unanswered-review-desktop.png`, `/tmp/paneon-b61-artifacts/choose-unanswered-review-mobile.png`. The compact independent summary remains intact and missing answers are displayed explicitly.
- `choose-layout.md` B50 wording updated to defer validation to final submission; the parent agent owns synchronization of shared design/spec/tasks/verification and final integration acceptance.

## B61 parent acceptance

主 agent 已检查 next/changeQuestion 增量并在最终工作区及独立安装包中复验：未答可前后浏览、末题进入独立汇总；仅最终提交定位首道无效题，未答不发事件，草稿/更正保留。

统一验收证据见 verification.md 的 B61–B65 主验收章节。
