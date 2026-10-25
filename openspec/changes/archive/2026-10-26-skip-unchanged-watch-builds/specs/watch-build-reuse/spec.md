## ADDED Requirements

### Requirement: Automatic watch updates reuse only matching builds

Automatic source refresh SHALL reuse the current build when its recorded input contents, resolution probes, build environment and generated outputs match. Reuse SHALL preserve the execution process, source watcher and module state. Missing evidence or a mismatch SHALL use the existing complete compilation path without adding a business validation failure.

#### Scenario: Save identical source bytes

- **WHEN** a watched file is saved without changing its contents and the build evidence still matches
- **THEN** the runtime skips compilation and keeps the worker and module state

#### Scenario: Changed resolution, package or generated file

- **WHEN** a watch refresh finds a new resolution candidate, changed package input, or missing/changed generated output
- **THEN** the runtime compiles normally instead of treating the source hash alone as a cache hit

### Requirement: Explicit reload retains forced refresh

Explicit run/reload SHALL retain full compilation and execution initialization. Explicit reload SHALL replace execution even when the source revision is unchanged.

#### Scenario: Reload unchanged source

- **WHEN** the user explicitly reloads a panel with unchanged source
- **THEN** compilation runs and the previous execution is replaced

### Requirement: Reuse completes diagnostic recovery

A successful watch reuse or watch reactivation SHALL clear a stale build diagnostic and publish a completed state. Reuse decisions SHALL be serialized with compilation by the panel's existing build queue.

#### Scenario: Restore the last successful source after a build failure

- **WHEN** source is restored to the last successful build and matching evidence permits reuse
- **THEN** the runtime clears the previous build error and completes its state notification without resetting execution
