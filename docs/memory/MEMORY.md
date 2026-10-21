# Paneon Project Memory Index

- [Documentation audiences](documentation-audiences.md) — README.md is user-facing; AGENTS.md is developer-facing
- [README language](documentation-readme-language.md) — Write README.md in English
- [Changelog language](documentation-changelog-language.md) — Write changelogs in English
- [Versioned releases](workflow-versioned-releases.md) — Develop on MAJOR.MINOR.x branches, tag releases with vMAJOR.MINOR.PATCH, and keep main at the highest released version
- [Commit messages](workflow-commit-messages.md) — Write English type(scope): summary messages based on the actual staged changes, with explanatory bodies when needed

- [Agent scope](product-agent-scope.md) — Paneon targets general-purpose agents; local CLI access enables reuse and TSX generation enables authoring
- [Product responsibility boundary](architecture-responsibilities.md) — Paneon owns interface infrastructure; panel code owns business calls, scheduling, monitoring, logs, retries, and storage
- [Panel version requirements](tech-panel-version-requirements.md) — Panels declare requires.paneon package ranges; CLI, SDK, and runtime share one package version
- [CLI output and debugging](cli-output-and-debugging.md) — English CLI text; moderate results omit repeated inputs while preserving useful information; --debug stays on stderr
- [CLI command groups](cli-command-groups.md) — Panel/server groups, reusable instance URLs, and explicit --wait-ms millisecond units
- [Default UI styling](ui-default-styling.md) — Initial iteration uses shadcn default themes and component styles; layout helpers only fill necessary layout gaps
- [Reusable panel examples](ui-reusable-examples.md) — Provide copyable TSX compositions and a real gh CLI repository/PR integration example
- [Markdown rendering](ui-markdown-rendering.md) — Read-only Markdown uses react-markdown + remark-gfm and github-markdown-css light styling
- [Source updates](tech-source-updates.md) — Reuse Vite/React update mechanisms without custom old-worker or in-flight-call preservation
- [Runtime home](tech-runtime-home.md) — PANEON_HOME is an internal constant fixed to ~/.paneon, without a user-facing override
- [Panel definitions and instances](glossary-panel-definitions-and-instances.md) — PanelDefinition uses definitionId, PanelInstance uses instanceId, and the service uses runtimeId
- [Local browser access](tech-local-browser-access.md) — Regular panel URLs without login or expiry; strict Host/origin checks and separate CLI control credentials
- [Framework state notifications](tech-state-notifications.md) — WebSocket state notifications, strict upgrade origin checks, bounded reconnect and shared-context multi-tab verification
