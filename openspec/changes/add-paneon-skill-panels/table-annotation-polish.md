# Table text annotations and compact editor

Status: both increments accepted by primary and integrated sequentially.

## User request and decisions

The screenshots show a table and the shared overall-annotation editor. The user
asked to remove repeated overall-annotation wording, replace the delete text
button with an icon, annotate the header label `说明`, and remove the table's
`Select objects` feature. Scope that removal to the supplied table page; other
pages and the public object-selection capability remain available.

- Keep the toolbar's overall-annotation entry. Hide the redundant visible title
  inside its overall editor, retaining the dialog's accessible name. Other
  annotation editors keep their useful identity/number.
- Use a coordinated ghost trash-icon button with localized accessible name and
  tooltip. Preserve existing delete/cancel/save semantics and focus/keyboard
  behavior; do not add confirmation prompts or change event data.
- Remove table object-selection toggle, selection help, and row/column selection
  checkboxes. Keep row numbers, native text copying/selection, saved-annotation
  catalog/locate, overall annotation and explicit submission. Do not merely hide
  the whole shared control and accidentally lose the saved-annotation catalog.
- Split the table header into explicitly registered selectable label text and a
  separate compact sort icon button. Sorting retains its accessible name and
  aria-sort; selecting a label must not sort the table.
- Add an explicit table reference `{kind:'header',columnKey}` for header text.
  Header text ranges refer to the exact input column label with UTF-16 and
  grapheme-safe source validation, not the column's cell values. Existing
  row/column/cell reference semantics remain unchanged. Update adapter resolve,
  locate, registration, event schema validation and the table contract together.
- Preserve theme/language preferences, stable annotations and drafts through
  search/filter/sort/pagination, and explicit save versus submit behavior.

## Confirmed implementation facts

- `src/ui/feedback-surface.tsx` renders the overall editor's duplicate visible
  title at its `state.editor` dialog and the full-text delete button beneath it.
- `FeedbackSelectionControls` combines object-mode actions and the saved catalog.
  Add optional `allowObjectSelection?: boolean` defaulting to true, so the table
  can disable object actions while retaining the catalog. No default behavior
  change for other consumers; table passes false.
- `table/panel.tsx` wraps headers in column FeedbackTarget but places label text
  inside Button. Only original string cells use FeedbackText. The table adapter
  resolve provides source text only for cell targets.
- `table/schema.ts` accepts only row/column/cell and explicitly rejects text
  ranges outside string cells. Registering header DOM alone cannot fix this.

## Ownership

Editor agent owns shared `feedback-surface.tsx`, any immediately needed public
type/export adjustment, and focused shared-UI tests. It implements the agreed
`allowObjectSelection` prop but does not edit the table panel or its schema.

Table agent owns `skills/paneon/assets/panels/table/`, `references/table.md`, table
tests/fixtures and relevant table-local strings if needed. It uses the agreed
prop and does not edit shared editor implementation or broad locale dictionaries
unless necessary and explicitly reported. Agents keep separate report files to
avoid editing this primary plan simultaneously.

## Acceptance

- Browser: opening the overall editor shows no repeated visible heading; the
  dialog and delete icon still have localized accessible names. Delete, Cancel,
  Save, keyboard shortcuts, focus return, drafts and submission retain semantics.
- Browser: table has no Select objects toggle/checkboxes but still shows saved
  annotation controls. Real mouse-select/copy `说明` without enabling a mode,
  annotate, save, locate and submit an exact header ref/range. Sorting via the
  separate button does not create an annotation; label selection does not sort.
- Unit: valid/invalid header keys and ranges, duplicate labels in distinct
  columns, emoji/combining graphemes, malicious/fabricated refs, existing cells
  and correction receipts; do not weaken prior validation to accept header text.
- Validate search/filter/sort/pagination, cancellation/deletion, empty submission,
  desktop layout, light/dark and en/zh-CN, no browser exceptions. Existing tests that
  intentionally asserted table object selection should be rewritten for the new
  user-requested table interaction rather than silently deleted.
- Use isolated runtimes and fixtures. Do not change the installed global skill,
  reload user instances, or restart the user service during implementation.
- Primary reviews the diffs and evidence, merges only task changes, commits and
  archives the worktrees after acceptance. Installing onto the user's live page
  is separate from developing the canonical assets.

## Primary outcome

1. Shared editor reviewed, desktop-browser verified and committed as `638c71f`.
   See `annotation-editor-polish-report.md`.
2. Table header source/schema/UI and removal of object controls reviewed together
   with the accepted shared dependency. Seven unit tests, desktop Chrome table
   behavior, desktop layout, typecheck and targeted lint passed. See
   `table-header-annotations-report.md`.

No outstanding findings in the requested scope. Agent phone-width checks were
outside the requested scope; primary acceptance used desktop only. User service,
installed skill and live instances were not changed.
