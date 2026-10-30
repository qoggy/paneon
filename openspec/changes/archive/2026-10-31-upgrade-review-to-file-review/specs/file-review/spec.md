## ADDED Requirements

### Requirement: Accept an explicit manifest of local text files

File Review SHALL accept an optional nonblank title and a nonempty `files: string[]` array of nonblank filesystem paths. It SHALL reject object entries, other non-string entries and undeclared top-level fields. Paths SHALL be literal filesystem paths, absolute or relative to the panel cwd; nonblank strings SHALL preserve their exact characters without trimming. The tree and file-path bar SHALL use the supplied paths without configurable display aliases. The panel SHALL generate identity from each original zero-based fileIndex, keeping repeated actual paths as separate manifest entries. It SHALL NOT require Git, caller-supplied ids, inline content or directory scanning.

#### Scenario: Open related files outside Git

- **WHEN** an agent supplies a Markdown file and a code file as path strings using valid relative and absolute paths outside a Git repository
- **THEN** the panel accepts the manifest and automatically opens its first entry without asking for ids or inline source

#### Scenario: Reject invalid input

- **WHEN** input has an empty files array, a blank provided title or path string, an object or another non-string array entry, legacy markdownFilePath or extra top-level fields
- **THEN** input validation rejects the request before creating a usable review page

#### Scenario: Preserve literal and duplicate paths

- **WHEN** path strings resolve to the same actual path, or a path includes literal hash, percent or question-mark characters
- **THEN** entries retain distinct original fileIndex identities and reads address the literal filesystem path rather than a URL interpretation

### Requirement: Navigate files without changing annotation state

Multi-file pages SHALL show a searchable directory tree on the left and the active preview on the right, with directory-first name sorting, expandable directories and case-insensitive search over supplied paths and resolved absolute paths. A file click or keyboard activation SHALL open its preview. Search SHALL retain matching ancestors and clearing search SHALL restore base expansion. A single-file page SHALL hide the tree and split separator by default. Multi-file desktop layout SHALL reuse the shared resizable split and support pointer and keyboard resizing, Escape drag cancellation and session-local layout retention. Navigation and resizing SHALL preserve saved annotations and SHALL NOT emit feedback. An open annotation editor SHALL retain its existing modal protection: the person SHALL explicitly save or cancel before switching files or locating another annotation, without implicit saving or submission.

The file-navigation toolbar SHALL contain grouping by directory, expand all and collapse all, using the same common styles as Diff Review. File Review SHALL open files on a single click and SHALL NOT render an additional open/view-current-file toolbar action or introduce a separate selected-but-unopened state. Directory mode SHALL be the default; flat mode SHALL show file names with their parent paths and preserve the same manifest identities, selected preview and saved directory expansion. Directory rows SHALL show the number of descendant files matching the current search. Switching modes SHALL preserve search and drafts and SHALL NOT reread files or emit feedback. Expand/collapse actions SHALL be disabled when the current view has no directories; collapse SHALL remain disabled during search.

#### Scenario: Switch file navigation modes without losing context

- **WHEN** a person collapses a directory, switches to flat mode, searches by a parent path and opens a file, then clears the search and restores directory mode
- **THEN** flat rows show the parent paths, the same manifest entry remains selected, the saved directory expansion is retained, directory counts reflect matching files, and mode switches do not reread or submit

#### Scenario: Open a file directly with one click

- **WHEN** a person clicks a file row once
- **THEN** the selected manifest entry opens in the preview immediately, without requiring a double-click or another toolbar action

#### Scenario: Read a deeply nested source file

- **WHEN** the manifest contains `src/io/github/qoggy/myproject/App.java` with no intervening directory branches
- **THEN** navigation compresses the directory chain into one row named `src/io/github/qoggy/myproject`, with `App.java` as its file child

#### Scenario: Search and annotate another file

- **WHEN** a person saves draft feedback in one file, searches for and opens another file, then clears search
- **THEN** the first file's feedback is retained, matching ancestors are visible during search, and base expansion is restored without a submission event

#### Scenario: Protect an unfinished annotation

- **WHEN** a person is typing in the shared annotation editor and attempts to navigate away
- **THEN** the existing modal editor retains the text and requires explicit save or cancel before file navigation, without silently saving or submitting it

#### Scenario: Read one document directly

- **WHEN** the manifest contains exactly one file
- **THEN** its preview opens without a file tree or an unused separator

#### Scenario: Resize an annotated preview

- **WHEN** a person resizes the multi-file split by pointer or keyboard, or cancels an active drag with Escape
- **THEN** pane sizes respect their bounds, the displayed source and drafts remain intact, and resizing causes no file query or feedback event

### Requirement: Select a read-only renderer from the actual file type

Files with actual path extensions `.md` or `.markdown`, case-insensitively, SHALL use the existing annotated Markdown presentation with their actual resolved sourcePath. All main previews SHALL share one supplied file-path bar without a component-type label. Other supported UTF-8 text SHALL use the existing public CodeBlock with `header=false`, `lineNumbers=true`, `defaultWrap=false` and its snapshot ref as annotationTarget, without an additional component title, nested border or extra outer padding; unknown languages SHALL use existing plain text highlighting behavior. The panel SHALL reuse built-in floating copy and wrapping controls without changing CodeBlock public props or defaults. Markdown SHALL retain its own content renderer, source mappings and custom rehype behavior; this change SHALL NOT migrate it to the public CodeBlock. Previews SHALL preserve normal reading and copying and SHALL NOT edit files or execute file content. Existing Markdown links and embedded images SHALL retain their behavior; this SHALL NOT add image, PDF, binary or executable MDX manifest previews or a source/rendered toggle.

#### Scenario: Render Markdown with a case-insensitive extension

- **WHEN** the manifest includes a path string ending in `.MD` or `.MARKDOWN`
- **THEN** the main preview renders Markdown and relative links/resources resolve from the actual Markdown location

#### Scenario: Read code and unsupported-language text

- **WHEN** the person opens a supported code language and then an unknown text extension
- **THEN** both show read-only source with line numbers and initial horizontal scrolling, the first uses bundled syntax highlighting, and the second remains selectable plain text without downloading a grammar; copying and toggling wrapping use the existing component controls

### Requirement: Retain bounded original snapshots across file navigation

File reads SHALL use existing serverAction execution and bounded UTF-8 reading, only on demand when an entry is opened. They SHALL reject non-regular files, invalid UTF-8, NUL-containing content and files larger than 1 MiB without truncation. Empty files SHALL be valid. Successful reads SHALL return an absolute actual path, exact source and a content snapshot identity; the browser SHALL retain each successfully read manifest entry for the current page lifetime. Switching back, locating annotations and submitting SHALL use this retained source even after disk modification or deletion. Only the current preview SHALL require a mounted full renderer. Late results SHALL NOT replace another entry's preview. The panel SHALL NOT watch or automatically reload files, persist backend snapshots or add a file-specific HTTP route. Reloading the page SHALL read current files and SHALL NOT promise draft recovery.

#### Scenario: Switch back after disk deletion

- **WHEN** a file is read and annotated, the person opens another entry, and the original file is modified or deleted
- **THEN** switching back or locating the annotation restores the original source without reading the changed path

#### Scenario: Open an invalid file alongside valid files

- **WHEN** an entry is missing, unreadable, non-regular, too large or not valid supported text
- **THEN** the panel shows that file's error, emits no feedback automatically and leaves other manifest entries available for review

#### Scenario: Read empty content

- **WHEN** a file is empty
- **THEN** its preview shows a valid empty state without treating it as a read failure

#### Scenario: Switch while an earlier read is pending

- **WHEN** the first file's read finishes after the person has opened a different file
- **THEN** its result belongs only to the first file's cache and does not replace the active preview

### Requirement: Submit precise feedback for the original file sources

File Review SHALL use one page annotation session across preview mounts and emit `file-review-submitted` only after explicit submission. Internal main-preview targets SHALL use `ref: {fileIndex, snapshotId}` and original-source UTF-16 ranges with exact quotes. Rendered Markdown selections SHALL map to original Markdown ranges; discontiguous mappings SHALL retain multiple targets in one annotation without dropping content. Whole-document opinions SHALL use selected heading text without a separate unselected-comment editor. The page adapter SHALL resolve retained main-preview sources and restore their preview when locating saved annotations, including clearing a blocking search and expanding ancestors. It SHALL await the matching preview's layout and text registration before returning, after which the existing annotation session SHALL locate the exact source range. This SHALL NOT add a CodeBlock ref/reveal API or duplicate source-to-DOM mapping in the panel.

Public events SHALL contain a `files` array of objects with annotations nested under their source metadata. Each referenced manifest-entry snapshot SHALL contain a resolved absolute path, one snapshotId and its annotations; annotation objects SHALL contain targets and comment, with text ranges inherited from that source. Display aliases, unreferenced files, complete file contents, annotation ids, fileIndex, internal ref/sourceRef and a separate sources lookup array SHALL NOT be published. Internal draft identities and validation evidence SHALL remain available inside the page and SHALL NOT be confused with the public event schema.

The supplied file-path text SHALL support selection annotations through the existing AnnotationText and page session once its file snapshot is available. Internal path targets SHALL distinguish their source from body text and retain exact UTF-16 ranges against the supplied path string. Path annotation editing, navigation, submission and correction SHALL reuse the existing annotation flow. Public path targets SHALL contain only `{path: {quote}}`, alongside the unchanged body `{text: {start, end, quote}}` target format. The existing file metadata, grouping and correction format SHALL remain unchanged; path coordinates, internal source discriminators, pathText, displayPath and additional source fields SHALL NOT be published.

Linked-local-file annotations SHALL retain internal `sourceRef: {path, snapshotId}` semantics: their ref identifies the owning manifest Markdown, while text offsets address the linked source. Public feedback SHALL group these annotations under the linked file's own path/snapshotId, omitting an unannotated owning Markdown. Existing linked-snapshot resolution, reopening and range validation SHALL remain in the common page session. Validation of manifest targets SHALL check identity and ranges against explicitly supplied original browser evidence, without rereading disk or requiring prior worker memory. Existing request/event limits SHALL remain in force; failures SHALL preserve drafts without truncation or automatic splitting.

#### Scenario: Submit Markdown and code annotations together

- **WHEN** a person annotates formatted Markdown and a phrase in another code file from a path-string manifest and explicitly submits
- **THEN** one event nests each annotation and its exact original source ranges under the corresponding file's resolved absolute path/snapshotId, with no display aliases, internal ids/refs, separate sources lookup or full file duplication

#### Scenario: Submit selected path text alongside body feedback

- **WHEN** a person annotates `cache-plan.md` within the supplied path `docs/cache-plan.md`, annotates the file body and explicitly submits
- **THEN** both opinions appear under the same file group; the path target is exactly `{path: {quote: "cache-plan.md"}}`, the body retains its existing text range, and no additional metadata or path coordinates are published

#### Scenario: Locate a path selection after switching files

- **WHEN** a saved path annotation belongs to a cached file hidden by the current search and a different file is open
- **THEN** locating it clears the search, reveals its ancestors, restores the cached file and selects the exact original path range without rereading disk; editing, correction and withdrawal retain existing behavior

#### Scenario: Locate a hidden file's feedback

- **WHEN** a saved annotation belongs to a cached file hidden by the current search
- **THEN** locating it clears the blocking search, reveals its tree ancestors and scrolls its preserved preview to the matching original source selection

#### Scenario: Locate repeated code after remounting

- **WHEN** a code snapshot contains repeated text and an annotation addresses the second occurrence across CRLF or lone CR, while another file is mounted
- **THEN** the page adapter restores that snapshot and waits for registration, and the common session locates the exact original range before and after asynchronous highlighting without a component reveal handle or first-text-match search

#### Scenario: Include feedback on a linked local file

- **WHEN** a person annotates text in a local file opened from a manifest Markdown link and submits with main-preview annotations
- **THEN** linked targets retain their sourceRef and owning Markdown ref internally, use linked-source offsets for validation, and publish under the linked file's own path/snapshotId with no internal references or redundant unannotated Markdown entry

#### Scenario: Locate linked feedback while its Markdown is unmounted

- **WHEN** the active preview is a code file and a saved annotation belongs to a file previously opened from a Markdown link
- **THEN** the existing page session reopens the retained linked-file snapshot and locates its range without rereading disk or requiring the owning Markdown preview to remain mounted

#### Scenario: Validate after read worker termination

- **WHEN** the file-reading worker no longer exists and complete original validation evidence is supplied
- **THEN** submission validation uses the explicit request and instance manifest rather than prior worker state or current disk content

### Requirement: Preserve explicit correction and failure semantics

The initial submission SHALL require at least one annotation and SHALL allow an empty per-entry comment. Draft editing, deleting, navigation and resizing SHALL NOT submit. A correction SHALL contain the full replacement files result with replacesEventId referencing the previous successful event of the same type. An empty corrected files array SHALL withdraw all earlier feedback. Validation, payload-limit or persistence failure SHALL preserve edits and the prior successful receipt without reporting success.

#### Scenario: Withdraw submitted feedback

- **WHEN** a person removes all annotations after a successful submission and explicitly submits a correction
- **THEN** the event contains `files: []` with the previous successful event id in replacesEventId

#### Scenario: Preserve feedback after a failed save

- **WHEN** an initial or corrected submission fails validation, a size limit or event persistence
- **THEN** annotations and in-progress edits remain available, no successful receipt is advanced, and no truncated or split result is emitted
