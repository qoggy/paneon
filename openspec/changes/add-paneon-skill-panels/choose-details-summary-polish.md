# Choose details and summary polish

## Scope and confirmed causes

- User requests an overlay drawer for option details, removal of redundant summary guidance/status, and progress without visible single/multiple-choice labels.
- `skills/paneon/assets/panels/choose/panel.tsx` uses a 1024px media query: desktop details add a two-column grid and an aside, shifting the main question. Narrow screens already use a right-aligned Dialog.
- Summary renders `Incomplete answer` for every invalid answer and additionally `No answer` for empty selections. `schema.ts` requires at least one selection and nonblank custom text; a checked empty custom answer is distinct from no selection.
- The local UI exports Dialog but has no Sheet yet. Use the official shadcn Sheet matching the existing Radix/new-york-v4 source convention, not a new library or a custom drawer framework. Official documentation: https://ui.shadcn.com/docs/components/sheet .

## Implementation requirements

- All viewport sizes use a right-side overlay Sheet for option details; never resize/reposition the question column. Desktop width is bounded, small viewports fit the available width, long details scroll inside the sheet. Use theme tokens/default shadcn styling. Preserve Markdown, option title, Escape/outside/close-button dismissal, focus trapping and focus return to the originating detail trigger. Opening details does not select an option or lose draft inputs. Remove obsolete desktop aside/media-query branches.
- Add/export the Sheet UI primitive from the matching official registry source, recording source/hash/license provenance as existing UI components do. Do not upgrade all UI primitives or introduce a second primitive stack.
- Remove visible Single choice / Multiple choice labels; keep the existing progress `1 / N` and proper radio/group semantics.
- Remove `Check your answers before submitting.` from summary. Keep user-supplied questionnaire and question descriptions unchanged.
- Empty selections show one concise localized status: `Not answered` / `未回答`; no second generic incomplete label. Checked blank custom selections show the specific `Enter your own answer` / `请填写自填答案` once, while preserving any other selected options in a multiple-choice answer. Keep validation and incomplete row identity/accessible descriptions intact. Do not relax final complete-answer validation or prevent navigation to unanswered questions.
- Retain answer drafts, previous/next/review/edit/corrected submission behavior and the existing answers-submitted event shape.
- Provide both English/Chinese built-in copy and light/dark theme support; never translate supplied labels/content.

## Validation and delivery

- Update existing Choose tests (`tests/browser/skill-pages.mjs`, `tests/browser/choose-review-interactions.mjs`) that encode old labels/desktop aside behavior; add focused browser assertions for no main-column movement before/after details at desktop and narrow widths, dismissal/focus return, long-content scrolling, a single empty status and specific blank-custom status, preserved drafts, and blocked invalid submission. Verify light/dark and English/Chinese.
- Run relevant typecheck/lint/format/build checks and focused browser flows; record evidence and failures honestly. Avoid unrelated Git/runtime edits or user service restart/reload/skill installation.
- Agent works only in its dedicated worktree and does not commit; main agent independently accepts, integrates and commits later.

## Progress

- [x] Main agent inspected actual implementation and validation rules.
- [x] Requirements and boundaries documented.
- [x] Subagent implementation and focused verification.
- [x] Independent acceptance and integration; included in the primary UI acceptance commit.

## Implementation result

- Replaced desktop aside/mobile Dialog branches with one right-side shadcn Sheet overlay. The question stays centered at its original width; modal focus trapping, Escape, overlay/close dismissal, trigger focus return, and a dedicated internal Markdown scroll container are retained.
- Vendored the official Radix `new-york-v4` Sheet from the recorded registry URL. `upstream.json` records the downloaded JSON SHA-256 and retrieval date; the existing upstream MIT license remains applicable. Local adaptations are relative imports, formatting and the already-established `useUI` translation of Close.
- Progress now displays only `1 / N`; summary no longer repeats submission instructions. Invalid rows expose exactly one localized missing-answer status. Blank custom answers do not render an additional empty answer, and multiple-choice option answers/comments remain visible. Schema and event shape are unchanged.

## Verification evidence

- `npm run build` passed: `/tmp/paneon-choose-build.log`.
- Focused ESLint passed: `/tmp/paneon-choose-lint.log`; task files formatted with Prettier.
- `node --test tests/skill-pages.test.ts`: all 6 tests passed, including coverage/cardinality/custom text validation: `/tmp/paneon-choose-unit.log`.
- `node tests/browser/choose-review-interactions.mjs` passed: `/tmp/paneon-choose-interactions.log`. Desktop 1280px and narrow 390px sheet opens/closes preserve exact question x/y/width, including 500px-high scrolling viewports. Verified focus trapping/return, all dismissal paths, Markdown internal scrolling, draft preservation, empty/custom-empty summary distinction, blocked invalid submission and final event payload. English/Chinese and light/dark matrix passed. Screenshots: `/tmp/paneon-choose-review-interactions/`.
- `PANEON_TEST_ARTIFACTS=/tmp/paneon-choose-skill-pages node tests/browser/skill-pages.mjs` passed: `/tmp/paneon-choose-skill-pages.log`. Existing choose/form workflows, corrections, long titles and long details remain covered. Screenshots: `/tmp/paneon-choose-skill-pages/`.
- `git diff --check` passed. No user runtime restart/reload, installed skill update, or commit was performed.

## Investigation limitation

One development test sequence that repeatedly resized the iframe and opened/closed sheets at 390x500 lost a Playwright Next click without generating DOM pointer/click events or page errors. An isolated 390x500 probe with and without opening a Sheet both navigated normally and emitted the expected click (`/tmp/paneon-choose-low-height-probe.log`). This has not been established as a product defect or an existing-code defect; no production workaround was added. Final workflow navigation uses the standard 390x844 viewport, while the 500px-high stress checks still cover sheet geometry, dismissal/focus and internal scrolling. Main-agent acceptance remains pending.

## Primary acceptance (2026-10-24)

Accepted after independent code review and verification on the combined main checkout based on `d10aa89`. The main agent reran the complete build, focused ESLint/Prettier and 24 related unit tests, plus `choose-review-interactions.mjs`, `git-review-chrome.mjs`, `git-review-loading.mjs`, `diff-reading.mjs` and all three GitHub PR browser scenarios. All passed. The choose geometry/focus/draft/validation matrix was checked independently; no schema relaxation or speculative click workaround was introduced. Representative screenshots were visually reviewed. Logs are `/tmp/paneon-primary-ui-acceptance-{build,lint,format,unit,choose,git,loading,reading,pr}.log`.

Integration is limited to the listed Choose and Git task files. Other concurrent lifecycle/annotation work is excluded. The installed skill and user's running instances were not updated; delivery here is source integration and a local commit.
