## ADDED Requirements

### Requirement: Accept a choice with optional explanation

The standard choice page SHALL support choosing supplied options with or without a supplementary explanation for each selected option. Each selected option SHALL carry its own string comment, with an empty string representing no explanation; the result SHALL NOT use a shared question-level comment. Questions and options SHALL have stable identifiers so submitted answers can be mapped to the supplied content. The page SHALL retain option summaries, optional Markdown details, recommendation markers, and single/multiple selection support.

#### Scenario: Choose without explanation

- **WHEN** a person selects a valid option and supplies no explanation
- **THEN** the choice is a valid answer and its submitted data identifies the selected option

#### Scenario: Add an explanation

- **WHEN** a person selects an option and adds a change request
- **THEN** the submitted answer preserves both the option identity and the supplied explanation

### Requirement: Accept an independently written answer

The page SHALL always display the custom-answer input, without requiring a mode-switch button, and allow a person who does not accept any supplied option to write an answer without selecting an existing option. In single mode, supplied options and custom text SHALL remain mutually exclusive. In multiple mode, the person SHALL be able to select supplied options and one custom answer together, or either alone. Active selections SHALL be clearly indicated. Submitted data SHALL distinguish that custom answer from a selection and its optional explanation.

#### Scenario: None of the options fits

- **WHEN** a person writes a nonempty custom answer instead of choosing a supplied option
- **THEN** that answer can be submitted without inventing a selected option or requiring a supplied choice

### Requirement: Answer multiple questions in one page

One panel instance SHALL support answering multiple choice questions sequentially in the same browser page. The person SHALL be able to revisit and revise an earlier answer before submitting the complete set of answers. The implementation SHALL NOT require a separate panel instance for each question.

#### Scenario: Move through a set of questions

- **WHEN** the supplied input contains multiple choice questions
- **THEN** the person can answer them within one page and each submitted answer is associated with its question identifier

#### Scenario: Revisit an earlier answer

- **WHEN** a person returns to an earlier question before final submission
- **THEN** its entered answer remains available for editing

### Requirement: Submit the complete set of answers at the end

The page SHALL submit the complete set of answers only after the person explicitly submits the questionnaire at the end. Moving between questions and editing drafts SHALL NOT emit answer events. A successful final submission SHALL save one event containing the final answer for every supplied question, associated with its stable question identifier.

#### Scenario: Continue without submitting

- **WHEN** a person answers a question and moves to another question
- **THEN** the page retains the draft without emitting an answer event for the agent

#### Scenario: Submit all answers together

- **WHEN** a person completes the questionnaire and explicitly submits it
- **THEN** one event contains the final answers to all questions, including selections, supplementary explanations, and custom answers as applicable

### Requirement: Validate answers against the original questionnaire

The input SHALL contain nonempty questions and options with unique scoped identifiers and valid initial selections. Final submission SHALL contain exactly one answer for each input question, reject unknown or duplicate identifiers, enforce single/multiple selection cardinality, and reject blank custom answers. Answers and selected options SHALL follow their original input order. Validation SHALL preserve nonempty user text rather than silently rewriting it. Failed validation SHALL retain drafts and identify the relevant question.

#### Scenario: Submit an invalid complete set

- **WHEN** an answer is missing, duplicated, or points to an option from another question
- **THEN** the page rejects the submission, retains all drafts, and identifies the question without emitting an event

### Requirement: A new questionnaire round uses a new panel instance

One standard choice panel instance SHALL represent one questionnaire round, which can contain multiple questions. When the agent starts a new round, the skill SHALL direct it to create a new panel instance using the ordinary run command and provide the new link. The new round SHALL NOT replace the previous round inside its existing instance. Questions and submitted answers SHALL remain associated with their originating instance.

#### Scenario: Ask follow-up questions after a submitted round

- **WHEN** the agent reads the completed answers and asks a new round of questions
- **THEN** the agent creates a new instance and provides its link while the previous round and its events remain associated with the previous instance

#### Scenario: Reuse question identifiers in another round

- **WHEN** two separate rounds use the same question identifier
- **THEN** their answers are distinguished by the panel instance and are not treated as answers from one evolving questionnaire

### Requirement: Keep explanations with their selected options

Each selected option SHALL display its own optional explanation field within the corresponding card. Switching, deselecting, or revisiting options SHALL preserve independent drafts without moving one option's explanation onto another option. Only selected supplied options and their explanations SHALL be submitted as selections containing kind: option, optionId and comment, in input option order. A selected custom answer SHALL be a sibling selection containing kind: custom and text, appended after supplied options. The question SHALL NOT have an options/custom mode in its result.

#### Scenario: Explain multiple options independently

- **WHEN** a person selects two options and writes different explanations
- **THEN** each explanation stays attached to its own option in the UI, summary, and submitted result

#### Scenario: Return to a deselected option

- **WHEN** a person deselects an option and later selects it again before submission
- **THEN** that option retains its explanation draft, while deselected options do not appear in the submitted result

### Requirement: Present a coherent question layout

The page SHALL visually group the questionnaire title and description, and group question progress, title, and description. It SHALL retain default component styling while avoiding excessive gaps between these related elements.

#### Scenario: Read the questionnaire on a narrow screen

- **WHEN** a person views the page at a narrow viewport
- **THEN** the progress, question, options, per-option explanations, and custom answer remain readable without horizontal page overflow

### Requirement: Combine a custom answer with supplied choices in multiple mode

The page SHALL treat a selected custom answer as a peer of supplied selections, not as a question-level explanation. Entering nonblank custom text SHALL select it without clearing supplied selections; deselecting it SHALL retain its draft without submitting it. At most one custom selection is allowed per question, and selected custom text SHALL not be blank.

#### Scenario: Select supplied options and an additional custom answer

- **WHEN** a person selects supplied options and writes an additional answer in a multiple-choice question
- **THEN** both the selected supplied options with their individual explanations and the selected custom answer are submitted together

#### Scenario: Deselect a custom answer

- **WHEN** a person deselects the custom answer in multiple mode
- **THEN** its draft text is retained but excluded from submission, and supplied selections remain unchanged
