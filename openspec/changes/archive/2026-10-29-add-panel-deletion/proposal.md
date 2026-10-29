## Why

Closing a panel ends interaction while retaining its identity and submitted feedback. People also need to permanently remove unwanted instances without losing the separate close operation.

## What Changes

- Add permanent single-instance deletion through the CLI, HTTP API and management list, retaining close unchanged.
- Allow deletion from running, unavailable and closed states; stop resources before removing instance records, events and consumer positions.
- Show Close and Delete directly on each management card, with an explicit irreversible-deletion confirmation in the UI.
- Notify open pages and waiting event readers when an instance is deleted.
- Preserve author source, project files and external effects; do not add recovery, acknowledgement prerequisites or a close-first requirement.

## Capabilities

### New Capabilities

- `panel-deletion`: Permanent instance deletion and its CLI, API, UI and concurrent-reader behavior.

### Modified Capabilities

None. Existing close/history guarantees remain in effect until an explicit deletion.

## Impact

Runtime lifecycle and SQLite store, server routes/notifications, CLI commands, management list, panel host, localized UI copy, agent skill instructions and focused integration/browser tests. No new dependencies or database schema changes.
