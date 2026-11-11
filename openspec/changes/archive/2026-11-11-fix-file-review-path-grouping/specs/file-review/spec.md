## MODIFIED Requirements

### Requirement: Accept an explicit manifest of local text files

File Review SHALL accept an optional nonblank title and a nonempty `files: string[]` array of nonblank filesystem paths. It SHALL reject object entries, other non-string entries and undeclared top-level fields. Paths SHALL be literal filesystem paths, absolute or relative to the panel cwd; nonblank strings SHALL preserve their exact characters without trimming. Directory grouping SHALL use absolute paths resolved against the panel cwd, sharing directory nodes regardless of relative or absolute input spelling. The file-path bar and flat-mode path labels SHALL use the supplied paths without configurable display aliases. The panel SHALL generate identity from each original zero-based fileIndex, keeping repeated actual paths as separate manifest entries. It SHALL NOT require Git, caller-supplied ids, inline content or directory scanning.

#### Scenario: Open related files outside Git

- **WHEN** an agent supplies a Markdown file and a code file as path strings using valid relative and absolute paths outside a Git repository
- **THEN** the panel accepts the manifest and automatically opens its first entry without asking for ids or inline source

#### Scenario: Reject invalid input

- **WHEN** input has an empty files array, a blank provided title or path string, an object or another non-string array entry, legacy markdownFilePath or extra top-level fields
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
