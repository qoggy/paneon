## MODIFIED Requirements

### Requirement: Identify semantic objects and selected text

Submitted targets SHALL contain a JSON-serializable reference and an optional original-source text range. Author-defined targets SHALL preserve their page-defined semantic reference; framework-selected rendered elements SHALL use `{element:{path,tag,excerpt}}` without requiring author registration. These DOM element references SHALL describe rendered content and SHALL NOT claim a business identity or source-code location. Ordinary text and image-syntax ranges SHALL contain start, end and exact quote. Mermaid targets SHALL carry type='mermaid'; their optional text range SHALL contain only start/end, while the framework retains full original source and AST evidence internally for validation and location. Whole-object targets SHALL omit the text range. Registered plain text SHALL support selecting a word or continuous fragment using original-string UTF-16 offsets and a quote consistent with that range. Page adapters SHALL define semantic identity, content association, validation, and navigation for author-defined targets; framework element targets SHALL use their registered rendered geometry instead of being passed to business-specific adapters.

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

#### Scenario: Annotate rendered content without an author reference

- **WHEN** a person selects an ordinary rendered element through the shared floating picker
- **THEN** its generated element reference is accepted alongside author-defined targets, with unchanged editor and submission behavior

### Requirement: Use the same anchor when editing saved annotations

Opening an existing annotation whose target is available from its marker or from the directory edit action SHALL anchor the shared editor to the corresponding numbered marker with the same alignment and collision behavior. Directory editing SHALL retain its existing wait for target location and scrolling to settle. If a generated element target is hidden or removed when directory editing begins, the same editor SHALL open at the viewport's bottom-right with 16px clearance, preserving the saved identity, targets, comment and save/cancel/delete behavior. An offscreen rendered target SHALL still be scrolled into view. No automatic view restoration or replacement-target matching is introduced.

#### Scenario: Edit the same target from either entry

- **WHEN** a person opens the same saved annotation from its marker and from the directory at the same viewport and scroll position
- **THEN** the editor uses the same marker anchor and appears in the same position

#### Scenario: Edit an unavailable element's opinion

- **WHEN** a person hides or removes a previously annotated element and chooses Edit from the directory
- **THEN** the original editor opens at the bottom-right with the saved comment, without attempting to locate or restore that element
- **AND** saving updates only the opinion, cancellation discards unsaved changes and deletion removes the annotation through the existing flow
