## ADDED Requirements

### Requirement: Keep displayed review data and annotation identity in the browser

Git/PR adapters SHALL retain the exact displayed source metadata and raw content in browser-owned state while annotations or their complete corrections refer to it. An annotation SHALL describe what the person saw, not the latest repository or remote content. Later reads SHALL create a new displayed version rather than change existing targets. Execution-only suspension SHALL NOT discard the mounted client or require persistence of raw review snapshots. Closing or reloading the browser SHALL NOT imply recovery of unsubmitted drafts.

#### Scenario: A working file changes during suspension

- **WHEN** a mounted page retains an annotation and the file changes while its backend worker is absent
- **THEN** submission refers to the original displayed content without re-reading the new file to reinterpret the annotation

#### Scenario: A PR description changes remotely

- **WHEN** remote PR content changes after a browser has displayed and annotated it
- **THEN** its existing annotation retains the original object/version/content and later query results cannot overwrite that source

### Requirement: Keep reusable component inputs independent of backend snapshot sessions

A generic Diff SHALL support two supplied strings and optional paths, versions, semantic annotation context and callbacks without requiring a repository or backend business session. Git-reading components or their data layers MAY encapsulate serverAction calls using explicit repository, branch/commit, path and pagination inputs. Git/PR read calls SHALL work in a new worker without required old session/listing/history Maps; caches MAY accelerate reads but SHALL be bounded and reconstructible.

#### Scenario: A custom page compares authored strings

- **WHEN** an author supplies two strings without any Git repository
- **THEN** the Diff and its annotations work from the supplied content and author-provided references

#### Scenario: A file is opened after the worker was collected

- **WHEN** a person opens another file, changes the selected commit or requests another history page after worker recreation
- **THEN** explicit read inputs suffice and a missing old session/listing/history cache is not a prerequisite failure; newly observed working content gets a new identity

### Requirement: Submit self-contained annotation sources and evidence

Standard Git/PR pages SHALL submit annotations, source/version metadata and enough exact raw evidence to interpret their file, hunk, line/text or PR-object targets without resolving opaque IDs in an old backend Map. Sources MAY be deduplicated within an event. File-level targets SHALL carry source identity and side metadata without requiring full file content. Text targets SHALL carry exact selected line-span content and UTF-16 ranges/quotes; hunk targets SHALL carry the original patch and needed side fragments; PR object targets SHALL carry original displayed fields or text and observation/version context. Generic Feedback annotations/comment semantics SHALL remain composable and page-defined.

#### Scenario: A fresh worker receives an annotation

- **WHEN** a person explicitly submits retained browser annotations to a newly initialized worker
- **THEN** the supplied sources/evidence suffice to validate internal consistency and append the event without a prior snapshot Map, disk snapshot or Git/gh reread

#### Scenario: A range conflicts with its supplied evidence

- **WHEN** the quote, line span or grapheme boundaries do not match submitted original evidence
- **THEN** submission fails with the browser draft retained and does not substitute current content or another occurrence

### Requirement: Bound validation, privacy and payload responsibilities

Backend validation SHALL check declared Zod structure, source/target associations, configured repository ownership, range/patch consistency and existing size limits using the supplied event and fixed panel configuration. Partial evidence SHALL NOT be claimed to independently prove a full-file content hash or repository authenticity. This change SHALL NOT introduce signature/attestation infrastructure, raw snapshot files, a business storage directory or draft persistence. Submitted original text MAY be stored as part of the existing explicit annotation event. Credentials SHALL NOT be included. Events SHALL remain within 65536 UTF-16 characters and complete requests within 262144 UTF-8 bytes; oversized results SHALL fail without truncation, automatic splitting, emission or fallback persistence.

#### Scenario: Complete evidence exceeds the event limit

- **WHEN** an explicit annotation result exceeds the existing event/request size limit
- **THEN** the page preserves the draft, explains the limit and emits no incomplete or automatically split result

#### Scenario: A browser is closed before submission

- **WHEN** a person closes a page holding only in-memory annotation drafts
- **THEN** no annotation event or source-snapshot file is created by that closure

### Requirement: Preserve explicit submission and complete corrections

Worker recreation, reconnection and source reads SHALL NOT automatically emit feedback, replay a mutation or advance consumer acknowledgements. The person SHALL explicitly submit one complete result with any existing replacesEventId; full Zod validation and durable append SHALL precede success reporting. Saved browser annotations SHALL remain distinct from submitted SQLite events.

#### Scenario: A person corrects annotations after backend recreation

- **WHEN** the mounted page retains a successful receipt, the worker is recreated and the person explicitly submits a correction
- **THEN** one complete result includes the original displayed sources/evidence and replacesEventId without duplicate automatic submission
