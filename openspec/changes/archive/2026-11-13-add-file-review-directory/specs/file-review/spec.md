## MODIFIED Requirements

### Requirement: Accept an explicit manifest of local text files

File Review SHALL accept an optional nonblank title and optional `files: string[]` and `directories: string[]` arrays of nonblank filesystem paths, with at least one path across both arrays. It SHALL reject object entries, other non-string entries and undeclared top-level fields. Paths SHALL be literal filesystem paths, absolute or relative to the panel cwd; nonblank strings SHALL preserve their exact characters without trimming. Directory grouping SHALL use absolute paths resolved against the panel cwd, sharing directory nodes regardless of relative or absolute input spelling. The file-path bar and flat-mode path labels SHALL use the supplied paths without configurable display aliases. The panel SHALL generate identity from each original zero-based fileIndex, keeping repeated actual paths as separate manifest entries. It SHALL NOT require Git, caller-supplied ids or inline content. Directories SHALL request recursive discovery and MAY be combined with explicit files.

#### Scenario: Open related files outside Git

- **WHEN** an agent supplies a Markdown file and a code file as path strings using valid relative and absolute paths outside a Git repository
- **THEN** the panel accepts the manifest and automatically opens its first entry without asking for ids or inline source

#### Scenario: Reject invalid input

- **WHEN** input has no paths across files and directories, a blank provided title or path string, an object or another non-string array entry, legacy markdownFilePath or extra top-level fields
- **THEN** input validation rejects the request before creating a usable review page

#### Scenario: Preserve literal and duplicate paths

- **WHEN** path strings resolve to the same actual path, or a path includes literal hash, percent or question-mark characters
- **THEN** entries retain distinct original fileIndex identities and reads address the literal filesystem path rather than a URL interpretation

#### Scenario: Group mixed path spellings in the same directory

- **WHEN** relative, dot-segment and absolute manifest paths resolve to files in the same directory
- **THEN** the grouped tree places all entries under one directory, initially expanded after path resolution, and retains duplicate manifest entries

#### Scenario: Share ancestors across directories outside the panel cwd

- **WHEN** an absolute artifact path outside the panel cwd and a relative worktree path share an ancestor
- **THEN** the grouped tree shows that shared ancestor with their distinct directory branches

#### Scenario: Combine multiple directories with supplementary files

- **WHEN** input supplies directories ["src", "tests"] and files ["docs/plan.md"]
- **THEN** the page discovers both directories and combines their paths with the explicit document

#### Scenario: Supply one nonempty source with the other omitted or empty

- **WHEN** either array contains paths and the other is omitted or empty
- **THEN** the input remains valid without trimming literal path characters

### Requirement: Navigate files without changing annotation state

Multi-file pages and pages with directory input SHALL show a searchable directory tree on the left and the active preview on the right, with directory-first name sorting, expandable directories and case-insensitive search over supplied paths and resolved absolute paths. A file click or keyboard activation SHALL open its preview. Search SHALL retain matching ancestors and clearing search SHALL restore base expansion. A files-only single-file page SHALL hide the tree and split separator by default. Directory input SHALL retain navigation, preserve compression boundaries at supplied directories, and initially expand each supplied directory and the ancestors needed to reveal supplied directories and explicit files. Other discovered subdirectories SHALL remain collapsed while retaining complete search and explicit expand-all. Multi-file desktop layout SHALL reuse the shared resizable split and support pointer and keyboard resizing, Escape drag cancellation and session-local layout retention. Navigation and resizing SHALL preserve saved annotations and SHALL NOT emit feedback. An open annotation editor SHALL retain its existing modal protection: the person SHALL explicitly save or cancel before switching files or locating another annotation, without implicit saving or submission.

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

- **WHEN** a files-only manifest contains exactly one file
- **THEN** its preview opens without a file tree or an unused separator

#### Scenario: Expand supplied directories without expanding their descendants

- **WHEN** directories include multiple roots or one root containing a continuous nested directory chain
- **THEN** each supplied directory and its ancestors are expanded, compression stops at that supplied directory, and other discovered subdirectories remain collapsed

#### Scenario: Reveal an explicit file within a supplied directory

- **WHEN** an explicit file is also discovered under a supplied directory
- **THEN** the file appears once, keeps its explicit identity, and its ancestors are expanded so it is initially visible

#### Scenario: Resize an annotated preview

- **WHEN** a person resizes the multi-file split by pointer or keyboard, or cancels an active drag with Escape
- **THEN** pane sizes respect their bounds, the displayed source and drafts remain intact, and resizing causes no file query or feedback event

## ADDED Requirements

### Requirement: Discover directory lists as a stable review manifest

File Review SHALL traverse directory entries recursively using metadata, with no content pre-read or dependency on Git. Ordinary directories and directory symbolic links SHALL be traversed during initialization; files SHALL be retained for the existing on-demand reader to decide preview eligibility. Explicit files and directory roots SHALL also retain symbolic-link metadata. This change SHALL NOT introduce ignore rules or read .gitignore files.

Explicit files SHALL retain their original indexed prefix and duplicate identities. Discovered entries SHALL be appended by root input order and per-root path sorting, with duplicate normalized absolute paths omitted. Repeated and overlapping roots SHALL reuse traversal where prior ancestor constraints do not omit paths available from the new root. Each explicit root SHALL begin with its own ancestor chain rather than inherit another root's cycle restriction. The completed manifest SHALL remain fixed until reload. Discovered paths SHALL display relative to cwd when contained within it and otherwise as absolute paths; all navigation grouping SHALL use resolved paths.

#### Scenario: Review overlapping roots

- **WHEN** roots repeat or overlap and an explicit file is also found in a directory
- **THEN** explicit indices stay unchanged and discovered normalized paths are appended only once

#### Scenario: Discover without pre-reading bodies

- **WHEN** a directory contains nested entries, empty, binary or oversized files
- **THEN** discovery records paths and the existing reader handles preview eligibility only when opened

#### Scenario: Review files and directory links

- **WHEN** supplied paths or a scanned directory contain symbolic links to files or directories
- **THEN** file links retain their targets, directory-link contents are collected during initialization including targets outside the supplied root, and files keep their link-based paths for preview and annotation

#### Scenario: Stop cycles without hiding distinct directory aliases

- **WHEN** a directory link resolves to an ancestor of its current traversal chain, or different links resolve to the same non-ancestor directory
- **THEN** only the ancestor cycle stops automatic traversal and is marked as cyclic, while separate aliases remain visible with their own link-based paths

### Requirement: Present symbolic links without changing the review flow

File and directory links SHALL retain their respective icons with a link-arrow marker. The tree SHALL preserve directory-link nodes and compression boundaries, including empty linked directories. Unavailable targets SHALL have an error presentation. A link tooltip SHALL be anchored to its icon and name and show only its original target path, appending “（循环）” for cycles in Chinese without an inline cycle label or further explanatory instruction. The preview header SHALL remain a single row and preserve the annotation-bearing link path alongside its target. The public Tree component, file feedback format and existing preview eligibility SHALL remain unchanged.

#### Scenario: Inspect a linked file and its target

- **WHEN** a person hovers a file link or opens it
- **THEN** the tooltip shows only the target and the single-row preview header preserves the original link path and displays the target

#### Scenario: Inspect an empty, unavailable or cyclic link

- **WHEN** a directory target is empty, a link target is unavailable, or a directory link is cyclic
- **THEN** the empty directory link remains a directory, unavailable links are distinguishable, and cyclic links have the cycle hint only in their tooltip without attempting a file preview

### Requirement: Keep directory loading and errors observable

Expected missing, non-directory, permission and directory I/O errors SHALL be shown with their affected paths while retaining other readable sources. Unexpected exceptions SHALL propagate. Empty successful scans SHALL show an empty state and SHALL NOT trigger an absent first-file read.

While directory discovery is pending, the left navigation SHALL show its loading state and SHALL NOT report that no files match. The preview SHALL remain blank until a file is available, while explicit files MAY be previewed before directory discovery finishes. Empty and failed directory states SHALL appear in the navigation; the no-matches state SHALL describe only completed search filtering.

#### Scenario: Keep directory loading in the navigation

- **WHEN** directory discovery is pending, including while the person enters a search term
- **THEN** navigation shows a loading indicator instead of no matches, an unavailable preview remains blank, and existing explicit-file previews remain usable

#### Scenario: One root fails

- **WHEN** one directory cannot be read but another directory or an explicit file is available
- **THEN** the readable entries remain usable and the directory issue stays visible

#### Scenario: Empty directory or all roots fail

- **WHEN** discovery yields no entries
- **THEN** a successful empty result is distinguished from failed directory loading and no file read is attempted

### Requirement: Reuse the existing review flow for discovered files

A file read SHALL send its individual path and fileIndex rather than the full discovered manifest. Directory feedback SHALL accept retained snapshots whose paths belong under an original supplied root, without rescanning or rereading disk. Existing files-only checks, snapshot evidence, public events, annotations and correction semantics SHALL remain in place.

#### Scenario: Submit after a discovered file changes or disappears

- **WHEN** an opened and annotated discovered file changes or is removed
- **THEN** navigation and submission use the retained original snapshot and public file grouping

#### Scenario: Read a target from a large manifest

- **WHEN** a directory supplies many discovered paths
- **THEN** opening one file sends only that target path and index
