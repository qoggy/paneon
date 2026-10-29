# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/qoggy/paneon/compare/v0.1.0...0.1.x
[0.1.0]: https://github.com/qoggy/paneon/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/qoggy/paneon/releases/tag/v0.0.1
