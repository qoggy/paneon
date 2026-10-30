## MODIFIED Requirements

### Requirement: Submit precise feedback for the original file sources

File Review SHALL use one page annotation session across preview mounts and emit `file-review-submitted` only after explicit submission. Internal main-preview targets SHALL use `ref: {fileIndex, snapshotId}` and original-source UTF-16 ranges. Ordinary text and image syntax SHALL retain exact quotes. Whole Mermaid targets SHALL carry type='mermaid' and quote-free start/end ranges that identify the complete original fence; original snapshot evidence SHALL remain internal. Rendered Markdown selections SHALL map to original Markdown ranges; discontiguous mappings SHALL retain multiple targets in one annotation without dropping content. Whole-document opinions SHALL use selected heading text without a separate unselected-comment editor. The page adapter SHALL resolve retained main-preview sources and restore their preview when locating saved annotations, including clearing a blocking search and expanding ancestors. It SHALL await the matching preview's layout and text registration before returning, after which the existing annotation session SHALL locate the exact source range. This SHALL NOT add a CodeBlock ref/reveal API or duplicate source-to-DOM mapping in the panel.

Public events SHALL contain a `files` array of objects with annotations nested under their source metadata. Each referenced manifest-entry snapshot SHALL contain a resolved absolute path, one snapshotId and its annotations; annotation objects SHALL contain targets and comment, with text ranges inherited from that source. Display aliases, unreferenced files, complete file contents, annotation ids, fileIndex, internal ref/sourceRef and a separate sources lookup array SHALL NOT be published. Internal draft identities and validation evidence SHALL remain available inside the page and SHALL NOT be confused with the public event schema.

The supplied file-path text SHALL support selection annotations through the existing AnnotationText and page session once its file snapshot is available. Internal path targets SHALL distinguish their source from body text and retain exact UTF-16 ranges against the supplied path string. Path annotation editing, navigation, submission and correction SHALL reuse the existing annotation flow. Public path targets SHALL contain only `{path: {quote}}`, alongside the unchanged ordinary body `{text: {start, end, quote}}` format and Mermaid `{type: 'mermaid', text: {start, end}}` targets. The existing file metadata, grouping and correction format SHALL remain unchanged; path coordinates, internal source discriminators, pathText, displayPath and additional source fields SHALL NOT be published.

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

#### Scenario: Submit an entire Markdown Mermaid

- **WHEN** a person annotates a whole Mermaid fence in a manifest Markdown and submits
- **THEN** its original file group contains type=mermaid and the exact complete fence start/end without source quote or diagram code, using the existing path/snapshotId and correction contract
