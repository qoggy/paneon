## Scope

- [x] 1.1 Record approval of items 1–5 and the generated-directory deletion boundaries; leave items 6–8 deferred.

## Implementation

- [x] 2.1 Make execution and metadata workers abort and exit on IPC disconnect.
- [x] 2.2 Add generated-directory pruning and manifest-cache invalidation without following links or deleting unknown content.
- [x] 2.3 Serialize failure/publication cleanup and close-after-retirement cleanup with existing panel work.
- [x] 2.4 Start one asynchronous sweep after successful listen and await it before SQLite shutdown.

## Verification

- [x] 3.1 Cover failure, same-revision rebuild, successful replacement, close, history, sweep races and worker controller death with isolated tests.
- [x] 3.2 Run full build/unit suite, relevant real-browser acceptance, lint, formatting and OpenSpec validation; record evidence and update project documentation.
