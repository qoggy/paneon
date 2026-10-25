## Why

An unchanged source save still runs TypeScript, two Vite builds and metadata evaluation, then replaces the panel worker. Startup and cold artifact reuse already exist; the remaining opportunity is avoiding unnecessary automatic rebuilds.

## What Changes

- Reuse the current compilation on automatic watch updates when its recorded inputs, resolution probes, environment and generated files still match.
- Preserve the worker and watcher on a hit; clear stale build diagnostics and finish the state notification.
- Keep explicit run/reload as full compilation and execution replacement. A cache miss uses the existing build path.
- Record reuse evidence with successful builds; older artifacts can rebuild normally without a migration.

## Capabilities

### New Capabilities

- `watch-build-reuse`: Skip unchanged automatic builds while preserving explicit reload and failure recovery.

### Modified Capabilities

None.

## Impact

Compiler snapshots and manifest metadata, runtime artifact checks and watch orchestration, focused regression tests and source-update documentation. No new dependencies, business validation, history cleanup or residency policy changes.
