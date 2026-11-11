## Why

File Review builds its directory tree from literal input strings, so mixed relative and absolute paths appear under unrelated roots even when they share a directory. Mac mini panel 82 demonstrates this mismatch between navigation and the paths used for file reads.

## What Changes

- Group files using absolute paths resolved against the panel cwd.
- Initialize expanded directories after path resolution without changing original manifest identities or path-bar text.
- Add browser regression coverage for mixed paths and shared ancestors.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `file-review`: Directory grouping uses resolved filesystem paths rather than literal input roots.

## Impact

File Review panel navigation and its browser tests. Reuses the existing resolvePaths action; no new API or dependency.
