## Why

Choose only shows one question at a time, so people cannot see the questionnaire's topics or jump directly between them while answering. The approved design adds a persistent question directory beside the existing question column.

## What Changes

- Show question numbers, full titles and existing answer status in a left directory, with the current question highlighted independently of its answer status.
- Let people jump to any question or open answer summary without discarding drafts or submitting answers.
- Keep long directories independently scrollable and keep the current question visible.
- Show only answered / not answered in the directory, as clarified by the user. A blank selected custom answer is not answered.
- Follow-up request: select the custom answer whenever its text is edited, including whitespace input or clearing, so editing cannot silently leave a supplied option selected instead.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `guided-choice-panel`: Add a persistent question directory with direct navigation and existing answer-status presentation.

## Impact

Only the Choose panel, its shared locale labels and focused browser coverage change. Input/output schemas, answer construction, validation, submission, persistence, runtime and public components remain unchanged.
