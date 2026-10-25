## Why

Basic panels currently emit about 6.85 MB of unreachable lazy JavaScript after rebundling the prebuilt UI library. Source watching also misses file creation/deletion, failed new dependencies and environment changes; rebuilding an env change can retain the old revision and browser content.

## What Changes

- Preserve UI/rich-library module boundaries, retain rich libraries' existing compression and leave ordinary package imports for final panel bundling.
- Share one lazy Vite watcher between hot panels, with reference-counted subscriptions restricted to relevant inputs and resolution candidates.
- Carry local watch evidence across successful and failed compiler IPC results, recover automatically after fixes, and reconcile changes during subscription updates.
- Include production env files in source revisions and watch all four env candidates without Vite server restarts.
- Preserve unchanged-build reuse, explicit reload, bounded residency, action isolation and artifact cleanup.

## Capabilities

### New Capabilities

- `precise-source-watching`: Hot-panel input subscriptions, failure recovery and environment source updates.
- `lean-panel-bundles`: Final consumers exclude unused rich-content chunks while retaining requested lazy features.

### Modified Capabilities

None.

## Impact

UI build configuration, compiler snapshots/manifest and private IPC metadata, Runtime watch resource ownership, focused regression tests and source-update documentation. No new dependencies, database migration, business validation, shared browser assets or action replay.
