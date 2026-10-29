# Paneon Project Memory Index

- [Documentation audiences](documentation-audiences.md) — README.md is user-facing; AGENTS.md is developer-facing
- [README language](documentation-readme-language.md) — Write README.md in English
- [Changelog language](documentation-changelog-language.md) — Write changelogs in English
- [Built-in panel references](documentation-panel-contracts.md) — Skill references cover when to use a panel, what it achieves and how to use it; no interface specifications
- [Skill public surface](documentation-skill-public-surface.md) — Document only paneon/sdk and paneon/ui for custom pages; leave assets/shared and built-in panel internals unmentioned, neither recommended nor forbidden
- [Versioned releases](workflow-versioned-releases.md) — Develop on MAJOR.MINOR.x branches, tag releases with vMAJOR.MINOR.PATCH, and keep main at the highest released version
- [Commit messages](workflow-commit-messages.md) — Write English type(scope): summary messages based on the actual staged changes, with explanatory bodies when needed

- [Agent scope](product-agent-scope.md) — Paneon targets general-purpose agents; local CLI access enables reuse and TSX generation enables authoring
- [Product responsibility boundary](architecture-responsibilities.md) — Paneon owns rendering, local calls, events and framework diagnostics; panels own business execution policies
- [Local file access](architecture-file-access.md) — Image owns image reads and Markdown owns linked text reads; component actions reuse existing registration; no dedicated file endpoint
- [Scenario boundaries and defensive logic](coding-scenario-boundaries.md) — Design for explicit supported scenarios; avoid speculative defenses for out-of-scope operations
- [Caught errors](coding-caught-errors.md) — Log caught errors, propagate them, or both; never silently discard failures
- [Structured error handling](coding-structured-errors.md) — Classify external errors by stable types/codes, never by matching error messages
- [Reuse foundational capabilities](coding-reuse-foundations.md) — Prefer standard libraries and mature community SDKs over custom general-purpose infrastructure
- [Root-cause bug fixes](coding-root-cause-fixes.md) — Establish the cause with logs/reproduction before a minimal targeted fix; add diagnostics when evidence is insufficient
- [CLI output and debugging](cli-output-and-debugging.md) — English CLI text; moderate results omit repeated inputs while preserving useful information
- [Default UI styling](ui-default-styling.md) — Public components use shadcn defaults; layout helpers provide necessary layout and panels may customize their pages
- [Components in built-in panels](ui-builtin-panel-components.md) — Compose paneon/ui components such as Empty, Spinner and toast; ask the user before developing or adopting a missing component
- [Desktop page scope](ui-desktop-scope.md) — Default to desktop development and acceptance; mobile-specific adaptation and testing require an explicit task requirement
- [Shared selection and annotations](ui-selection-feedback.md) — Use 批注 / annotation; document-wide opinions use selected heading text without a separate page-level comment entry; retain explicit submission and correction
- [Runtime home](tech-runtime-home.md) — PANEON_HOME is an internal constant fixed to ~/.paneon, without a user-facing override
