## Context

The approved desktop design pairs a persistent left directory with the existing narrow question column. Choose already owns drafts, per-question completeness, free navigation, independent details and summary navigation. The workspace also contains unrelated Markdown changes, which remain untouched.

## Goals / Non-Goals

**Goals:** Make all question topics discoverable and allow direct navigation while retaining drafts. Distinguish current location from answer completeness. Keep a long directory usable beside long question content.

**Non-Goals:** No new validation, browsing restrictions, answer state, event protocol, persistence policy, search/filter controls, answer previews, public components or mobile-specific interaction. Submission and correction retain their current behavior.

## Decisions

- Use the approved persistent directory rather than the alternative disclosure. Compose existing Page and Button components with a semantic navigation list; keep the question controls at their existing width and styling.
- Read status from existing `complete`: answered when complete, otherwise not answered, including blank selected custom answers. The directory has exactly these two statuses. Status never gates navigation. Following approved proposal A, show a plain number and single-line title, with an existing shared Check icon on the right only for answered questions; unanswered questions leave that fixed-width space empty. Retain translated status text for assistive reading; do not show a status Tooltip because it repeats the symbol's meaning. Match the actual Markdown outline styling: current question or summary uses semibold blue text (blue-600 in light mode, blue-400 in dark mode), other items use muted text and all row backgrounds stay transparent. Number circles and the extra left indicator remain removed. Existing summary messages remain unchanged.
- Long directory titles use CSS ellipsis while preserving the full text for accessible naming and the current question heading. Measure actual title overflow on layout, resize and style transitions; only truncated titles enable the existing Tooltip for hover or keyboard focus. The Tooltip contains the complete original title, never status text. Number and status columns keep their widths. Proposal A shortens the visible directory heading to Questions / 问题 and aligns it and summary with the rows. Widen the desktop directory from 15rem to 17rem and the page maximum from 54rem to 56rem, keeping the existing question-column width at the maximum layout. Questionnaire data remains unchanged.
- Call existing `changeQuestion` and `review` from directory buttons. Focus the question/review heading after activation, retaining existing draft/detail-clearing behavior. Directory controls follow the existing pending-submission freeze.
- Keep the directory sticky on desktop, with only the question list scrolling and the summary entry outside that scroll area. Adjust the list's scroll position when navigation makes its current item invisible; do not move the document merely to expose a directory item. At insufficient widths, let the grid stack naturally.
- Preserve Previous and Next. Keep the directory summary entry as the sole direct summary control, removing the duplicate bottom return-to-summary action and its display-only `hasReviewed` state. The directory is also present on summary; summary is a separate location, not an extra question.
- Remove both the directory completion counter and the question-position fraction from the answering page; numbers, current highlighting and answered checks remain in the directory. Show completion progress only beside the single Answer summary heading in the summary region. Remove the duplicate Review all answers / Answers heading pair. Keep the summary heading as the navigation focus target. Display incomplete summary rows neutrally until the existing `showReviewError` is true after a rejected submit; only then show red emphasis and an exclamation mark. Completeness, validation and submission rules are unchanged.
- Follow-up request: custom-text `onChange` always sets the existing `customSelected` state to true instead of conditioning that update on trimmed nonempty text. Single-mode exclusivity and multiple-mode coexistence already derive from that state. Focusing without editing does not select an answer; the person can explicitly select a supplied answer or deselect Other afterwards. Existing blank-custom final validation remains unchanged.

## Risks / Trade-offs

- [The wider layout changes old centered-column geometry assertions] → Update only Choose geometry expectations and retain behavioral regression coverage.
- [Long titles and question sets can overwhelm the directory] → Use single-line ellipsis with full-title disclosure for pointer/keyboard users and constrain the independently scrolling list to the desktop viewport.
- [Duplicate state could disagree with submission] → Reuse the existing completeness calculation; add no answer/status persistence or additional schema checks.
