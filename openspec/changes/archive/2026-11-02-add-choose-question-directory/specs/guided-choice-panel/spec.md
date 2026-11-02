## ADDED Requirements

### Requirement: Navigate through a persistent question directory

On desktop, Choose SHALL display a left question directory beside the question or summary. It SHALL list each input question in original order with its number, title and answer status. It SHALL distinguish the current question independently from answered status and offer answer summary as a separate entry. Long titles SHALL use single-line ellipsis, and long question lists SHALL scroll independently while keeping the current question visible after navigation.

The directory SHALL align the plain question number, single-line title and answer-status symbol in one row. Only an actually truncated title SHALL show its full original text in a Tooltip on hover or keyboard focus. Full titles SHALL remain available to accessible naming and in the main question heading. Number and status columns SHALL retain their widths. Answered SHALL display a check icon and unanswered SHALL leave the status column visually empty, with translated status text available to assistive reading and no status Tooltip. The visible heading SHALL be Questions / 问题. The current location SHALL match Markdown outline highlighting with blue semibold text and a transparent background, without number circles or an additional left indicator. The directory summary entry SHALL provide direct return to review, without a duplicate return-to-summary button below the question. Previous and Next SHALL remain available.

#### Scenario: Read a truncated question title

- **WHEN** a title exceeds its available directory width and the person hovers or keyboard-focuses its row
- **THEN** the row stays on one line with ellipsis, the full original title appears in a Tooltip and neither answers nor navigation change

#### Scenario: Read a short question title

- **WHEN** a title fits within its available directory width
- **THEN** no title Tooltip appears, including when the row is hovered or focused

#### Scenario: Read symbolic answer status

- **WHEN** a person reads a directory question
- **THEN** an answered question displays a check icon and an unanswered question leaves that space empty, without a status Tooltip, while both translated statuses remain available to assistive reading

#### Scenario: Jump directly to an unanswered question

- **WHEN** a person activates any directory question, including an unanswered question, by pointer or keyboard
- **THEN** that question opens, its heading receives focus, the directory highlights it, previous drafts remain intact, old details close and no answer event is emitted

#### Scenario: Show only answered or not answered

- **WHEN** a selected custom answer is blank
- **THEN** the directory shows not answered, does not count that question as answered and does not prevent navigation; the directory uses only answered and not answered statuses

#### Scenario: Open summary directly

- **WHEN** a person activates the summary entry before answering all questions
- **THEN** the existing summary opens and gains the current-location highlight without validation or submission, and directory questions remain available

#### Scenario: Navigate a long question list

- **WHEN** Previous or Next opens a question outside the directory's visible scroll area
- **THEN** the directory scrolls enough to reveal its current item without changing drafts or scrolling the page to the directory

#### Scenario: Read the simplified question and summary headers

- **WHEN** a person reads a question or opens summary
- **THEN** the directory has no completion counter and the question header has no position fraction; summary shows one Answer summary heading with completion progress, and navigation to summary focuses that heading

#### Scenario: Distinguish unanswered items from submission errors

- **WHEN** a person opens summary with incomplete answers before trying to submit
- **THEN** incomplete statuses use neutral styling without exclamation marks, and only a rejected submission activates the existing error emphasis without changing completeness or validation

### Requirement: Select the custom answer when its text is edited

Editing custom-answer text SHALL select the custom answer regardless of whether the edited value is nonblank, whitespace or empty. Single mode SHALL use its existing exclusive selection behavior; multiple mode SHALL retain supplied selections. Subsequent explicit selection or deselection SHALL remain available. Existing final-submission validation SHALL remain unchanged.

#### Scenario: Edit custom text after selecting a supplied option

- **WHEN** a person selects a supplied option and edits the custom-answer input, including entering whitespace or clearing its text
- **THEN** Other becomes selected, the supplied choice is excluded in single mode and retained in multiple mode, and no event is emitted

#### Scenario: Select another answer after editing

- **WHEN** a person explicitly selects a supplied answer in single mode or deselects Other in multiple mode after editing custom text
- **THEN** that explicit selection takes effect while the custom-text draft is retained

## MODIFIED Requirements

### Requirement: Present a coherent question layout

The page SHALL visually group the questionnaire title and description, and group the question title and description. The answering page SHALL NOT repeat the directory's current-location information as a question-position fraction or show a separate completion counter. It SHALL retain default component styling while avoiding excessive gaps between these related elements.

#### Scenario: Read the questionnaire on a narrow screen

- **WHEN** a person views the page at a narrow viewport
- **THEN** the question, options, per-option explanations, and custom answer remain readable without horizontal page overflow

### Requirement: Keep questionnaire guidance visible

Optional questionnaire Markdown SHALL be visible on initial display and on review, without a disclosure, truncation, or oversized typography. The compact questionnaire title and question-specific description SHALL remain separate. Long content SHALL wrap and remain fully readable on narrow screens.

#### Scenario: Read questionnaire guidance before answering and during review

- **WHEN** a questionnaire includes Markdown guidance and a person opens it or enters review
- **THEN** the complete guidance remains visible without opening a disclosure, and long content wraps within the page

### Requirement: Review without forced navigation

Every incomplete answer SHALL be visibly identified in the summary with explicit status text, including a selected custom answer whose text is blank. Before an incomplete submission attempt, incomplete rows SHALL use neutral styling without error icons. When an incomplete final or corrected submission is rejected, invalid rows SHALL add an error icon and error color to their explicit status text. The page SHALL remain on review, retain all drafts, display an inline incomplete count and emit no event. It SHALL NOT automatically enter a question.

#### Scenario: Submit an unfinished questionnaire from review

- **WHEN** a person presses Submit while some answers are incomplete
- **THEN** review remains visible, all invalid rows retain their status with an error icon and error color, and the inline error is focused without changing the current question or emitting an event
