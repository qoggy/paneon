# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/qoggy/paneon/compare/v0.0.1...0.0.x
[0.0.1]: https://github.com/qoggy/paneon/releases/tag/v0.0.1
