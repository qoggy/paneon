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

The panel SHALL allow text annotation on existing sides, preserve the exact read snapshots for annotation resolution and location, and emit `diff-review-submitted` only after explicit submission. Submission SHALL validate referenced manifest entries, snapshot identity and original UTF-16 text ranges. Events SHALL carry the complete annotations and referenced source descriptors with internally generated identities; they SHALL retain selected quotes without embedding whole files. Corrections SHALL replace the previous successful event through replacesEventId; failures SHALL retain the draft.

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
