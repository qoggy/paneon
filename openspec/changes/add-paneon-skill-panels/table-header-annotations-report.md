# Table header text annotations — implementation report

Status: accepted by primary and integrated into the current branch. Not installed
globally or loaded into a user instance.
Baseline: `d10aa89`.

## Root cause and implementation

The old header put its label inside the sorting Button, which the registered
text-selection collector correctly excludes. It also had no header text source:
only string cells were registered, and both table reference validation and the
adapter rejected header ranges. Registering selectable DOM alone would therefore
have failed validation or confused labels with all values in a column.

- Header labels now use `FeedbackText` outside a separate compact sort icon
  button. Sort keeps its localized `Sort {label}` name and the header's
  `aria-sort`; dragging a label does not sort and ordinary sorting does not
  create annotations. Small numeric/boolean columns leave enough room for the
  label and sort icon; long labels wrap within the table scrolling region.
- Added strict `{kind:'header',columnKey}` schema and source validation. Ranges
  refer to the exact original `columns[].label`, with existing UTF-16,
  grapheme-boundary and quote checks. The adapter resolves that source and
  locates the correct keyed header. Header locate preserves search, filters,
  sorting and current page; cell/row locate retains existing behavior.
- The table passes `allowObjectSelection={false}` to the shared controls. Removed
  table selection-mode state, help and page/row/column checkboxes. Row numbers,
  saved annotation catalog, markers, locate, overall annotation and submission
  remain. Public row/column/cell references and their strict validation remain.
- Updated the table usage contract and replaced existing browser assertions of
  deliberately removed object controls with real header/cell text selection.
  Failure retention, explicit save/submit, cancellation, correction receipts and
  CLI events/ack coverage remain.

## Task files

- `skills/paneon/assets/panels/table/panel.tsx`
- `skills/paneon/assets/panels/table/schema.ts`
- `skills/paneon/references/table.md`
- `tests/table-review.test.ts`
- `tests/browser/table-review.mjs`
- `tests/browser/table-review-fixture.mjs`
- `tests/browser/table-layout.mjs`
- `tests/browser/table-layout-fixture.mjs`
- `tests/browser/table-header-themes.mjs`
- `openspec/changes/add-paneon-skill-panels/table-header-annotations-report.md`

## Borrowed dependency (not this task's increment)

`src/ui/feedback-surface.tsx` was copied from the sibling
`annotation-editor-polish` worktree for joint build/browser verification. It
supplies `allowObjectSelection` and the compact shared editor. The primary should
merge that file from its owning agent, not treat this copied file as an
independent implementation. `node_modules` is a temporary symlink to the primary
repository and is not a source deliverable. The primary plan file was copied
into this worktree before dispatch and was not edited here.

## Verification

Passed against the final task code and borrowed shared dependency:

- `npm run build:cli`, `npm run build:ui`, `npm run build:web`.
- `npm run typecheck` (all four project checks).
- `node --test tests/table-review.test.ts`: 7 passed. Added valid headers,
  duplicate labels keyed independently, numeric header text, emoji/combining
  graphemes, malformed keys/refs, invalid offsets/quotes, unchanged old object
  refs and empty correction behavior.
- Targeted ESLint: 0 errors and 0 warnings; `git diff --check` passed.
- `node tests/browser/table-review.mjs`: complete table and Markdown Chrome
  assertions passed, including other pages' default object selection.
  Table uses physical mouse dragging for `说明`, native Command+C and reads the
  actual clipboard from the permitted top-level test page. Header event target
  is exactly `{kind:'header',columnKey:'name'}` with source range 0..2 and quote
  `说明`. Unicode/repeated string cell ranges, saved catalog, cross-page locate,
  sort/filter/page draft retention, unsaved/empty submission rejection,
  cancellation, server failure retention, duplicate in-flight submit rejection,
  receipts, empty correction, CLI events and ack passed. No store injection is
  used to create the header feedback.
- `node tests/browser/table-layout.mjs`: 1440px and 390px; real header drag,
  correction, keyboard/touch description/filter popovers, type rendering,
  sorting/filter reset, header locate preserving page, long raw text, long
  labels, multi-column scrolling and empty/no-match states passed. Existing
  compact-header assertion retained; measured normal header height is 40px.
- `node tests/browser/table-header-themes.mjs`: all eight combinations of
  light/dark × en/zh-CN × 1440/390px passed physical header selection, localized
  editor, save/submit and exact header event assertions. No page overflow;
  `pageerror` arrays empty. Input label remains Chinese independently of locale.

Logs:

- `/tmp/paneon-table-header-build-web.log`
- `/tmp/paneon-table-header-full-review.log`
- `/tmp/paneon-table-header-layout.log`
- `/tmp/paneon-table-header-themes.log`

Screenshots and metrics:
`/tmp/paneon-table-header-evidence/` (desktop/narrow normal and long layouts,
all eight theme/language/width screenshots, header-theme-results.json and
table-layout-metrics.json). Desktop normal and dark-English 390px screenshots
were visually inspected; the Boolean short-label width was corrected and the
final matrix re-run.

## Limits and next step

These checks run isolated temporary runtimes, copied skill assets and Chrome;
no installed global skill or user instance was modified. No full repository unit
suite or npm-package reinstall was run by this agent. The primary should review
and merge the task files together with the shared editor dependency, perform its
chosen combined integration acceptance, then commit and archive this worktree.

## Primary acceptance

Reviewed the schema, panel, usage contract and changed test assertions, then ran
current-branch typecheck, targeted ESLint/Prettier, 7 unit tests, the table-only
Chrome review flow and desktop-only layout flow. All passed, with no browser
errors. Physical selection and native copying returned `说明`; the emitted header
reference/range was exact. Sorting and header locate preserved the intended
behavior, and local save remained separate from submission. Desktop screenshot
was inspected: ordinary headers and rows measure 40px, with no page overflow.

Primary removed phone widths from the newly added theme test and added a
desktop-only switch to the existing layout test, without removing its existing
mobile coverage. No further mobile acceptance was run. Primary logs are
`/tmp/paneon-primary-table-{browser,layout,typecheck,lint}.log`; screenshots and
layout metrics are under `/tmp/paneon-primary-table-layout/`. No global skill,
user instance or service was changed.
