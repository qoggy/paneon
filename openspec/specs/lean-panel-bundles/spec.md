# Lean Panel Bundles Specification

## Purpose

Preserve UI module boundaries so panel bundles contain only reachable functionality and required local assets.

## Requirements

### Requirement: Consumers contain requested UI functionality

The UI library SHALL preserve module boundaries and leave ordinary package imports for final consumer bundling, while retaining rich libraries' existing library-stage compression. A basic panel SHALL exclude unreachable rich-content JavaScript output, while consumers that use rich content SHALL retain working local lazy assets.

#### Scenario: Basic UI panel

- **WHEN** a panel renders basic UI without Markdown or Mermaid
- **THEN** its client output contains no unreachable rich-content chunks

#### Scenario: Rich content panel

- **WHEN** a panel renders Mermaid and Markdown
- **THEN** its diagrams, content updates and error recovery work without external asset requests
