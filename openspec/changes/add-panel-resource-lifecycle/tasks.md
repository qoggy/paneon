## Accepted scope

- [x] 1.1 Record the user's adoption of lazy recovery and bounded per-panel processes; retire B14. Keep B15/C2 out of this implementation.
- [x] 1.2 Inspect the current implementation and preserve unrelated workspace changes, source, database and submitted events.

## Resource lifecycle

- [x] 2.1 Implement ten resident panel slots with idle-only LRU, bounded FIFO admission (32/10s), actual-exit accounting and shared same-panel leases.
- [x] 2.2 Bound compilation independently to one active build and cancel waiting/initializing work on close/stop.
- [x] 2.3 Split cold activation from explicit rebuild; reuse valid artifacts, retain cwd and same-panel asynchronous concurrency.
- [x] 2.4 Restore no historical processes/watchers; serve current static artifacts and bounded manifests without live execution; use indexed target record reads.
- [x] 2.5 Reattach bounded watch on page connection without pinning residency or starting execution; detect changes after eviction, preserve no-watch and existing reload failure semantics.
- [x] 2.6 Recheck revision/closed state after activation and immediately before event persistence; keep full schemas.

## Acceptance

- [x] 3.1 Verify LRU/busy/queue limits, timeout without later execution, retirement, compiler serialization and close/stop races.
- [x] 3.2 Verify cold history/assets, no recompilation on unchanged wake, source/version freshness, no-watch and same-panel concurrency.
- [x] 3.3 Exercise bounded resources with 1/5/10 active panels and repeated reuse/reload; report actual RSS/FD evidence and its limits.
- [x] 3.4 Run appropriate type/lint/format/OpenSpec and real browser regressions; update authoring and durable project guidance to the accepted contract.
