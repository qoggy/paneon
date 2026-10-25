## 1. Lean UI output

- [x] 1.1 Preserve rich module boundaries, externalize ordinary UI packages and assert basic consumers emit only reachable JavaScript.

## 2. Source watching

- [x] 2.1 Capture local source/probe/env evidence in manifests and failed compiler IPC; hash existing env inputs.
- [x] 2.2 Implement one lazy shared Vite watcher with independent subscriptions, event coalescing and input reconciliation.
- [x] 2.3 Integrate stable subscriptions with successful/failed builds, reuse, LRU, close and stop.
- [x] 2.4 Add real-event and controlled Runtime regression tests for recovery, shared paths, environment and overlapping saves.

## 3. Acceptance

- [x] 3.1 Verify complete build/test/lint, real Chrome UI/Markdown/Mermaid/credentials/lifecycle and independently installed package acceptance.
- [x] 3.2 Update source-update documentation and record exact validation results and changed files.
