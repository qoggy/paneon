## ADDED Requirements

### Requirement: Supported single-server scenario

The logging mechanism SHALL be designed for normal CLI startup, reuse and shutdown with one running server. It SHALL identify the current log group from runtime context and treat other groups as historical. It MUST NOT add old-PID liveness probing, multiple-writer recovery or special file-tampering defenses for manually modified CLI artifacts, runtime descriptors or log files. Existing authorization and credential boundaries SHALL remain unchanged.

#### Scenario: Historical logs are cleaned during a normal server run

- **WHEN** the single server performs historical retention cleanup
- **THEN** it excludes its known current group and applies count/age rules to historical groups without probing old PIDs

### Requirement: Reusable server logger

Paneon SHALL provide one reusable server-side logger with debug/info/warn/error/fatal methods, structured context and child loggers. Server modules SHALL obtain the logger through their service context. Adding an ordinary log point MUST NOT require registering an event name, extending a global event union or supplying operationId/buildId/tracing fields. Framework-owned common fields MUST NOT be overwritten by caller context.

#### Scenario: Developer adds a debug log

- **WHEN** a developer adds a debug call with a module name and selected contextual fields
- **THEN** it can persist at debug collection level without changes to any central event registry or shared log schema

#### Scenario: A child logger supplies instance context

- **WHEN** a module creates a child logger with component and instanceId
- **THEN** subsequent records inherit that context and the runtime's common fields

### Requirement: Useful error serialization

The logger SHALL support Error values, preserving type/name, message, stack, code where present and up to three levels of cause. Serialization SHALL handle cycles, oversized values and non-Error thrown values without throwing back into normal service code. Truncation SHALL be explicit and SHALL preserve useful primary error information within a 64 KiB record limit rather than dropping all error text.

#### Scenario: Error has a nested cause

- **WHEN** a framework error with a message, stack and cause is explicitly logged
- **THEN** retained records contain those diagnostic details subject to bounded serialization
- **AND** logging does not change the error information returned to the panel or CLI business caller

#### Scenario: Context contains a cycle or oversized field

- **WHEN** a log call includes circular context or an oversized string
- **THEN** the logger emits a bounded representation with explicit truncation/serialization indication without crashing the operation

### Requirement: Explicit log data selection

The framework SHALL NOT automatically dump inputs, business results, environment variables, request bodies or author process output. Initial log points MUST avoid explicitly writing credentials. Existing credential output checks SHALL remain unchanged. Generic field redaction and known-secret substitution SHALL NOT be introduced, as confirmed by B3. Error messages and stacks MUST NOT be universally deleted as a substitute for selecting appropriate log content.

#### Scenario: Logger is integrated without business payload dumping

- **WHEN** the initial server logger integration records startup, readiness, stopping or framework errors
- **THEN** it records the selected message and context without automatically adding input bodies or credential objects
- **AND** existing action/event credential boundaries remain unchanged

### Requirement: Startup-scoped levels and early initialization

Logging SHALL initialize before service restoration, with a consistent runtimeId across logger and runtime descriptor. The startup environment SHALL accept PANEON_LOG_LEVEL values debug/info/warn/error/fatal/off and reject invalid values. Info SHALL be the default collection level, as confirmed by B1. CLI --debug MUST remain scoped to the invoking command's stderr and MUST NOT silently configure the daemon.

#### Scenario: Startup fails after logger initialization

- **WHEN** service initialization fails after the logger is available
- **THEN** the framework logs the actual startup error, attempts bounded flushing and retains the expected failing exit behavior

#### Scenario: Logging is off

- **WHEN** a new runtime starts with PANEON_LOG_LEVEL=off
- **THEN** it creates no runtime log files and exposes off as the effective logging state

#### Scenario: A later command uses a different level environment

- **WHEN** a command contacts an existing info-level runtime with PANEON_LOG_LEVEL=debug
- **THEN** the runtime remains at its original info collection level

### Requirement: Minimal mechanism integration

The runtime entry, server and Runtime SHALL share the logger, including Fastify app.log/request.log. Automatic per-request access logging SHALL remain disabled. Initial integration SHALL cover startup, readiness, stopping and existing framework error boundaries; completion MUST NOT require a catalog of feature-specific log points, compilation timings, MIME diagnosis or cross-process tracing.

#### Scenario: Mechanism is accepted before feature-specific diagnostics

- **WHEN** server, child logger and Fastify logger calls persist correctly and the mechanism requirements pass
- **THEN** lack of detailed reload, Git or browser-failure log points does not prevent acceptance of this logging mechanism

### Requirement: Bounded local persistence

Runtime records SHALL be JSONL under the fixed ~/.paneon/logs/ directory, with an independent group per runtime and one writing server. Each group SHALL contain at most three files of at most 5 MiB each. Retention SHALL keep at most four groups including the current group, and remove historical groups whose latest file modification is over seven days old. The current group SHALL be identified from the running context and excluded from historical deletion. Created files/directories SHALL use 0600/0700 permissions. No PID-liveness file headers or symbolic-link substitution defense protocol SHALL be introduced. Off SHALL create no files.

#### Scenario: A file reaches the size limit

- **WHEN** the next complete record would exceed 5 MiB
- **THEN** the writer rotates before writing it, keeps at most two archives and does not split a JSON record across files

#### Scenario: A fifth normal startup creates a new current group

- **WHEN** normal startup adds a fifth log group
- **THEN** cleanup removes the oldest historical group and keeps at most four including the new current group

### Requirement: Failure visibility and bounded shutdown

The asynchronous pending queue SHALL be at most 1 MiB. Congestion SHALL use bounded drop accounting and report drops when writing resumes. A persistent writer failure SHALL expose unavailable status with a safe error code and avoid a retry storm without changing panel results. Normal shutdown SHALL attempt flush/close within at most 500 ms inside the existing shutdown budget. Fatal exception observation MUST NOT suppress the runtime's failing exit semantics.

#### Scenario: Writing fails or producers exceed destination capacity

- **WHEN** a file cannot be written or records exceed queue capacity
- **THEN** service work remains independent of the log destination, memory remains bounded and unavailable/drop information is observable

#### Scenario: Runtime stops with buffered logs

- **WHEN** the runtime performs normal shutdown
- **THEN** it attempts bounded flush/close without indefinitely delaying stop, and does not promise complete persistence after SIGKILL or power loss
