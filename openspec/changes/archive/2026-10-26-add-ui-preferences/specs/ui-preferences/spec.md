## ADDED Requirements

### Requirement: Persist user-level interface preferences

Paneon SHALL support theme light/dark and language en/zh-CN, defaulting to light/en. CLI config get/set and web settings SHALL share effective preferences stored at ~/.paneon/config.json. Updates SHALL atomically merge selected fields while preserving unrelated configuration. Preferences SHALL NOT become panel params, project configuration or instance overrides.

#### Scenario: Change a preference and restart

- **WHEN** a person changes ui.theme or ui.language through the supported CLI or web entry and the runtime later restarts
- **THEN** the saved value is restored, unrelated fields remain intact and panel business input is unchanged

#### Scenario: Saving fails

- **WHEN** a preference cannot be saved
- **THEN** the interface reports failure and retains the last confirmed effective value rather than claiming success

### Requirement: Synchronize preferences while preserving panel state

The runtime SHALL deliver complete preference snapshots to connected management pages and panel hosts, and hosts SHALL update the existing iframe through the identity-bound bridge. Initial host HTML and iframe mounting SHALL use effective theme/language. Preference changes SHALL NOT remount panels, reload source, trigger business queries or emit business events, and SHALL preserve answers, annotation drafts, displayed Git content and receipts.

#### Scenario: Switch language or theme across windows

- **WHEN** a preference changes while multiple pages and an edited panel are open
- **THEN** connected pages apply the same value while retaining the iframe, drafts and displayed business state without extra queries or events

### Requirement: Localize owned UI without rewriting supplied content

Paneon-owned controls, accessible labels, validation and submission messages SHALL support English and Simplified Chinese. Markdown, CodeBlock, Mermaid and Diff SHALL support both themes without changing source identity or annotation coordinates. Author/user text and external error messages SHALL remain original; existing business validation timing and ordering SHALL remain unchanged. CLI diagnostics SHALL remain English.

#### Scenario: View original content after a preference change

- **WHEN** a person changes language or theme while reading Markdown, code or Git and editing annotations
- **THEN** owned UI adapts while original content, quotes, coordinates, external errors and saved draft values retain their meaning
