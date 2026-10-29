## Why

Agents repeatedly pass panel instance IDs through CLI commands. SQLite autoincrement IDs provide concise local identifiers without an application-owned generator.

## What Changes

- Allocate panel IDs with SQLite `INTEGER PRIMARY KEY AUTOINCREMENT` and expose them as decimal strings.
- Keep the allocated ID through reload, close, deletion and runtime restarts; deleted committed IDs are not reused.
- **BREAKING**: Replace the UUID database schema without migrating existing instances, as selected by the user. Reset old instance data and generated artifacts while preserving configuration, logs and author source.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `code-first-panels`: Specify database-allocated decimal instance IDs.

## Impact

Runtime storage and creation, artifact discovery, numeric test fixtures and ID lifecycle coverage. CLI/API `instanceId` remains a string. No new dependencies or ID validation rules.
