## MODIFIED Requirements

### Requirement: Supply File Review as the standard content-review entry

The product skill SHALL ship `assets/panels/file-review/panel.tsx` with definition id `file-review` and event type `file-review-submitted` as its standard content-review panel, following the file-review capability. It SHALL replace the former `assets/panels/review/panel.tsx`, `review` definition and `review-submitted` event without a legacy alias or acceptance of markdownFilePath. Existing stored historical events SHALL NOT be rewritten or relabeled as the new event type, and existing instances SHALL NOT be automatically migrated.

The built-in panel table SHALL direct complete text files, directory lists or their combination to File Review, original/proposed pairs to Diff Review and repository changes/history to Git Review. A dedicated `references/file-review.md` SHALL document when to use the panel, what it achieves, its strict input and complete submission contract, original snapshot offsets, linked-file source groups and correction/withdrawal semantics using `files: []` for withdrawal. Public examples SHALL nest annotations under file metadata without internal annotation ids, fileIndex/ref, duplicated snapshot ids or separate sources lookup tables. The old review reference SHALL be removed. Agent-facing references SHALL NOT document panel layout specifications or recommend private shared asset modules as public APIs. Existing CodeBlock authoring guidance and public API SHALL remain unchanged by this panel integration.

#### Scenario: Discover the correct panel for a mixed deliverable

- **WHEN** an agent needs a person to review a Markdown plan plus a code or configuration file without a before/after comparison
- **THEN** the skill points to File Review with an explicit file manifest and its input/result reference

#### Scenario: Migrate a single-document call

- **WHEN** an agent follows the updated skill for an existing Markdown document
- **THEN** it uses the file-review entry with a one-item files array containing the Markdown path string and consumes file-review-submitted with annotations nested under the actual file's metadata

#### Scenario: Interpret linked-file feedback directly

- **WHEN** the submitted opinion addresses a file opened through a Markdown link
- **THEN** the reference explains that its file group's path/snapshotId and nested text ranges describe that linked file, without requiring an internal Markdown ref or source-table join

#### Scenario: Interpret a selected path annotation

- **WHEN** a submitted target contains `{path: {quote}}`
- **THEN** the reference explains that quote is selected path text under the enclosing file group, while body annotations retain their existing text ranges and no pathText or displayPath is introduced

#### Scenario: Read old persisted feedback

- **WHEN** a consumer reads a historical review-submitted event after the new panel is introduced
- **THEN** the old record retains its original event type and payload, and no automatic conversion or instance migration is claimed

#### Scenario: Run the installed skill outside the source repository

- **WHEN** the matching packaged skill is installed and its file-review entry is run from another cwd with valid input
- **THEN** the entry compiles against public SDK/UI exports, resolves relative file and directory paths against that cwd and supports reading and submitting precise file feedback

#### Scenario: Request directory discovery

- **WHEN** an agent wants one page for multiple directories and supplementary files
- **THEN** the input reference documents directories, combination with files and recursive discovery without requiring caller-side enumeration
