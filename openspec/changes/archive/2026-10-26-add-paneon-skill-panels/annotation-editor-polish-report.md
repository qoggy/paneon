# Shared annotation editor acceptance

Status: accepted by primary on the current branch; integrated.
Worktree: `/Users/yuguo/.codex/worktrees/annotation-editor-polish/paneon`.
Baseline: `d10aa89`. No commit was created. The main checkout, global skill,
user instances and user service were not changed.

## Change

- Removed only the overall editor's redundant visible heading; its dialog keeps
  its translated accessible name. Target editors still show their title/number.
- Replaced the full delete label with existing ghost `icon-sm` styling and a
  muted `Trash2` icon. Translated `aria-label` and `title` retain the action's
  identity without changing delete/save/cancel data or confirmation behavior.
- Added optional `FeedbackSelectionControls.allowObjectSelection`, defaulting
  to true. False hides only mode toggles and pending object annotation actions;
  children and the saved catalog, stable numbering and locating remain intact.
  No table files or public exports needed modification.

## Verification

All passed in this isolated worktree:

- `npm run build:cli`, `npm run build:ui`, `npm run build:web`.
- `npm run typecheck`.
- `npx eslint src/ui/feedback-surface.tsx tests/browser/annotation-editor.mjs`.
- `node --test tests/feedback.test.ts tests/feedback-state.test.ts tests/feedback-selection.test.ts`: 11/11.
- `node tests/browser/feedback.mjs`: existing complete contextual feedback
  regression, including native/keyboard selection, object groups, stable
  numbered markers, Save/Cancel/Delete, locate, frozen submission and CLI events.
- `node tests/browser/annotation-editor.mjs`: real Chrome checks all four
  light/dark and en/zh-CN combinations. Covers no duplicate overall title,
  dialog/icon accessible names and tooltip, icon keyboard activation, Save
  shortcut, Cancel/Escape focus return, empty overall deletion, disabled actions,
  no emission before explicit submission, default object-selection behavior,
  false-prop pending action hiding, catalog editing/location and stable number,
  native mouse text selection without object controls, 390px light/dark layout.
  `pageerror` list is empty. No store or state injection.
- `git diff --check`, changed-source/test Prettier checks.

Screenshots and result: `/tmp/paneon-annotation-editor-evidence/` contains
`light-en.png`, `dark-en.png`, `dark-zh-CN.png`, `light-zh-CN.png`,
`mobile-light.png`, `mobile-dark.png`, and `result.json`.
Desktop light and mobile dark screenshots were visually inspected.

Logs: `/tmp/paneon-annotation-editor-{browser,existing-feedback,unit,typecheck,lint,web}.log`.

Two initial test-only corrections were needed: unwrap the existing API result's
`data` field, and activate the fixture's disable button with the keyboard when
the intentionally anchored popover overlaps it. No product failure was masked,
no assertions were weakened and no timeout was increased.

## Files for integration

- `src/ui/feedback-surface.tsx`
- `tests/browser/annotation-editor-fixture.txt`
- `tests/browser/annotation-editor.mjs`
- `openspec/changes/add-paneon-skill-panels/annotation-editor-polish-report.md`

The copied primary plan and temporary `node_modules` symlink are not deliverables.
The table agent borrowed only the shared source file for combined verification;
that borrowed file must not be counted as its own change. Files are now frozen.

## Primary acceptance

Primary reviewed the source delta and desktop screenshot, then ran `npm run
build`, targeted ESLint/Prettier, the 11 feedback unit tests and the desktop-only
`annotation-editor.mjs` on the integrated branch. All passed; browser errors were
empty. Removed the added mobile-only loop from the delivered test because mobile
support was outside the requested scope. No user service, instance or installed
skill was changed.
