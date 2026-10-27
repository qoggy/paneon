# Stateless Git Review Specification

## Purpose

Provide reusable Git and Diff components with explicit reads, browser-owned annotation evidence and preserved review behavior.

## Requirements

### Requirement: Execute Git reads from explicit inputs

Git reads SHALL carry sufficient repository, fixed-version, path and serializable pagination context to execute without preexisting session/listing/history/snapshot Maps. Working-content rereads SHALL return new source identity rather than replace prior displayed data. Required repository/path access boundaries SHALL remain.

#### Scenario: A new execution environment receives a subsequent read

- **WHEN** a browser requests another file or history page with an explicit descriptor after the previous backend state is gone
- **THEN** the result is derived from those inputs and does not require an old in-memory ID lookup

### Requirement: Compose reusable Git and Diff components

Git branch, history and changed-file components SHALL expose semantic repository/version/selection props and callbacks, with named serverAction reads encapsulated by their module or data layer. A generic Diff SHALL render two strings without a Git repository, business session or mandatory annotation setup. Annotation support SHALL remain opt-in and shared consumers SHALL keep working.

#### Scenario: A custom author uses one component independently

- **WHEN** a custom page renders a branch/history/file component or a string Diff outside the built-in Git panel
- **THEN** documented semantic props suffice without copying the built-in page's orchestration or backend session Maps

### Requirement: Bind annotations to browser-retained displayed content

Git annotations SHALL retain source/version/raw evidence and exact target coordinates from the displayed content. Complete explicit submissions SHALL include enough source/evidence for stateless validation without re-reading current files. Later queries SHALL NOT reassign old annotations. Existing event/request size limits, comment fields and complete replacesEventId corrections SHALL remain; no raw snapshot/draft persistence or automatic replay SHALL be introduced.

#### Scenario: Worktree content changes before annotation submission

- **WHEN** a user annotates displayed text, backend state is discarded and the working file is edited
- **THEN** the submitted annotation still describes the original displayed content and is accepted based on its complete internally consistent source/evidence

#### Scenario: Evidence is inconsistent or too large

- **WHEN** source/range/evidence relationships are invalid or the explicit result exceeds current limits
- **THEN** submission fails visibly with the draft retained and no truncated, split or reassigned event is emitted

### Requirement: Preserve current user-visible Git behavior

The refactor SHALL NOT change the built-in Git panel interaction, UI or layout, including controls, wording, positions, defaults, sizing, spacing, scrolling, responsive behavior or keyboard flows. Internal wrappers SHALL preserve the existing rendered structure and behavior; standalone reuse SHALL be demonstrated on separate test/example pages. The refactor SHALL preserve commit selection responsiveness, lazy file reads, fixed branch history and topology, full commit messages, tree statuses and compact paths, splitter/collapse/navigation controls, selection safety and theme/language support. It SHALL NOT implement lifecycle/resource pooling or change PR business protocols.

#### Scenario: A commit is selected before a file is opened

- **WHEN** a user selects a commit then rapidly selects another
- **THEN** the selection updates promptly, stale responses do not replace the newer view and no file Diff is fetched or shown until explicitly requested

### Requirement: Compose Git history with Resizable

The history view SHALL use nested shadcn Resizable groups for its three columns and history/diff rows. The panel SHALL preserve the existing default dimensions, minimum column widths and row heights, compact separator spacing, session proportions and responsive stacked layout. Resizing one column boundary SHALL leave the opposite outer column unchanged and SHALL stop at the commit-list minimum width. The library SHALL own pointer handling and separator accessibility, with existing pixel keyboard steps retained through its layout API.

#### Scenario: Resize a single column boundary

- **WHEN** the user drags either vertical separator within the history view
- **THEN** its neighboring panes resize, the other outer pane retains its width and the commit list remains at least 16rem wide

#### Scenario: Collapse and reopen the history diff

- **WHEN** the user collapses and reopens the history diff or leaves and returns to history
- **THEN** the session layout is restored, loaded content remains associated with the correct commit and resizing does not query Git or emit feedback

#### Scenario: Resize while reviewing retained content

- **WHEN** the user resizes history columns or the history/diff height
- **THEN** the loaded row and diff identities, scroll positions and saved annotations remain available, and a draft editor remains intact during keyboard resizing
