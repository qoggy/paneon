# Panel Resource Lifecycle Specification

## Purpose

Bound panel execution and source-watching residency while preserving identities, compiled content and durable events.

## Requirements

### Requirement: Restore identities without historical execution

Service startup SHALL NOT compile or evaluate historical author modules or restore their execution processes/watchers. Logical open status SHALL remain independent of residency. Identities, submitted events and consumer positions SHALL remain unchanged.

#### Scenario: Many old panels remain open

- **WHEN** the service restarts with historical open panels
- **THEN** it SHALL become available without starting their compilers, workers or watchers

### Requirement: Bound per-panel residency with idle LRU

The default SHALL be at most ten resident panel positions, including initializing and retiring positions. A position MAY hold a watcher and at most one Node execution child with that panel's cwd and revision. Only positions without active initialization, builds, calls or event validation SHALL be ordinary LRU victims. Same-panel asynchronous calls SHALL retain their existing overlap behavior. B14's two-thread executor is withdrawn.

#### Scenario: Reach capacity

- **WHEN** another panel needs a position at capacity and an idle position exists
- **THEN** the least recently used idle position SHALL fully close its watcher and execution child before replacement starts

### Requirement: Bound capacity waiting independently of action execution

When all positions are busy, new panel admissions SHALL wait in FIFO order with default 32 waiting admissions and 10 seconds waiting time. A full queue or expired admission SHALL fail explicitly without later execution or mutation replay. No default action execution timeout, thread migration or ctx.cwd API SHALL be introduced. Compilation SHALL have an independent single active position and bounded admission.

#### Scenario: Admission expires

- **WHEN** a cold panel cannot obtain capacity before its waiting deadline
- **THEN** it SHALL return RUNTIME_BUSY and SHALL NOT execute when capacity later becomes available

### Requirement: Serve persisted content without execution

Static assets and current manifests SHALL be read from existing compiled artifacts independently of live execution. Historical events/acks and manifest lookup SHALL NOT activate author code. Target records SHALL use indexed reads. Manifest cache SHALL be capped at 32 entries and 8MiB serialized bytes; oversized entries SHALL NOT stay cached.

#### Scenario: Execution is cold and source is absent

- **WHEN** existing static artifacts and submitted events are requested
- **THEN** they SHALL remain readable without compiling missing source or starting execution

### Requirement: Activate valid revisions without implicit reload

Cold execution SHALL reuse valid compiled artifacts. Watch reactivation SHALL check source changes while unobserved; no-watch SHALL retain explicit source reload behavior. Paneon version changes SHALL be handled on use. Explicit reload or revision changes SHALL NOT add old-call preservation. Calls SHALL recheck revision and closed state after activation; event commits SHALL recheck immediately before persistence.

#### Scenario: Wake an unchanged panel

- **WHEN** an evicted panel receives a valid action for an unchanged revision
- **THEN** the runtime SHALL load its bundle without recompilation

### Requirement: Bound source watching without coupling it to execution

Existing state WebSocket connections MAY activate a bounded source watcher and check freshness, but SHALL NOT pin residency or require an execution child merely for notifications. Source updates for watcher-only panels SHALL NOT create persistent execution children. This change SHALL NOT implement pending B15 visibility behavior or C2 generated-file deletion.

#### Scenario: Open a static watch panel after restart

- **WHEN** its state connection is established
- **THEN** its existing content SHALL remain available, its watching SHALL obey residency capacity, and no execution child SHALL be needed until actual execution

### Requirement: Preserve isolation and disclose eviction boundaries

Author schemas and handlers SHALL remain outside the HTTP main process. LRU MAY discard module memory and unmanaged background work; these SHALL NOT be durable storage/job contracts. Close and stop SHALL cancel admission, initialization and execution, wait for actual exit, retain history and never automatically replay mutations.

#### Scenario: Close during initialization

- **WHEN** close arrives during queued or initializing execution
- **THEN** unpublished work SHALL stop, its capacity SHALL remain accounted until disposal, and no execution SHALL be published afterward
