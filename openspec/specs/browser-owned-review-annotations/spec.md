# Browser Owned Review Annotations Specification

## Purpose

Retain displayed review evidence in the browser and validate explicit submissions without prior execution memory.

## Requirements

### Requirement: Preserve originally displayed review content in the browser

Review pages SHALL retain the exact displayed source and coordinates while referenced by drafts/corrections. A later working-file or remote PR change SHALL create separate display data rather than reinterpret old annotations. No mandatory server snapshot persistence SHALL be introduced.

#### Scenario: Working file changes after drafting

- **WHEN** the browser drafts an annotation against the displayed file and the file later changes
- **THEN** submission SHALL carry the original source evidence and SHALL NOT reread the latest file to explain that annotation

### Requirement: Validate submissions without previous execution memory

Git and PR reads SHALL take explicit scope, version and path/page arguments. Their review adapters SHALL retain source metadata and saved selected content for delivery, with source resolution and range checks confined to location. A request worker SHALL not require prior session/listing/history/snapshot Maps. Feedback delivery SHALL NOT require checking original source text, coordinates or content hashes; PR feedback SHALL be built from browser-owned metadata without a separate source-integrity preflight.

#### Scenario: Previous execution thread no longer exists

- **WHEN** a browser submits a complete review after the reading task thread was destroyed
- **THEN** validation SHALL use that complete request and configured scope, and SHALL not require a previous execution context or backend business snapshot

### Requirement: Keep full schema validation and explicit persistence

Declared schemas SHALL retain structural and transport validation. Feedback submission SHALL NOT compare saved quotes or ranges to source text or recheck source content hashes; source checks remain independent location behavior. The main server SHALL recheck revision and closed state in the append transaction, preserve existing payload limits, and return a durable receipt only after successful append. Drafts SHALL remain browser-local.

#### Scenario: Validation or append fails

- **WHEN** structural validation, limits, revision checks or persistence fail
- **THEN** the browser SHALL preserve its draft and the framework SHALL not truncate, split, replay or replace evidence with latest content

### Requirement: Preserve review interaction and delivery semantics

Git/PR props, interaction, UI and layout SHALL remain unchanged. Corrections SHALL be complete events with replacesEventId. Event reads and acknowledgements SHALL remain independent; partial source consistency MUST NOT be presented as proof of repository authenticity.

#### Scenario: Source-only refactoring

- **WHEN** explicit cwd, bounded reused execution and browser-owned source are integrated
- **THEN** branch/commit/file selection, on-demand diffs, annotations and submission controls SHALL keep their accepted behavior
