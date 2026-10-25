# UI preferences verification

## Delivery boundary

Implementation is in `/Users/yuguo/.codex/worktrees/ui-theme-language/paneon`.
HEAD remains `cb0e4694cec0e41086f4113a49e7f193ca7b270f`. No commit, push, merge,
main-checkout edit, or worktree deletion was performed.

The baseline is HEAD plus the 12 transplanted files recorded in
`/tmp/paneon-ui-preferences-dispatch-baseline/manifest.json`. Delivery lists and
patches compare against that combined baseline, so inherited host/guidance drafts
are not counted as new implementation. `docs/memory/ui-default-styling.md` remains
byte-for-byte at its transplanted baseline.

All runtime/configuration tests used temporary homes. No test read or wrote the
real user's `~/.paneon/config.json`.

## Implemented behavior

- Shared light/en defaults; atomically merged `~/.paneon/config.json`, preserving unknown keys; GET/POST and a complete-snapshot WebSocket stream reuse existing Host/origin/control-token policy and connection cleanup.
- Source and built `config get/set`, home Settings, server-rendered initial theme/lang attributes, and independent iframe UI bridge messages. Preferences never enter params, source hashes, or business event schemas.
- Compiler-owned UIProvider subscription preserves component/iframe identity. Typed public and skill dictionaries localize owned defaults, accessible labels, validation summaries and already-visible receipts. Original user/author text and external errors stay unchanged; an external error literally equal to `Save` is explicitly tested in both languages.
- Scoped upstream GitHub Markdown light/dark styles; Shiki dual-theme token styles with unchanged Text node identity; Mermaid theme redraw; themed Diff/Git colors. Git/PR display metadata is outside source IDs/hashes.
- Standard choose/form/table/review/Git/PR controls and teaching-example operations use the environment language. Dates and numeric template parameters use Intl; fixed teaching prose/data and external Git/PR state codes remain original.

## Quantified theme-switch correction

Visual inspection exposed a real low-contrast transition, rather than a permanent
palette defect. Before the fix, the sampled first dark frame at 9ms had 1:1
foreground/background contrast. Table cells first reached 4.5:1 at 69ms and the
nested header controls at 218ms. Data: `/tmp/paneon-ui-transition-before.json`.

`applyUI` now temporarily disables transitions only for an actual palette change,
flushes the new palette, and restores normal transitions after two animation
frames. Language-only updates do not trigger this treatment. The regression
samples 45 frames in each direction: all 90 frames have a minimum contrast of
18.968:1, the temporary attribute is removed, and the control's original `0.15s`
transition is restored. This is a product fix; waiting for animations is used only
to capture settled screenshots.

Evidence: `tests/browser/preferences-transition.mjs`,
`/tmp/paneon-ui-browser-transition.log`, and
`/tmp/paneon-ui-preferences-evidence/transition-after.json`.

## Checks

<!-- prettier-ignore -->
| Check | Result | Evidence |
| --- | --- | --- |
| Full build, CLI/UI declarations, typecheck and web assets | Passed | `/tmp/paneon-ui-build.log` |
| Full unit suite, bounded concurrency 2 | 156/156 passed | `/tmp/paneon-ui-all-unit.log` |
| Final preference/CLI/file-tree focused suite | 9/9 passed | `/tmp/paneon-ui-final-focused-unit.log` |
| Scoped lint | 0 errors; one pre-existing compiler non-null warning at line 148 | `/tmp/paneon-ui-lint.log` |
| Task-file formatting and diff whitespace | Passed | `/tmp/paneon-ui-format.log`; `git diff --check` |
| Independent installed npm tarball | Passed public declarations/exports, both skill dictionaries, config save and actual Chrome standard-page load | `/tmp/paneon-ui-pack.log`; `tests/preferences-pack.mjs` |

## Real Chrome checks

<!-- prettier-ignore -->
| Flow | Verified result | Evidence |
| --- | --- | --- |
| Four combinations, home/choose/form/custom UI | Same iframe and CodeBlock Text node; current answer and form draft; saved annotation/quote plus unsaved editor; receipt language; no extra query/event; 390px; failed Settings save; external error unchanged; first dark content mounted under dark | `/tmp/paneon-ui-browser-preferences.log` |
| Git four combinations | Current commit/file/editor preserved; 3 initial queries, no preference-triggered queries, 0 events | `/tmp/paneon-ui-browser-preferences-git.log` |
| Table/Review/PR four combinations and 390px | Filter/search and original PR title preserved; Markdown Text node identity; 2 initial PR queries and no extra queries, 0 events | `/tmp/paneon-ui-browser-standard-combinations.log` |
| Independent parent probe | Four combinations, original params/revision, DOM/draft identity, 12 concurrent writes converge, unknown config keys, server dark HTML and restart persistence | `/tmp/paneon-ui-parent-probe.log` |
| Original choose/form regression | Free browsing, independent summary, responsive details, focus restoration, form clear/validation/failure/corrections and events/ack | `/tmp/paneon-ui-browser-skill-pages.log` |
| Original Git regression | Multi-repository/index/worktree, old snapshots, exact Unicode ranges, branches/history/250-row virtualization, B54/B57 drag/keyboard/cancel and corrections | `/tmp/paneon-ui-browser-git.log` |
| Original Git tree and select-all performance | Directory/search/mobile geometry; 600 lines and 47,070 UTF-16 units per side, 15,600 highlight spans, exact Meta+A/copy/ranges in split/unified/expanded modes | `/tmp/paneon-ui-browser-file-tree.log`; `/tmp/paneon-ui-browser-select-all.log` |
| Original PR regression | Pinned sources, Markdown/diff/check/PR targets, cross-PR feedback, requests, failures, corrections, coverage and CLI events/ack | `/tmp/paneon-ui-browser-pr.log` |
| Original compact table and Markdown review | Sorting/filter/pagination, cross-page annotations and corrections, UTF-16/link/code/Markdown original ranges, narrow layouts | `/tmp/paneon-ui-browser-table.log`; `/tmp/paneon-ui-browser-table-review.log` |
| Original contextual annotations and Diff toolbar | Temporary edits/Cancel/Delete, numbered markers, raw ranges, scroll, stale snapshots, explicit submit; three-hunk navigation/layout/context/binary/390px | `/tmp/paneon-ui-browser-feedback.log`; `/tmp/paneon-ui-browser-diff.log` |
| Original Mermaid and two teaching examples | Local rendering/error recovery/nesting/update; deterministic controls and fixed teaching content; feedback and mobile behavior | `/tmp/paneon-ui-browser-mermaid.log`; `/tmp/paneon-ui-browser-examples.log` |
| Host/query/10 shared-context tabs | Existing lifecycle and no mutation replay; every tab owns panel + preferences streams; reconnect and close release all streams | `/tmp/paneon-ui-browser-host.log`; `/tmp/paneon-ui-browser-query.log`; `/tmp/paneon-ui-browser-tabs.log` |

The select-all run measured split/unified/expanded selection+copy at
630/927/708ms and Save at 510ms. Existing performance assertions passed. The log
also records browser long tasks; these results do not claim that large selection
work is instantaneous or that every machine has the same timing.

Twenty rendered screenshots are in
`/tmp/paneon-ui-preferences-evidence/`: the four core combinations plus narrow,
and Table/Review/PR in each combination plus narrow. Dark/Chinese, narrow,
Table dark/English, PR narrow and Review light/Chinese images were inspected.
Screenshots are real browser output; static checks alone are not visual proof.

## Scope and remaining boundaries

No extra business input/schema checks or runtime business restrictions were
introduced. New configuration checks are limited to the two requested keys and
their light/dark and en/zh-CN enums. Existing same-origin/read-only stream rules
and bounded reconnection are reused.

Old compiled instances and previously copied hardcoded TSX require source updates
and recompilation to gain the new environment behavior. They are not forcibly
reloaded. Direct config-file edits are read at runtime startup. Git/PR source
content, API state codes, author content and external diagnostics stay original.

Per the parent agent's scope instruction, project memory files were not maintained.
`docs/memory/ui-markdown-rendering.md` and its index still describe the older
light-only/default Mermaid fact; this is a known documentation follow-up outside
this delivery. The transplanted UI styling memory remains unchanged.

## Task-only file list

The absolute task-only paths, old/new hashes and a patch against HEAD plus the
transplanted snapshot are delivered in `/tmp/paneon-ui-preferences-delivery/`.

## Parent acceptance — 2026-10-22

主 agent 已将纯任务补丁应用到 `/Users/yuguo/IdeaProjects/paneon`，74个任务文件逐一核对交付 SHA-256 一致；未复制隔离工作树里的其他文件。移植前已存在的全屏宿主行为保留，其 host/query 两份既有回归一并作为依赖落盘；其他 change 和与本功能无关的指南草稿不修改。subagent 未创建任何提交。

主工作区独立检查与最终产物：

- `npm run build`（含完整类型检查）通过：`/tmp/paneon-ui-parent-final-build.log`。
- 全量156/156单测通过：`/tmp/paneon-ui-parent-final-units.log`。
- 独立父级 probe 通过四组合、12个并发写入、多窗口、业务params/revision/草稿/DOM身份、零额外事件、未知配置键和重启持久化：`/tmp/paneon-ui-parent-final-independent.log`。
- 公共/choose/form四组合、Git四组合及Table/Review/PR四组合通过：`/tmp/paneon-ui-parent-final-{four-combinations,git-combinations,standard-combinations}.log`。
- 双向90帧主题切换对比检查通过，最低对比度18.968:1；临时属性消失且原0.15s控件动画恢复：`/tmp/paneon-ui-parent-final-transition.log`。
- 最终独立npm安装包、公开导出、两套skill字典、配置和Chrome标准页通过：`/tmp/paneon-ui-parent-final-package.log`。
- scoped ESLint 0 errors，仅既有compiler非空断言warning；全部任务文件Prettier和diff whitespace通过：`/tmp/paneon-ui-parent-final-{lint,format}.log`。
- 主agent查看最终主工作区实际明暗/中文/英文/窄屏截图，证据 `/tmp/paneon-ui-parent-final-evidence/`。

本轮不自动重启用户正在使用的服务，不强制重新编译旧实例，不修改用户实际配置。新功能通过新版本runtime和重新编译的页面获取，既有草稿不在验收中中断。

### Recorded files

以下路径相对仓库根目录，含任务文件及上述两份已存在的宿主依赖回归：

```text
README.md
openspec/changes/add-ui-preferences/design.md
openspec/changes/add-ui-preferences/tasks.md
openspec/changes/add-ui-preferences/verification.md
skills/paneon/SKILL.md
skills/paneon/assets/examples/concurrency/panel.tsx
skills/paneon/assets/examples/github-pr/github.ts
skills/paneon/assets/examples/github-pr/panel.tsx
skills/paneon/assets/examples/sentinel-leap-array/panel.tsx
skills/paneon/assets/panels/choose/panel.tsx
skills/paneon/assets/panels/form/panel.tsx
skills/paneon/assets/panels/git-review/branches.tsx
skills/paneon/assets/panels/git-review/file-tree-model.ts
skills/paneon/assets/panels/git-review/file-tree.tsx
skills/paneon/assets/panels/git-review/git.ts
skills/paneon/assets/panels/git-review/history-columns.ts
skills/paneon/assets/panels/git-review/history-split.ts
skills/paneon/assets/panels/git-review/history.tsx
skills/paneon/assets/panels/git-review/panel.tsx
skills/paneon/assets/panels/review/panel.tsx
skills/paneon/assets/panels/table/panel.tsx
skills/paneon/assets/shared/diff-toolbar.tsx
skills/paneon/assets/shared/diff.tsx
skills/paneon/assets/shared/i18n.ts
skills/paneon/assets/shared/locales/en.ts
skills/paneon/assets/shared/locales/zh-CN.ts
skills/paneon/assets/shared/submission.ts
skills/paneon/references/authoring.md
skills/paneon/references/cli.md
skills/paneon/references/preferences.md
src/App.tsx
src/cli/config.ts
src/cli/index.ts
src/compiler/index.ts
src/main.tsx
src/runtime/preferences.ts
src/runtime/server.ts
src/sdk/client.ts
src/sdk/protocol.ts
src/sdk/ui-environment.ts
src/shared/preferences.ts
src/ui/code-block.tsx
src/ui/dialog.tsx
src/ui/feedback-surface.tsx
src/ui/index.ts
src/ui/locales/en.ts
src/ui/locales/zh-CN.ts
src/ui/markdown-theme.css
src/ui/mermaid.tsx
src/ui/pagination.tsx
src/ui/spinner.tsx
src/ui/styles.css
src/ui/ui-provider.tsx
src/ui/use-ui.ts
src/web/panel-host.tsx
src/web/preferences-settings.tsx
src/web/preferences-state.ts
src/web/preferences.tsx
tests/browser/diff-toolbar.mjs
tests/browser/explanations-fixture.mjs
tests/browser/feedback-fixture.mjs
tests/browser/git-review-fixture.mjs
tests/browser/git-review.mjs
tests/browser/git-select-all.mjs
tests/browser/github-pr-fixture.mjs
tests/browser/host-lifecycle.mjs
tests/browser/multiple-tabs.mjs
tests/browser/preferences-git.mjs
tests/browser/preferences-standard-pages.mjs
tests/browser/preferences-transition.mjs
tests/browser/preferences.mjs
tests/browser/query-lifecycle.mjs
tests/browser/table-review-fixture.mjs
tests/browser/table-review.mjs
tests/preferences-pack.mjs
tests/preferences.test.ts
```
