## REMOVED Requirements

### Requirement: Review a complete Markdown document with precise feedback

**Reason**: 单份 Markdown review 的入口、输入和 document 引用由支持明确多文件清单的 File Review 统一替代；Markdown 精确批注、原文保留和显式提交能力由新能力完整承接。

**Migration**: 将 `<skill>/assets/panels/review/panel.tsx` 改为 `<skill>/assets/panels/file-review/panel.tsx`，`{title, markdownFilePath}` 改为 `{title, files:[markdownFilePath]}`，输入 files 为非空路径字符串数组，不接受文件对象或展示别名。读取 `file-review-submitted` 的 files 数组，每项包含实际绝对 path、snapshotId 和嵌套 annotations，替代 `review-submitted`。不暴露页面内部的 fileIndex/ref 或分离 sources，不改写历史事件。

## ADDED Requirements

### Requirement: Supply File Review as the standard content-review entry

The product skill SHALL ship `assets/panels/file-review/panel.tsx` with definition id `file-review` and event type `file-review-submitted` as its standard content-review panel, following the file-review capability. It SHALL replace the former `assets/panels/review/panel.tsx`, `review` definition and `review-submitted` event without a legacy alias or acceptance of markdownFilePath. Existing stored historical events SHALL NOT be rewritten or relabeled as the new event type, and existing instances SHALL NOT be automatically migrated.

The built-in panel table SHALL direct one or more complete text files to File Review, original/proposed pairs to Diff Review and repository changes/history to Git Review. A dedicated `references/file-review.md` SHALL document when to use the panel, what it achieves, its strict input and complete submission contract, original snapshot offsets, linked-file source groups and correction/withdrawal semantics using `files: []` for withdrawal. Public examples SHALL nest annotations under file metadata without internal annotation ids, fileIndex/ref, duplicated snapshot ids or separate sources lookup tables. The old review reference SHALL be removed. Agent-facing references SHALL NOT document panel layout specifications or recommend private shared asset modules as public APIs. Existing CodeBlock authoring guidance and public API SHALL remain unchanged by this panel integration.

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
- **THEN** the entry compiles against public SDK/UI exports, resolves relative file paths against that cwd and supports reading and submitting precise file feedback
