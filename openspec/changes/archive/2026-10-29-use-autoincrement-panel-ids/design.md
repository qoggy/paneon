## Context

The runtime currently constructs `instance-UUID` before compilation. SQLite stores text panel keys and associated events and consumer positions. The user selected SQLite autoincrement, decimal string IDs and no legacy compatibility.

## Goals / Non-Goals

**Goals:** Let SQLite allocate short IDs, preserve string API types, and retain existing successful-run, event and deletion behavior.

**Non-Goals:** UUID migration, time-based generators, additional input validation or new allocation infrastructure.

## Decisions

- Use `INTEGER PRIMARY KEY AUTOINCREMENT` for panels and integer foreign keys for events and consumers. Convert stored IDs to strings at the Store boundary.
- Let `Store.save` insert an initial record without an explicit ID and return its allocated ID. Existing saves keep their explicit ID. Allocate before asynchronous compilation, so concurrent creations have distinct committed identities.
- Delete the initial record if run fails, then propagate the original failure. The committed allocation can leave a gap; SQLite retains its sequence.
- Recognize numeric artifact directories. Bump the existing schema version check to 2; add no legacy migration branch. Reset the local instance database and generated panel artifacts after stopping the old runtime.

## Risks / Trade-offs

- Old instance data becomes unreadable under schema 2. The user explicitly chose to discard it; preserve configuration, logs, library and source files.
- Initial records briefly exist during compilation. Failed creation removes its initial record.
- Numeric database values must be converted in both detailed and paginated reads to keep the public contract unchanged.
