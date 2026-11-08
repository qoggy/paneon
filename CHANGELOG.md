# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Use the new `Slider` component from `@qoggy/paneon/ui` for single-value or range controls. The dining philosophers and Sentinel sliding-window examples now use it.
- Look up public UI components in the bundled skill's component index, with individual references covering imports, common props and usage examples.
- Follow the README's uninstall instructions to remove Paneon and optionally clean up installed skills and local data.
- Get optional `Tooltip` component suggestions from `paneon panel check` for native HTML `title` tooltips, without affecting the command's exit code.

### Changed

- **Breaking:** Remove `events` from `definePanel` and the panel manifest. Send JSON feedback directly with `agent.emit(type, payload)` without declaring event types or schemas; Paneon preserves the payload's fields instead of validating or transforming them through an event schema. Move any required validation into the page before sending.
- **Breaking:** Simplify `AnnotationAdapter` to `locate(target)` only. Remove `resolve`, `targetRanges` and the exported `AnnotationTargetResolution` type; custom adapters should restore the relevant view and let Paneon locate and highlight registered content.
- Allow custom pages to use browser clipboard writes, downloads, popups, top-level navigation and local storage directly. Local storage persists across reloads and is shared by pages served from the same Paneon origin.
- Report multiple TypeScript or dependency errors together, with file locations, when a panel build fails, instead of stopping at the first error.

### Fixed

- Avoid blocking saved annotation submissions on text-range, quote or content-hash checks used for locating their sources, preserving selected quotes and comments across file review, diff review, Git review, tables and the GitHub PR example.
- Preserve module-level assignments to bindings used by a page, avoiding missing initialization in compiled panels.
- Correct `paneon panel check` handling of component aliases and conditional annotation targets, distinguishing intentionally optional diff sides from missing targets.

## [0.4.0] - 2026-11-06

### Added

- Filter Git history by commit message or hash prefix and by author, including your configured Git identity. Text search supports case-sensitive matching and regular expressions, and the filtered graph shows connections through hidden commits.
- Copy a commit's full revision number from its Git history context menu.
- Use the new `FileIcon` component from `@qoggy/paneon/ui` for file-type icons that follow the light or dark theme and work offline. File review, diff review and Git review now use these icons in their file trees.
- Highlight files with common test filename conventions in file review, diff review and Git review trees.

### Changed

- **Breaking:** Replace `paneon panel check-annotations` with `paneon panel check <entry.tsx>`. It also reports native `<select>`, `<textarea>` and text-like `<input>` elements that `@qoggy/paneon/ui` components replace, and exits with 1 when it finds any. Annotation coverage is checked only when the rendered page calls `usePageAnnotations`; a page without it is no longer reported as missing annotations. The annotation findings move under `annotations`, together with a `status` of `enabled`, `disabled` or `undetermined`.
- Load earlier Git commits as you scroll toward the end of history, preserving the selected commit and scroll position. A manual load control remains available.
- Group Git commit references by local branch, remote branch, tag and HEAD, with compact summaries in history and full reference lists in commit details. History and detail dates now consistently use `YYYY/MM/DD HH:mm` in local time.
- Compact review toolbars and allow the Git history overview, file list and commit details to be fully collapsed with their resize handles.
- Show a success notification after submitting choice answers and keep the submit button's width stable while saving or submitting corrections.

### Fixed

- Show a localized "File not found" state when a file review path no longer exists, while retaining error details for other read failures.
- Verify remote default branches when identifying Git mainlines, avoiding incorrect markers caused by stale local remote HEAD references.

## [0.3.0] - 2026-11-05

### Added

- Select rendered page elements for annotation, including cards, controls and SVG content, without configuring each target. Adjust the selected range with the keyboard and retain visible outlines for saved annotations.
- Undo up to three deleted annotations independently, restoring their original order and source references.
- Navigate choice questions through a persistent directory showing answer status, and jump between questions and the answer summary.
- Switch Markdown files between rendered and source views in file review, with per-file view and scroll positions preserved. Opening an annotation switches to source when its range has no rendered representation.

### Changed

- **Breaking:** Choose input no longer accepts top-level `title` or `description`. Keep titles and optional descriptions on individual entries in `questions`.
- Rename the bundled agent skill from `paneon` to `paneon-visualize`. Run `paneon init` to update selected agents; obsolete skill targets recorded by previous installations are removed after the new installation succeeds.
- **Breaking:** Custom annotation consumers must handle generated element references alongside their own targets. The `usePageAnnotations` submission callback and `annotationValueSchema` now include `ElementAnnotationRef`; built-in panel feedback preserves these element annotations.
- Default the `Markdown` heading outline to a popover. Use `outline="auto"` for a responsive sidebar or `outline="off"` to disable it; outlines appear only when there is more than one heading.
- Add return links to panel management when a page is closed, unavailable or fails to start.

### Fixed

- Locate annotations below common fixed or sticky top bars, keeping the target, marker and editor visible.
- Keep notifications clear of the floating annotation controls and directory, and restore focus after annotation editing.
- Register source watches before startup completes and recover watches when dependency directories are deleted and recreated, preserving automatic page reloads.
- Avoid skill installation failures when concurrent installers create the same parent directory.

## [0.2.0] - 2026-10-31

### Added

- Annotate whole images and Mermaid diagrams, including those embedded in Markdown and opened in expanded viewers.
- Annotate page and section titles and descriptions, table titles, descriptions and numeric or boolean cells, and GitHub pull request titles.
- Build custom pages with an enhanced `CodeBlock` supporting copy, word wrapping, line numbers, highlighted lines and annotations on the original source.
- Navigate Markdown with an automatic heading outline that follows the reading position and adapts to the available width.
- Check annotation coverage before sharing a page with `paneon panel check-annotations <entry.tsx>`.

### Changed

- **Breaking:** File review replaces the Markdown review panel. Run `assets/panels/file-review/panel.tsx` with optional `title` and `files: string[]` instead of the old `review` entry and `markdownFilePath`. Review Markdown, code and configuration together, retain annotations across files, and consume `file-review-submitted` with annotations nested under each file's absolute path and snapshot. Historical events and existing instances are not migrated.
- **Breaking:** Diff review now nests annotations under `files` instead of publishing separate `annotations` and `sources`. GitHub PR feedback nests annotations under a `sources` array instead of a source map and separate annotations. Table feedback omits annotation IDs, and Git review line targets include their source text directly instead of `textRef` references. Update consumers of these events for the new formats.
- Use a consistent code block presentation across Markdown, linked file previews and custom pages.
- Identify each panel's browser tab by its definition name.
- Expand the bundled agent skill with guidance for presenting explanations, choosing visual formats and revising pages after feedback.

### Fixed

- Preserve saved annotations for submission when their content is no longer displayed, such as after switching tabs or closing a section.
- Wait for annotation targets to be revealed and scrolling to settle before opening their editor. Prevent conflicting annotation actions and linked-file navigation from discarding or implicitly saving an open edit.
- Align diff scrollbar change markers with the content when a source is shorter than the viewport.

## [0.1.0] - 2026-10-30

### Added

- Compare and annotate pairs of local files with the new diff review page, without creating a Git repository.
- Follow local file links in Markdown to preview and annotate the referenced text files.
- Display YAML frontmatter and navigate between headings in Markdown documents.
- Expand images from Markdown into a viewer with zoom, copy, and download controls.
- Add and remove repositories within Git review, choose repository paths with a directory browser, and explicitly check out local branches, remote branches, or tags.
- Permanently remove a panel and its saved feedback with `paneon panel delete` or the management interface.
- Build custom pages with reusable image, tree, breadcrumb, and resizable layout components.
- Annotate a diff change block directly from its comment control.

### Changed

- Read side-by-side diffs in continuous source columns, with synchronized scrolling, inline change highlighting, and surrounding context expanded by default.
- In Git history, click a branch to select it and double-click or press Enter to open it. Open a commit's comparison with its first parent from history, and retain the history scroll position when returning.
- Preserve panel list filters and pagination in the URL, including when following a direct link or navigating browser history.
- Extend syntax highlighting to Markdown code blocks and add support for more languages in code blocks and diffs.
- Keep annotation editors open until you explicitly save or cancel, preventing accidental dismissal when clicking outside.
- **Breaking:** Markdown review reads a local file through `markdownFilePath`, replacing the inline `markdown` input.
- **Breaking:** Git review accepts absolute repository paths as strings instead of `{ id, path, label }` objects. Use `initialView.repositoryPath` in place of `initialView.repositoryId`; submitted feedback now uses a `files` array instead of separate `annotations` and `sources` fields. The optional `title` input has been removed.
- **Breaking:** Custom pages use `usePageAnnotations` to enable the shared annotation controls. It replaces the public `AnnotationRoot`, `AnnotationSubmitButton`, `AnnotationMenu`, and `AnnotationRootProps` APIs.
- **Breaking:** Event reads no longer return the `revision` field.
- **Breaking:** Panel instance IDs are decimal strings instead of UUIDs. Existing schema 1 runtime databases are unsupported and are not migrated to schema 2.

### Fixed

- Avoid Git review refresh errors after staging or committing moves the selected file out of the current working changes view.
- Stop stalled panel builds after a timeout and terminate compiler child processes left running after a failed or cancelled build.

## [0.0.1] - 2026-10-26

### Added

- Run local TypeScript and React pages with `paneon panel run`, and return submitted choices, form input, and annotations to the agent.
- Ready-made pages for choices, forms, searchable and sortable tables, Markdown review, and Git review.
- Review working changes, commit history, and branch or version comparisons across local repositories, with file trees, change navigation, and annotations on text, lines, hunks, or whole files.
- Reusable UI components for custom pages, including Markdown, syntax-highlighted code, file diffs, and Mermaid diagrams with zoom, copy, and download controls.
- A TypeScript SDK for validated page input, local server actions, queries, and interaction events, with separate event reading and acknowledgement for each consumer.
- Contextual annotations with draft editing, source references, location highlighting, and explicit submission and correction.
- Install the bundled agent skill with `paneon init`, using project or user scope and copy or symlink installation.
- CLI commands and a browser interface to inspect and manage pages, control the local service, configure its port, and read persistent logs.
- Shared light and dark themes and English and Simplified Chinese interface preferences.
- Automatic source reload, restoration of stored pages on demand, limits on resident page resources, and cleanup of obsolete generated files.
- Runnable explanation examples for dining philosophers and Sentinel's sliding window, plus a read-only GitHub pull request workspace using the local `gh` CLI.

[unreleased]: https://github.com/qoggy/paneon/compare/v0.4.0...0.4.x
[0.4.0]: https://github.com/qoggy/paneon/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/qoggy/paneon/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/qoggy/paneon/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/qoggy/paneon/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/qoggy/paneon/releases/tag/v0.0.1
