# Component Server Actions Specification

## Purpose

Allow packaged components to declare private server actions and register retained actions through the existing panel compilation and runtime mechanisms.

## Requirements

### Requirement: Packaged components declare ordinary actions

Component modules SHALL declare top-level serverAction values using the existing contract. Library builds SHALL separate browser proxies and Node handlers and emit a manifest discoverable through package metadata. Public component barrels SHALL NOT expose private actions.

#### Scenario: Component action is built

- **WHEN** a component calls its own action
- **THEN** browser output contains a proxy with the same stable ID as the emitted Node action and contains no handler-only Node imports

### Requirement: Panel compilation extends existing registration

Panel compilation SHALL merge actions of retained packaged components into the existing action table, preserve ordinary panel action behavior, and include component artifacts in cache/revision inputs. Runtime execution SHALL remain unchanged.

#### Scenario: Independent component action

- **WHEN** a panel imports a packaged component unrelated to Markdown that declares an action
- **THEN** its action executes through the existing action endpoint without component-specific compiler branches

#### Scenario: Unused component

- **WHEN** a panel uses only basic controls
- **THEN** unused Markdown actions and rich browser modules are not registered or included
