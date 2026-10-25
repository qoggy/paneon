# Form layout delivery — B46

## Implementation

Worktree: `/Users/yuguo/.codex/worktrees/form-ux/paneon`.

Base: `bb67ef8` plus the prepared choose delivery `d4ed240` (equivalent to original `32bc21d`). The choose dependency is not part of this delivery commit.

The form combined shadcn's vertical `Field` direct-child width rule with vertically stacked clear actions; radio/multiselect options were vertically arranged, boolean labels were outside their control row, and the direct submit button inherited the field group's stretch behavior.

Corrected only the supplied form panel's composition:

- Select and its small ghost `×` action share a capped-width row. Radio uses the same compact clear action. Its accessible name/title remains `Clear <field label>`, it appears only with a value, and clearing affects only that field and returns focus to the corresponding control.
- Radio/multiselect options use wrapping rows. Labels can wrap, including long uninterrupted strings, while controls retain their upstream size.
- Boolean fields use shadcn's horizontal `Field` with `FieldContent`; labels remain clickable, and descriptions/errors retain their existing ID associations.
- The primary submit button sits in an action row at content width. Existing submit/correction/pending text and event schemas are unchanged.

No public UI component, form schema, SDK/runtime, choose source, dependency, central design or task file was modified.

## Verification

All commands below ran in this worktree:

```sh
npm run build
node --test tests/skill-pages.test.ts
npm run lint
npx prettier --check skills/paneon/assets/panels/form/panel.tsx skills/paneon/references/form.md tests/browser/skill-pages.mjs openspec/changes/add-paneon-skill-panels/reports/form-ux.md
PANEON_TEST_ARTIFACTS=/tmp/paneon-form-ux/source node tests/browser/skill-pages.mjs
PANEON_TEST_ARTIFACTS=/tmp/paneon-form-ux/package node tests/browser/skill-pages-pack.mjs
git diff --check
```

- Build, including all TypeScript checks and the production UI/web build: passed.
- Existing choose/form schema tests: **6/6 passed**.
- Lint: **0 errors**, 15 existing non-null-assertion warnings outside the modified files.
- Targeted formatting and whitespace checks: passed.
- Source/copied skill, real Chrome: passed the complete existing choose regression and all form flows.
- Independent npm pack/install, packaged runtime and CLI, complete skill copied outside the repository, real Chrome: passed the same checks. The package script verified all required skill resources before installing.

New real-browser checks cover small adjacent Select clear geometry, short radio and multiselect options on one row, label/control alignment and label toggling, default square checkbox geometry, content-width submit, Select/Radio clear visibility and isolation, restored focus, radio arrow navigation, required Radio and Select validation/focus, unchanged `false`/`0` behavior, pending control freeze and duplicate prevention, failed-save drafts, complete correction events and CLI event reads/acknowledgements. Original choose assertions and original form submission assertions were retained.

A separate fresh **390 × 844** page includes long radio labels and an uninterrupted long multiselect label. Both wrap without horizontal document overflow; short options still share a row. Required Select clearing leaves other fields intact and emits no event until a valid explicit submission.

The keyboard assertion holds ArrowRight for 80 ms: Radix changes focus asynchronously while the key is held. Required-radio focus is checked within the radiogroup because Radix delegates the group's programmatic focus to a radio. These tests follow the existing upstream behavior; no custom keyboard mechanism was added.

## Screenshots

Source screenshots were opened and visually inspected:

- Desktop, full form: `/tmp/paneon-form-ux/source/form-desktop.png`.
- Narrow page, Select and wrapping options: `/tmp/paneon-form-ux/source/form-mobile.png`.
- Narrow page, boolean descriptions and submit: `/tmp/paneon-form-ux/source/form-mobile-actions.png`.

The independent installation produced matching evidence under `/tmp/paneon-form-ux/package/` with the same filenames. Screenshots include the host chrome from this worktree's baseline; this delivery does not modify the host.

## Changed files

- `skills/paneon/assets/panels/form/panel.tsx`
- `skills/paneon/references/form.md`
- `tests/browser/skill-pages.mjs` (form assertions only)
- `openspec/changes/add-paneon-skill-panels/reports/form-ux.md`

No push, integration or worktree cleanup was performed. Main-agent acceptance remains separate from this implementation delivery.
