## ADDED Requirements

### Requirement: Add absolute local repositories

The Git review panel SHALL provide absolute-path input and a Browse directory selector. It SHALL reject relative paths, files, non-repositories and bare repositories, resolve Git roots and real paths, and reject duplicate worktree roots without navigation. Different worktrees SHALL remain distinct. Successful addition SHALL append the repository and open its working changes while preserving other views and annotations. Cancellation and failed validation SHALL leave the list and current view unchanged.

#### Scenario: Add a nested absolute directory

- **WHEN** a person adds an absolute subdirectory of a new Git worktree
- **THEN** the real worktree root is appended and selected with working changes

#### Scenario: Reject duplicate and relative input

- **WHEN** a person adds a relative directory or an alias of an already active worktree
- **THEN** the dialog retains input and displays an error without changing repositories or views

#### Scenario: Browse and cancel

- **WHEN** a person navigates directories and chooses one
- **THEN** its absolute path fills the add input and only explicit Add validates and adds it
- **AND** cancellation or a late response after cancellation cannot add a repository

### Requirement: Remove only inactive repositories with submitted feedback

The panel SHALL prohibit removing the current repository, including the sole repository. It SHALL prohibit removing any other repository whose annotations differ from its last successful submission, including additions, changes and deletions. Other repositories' drafts SHALL NOT block removal. Submitted history SHALL remain. A removed repository SHALL lose its browsing caches; re-adding SHALL read current content without restoring old editable drafts.

#### Scenario: Current and sole repositories

- **WHEN** a person attempts to remove the current repository
- **THEN** removal is blocked with a reason requiring navigation to another repository

#### Scenario: Unsubmitted edits or failed submission

- **WHEN** an inactive repository has new annotations, changed/deleted submitted annotations, or a failed submission
- **THEN** removal is blocked and all draft contents remain available

#### Scenario: Remove submitted feedback without retracting it

- **WHEN** an inactive repository has no unsubmitted changes and is removed, followed by a submission for another repository
- **THEN** its completed feedback remains in the complete replacement event unchanged

### Requirement: Preserve session and operation boundaries

Repository list changes SHALL remain browser-session-local. Reload SHALL restore initial configuration. Reading errors SHALL use existing visible error handling. Late query results SHALL NOT restore removed repositories or override newer views. Checkout and submission SHALL disable repository management until completion without queuing operations. Annotation editing SHALL use the shared editor's save/cancel workflow before management actions.

#### Scenario: Reload and busy operations

- **WHEN** a person reloads the page after changing its repository list
- **THEN** initial input is restored
- **AND** checkout or submission in progress blocks Add and Remove until it settles
