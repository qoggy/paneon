# Choice panel UX delivery — B43

## Status and scope

Implemented in the isolated `choose-ux` worktree, from `53add23`, with the clarified contract from main's `5a5d2f5` cherry-picked as `7a388a2`. This report records child verification; main-agent acceptance and integration remain pending. No push or main-workspace edits were performed.

The original defects were separate Page children accumulating spacing, question-wide `comment` state, and mutually exclusive modes controlled by two buttons. The page now groups related headings locally, keeps the custom input visible as an Other card, and maintains a separate explanation draft for every option.

## Delivered behavior

- Compact title/description and progress/question groups, using existing shadcn styles and only page-local layout utilities.
- The Other input is always visible; typing nonblank text selects it directly. Single-choice Other remains exclusive with supplied options; multiple-choice Other is a peer checkbox and can coexist with supplied selections.
- Each selected option contains its own explanation input. Changing single selections, deselecting and reselecting, and revisiting questions preserve independent drafts without transferring text to another option.
- Deselecting Other keeps its text without submitting it. Clearing selected custom text retains the selection and requires writing an answer or changing the selection; there is no silent fallback.
- Answers use one `selections` array containing `{ kind: 'option', optionId, comment }` and/or `{ kind: 'custom', text }`. Single mode requires exactly one entry; multiple mode requires at least one; custom is limited to one entry. Option comments always exist, including empty strings. All text preserves original spacing. Supplied selections are normalized to input order, custom last.
- Complete final submission, summary, correction linkage, failure drafts, duplicate-submit protection, navigation without events, and new-instance round isolation are preserved. Common empty-answer errors use direct English messages rather than joined Zod diagnostics.
- Input `selectedIds`, shared UI/SDK/runtime, host header, form implementation and its regression assertions are unchanged. Historical events remain ordinary immutable payloads; no compatibility branch was added to the new result schema.

## Verification

| Check                                                                                               | Result                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                                                                                     | Passed CLI, UI, all type-check targets and production web build                                                                     |
| `node --test tests/skill-pages.test.ts`                                                             | 6/6 passed: three choose schema tests and all three original form tests                                                             |
| `npm run lint`                                                                                      | 0 errors; 15 existing non-null assertion warnings in unchanged compiler/runtime test files                                          |
| Prettier on all changed implementation/test/reference/report files                                  | Passed                                                                                                                              |
| `git diff --check`                                                                                  | Passed                                                                                                                              |
| `PANEON_TEST_ARTIFACTS=/tmp/paneon-choose-ux-evidence node tests/browser/skill-pages.mjs`           | Passed actual installed Chrome, desktop 1280px and narrow 390px, copied skill outside the repository                                |
| `PANEON_TEST_ARTIFACTS=/tmp/paneon-choose-ux-pack-evidence node tests/browser/skill-pages-pack.mjs` | Passed independent npm package installation, complete skill copy, packaged runtime/CLI and the same actual Chrome choose/form suite |

Schema cases cover full question coverage and ordering, per-option empty/whitespace/nonblank comments, mixed selections, custom-only answers, invalid/duplicate/cross-question IDs, cardinality, duplicate custom answers, blank custom text, missing/wrong comments, extra fields, correction IDs and strict result shape.

Browser cases cover initial custom visibility and removed mode buttons; friendly validation; supplied single/custom switching; independent explanation restoration; simultaneous two supplied selections plus custom; cancelling/reselecting custom; clearing selected custom; navigation drafts and no events; ordered summary/result; pending submission and duplicate click; persistence failure and full correction history; custom-only multiple answers and exclusion of cancelled custom text. Existing form controls, validation, failure drafts, complete correction and CLI events/ack all pass. The narrow document has no horizontal overflow, and measured description/progress/title gaps satisfy the compact group checks.

Desktop and narrow screenshots are at `/tmp/paneon-choose-ux-evidence/choose-desktop.png`, `/tmp/paneon-choose-ux-evidence/choose-multiple-desktop.png`, and `/tmp/paneon-choose-ux-evidence/choose-mobile.png`. They use the worktree's committed host, which still has its pre-existing header; this task deliberately does not modify the host. Screenshot files are local verification artifacts, not shipped product assets.

The first full-page narrow capture retained an internal scroll position, making the title hard to inspect. The evidence helper now resets both document scroll positions and captures the viewport; a repeated browser run validates the same interaction suite. Independent npm acceptance had already passed with the identical product code.

No real GitHub or deployment operations were invoked. Browser drafts remain in memory and are not recovered after a reload, consistent with the supplied-page policy.

## Changed files

- `skills/paneon/assets/panels/choose/panel.tsx`
- `skills/paneon/assets/panels/choose/schema.ts`
- `skills/paneon/references/choose.md`
- `tests/skill-pages.test.ts`
- `tests/browser/skill-pages.mjs`
- `openspec/changes/add-paneon-skill-panels/reports/choose-ux.md`

Main-agent follow-up: inspect the child commit and screenshots, accept the result, integrate only the delivery commit (the clarification docs are already on main), and update central task/development state. Do not reapply the cherry-picked clarification commit.
