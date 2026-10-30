# Markdown Code Block Presentation Specification

## Purpose

Use fixed upstream presentation primitives for Markdown code blocks and linked-file previews while preserving source identity, existing operations and customization boundaries.

## Requirements

### Requirement: Reuse fixed upstream code block primitives within Markdown

Markdown fenced code and linked-file source previews SHALL compose a shared internal set of shadcn Base Code Block presentation primitives with matching component styles. The adopted code, styles, source revision or registry identity, integrity digests, license and local adaptations SHALL be recorded. Reuse SHALL NOT introduce runtime upstream downloads, a full theme upgrade, new public UI exports or changes to the existing public Markdown and CodeBlock props. Existing CodeText and DiffView callers outside these Markdown paths SHALL retain their behavior.

#### Scenario: Render both paths from the installed package

- **WHEN** a page displays a fenced code block and opens a local file link without external network access
- **THEN** both use the bundled shared presentation primitives and required styles without a runtime grammar or component download

#### Scenario: Keep current public callers valid

- **WHEN** a caller uses existing Markdown props or CodeBlock code/language/className props
- **THEN** it requires no new parameters and no migration to an internal component API

### Requirement: Compose Markdown code headers without changing operation semantics

Default fenced code blocks SHALL use upstream Header, Title, Actions and Content composition while retaining current language labels, icons, copy and wrap controls. They SHALL initially wrap long lines and SHALL NOT display line numbers or introduce fence metadata syntax or new control options. Header actions SHALL stay outside horizontally scrolling content. Controls SHALL preserve keyboard interaction, accessible state, English/Simplified Chinese messages and both themes. Copy SHALL use the existing browserAction host bridge once, preserve pending/disabled/focus and observable success/failure feedback, and copy only the existing code string with its whitespace and parsed newline behavior. Header and control text SHALL NOT enter copied source or annotation coordinates.

#### Scenario: Toggle wrapping while reading a long fenced block

- **WHEN** a reader turns wrapping off or on using mouse or keyboard
- **THEN** the content changes layout, its header stays fixed relative to horizontal code scrolling, and source identity, annotations and copied text do not change

#### Scenario: Copy with success or failure

- **WHEN** a reader invokes copy and the host clipboard operation is pending, succeeds or fails
- **THEN** only one host copy runs, pending activation is blocked with focus retained, and the appropriate success or failure remains visible without a direct duplicate clipboard call or silently discarded exception

### Requirement: Preserve linked-file numbering and existing line highlights

Linked-file previews SHALL use upstream Content line numbering and Line highlight presentation for the existing one-based inclusive `#Lx-Ly` range. They SHALL retain file-language inference, original file content, current status text and automatic target-line scrolling. Opening without a line range SHALL show the source without a range highlight. Out-of-range handling SHALL retain current semantics, without inventing source lines. FilePreviewSheet SHALL retain its existing file title, path copy, sizing, focus, close, loading and error responsibilities; the content SHALL NOT add a duplicate header or new controls. Empty files SHALL retain the existing Empty state.

#### Scenario: Open a link to a line range

- **WHEN** a Markdown link opens a readable text file with `#L7-L10`
- **THEN** its actual numbered lines 7 through 10 are highlighted, the start line is revealed near the existing viewport position, and the surrounding source remains readable and selectable

#### Scenario: Handle missing and out-of-range anchors

- **WHEN** the same file is opened without an anchor, with an end beyond the last line, or with a start beyond the last line
- **THEN** it respectively has no range highlight, retains the current bounded end display, or shows the existing out-of-range notice without fabricated lines or annotation offsets

#### Scenario: Preserve the sheet and empty state

- **WHEN** a reader opens an empty, loading or unreadable linked file or closes a preview
- **THEN** existing empty/loading/error UI and focus restoration remain, without duplicate content headers or new file-reading behavior

### Requirement: Retain exact annotation mappings through presentation changes

Fenced source mappings SHALL continue to address the original Markdown, including parser-generated final newlines and source-only syntax. File mappings SHALL continue to address the exact retained UTF-16 file snapshot with existing ref and sourceRef identities. Mapping SHALL remain correct through line splitting, CRLF or lone-CR normalization, consecutive/trailing empty lines, Unicode, repeated text, syntax-token replacement, wrapping and theme changes. Decorative line numbers, titles and controls SHALL be excluded. The implementation SHALL NOT guess original locations by searching the first matching quote or silently replace old ranges with display offsets. Existing annotation opt-in, drafts, location, explicit submission and complete corrections SHALL remain unchanged.

#### Scenario: Annotate across highlighted numbered lines

- **WHEN** a person selects text across lines in a linked file containing CRLF, blank lines, Chinese and emoji
- **THEN** the saved targets contain exact original UTF-16 ranges and matching quotes with unchanged sourceRef, excluding visual line numbers

#### Scenario: Preserve final-newline distinctions

- **WHEN** code contains consecutive empty lines, ends with or without a newline, or receives a synthetic final newline from Markdown parsing
- **THEN** display and copy preserve the established code behavior and all annotatable boundaries map to their actual original source without treating synthetic decoration as source characters

#### Scenario: Rebind after asynchronous syntax highlighting

- **WHEN** highlighting replaces text nodes after initial render or wrapping/theme changes presentation
- **THEN** saved and newly selected annotations still resolve and locate precisely without changing their original source or comments

#### Scenario: Locate retained linked-file feedback after disk changes

- **WHEN** a person saves file feedback, closes the drawer, changes or deletes the disk file, and locates the feedback or submits a correction
- **THEN** the existing snapshot is used for location and validation, drafts and event source identities remain intact, and no latest disk text is substituted

### Requirement: Preserve Markdown customization and resource boundaries

Existing syntax highlighting languages and bundled assets, plain-text unknown-language behavior, inline code, Mermaid fences, components.pre/components.code overrides and author-provided rehype markup SHALL retain their current rendering boundaries. Existing frontmatter literal-code paths SHALL retain their parsing, error and source-mapping behavior when they share the internal code presentation. This presentation change SHALL NOT modify file-link resolution, reads, component actions, image/diagram viewers, snapshot persistence, event schemas or submission limits.

#### Scenario: Render customized and special Markdown

- **WHEN** content uses inline code, Mermaid, author code/pre renderers, custom rehype highlighting, unknown languages or literal frontmatter code
- **THEN** the existing appropriate renderer and source mapping remain effective without forcing all content through a new string-only line renderer

#### Scenario: Resolve a local file from its document

- **WHEN** Markdown with sourcePath opens a relative linked text file
- **THEN** its existing component action resolves against the document directory and retains file snapshot and annotation semantics without a new HTTP file route
