## ADDED Requirements

### Requirement: Offer word wrapping with CodeBlock interaction

Public DiffView SHALL accept `defaultWrap?: boolean`, defaulting to false, and own the user's wrap state internally. Its toolbar SHALL group difference navigation separately from display options, use a side-by-side/unified radio menu showing the current layout, and keep fixed wrap and hide-unchanged-lines icons in icon-sm buttons. Both toggles SHALL use secondary styling when on and ghost when off, with localized tooltips and aria-pressed semantics. The wrap tooltip SHALL state the current state and next action. Split, unified and whole-file single-sided views SHALL share the same state. Diff Review and Git Review SHALL inherit this behavior without panel-specific wrap parameters or state.

#### Scenario: Retain the default long-line presentation

- **WHEN** a user opens a DiffView without specifying defaultWrap
- **THEN** long source lines remain unwrapped and horizontally scrollable

#### Scenario: Start with wrapping enabled

- **WHEN** a caller passes defaultWrap=true
- **THEN** source text and long unbroken strings wrap within the available source width while preserving whitespace and logical line numbers

#### Scenario: Toggle wrapping

- **WHEN** the user activates the toolbar's wrap button by pointer or keyboard
- **THEN** both sides switch together, the pressed state and tooltip update, and disabling wrapping restores horizontal content scrolling without moving the toolbar

#### Scenario: Recognize the current state without hover

- **WHEN** the wrap state changes
- **THEN** the wrap icon stays fixed while selected styling and aria-pressed reflect the resulting state

#### Scenario: Choose a comparison layout

- **WHEN** the user opens the layout menu and chooses side-by-side or unified by pointer or keyboard
- **THEN** the selected radio item and trigger text show that layout while preserving navigation, wrapping and annotations

#### Scenario: Toggle context presentation

- **WHEN** the user activates the hide-unchanged-lines icon
- **THEN** the existing context presentation toggles, selected styling reflects hidden context, and aria-expanded reflects whether all context is shown

#### Scenario: Preserve the initial-value lifecycle

- **WHEN** a mounted DiffView receives a changed defaultWrap or source after the user chooses a wrap state
- **THEN** that choice remains until unmount; a new instance initializes from its own defaultWrap

### Requirement: Preserve source identity and diff geometry during wrapping

Visual wrapping SHALL NOT insert source newlines, renumber logical lines, replace source text nodes, reread files or emit feedback. Annotation quotes and UTF-16 ranges SHALL retain their original source meaning. Reflow after toggling, resizing or changing diff modes SHALL update connected scrolling, connectors, overview markers and annotation geometry from actual source row heights. End-of-file notes and hunk titles SHALL fit the wrapped width.

#### Scenario: Resize asymmetrically wrapped columns

- **WHEN** the user resizes the old/new divider or changes available panel width while source lines wrap to different heights
- **THEN** each source remains continuous and the connected track, connectors and annotations follow the new measured geometry

#### Scenario: Annotate across visual lines

- **WHEN** the user selects text spanning visual wraps, toggles wrapping or switches diff modes, and submits an annotation
- **THEN** its quote and UTF-16 range still identify the same original text, including CRLF and Unicode content
