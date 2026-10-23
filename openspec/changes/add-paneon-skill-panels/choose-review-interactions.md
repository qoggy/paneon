# Choice details and review interaction corrections

## Scope and status

2026-10-23. User supplied four screenshots and authorized implementation through distributed-development. Main agent owns this brief and acceptance; one subagent owns the tightly coupled choice-page implementation in an isolated worktree. Status: implementation and independent main-agent acceptance passed; integrated and committed on the current branch. Managed-worktree archive requested; the tool returned queued and physical removal is not yet confirmed. Worktree: `/Users/yuguo/.codex/worktrees/choose-review-interactions/paneon`, based on `5070397e42833843530eb5810cb7b2b7f612feec`. No development accepted yet.

This iteration does not rename feedback event fields, change question/selection schemas, introduce historical compatibility, update installed skills, or change other standard pages. The existing root worktree has unrelated annotation naming and runtime changes; preserve them and do not commit them as part of this task.

## Confirmed current causes

- `skills/paneon/assets/panels/choose/panel.tsx`: option-details trigger unconditionally calls `setDetailId(option.id)`, although `aria-expanded` already reflects the open option.
- The questionnaire's `params.description` is only rendered in a Description Popover. People cannot read it on initial display.
- `submit()` calls `validate(at)`, whose failure path calls `changeQuestion(at)`, forcibly leaving the summary.
- Summary rows are static list items. Missing answers use subdued italic No answer text, and direct return to a chosen question is unavailable.

## Agreed behavior from the screenshots

1. **Toggle details.** Clicking an option's details trigger opens that option. Clicking the same trigger again closes it. Clicking another option's details switches the pane. Both the pane's Close details control and Escape remain supported. Opening or closing details does not change answers, explanations, current question, or emit events. Keep accessible expanded/controls state accurate and an appropriate open/close label. Desktop side pane and narrow dialog retain their existing responsive design.
2. **Visible description.** Render the questionnaire description by default in the header, using restrained body text and the existing themed Markdown renderer. Remove the Description-only discovery step. Preserve content; do not hide critical guidance behind truncation or clamping. Keep the compact title/progress line, current question heading and optional question-specific description. Do not restore redundant generic instruction lines or large typography/margins. Long Markdown and narrow screens must wrap without overflow. Render the description on the review step too.
3. **Visible incomplete answers without forced navigation.** Derive completeness from `answerSchema(question).safeParse(answer(at))`, including a selected custom answer whose body is blank. On the summary, incomplete rows have explicit localized status text and an accessible icon/label plus restrained themed warning/error styling; color alone is insufficient. Preserve nonempty invalid drafts in the preview. On Submit, show an inline localized error/count and remain on the summary. Focus or scroll may target the summary error/row within that page, but must never automatically enter a question. Emit nothing on invalid submit. On valid submit retain the existing complete schema validation, explicit submit, failure retention, locking and correction behavior.
4. **Direct review navigation.** Make every answer-summary row (answered or incomplete) a real keyboard-operable control returning to the corresponding question. Use a clear hover/focus affordance and accessible question label; no nested interactive content. Preserve all drafts. After entering a question from review, provide a direct localized Return to summary action so users with many questions need not traverse all remaining questions again. Existing Previous/Next free navigation continues without requiring answers. Returning to review never emits events or implicitly validates/clears drafts.

## Implementation boundary

The single implementation agent may edit:

- `skills/paneon/assets/panels/choose/panel.tsx`
- `skills/paneon/assets/shared/locales/en.ts`
- `skills/paneon/assets/shared/locales/zh-CN.ts`
- The existing `tests/browser/skill-pages.mjs` choice assertions must be updated for the intentionally changed description and invalid-submit flows; preserve their underlying coverage and all unrelated form tests.
- A new focused real-browser regression file under `tests/browser/` (prefer `choose-review-interactions.mjs`); reuse existing fixtures/helpers where appropriate without changing unrelated suites.
- A new acceptance report `openspec/changes/add-paneon-skill-panels/reports/choose-review-interactions.md`.

Read this main-worktree brief via its absolute path if it is not present in the worktree. Do not modify this brief or central design/tasks concurrently. Worktree starts at the current branch's latest committed HEAD; uncommitted annotation naming changes are intentionally not copied. Additive locale changes will be reconciled at integration without reverting existing root translations. No dependency or shared public UI changes are expected.

## Acceptance

- Real browser: both layouts, same-option open/close, switch between detail options, explicit close/Escape, unchanged answer drafts and no extra events.
- Description visible before any click, long text and no-description inputs, desktop and 390px viewport, light/dark and English/Chinese.
- At least three questions: mix answered/unanswered/blank custom. All invalid summary rows are discoverable; invalid submit stays in review and creates no event. Click first/middle/last rows, preserve independent option explanations/custom drafts, return directly to review; valid explicit submit emits the correct complete result once. Confirm failed submit retains data and existing correction flow is not broken.
- Run appropriate build/typecheck/lint/format and existing `tests/browser/skill-pages.mjs` regressions when feasible; distinguish genuine failures from environmental blockers. Do not delete assertions, add retries/timeouts, or use synthetic store injection to hide product issues.
- Capture representative wide/narrow and dark/light screenshots and report exact evidence paths. Main agent must inspect implementation and perform independent acceptance before integration/commit and managed-worktree archive.

## Task checklist

- [x] Inspect screenshots and actual implementation; isolate root causes.
- [x] Write concrete behavior and file boundaries.
- [x] Dispatch subagent in a fresh worktree from latest committed HEAD.
- [x] Subagent implements and verifies the interactions, then submits a commit/report.
- [x] Main agent reviews changes, performs independent acceptance and reconciles additive locales.
- [x] Commit accepted task changes only.
- [ ] Confirm managed-worktree archival (request sent; tool returned queued).
