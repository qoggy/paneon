# Diff Review Specification

## Purpose

Provide a built-in, non-Git path comparison panel with file navigation, preserved annotations and shared resizable review layouts.

## Requirements

### Requirement: Provide a built-in path comparison panel

Paneon SHALL ship `assets/panels/diff-review/panel.tsx` with definition id `diff-review`, documented in the skill built-in table and a dedicated input/result reference. The panel SHALL accept an optional title and a nonempty files array containing optional displayPath and nullable oldPath/newPath, with at least one side present. It SHALL NOT require proposal IDs, versions, node IDs or Git fields. Missing paths SHALL be errors rather than absent sides. Reads SHALL be read-only and relative paths SHALL resolve against the panel working directory.

#### Scenario: Run without a Git repository

- **WHEN** the agent runs the built-in entry with only original/proposed paths outside a Git repository
- **THEN** Paneon reads the files and opens the first comparison with full diff context and all directories expanded

### Requirement: Present file paths with familiar navigation

The panel SHALL provide directory/flat mode, directory-first name sorting, single-directory-chain compression, visible file counts, case-insensitive search over display and both physical paths, and the existing four file toolbar actions. It SHALL distinguish addition, modification, deletion, equality, pending comparison and read failure without requiring agent-supplied status. The shared Tree SHALL remain Git-independent.

#### Scenario: Search a path and restore layout

- **WHEN** a search matches a physical path of a deeply nested entry
- **THEN** the leaf and its original compressed ancestor labels remain visible with matching counts, and clearing search restores the saved base expansion

### Requirement: Submit annotations tied to preserved comparisons

The panel SHALL allow text annotation on existing sides, preserve the exact read snapshots for annotation resolution and location, and emit `diff-review-submitted` only after explicit submission. Submission SHALL retain saved quotes, coordinates and snapshot metadata without comparing original text, text ranges or content hashes. Manifest metadata and event structure SHALL remain validated. Events SHALL group the complete feedback in `files`, with each original file snapshot carrying its paths, snapshot identity and annotations together. Targets SHALL carry their side and original text ranges without repeating the enclosing source identity. Internal file indexes and annotation IDs SHALL remain in the editable draft rather than the published event. Events SHALL retain selected quotes without embedding whole files. Corrections SHALL replace the previous successful event through replacesEventId; an empty `files` array SHALL withdraw all earlier feedback. Failures SHALL retain the draft.

#### Scenario: Submit several annotations on one snapshot

- **WHEN** a user submits several annotations on one original file snapshot
- **THEN** the event contains one file entry with all those annotations, publishing its paths and snapshot identity once without a separate sources table

#### Scenario: Locate and submit after a physical file changes

- **WHEN** a user annotates a displayed file, opens another file and the original file changes on disk
- **THEN** locating the annotation restores the preserved comparison, and submitting retains the original quote and snapshot identity

#### Scenario: Submit a correction

- **WHEN** a user changes annotations after a successful submission and explicitly submits again
- **THEN** the new complete result identifies the previous event through replacesEventId

### Requirement: Share a resizable file comparison layout

Diff Review and Git Review's changes/compare views SHALL compose the public shadcn Resizable primitives through one shared file-review split. They SHALL use a narrow visual divider with a practical mouse target, preserve size constraints, support pointer and keyboard resizing, cancel active drags with Escape and retain the layout within the current panel session. The library SHALL own pointer sizing and separator accessibility. Resizing SHALL NOT replace the displayed diff or annotation draft, query files or emit submission events. Git Review's existing history layout SHALL remain unchanged.

#### Scenario: Resize while reviewing an annotated file

- **WHEN** the user drags the file-list separator or adjusts it by keyboard
- **THEN** the list and diff widths change within their bounds, the diff DOM and draft remain mounted and no read or submission occurs

#### Scenario: Reopen a collapsed Git diff

- **WHEN** the user collapses and reopens the diff or leaves and returns to the changes view
- **THEN** the separator returns with its previous width and the existing Git layout is retained

#### Scenario: Resize the old and new columns within DiffView

- **WHEN** the user drags the internal old/new divider
- **THEN** Resizable manages the column sizes, every hunk and path header uses the same boundary, source text nodes and annotations are retained and horizontal panes remain independently scrollable
- **AND** switching unified/side-by-side modes retains the ratio, while added/deleted whole files remain full-width without an internal divider

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
