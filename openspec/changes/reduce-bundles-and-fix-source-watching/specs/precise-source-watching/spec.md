## ADDED Requirements

### Requirement: Shared hot-panel subscriptions

Runtime SHALL share one lazy Vite source watcher and subscribe only to hot panels' local inputs, relevant resolution candidates and production env candidates. Removing a panel SHALL preserve other panels' subscriptions. Cold restore and no-watch panels SHALL not subscribe.

#### Scenario: Shared dependency survives eviction

- **WHEN** two hot panels subscribe to one file and one panel is retired
- **THEN** changing the file still updates the remaining panel

#### Scenario: Unrelated directory is not scanned

- **WHEN** the entry directory contains unrelated nested files
- **THEN** they are absent from watcher traversal and do not trigger a panel rebuild

### Requirement: Changes and failed attempts remain recoverable

Watch updates SHALL handle creation, deletion, restoration and candidate changes. Failed compiler attempts SHALL return local watch evidence separately from diagnostics, retain the successful graph and replace previous failed evidence. Changes during compilation or subscription updates SHALL remain pending and be reconciled without action replay.

#### Scenario: New dependency is corrected

- **WHEN** a new imported file fails typechecking and is subsequently corrected
- **THEN** the panel automatically rebuilds and clears its diagnostic

#### Scenario: Higher priority candidate appears

- **WHEN** a missing local module candidate becomes the preferred resolution
- **THEN** the panel automatically compiles the new resolution

#### Scenario: Save overlaps compilation

- **WHEN** a source save arrives while a prior snapshot is compiling
- **THEN** the final successful panel reflects the latest source without requiring manual reload

### Requirement: Environment changes update the browser revision

Existing .env, .env.local, .env.production and .env.production.local files SHALL participate in source revision hashing. All four candidates SHALL be watched, including absent files. These changes SHALL use ordinary invalidation without restarting Vite or losing external dependencies.

#### Scenario: Environment value changes

- **WHEN** a hot panel's production env value changes
- **THEN** its revision changes and its open browser renders the new value automatically

### Requirement: Existing source lifecycle semantics remain

Unchanged automatic updates SHALL retain the worker and module state. Explicit reload SHALL force compilation and execution replacement. Bounded residency, no-watch, cold activation and artifact retention SHALL continue to apply.

#### Scenario: Same contents are saved

- **WHEN** a hot source is saved without changing its contents
- **THEN** its build is reused and its execution remains usable
