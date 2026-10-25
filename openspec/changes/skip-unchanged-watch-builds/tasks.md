## Implementation

- [x] 1.1 Record build input, resolution, environment and output evidence without changing revision identities.
- [x] 1.2 Reuse matching watch builds inside the existing queue, preserving explicit reload and recovering diagnostic/state completion.

## Verification

- [x] 2.1 Add regression coverage for no-op watch state, real edits, resolution/package/output misses and error recovery.
- [x] 2.2 Run focused runtime/compiler tests, type/lint/format checks and measure reuse cost.
- [x] 2.3 Update source-update documentation and record verification plus the cache decision inventory.
