## MODIFIED Requirements

### Requirement: Identify semantic objects and selected text

Submitted targets SHALL contain a JSON-serializable page-defined object reference and an optional original-source text range. Ordinary text and image-syntax ranges SHALL contain start, end and exact quote. Mermaid targets SHALL carry type='mermaid'; their optional text range SHALL contain only start/end, while the framework retains full original source and AST evidence internally for validation and location. Whole-object targets SHALL omit the text range. Registered plain text SHALL support selecting a word or continuous fragment using original-string UTF-16 offsets and a quote consistent with that range. Page adapters SHALL define semantic identity, content association, validation, and navigation; arbitrary DOM positions SHALL NOT substitute for semantic targets.

#### Scenario: Select two objects together

- **WHEN** a person selects two registered nonadjacent objects and adds one annotation
- **THEN** that annotation retains both references as its own target set

#### Scenario: Select a word within plain text

- **WHEN** a person selects a word in registered plain text and adds an annotation
- **THEN** the target contains its object reference and the matching original-text range and quote

#### Scenario: Submit Mermaid without author-side filtering

- **WHEN** a person saves and explicitly submits a whole Mermaid annotation
- **THEN** the public draft and onSubmit target contain the original ref and Mermaid type, plus a quote-free original fence range for Markdown, while ordinary text/image quotes remain unchanged
- **AND** authors can reuse annotationValueSchema and send targets without parsing Mermaid or deleting quote fields
