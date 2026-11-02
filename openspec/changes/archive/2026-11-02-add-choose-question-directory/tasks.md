## 1. Directory presentation and navigation

- [x] 1.1 Add the persistent directory, existing answer statuses, direct question/summary navigation and English/Chinese labels.
- [x] 1.2 Keep the question column narrow and the long directory independently scrollable with the current item visible.

## 2. Verification

- [x] 2.1 Add focused browser coverage for direct navigation, draft/status preservation, long directory behavior and unchanged explicit submission.
- [x] 2.2 Run build/typecheck, relevant existing regressions, scoped lint/format and OpenSpec validation; inspect actual desktop screenshots and record results.

## Verification results

- `npm run build`: passed, including complete TypeScript checking, CLI/UI/web builds.
- `node --test tests/skill-pages.test.ts`: 6/6 passed.
- `node tests/browser/choose-directory.mjs`: passed in real Chrome. Covers pointer/keyboard jumps, heading focus, exactly two answer statuses, retained fixed/custom/per-option drafts, unchanged submission payload, Chinese labels, long title wrapping, a sticky 35-question independently scrolling directory and current-item visibility. Log: `/tmp/paneon-choose-directory-test.log`; screenshots: `/tmp/paneon-choose-directory/`.
- `PANEON_TEST_DESKTOP_ONLY=1 node tests/browser/choose-review-interactions.mjs`: passed. Existing details, summary, invalid submission, keyboard editing and complete explicit-event coverage remain intact. Log: `/tmp/paneon-choose-review-test.log`.
- Existing complete Choose/Form browser regression `tests/browser/skill-pages.mjs`: passed, including existing pending/failed/corrected submission and new-round coverage. Only its old Choose geometry assertions changed. Log: `/tmp/paneon-directory-skill-pages.log`.
- Scoped ESLint, Prettier, `git diff --check` and strict OpenSpec validation passed. Actual desktop screenshots for the ordinary and long directory were inspected.
- The first directory test used the wrong Chinese Previous/Next labels; corrected the test to the existing labels. A subsequent run failed before page compilation because `dist/ui/actions.js` was temporarily absent; the file was present again when checked and no build was running. The final run against the complete build passed. No runtime retry or fallback was added.
- The implementation adds no business validation, schema checks or navigation gates. Answer status reads the existing completeness result; navigation calls the existing question/review functions. New conditional branches only select presentation/current-item state and adjust directory scrolling.
- Actual review instance: `http://127.0.0.1:49321/panels/78` (watching the Choose source). No commit, push or release was performed.

## 3. Follow-up: select custom answers during editing

- [x] 3.1 Reproduce existing behavior and remove the nonblank condition from custom-text selection; keep existing single/multiple behavior and validation.
- [x] 3.2 Verify whitespace input, clearing, editing after explicit deselection, draft preservation and existing submission behavior in real Chrome; run typecheck and scoped checks.

Follow-up verification: live Chrome reproduced that ordinary text already selected Other, while whitespace and clearing retained a supplied selection because of the trimmed-nonempty condition. Removed only that condition. The expanded `choose-directory.mjs` passed, including single-mode exclusivity, multiple-mode preservation, whitespace, clearing and editing after explicit deselection. The complete existing `skill-pages.mjs` browser regression passed, as did `npm run typecheck`, scoped ESLint/Prettier, strict OpenSpec validation and `git diff --check`. Logs: `/tmp/paneon-custom-edit-directory.log`, `/tmp/paneon-custom-edit-regression.log` and `/tmp/paneon-custom-edit-typecheck.log`. No new validation was added; selected blank custom text still follows the original final-submission rule.

## 4. Simplify the approved directory

- [x] 4.1 Put plain numbers, wrapping full titles and answer statuses on one row; retain only a subtle background for the current location.
- [x] 4.2 Remove the duplicate bottom return-to-summary action and its UI-only state; keep the directory summary entry and Previous/Next.
- [x] 4.3 Verify the existing directory and desktop review regressions, inspect actual desktop rendering and run typecheck plus scoped checks.

Simplification verification: the existing directory and desktop review browser suites passed, as did full typecheck, strict OpenSpec validation and scoped checks. Ordinary and long desktop directory screenshots were inspected. Navigation, retained drafts and explicit submission remain unchanged. Logs: `/tmp/paneon-simple-directory.log`, `/tmp/paneon-simple-review.log`, `/tmp/paneon-simple-directory-typecheck.log`. The later discussion of icon-based status is a pending design choice and is not implemented in this simplification.

## 5. Symbolic status and Markdown-style current highlighting

- [x] 5.1 Replace visible answer-status text with ✓ / ○, retaining translated accessible text; remove Tooltip following the user's clarification.
- [x] 5.2 Match the actual Markdown outline's blue semibold current-item text and transparent backgrounds, including summary.
- [x] 5.3 Check accessible status, navigation, desktop light/dark rendering, typecheck and scoped checks without changing answer or submission behavior.

Symbol/highlight verification: the final no-Tooltip directory regression passed, including accessible English/Chinese statuses, direct pointer/keyboard navigation, retained drafts, unchanged submission payload and long-list scrolling. The existing desktop review regression also passed across light/dark themes and both languages. Typecheck, scoped ESLint/Prettier, strict OpenSpec validation and `git diff --check` passed. The actual page's current row was measured as transparent with font weight 600 and the same blue-600 color as Markdown outline; ordinary, long and dark summary rendering were inspected. Logs: `/tmp/paneon-icon-directory.log`, `/tmp/paneon-icon-review.log`, `/tmp/paneon-icon-directory-typecheck.log`. Tooltip support was removed per the user's final instruction; no new validation, answer-state rule or submission behavior was introduced.

## 6. Single-line titles with full-text disclosure

- [x] 6.1 Keep directory titles on one line with ellipsis; enable the existing Tooltip only for actual title overflow on hover or keyboard focus, preserving fixed number/status columns and full accessible text.
- [x] 6.2 Verify short-title silence, long-title hover/focus, resize updates, unchanged navigation/drafts and scoped checks; inspect the actual long-title rendering.

Title verification: the final directory browser regression passed. Short titles show no Tooltip; long titles use one-line ellipsis and disclose their complete original text on hover and keyboard focus; widening the window disables unnecessary disclosure and narrowing enables it again. Existing navigation, drafts, independently scrolling directory and complete submission payload checks passed. Typecheck, scoped ESLint/Prettier, strict OpenSpec validation and `git diff --check` passed. The actual full-title popup screenshot was inspected. Log: `/tmp/paneon-title-ellipsis.log`; typecheck log: `/tmp/paneon-title-ellipsis-typecheck.log`; screenshot: `/tmp/paneon-choose-directory/directory-long-title-hover.png`. Initial test-selector issues involving closing Tooltip animations and nested hidden status text were corrected without product fallbacks or new validation.

Memory correction: `docs/memory/documentation-panel-contracts.md` excludes interface specifications and interaction details from Skill references. Removed this task's directory-navigation and custom-input interaction additions from `skills/paneon-visualize/references/choose.md`, restoring it to its original content. UI implementation remains in the built-in panel assets; UI design and verification remain in OpenSpec and tests. `SKILL.md` is unchanged.

## 7. Approved proposal A: plain outline

- [x] 7.1 Shorten the visible heading, show only answered check icons, retain accessible unanswered status and transparent blue highlighting, and align the directory header/footer with its rows. Widen only the directory while preserving the existing maximum question-column width.
- [x] 7.2 Run build and scoped checks; inspect the actual page and long-title disclosure without changing answer or submission behavior.

Proposal A verification: `npm run build` passed, including typecheck. Scoped ESLint, Prettier, strict OpenSpec validation and `git diff --check` passed. On actual instance 78, browser inspection confirmed Questions, two answered SVG checks and five visually empty unanswered slots with accessible status text, transparent current highlighting, direct unanswered-question navigation and summary navigation. The directory measures 272px and the question column remains 560px at the maximum layout. A truncated title still discloses its complete text on keyboard focus; a short focused title produces no Tooltip. The existing hover implementation is unchanged. No answers were edited or submitted during this visual check; the full browser regression was not rerun for this presentation-only follow-up. Build log: `/tmp/paneon-proposal-a-build.log`; actual screenshot: `/tmp/paneon-proposal-a/actual-directory.png`. The previously requested global Codex skill install and server stop/start completed successfully; no historical-instance repair or backup was performed.

## 8. Remove repeated counters and summary emphasis

- [x] 8.1 Remove the two answering-page counters, merge summary headings while retaining summary progress and heading focus, and use the existing submit-error state for red incomplete-row emphasis.
- [x] 8.2 Adapt affected browser expectations and verify build, scoped checks, actual question/summary rendering and the existing rejected-submission behavior.

Counter/summary verification: `npm run build` (including typecheck), scoped ESLint, Prettier, strict OpenSpec validation and `git diff --check` passed. Browser expectations were adapted to the unified Answer summary heading and removed fractions. Direct browser checks on instance 78 confirmed no answering-page fractions, exactly one summary heading and one progress counter, focus on that heading, and five neutral incomplete rows without exclamation marks. Attempting the existing incomplete submit showed the unchanged five-incomplete alert, focused it and emphasized exactly those five rows. Reopening summary reset the existing error state and neutral styling. No answers were edited; no successful submission was attempted. The full browser scripts were not rerun. Build log: `/tmp/paneon-simplify-summary-build.log`; inspected screenshots: `/tmp/paneon-simplified-summary/question.png`, `/tmp/paneon-simplified-summary/summary.png`.
