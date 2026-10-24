## ADDED Requirements

### Requirement: Converge backend resources independently of historical panels

For fixed panel totals and up to ten actively used panels, the runtime SHALL bound execution, cache and framework watch resources rather than allocate a persistent execution process per panel. It SHALL prioritize finite reuse and responsive return/reload rather than require immediate zero threads after every call. Historical identities and submitted events SHALL remain.

#### Scenario: Old panels remain unclosed

- **WHEN** many historical panels remain without active calls
- **THEN** they SHALL NOT each retain an execution process, and a bounded warm pool MAY remain until its idle timeout

### Requirement: Reuse one fixed revision per bounded worker

Subject to B14 approval, at most two default workers SHALL exist globally across starting, busy, idle and retiring states. Each SHALL load only one fixed serverEntry/revision. Matching idle workers SHALL be reused; mismatched idle workers SHALL exit before replacement. Author modules and full schemas SHALL NOT execute on HTTP main.

#### Scenario: Three same-panel calls

- **WHEN** three calls for one revision arrive together in an empty default pool
- **THEN** at most two threads SHALL start and the third call SHALL reuse a completed worker rather than create a third fresh worker

### Requirement: Retire warmed workers at finite boundaries

Workers SHALL retire after60s idle,100 completed calls or5min age, with count/age retirement after the current task completes. Failed/cancelled/obsolete-revision workers SHALL not retain unknown background work for reuse. Per-job signal, context and secret references SHALL be released on completion. Cross-call mutable module state SHALL NOT be a supported business storage contract.

#### Scenario: Idle and stale worker

- **WHEN** a warmed worker remains idle until its deadline or changes revision
- **THEN** it SHALL exit without discarding browser content or requiring user close

### Requirement: Separate queue waiting and execution deadlines

The defaults SHALL be32 waiting tasks,10s waiting deadline and30s execution deadline. A not-yet-started request that expires SHALL fail without later execution or automatic replay. Termination SHALL retain worker capacity until actual exit; mutations with uncertain results SHALL not replay.

#### Scenario: Two long calls

- **WHEN** a third call waits10s without starting
- **THEN** it SHALL leave the queue with an explicit busy result, distinct from an execution timeout

### Requirement: Reuse notification channels for visible source references

Subject to B15 approval, effective visibility SHALL combine host display and document visibility. Panel/preference notification sockets SHALL close while hidden and reconnect with one state synchronization on return. Watch dependencies SHALL aggregate visible sockets. Existing15s WebSocket protocol ping/pong MAY detect broken connections; no new30s HTTP presence reports or90s leases SHALL be added.

#### Scenario: Hidden page with optional timed query

- **WHEN** a page becomes hidden
- **THEN** its iframe/drafts SHALL remain, explicitly configured refreshMs timers and notification reconnects SHALL pause, and already-started business actions SHALL not be cancelled or replayed

### Requirement: Keep existing records and bound framework artifacts

Records SHALL use indexed/projection reads without historical params-wide decoding. Static files SHALL not require a live worker; manifest metadata SHALL be capped at32 entries/8MiB. Subject to C2 approval, generated revisions SHALL retain current/previous successful versions plus active references and reclaim others without deleting source or submitted events. No DB schema migration/reset SHALL occur.

#### Scenario: Fixed panel count with repeated reload

- **WHEN** C2 is approved and a panel repeatedly builds new versions
- **THEN** unreferenced generated versions outside retention SHALL be reclaimed, while source and SQLite events remain; arbitrary reclaimed revision URLs need not replay

### Requirement: Preserve explicit context and accurate isolation claims

Actions SHALL use explicit ctx.cwd and bounded timeoutMs, supported libraries and awaited work. Thread isolation SHALL not be presented as an OS malicious-code/native-crash sandbox. Standalone prototypes SHALL not be presented as product memory or browser performance proof.

#### Scenario: Action exits

- **WHEN** a module or handler calls process.exit or blocks synchronously
- **THEN** the main server SHALL survive direct thread exit or enforce the deadline, while the task fails explicitly without automatic mutation replay
