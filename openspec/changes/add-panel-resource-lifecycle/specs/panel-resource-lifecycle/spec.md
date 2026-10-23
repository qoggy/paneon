## ADDED Requirements

### Requirement: Separate instance availability from resident execution

Paneon SHALL distinguish instance status `open`, `closed`, or `unavailable` from transient execution state `sleeping`, `starting`, `ready`, or `suspending`. Open auto-mode instances SHALL NOT require a resident worker merely to remain stored or serve immutable client assets. Explicit closure SHALL prevent ordinary reads and wake requests from reopening the instance. Sleep SHALL NOT delete events, advance consumer acknowledgements, or change an unchanged source revision.

#### Scenario: An unused instance remains accessible

- **WHEN** an open instance has no resident execution environment
- **THEN** inspect and its immutable assets remain available and the instance reports sleeping rather than closed

#### Scenario: An explicitly closed instance is revisited

- **WHEN** a browser revisits a closed instance or requests wake
- **THEN** Paneon retains the closed state and does not start an execution worker

### Requirement: Create and restore auto-mode instances without eager resident workers

Initial run SHALL validate input and publish a complete immutable artifact before returning the URL. Auto mode SHALL be the default without requiring a CLI lifecycle parameter. Runtime startup SHALL NOT compile or start workers for all stored auto instances. Persistent instances SHALL restore subject to resource limits without blocking the control service on the whole list.

#### Scenario: Runtime starts with many unused instances

- **WHEN** the database contains hundreds of open auto instances and no visible clients
- **THEN** runtime startup does not compile or launch an execution worker for each one, while list and event reads remain usable

### Requirement: Track visibility through expiring per-client leases

The host SHALL report visible or hidden state per browser client over a same-origin HTTP presence endpoint. Visible leases SHALL renew every 30 seconds and expire after 90 seconds without renewal. One valid visible client SHALL keep the instance visibly active even if other clients are hidden. Closing a tab SHALL NOT be a requirement for eventual expiry. Framework WebSocket state streams SHALL remain read-only.

#### Scenario: One of two tabs becomes hidden

- **WHEN** two tabs view the same instance and one remains visible
- **THEN** the hidden tab does not override the visible lease or cause idle suspension

#### Scenario: A browser disappears without a final message

- **WHEN** a browser crashes or disconnects without sending an unload notification
- **THEN** its lease expires and it cannot keep the instance active indefinitely

### Requirement: Suspend only safe idle execution

After all visible leases disappear and protected operations finish, an auto instance SHALL become eligible for idle suspension after the configured interval, initially 300 seconds. During suspension Paneon SHALL stop dispatch, close source watchers, revoke instance credentials and stop the idle worker before releasing its slot. Builds, initialization, event validation/persistence, running actions and leased credential prompts SHALL prevent automatic termination. Client disconnection SHALL NOT imply an action completed. List, inspect, event reads/ack and notification heartbeats SHALL NOT count as interaction activity.

#### Scenario: A mutation continues after its browser disappears

- **WHEN** the last browser disappears while an accepted mutation is still executing
- **THEN** Paneon does not terminate that execution as idle and does not replay the mutation

#### Scenario: An idle instance is collected

- **WHEN** an auto instance has no visible lease or protected operation for the configured interval
- **THEN** its worker and source watcher are released while its identity, artifact reference and events remain

### Requirement: Wake with per-instance serialization and bounded resources

Wake SHALL use one initialization promise per instance and reserve worker capacity before starting. The initial defaults SHALL allow at most eight resident executions and two concurrent builds. Persistent and busy executions SHALL NOT be evicted. Capacity pressure SHALL prefer unprotected hidden auto executions, then least-recently-used unprotected auto executions. Wake/build queues SHALL be bounded to 32 items with respective admission waits of 10 and 30 seconds. RESOURCE_BUSY SHALL describe failure before dispatch without replaying business operations. Starting processes SHALL count toward capacity; transient build/metadata processes SHALL be reported separately from resident execution.

#### Scenario: Several requests wake the same sleeping instance

- **WHEN** several eligible requests arrive concurrently for one sleeping instance
- **THEN** only one execution is initialized, revision is rechecked after preparation, and each accepted operation is dispatched at most once

#### Scenario: Every execution slot is protected

- **WHEN** new work needs capacity and all resident slots are busy or persistent until the admission deadline
- **THEN** Paneon returns RESOURCE_BUSY without killing protected work or executing the rejected operation

### Requirement: Explicit persistent execution mode

Panel definitions SHALL support `execution.mode` with `auto` as the default and `persistent` as an explicit exception. Persistent mode SHALL retain server module state during normal service operation and SHALL NOT be suspended due to hidden browsers. It SHALL consume the same execution quota. It SHALL NOT promise restart of interrupted external business work or survival of module memory across service failure or actual source reload.

#### Scenario: A persistent monitoring panel has no browser

- **WHEN** a persistent instance remains open with no visible clients
- **THEN** idle collection does not terminate its execution and the resource summary identifies its quota use

### Requirement: Pause hidden automatic browser queries without replaying writes

The SDK SHALL pause useQuery refresh timers for hidden auto-mode pages and resume with one fresh query on visibility restoration. Inactive browser calls SHALL NOT repeatedly wake auto instances. The host SHALL validate bridge identity when forwarding visibility state. Explicit persistent-mode background calls SHALL remain supported. Pending accepted operations SHALL retain their existing completion semantics, and the framework SHALL NOT automatically retry mutations or event emission after reconnect or wake failure.

#### Scenario: A hidden polling page remains in the background

- **WHEN** an auto panel using useQuery with refreshMs is hidden
- **THEN** its automatic refresh timer is paused rather than repeatedly reviving execution

### Requirement: Preserve the mounted client across execution-only transitions

Execution state changes SHALL NOT change iframe identity or discard browser-owned answer, annotation, view, or receipt state when source revision is unchanged. No cross-browser-close draft recovery SHALL be implied. Source changes detected while watch is enabled SHALL retain the existing source-reload semantics rather than pretending to be an execution-only wake. No-watch instances SHALL use their pinned artifact until explicit reload.

#### Scenario: A sleeping page with unsaved annotations returns to foreground

- **WHEN** its mounted iframe remains alive and the source revision is unchanged
- **THEN** wake preserves the draft, displayed sources and view without silently submitting, reloading the frame, changing annotation targets or requiring recovery of backend business snapshots

### Requirement: Use indexed storage and bounded artifact metadata

Single-instance lookup SHALL select by primary key without decoding every stored input. Lists SHALL paginate in SQL. Manifest caches SHALL have both entry and encoded-size bounds. Code artifacts SHALL be shared by package-version and content-revision key while inputs and browser-owned display/draft data remain per instance. Unreferenced artifact candidates SHALL persist their first-unreferenced time; only candidates unreferenced for 24 hours and free of active build/serve/client references SHALL be deleted after a final synchronized check. Events, consumer positions, source files and author data SHALL NOT be automatically deleted by this collector.

#### Scenario: A single panel is inspected among many historical instances

- **WHEN** one instance is inspected from a database containing many closed and open instances
- **THEN** the request reads the target record and its needed manifest without parsing all other inputs or launching a worker

#### Scenario: An artifact is referenced again before cleanup

- **WHEN** an artifact candidate acquires a new open-instance or in-flight reference
- **THEN** its collection candidacy is removed and the collector does not delete it

### Requirement: Report execution state without exposing author content

HTTP, CLI and localized host UI SHALL expose availability, execution mode, execution state, resource counts and actionable wake failures. Resource diagnostics SHALL NOT include params, snapshot bodies or credentials. Resource configuration SHALL share atomic serialization with UI preferences so updates cannot discard each other's fields. Browser hints SHALL NOT replace existing Host/Origin or CLI authorization.

#### Scenario: Theme changes after a resource configuration update

- **WHEN** ui.theme is saved after resources.maxResidentExecutions changes
- **THEN** both valid changes remain in the single persisted configuration
