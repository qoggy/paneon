# Git diff reading and resize refinement

## Request and scope

Status: accepted and integrated by primary; global skill installation remains separate.

The user supplied three screenshots and requested one subagent to improve Git
diff reading. The latest screenshot explicitly adds a horizontally draggable
middle divider, with a column-resize cursor on hover. Keep the compact shadcn
theme, light/dark and en/zh-CN support, exact source coordinates, and existing
annotation and collapse behavior.

1. Stop scrolled source lines appearing in the strip above the sticky diff
   toolbar. The current Git viewport has padding and DiffView uses sticky top-0
   inside it; verify the clipping and stacking geometry rather than hiding the
   symptom with a random overlay.
2. Opening a file should initially show full context and locate the first
   actual change. Changing files resets the location, while explicit annotation
   location takes precedence. Reopening a collapsed file preserves its reading
   state. Preserve bounded work for large inputs and Command+A safety.
3. Use compact per-side source headers: abbreviated immutable commit identity
   where available and readable file path; working tree/index labels otherwise.
   Do not invent hashes or lose complete identities used by annotations.
4. Improve line-number gutters and the middle separation using the JetBrains
   reference as visual guidance. Code must not collide with the divider or line
   numbers; changed and missing-side regions must retain exact line mapping.
5. Make the left/right diff widths adjustable through one continuous middle
   separator. Hover shows col-resize; pointer capture, cancellation, min widths,
   keyboard adjustment and responsive resizing must work. Keep one ratio across
   the file's hunks, independent horizontal scrolling and aligned rows. Unified
   mode must remain usable, and returning to split mode preserves the ratio.

## Current implementation and ownership

- `skills/paneon/assets/shared/diff.tsx`: expanded defaults false; revealHunk uses
  scrollIntoView; split tables are rendered in an equal-width grid with line
  buttons at the left of each code pane. Keep source offsets unchanged.
- `skills/paneon/assets/shared/diff-toolbar.tsx`: compact difference navigation,
  mode controls and context toggle; keep the quiet collapse control.
- `skills/paneon/assets/panels/git-review/panel.tsx`: scroll viewport and snapshot
  source metadata. Changes here must be small and preserve concurrent annotation
  terminology work already present in the primary working tree.
- `skills/paneon/assets/panels/git-review/history-split.ts` and
  `history-columns.ts`: existing pointer/keyboard resize conventions to reuse.
- `tests/browser/diff-toolbar.mjs`, `git-review-loading.mjs`,
  `git-review-layout.mjs`: existing geometry, context, annotation and collapse
  coverage. Add a focused browser test/fixture for this request as needed.

The running installed skill is an older directory copy. This task implements and
tests canonical repository assets in an isolated worktree. Do not overwrite the
global skill, restart the user's daemon, or claim that the existing page has
already received the changes. Primary acceptance handles integration and delivery.

## Acceptance

- Demonstrate the initial full-context/first-change location, including a late
  first hunk, added/deleted files, unchanged files, and retained annotations.
- Verify no code is painted above the sticky toolbar while scrolling and no
  unrelated ancestor/page is scrolled by diff navigation.
- Pointer and keyboard resizing works at normal and narrow widths, has correct
  cursor/ARIA, clamps both panes, and preserves content/scroll/annotation mapping.
- Preserve existing diff mode, hunk navigation, collapse/reopen, Command+A and
  lazy loading behavior. No expensive per-pixel source-model rebuilding.
- Record light/dark and en/zh-CN screenshots and browser error results, plus
  relevant tests/typecheck/format checks. Report failures honestly.
- Report only task changes relative to the supplied working-tree baseline;
  do not commit or integrate unrelated concurrent changes.

## Implemented in isolated worktree (2026-10-23)

The delegated implementation is complete; primary integration/acceptance and
installation remain separate. No global skill or running user daemon was changed.

### Root causes and implementation

- The Git diff scroll viewport had `p-3`, while its nested toolbar was sticky at
  `top: 0`. Scrolled source was still painted into the viewport padding above the
  toolbar. Remove padding from that scroll boundary; the toolbar and source headers
  now form one opaque sticky header flush with the inner viewport border.
- Git now explicitly passes `defaultExpanded` to the shared DiffView. Initial
  file mounts/source changes expand context and locate the first changed source
  line in the nearest vertical scroll viewport only. Existing PR/custom consumers
  retain the old folded default unless opted in. Explicit annotation location wins;
  hidden/reopened Git subtrees retain their previous mode, context and scroll.
- Per-side headers use actual source-view commit identities: history parent/commit,
  comparison merge-base (where applicable)/head, or Index/Working tree for mutable
  content. Missing sides show `∅`. Complete identities and source offsets remain
  untouched. Compact sticky line gutters meet at the middle; syntax/source nodes
  and `data-code-side`, `data-line`, `data-source-start` are unchanged.
- `useDiffSplit` measures a shared root and updates CSS variables and separator ARIA
  directly. Pointer moves never set React source state or rebuild models, syntax or
  registration. A single continuous hit area controls all hunk widths; Home/End,
  arrows/Shift-arrows, capture, Escape/cancel, lost capture, blur and responsive
  bounds are handled. Both panes keep independent horizontal scroll. Hunk annotation
  headers and range controls sit above the drag hit area so it cannot swallow their
  clicks. There is no new dependency or diff-algorithm change.

### Validation evidence

- Git domain unit tests passed: 10/10 (`node --test tests/git-review.test.ts`).
- CLI, public UI and production Web builds passed; TypeScript and focused ESLint
  checks passed. Only the existing npm user-config warning was emitted.
- `node tests/browser/diff-reading.mjs`: passed using isolated temporary runtime and
  copied canonical skill. Late first difference at line 250/340, full source count,
  added/deleted/unchanged sources, explicit line-12 annotation precedence, top-strip
  hit testing, unchanged outer scroll, pointer/keyboard/cancel/resize, shared hunk
  ratio, no syntax DOM mutation while dragging, mode/context transitions, independent
  horizontal panes, exact line annotation, collapse retained DOM/scroll, native
  Meta+A, 390px no outer horizontal overflow, empty pageerror/crash lists.
- Top geometry measured viewport y=148 and sticky header y=149 (the one-pixel border);
  `elementFromPoint` above source hits the header, not a source line.
- Existing `diff-toolbar.mjs`, `git-review-loading.mjs`, `git-review-layout.mjs`,
  `git-review.mjs` and `git-select-all.mjs` passed. The two Git browser tests changed
  only the intentional initial-context assertion and an explicit collapse before
  hunk annotation selection. Existing shared-toolbar test was unchanged from the
  supplied snapshot.
- Actual 1082-ref Git loading test retained immediate selection and stale-response
  protection: selected-row update 12.5ms, next frame 47.5ms, directory 189.1ms.
  These are local fixture measurements, not a guarantee for every repository.
- Native Meta+A regression: 600 lines per side, 47,070 UTF-16 units per side and
  15,600 highlighted spans. Selection/copy and annotation delivery passed; no renderer
  crash. ARIA pixel values remain correct after mode and annotation rerenders. Source
  highlighting/mode transitions still have measurable long tasks
  (up to 826ms in that run); this task does not claim arbitrary-size virtualization.

Screenshots and structured output:

- `/tmp/paneon-diff-reading-evidence/light-zh-CN.png`
- `/tmp/paneon-diff-reading-evidence/dark-zh-CN.png`
- `/tmp/paneon-diff-reading-evidence/light-en.png`
- `/tmp/paneon-diff-reading-evidence/dark-en.png`
- `/tmp/paneon-diff-reading-evidence/mobile.png`
- `/tmp/paneon-diff-reading-evidence/result.json`

Command logs: `/tmp/paneon-refine-{build,web,types,lint,reading,toolbar,loading,layout,git,select}.log`.

## Primary acceptance

The primary reviewed the final source and screenshots and reconstructed the
dispatch baseline from commit `5070397` plus its captured working-tree patch.
Only this task's ten-file increment was merged; concurrent annotation terminology
changes and the newer choice-navigation commit were preserved.

- Primary working tree: TypeScript, focused ESLint, Prettier (including explicit
  TypeScript formatting of the TSX fixture), and ten Git unit tests passed.
- A clean copy of `cf5a4af` plus only this task's increment completed the full
  build. Its new reading test, original shared-toolbar test, and actual Git
  lazy-loading/collapse regression passed. The new test is self-contained and
  does not require the unrelated, uncommitted annotation helper.
- An additional PR regression passed two of three workflows. The remaining
  workflow waits for English `Head dddd…` while its Chinese UI renders
  `当前版本 dddd…`. Replacing DiffView with its pre-change version reproduced the
  same failure at the same assertion, so this is an existing test expectation,
  not evidence of a regression caused by this task. No unrelated PR test or
  product copy was changed to make it pass.
- A review hypothesis about ARIA resetting after a render was not reproducible;
  the final test checks separator geometry after resize, mode changes and saving
  an annotation. No production workaround was added for that hypothesis.

Primary logs: `/tmp/paneon-diff-primary-{isolated-build,unit,reading,toolbar,loading,pr,pr-baseline}.log`.
The running global skill was not replaced and no user instance was reloaded by
this acceptance. Installation and user-page delivery require a separate action.
