## 1. Core implementation

- [x] 1.1 Allocate panel IDs through SQLite, expose decimal strings, and recognize numeric artifact directories.
- [x] 1.2 Preserve cleanup of failed creation and existing reload, close and deletion behavior.

## 2. Verification and local runtime

- [x] 2.1 Update numeric fixtures and test allocation, restart, deletion, concurrent creation and failure cleanup.
- [x] 2.2 Run relevant automated tests, type checking, lint and formatting checks.
- [x] 2.3 Reset the authorized local legacy instance data, restart the runtime and verify a real numeric-ID panel.

Validation: `npm test` passed 372/372 tests. Type checking, lint (55 existing warnings), formatting checks, OpenSpec validation and the artifact-retention browser regression passed. The local CLI created instance `"1"` at `/panels/1`; its verification panel was closed after inspection. Reset 119 legacy panels and their associated events and consumers while retaining configuration, logs and author source.
